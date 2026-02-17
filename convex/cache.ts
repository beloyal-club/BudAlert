import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// ============================================================
// STATS CACHE (PERF-002)
// Precomputed aggregates for fast dashboard queries
// ============================================================

const GLOBAL_CACHE_KEY = "global";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached stats - ultra fast O(1) lookup
 * Falls back to live computation if cache is stale/missing
 */
export const getStats = query({
  args: {
    maxAgeMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxAge = args.maxAgeMs || CACHE_TTL_MS;
    
    // Try to get cached stats
    const cached = await ctx.db
      .query("statsCache")
      .withIndex("by_key", (q) => q.eq("key", GLOBAL_CACHE_KEY))
      .first();
    
    const now = Date.now();
    
    // Return cached if fresh
    if (cached && (now - cached.computedAt) < maxAge) {
      return {
        ...cached,
        fromCache: true,
        cacheAge: now - cached.computedAt,
      };
    }
    
    // Cache miss or stale - compute live (caller should trigger refresh)
    return {
      fromCache: false,
      needsRefresh: true,
      staleData: cached || null,
    };
  },
});

/**
 * Get cached stats with automatic fallback to live computation
 * Slightly slower but always returns data
 */
export const getStatsWithFallback = query({
  args: {},
  handler: async (ctx) => {
    // Try cache first
    const cached = await ctx.db
      .query("statsCache")
      .withIndex("by_key", (q) => q.eq("key", GLOBAL_CACHE_KEY))
      .first();
    
    const now = Date.now();
    
    // Return cached if exists and reasonably fresh (10 min)
    if (cached && (now - cached.computedAt) < 10 * 60 * 1000) {
      return {
        timestamp: cached.computedAt,
        retailers: cached.retailers,
        brands: cached.brands,
        inventory: {
          ...cached.inventory,
          stockRate: cached.inventory.totalRecords > 0
            ? Math.round((cached.inventory.inStock / cached.inventory.totalRecords) * 100)
            : 0,
        },
        scrapeHealth: cached.scrapeHealth,
        priceChanges: { last24h: 0, drops: 0 }, // TODO: track in cache
        fromCache: true,
        cacheAge: now - cached.computedAt,
      };
    }
    
    // Fallback: compute live (expensive)
    const [retailers, brands, inventory, deadLetters] = await Promise.all([
      ctx.db.query("retailers").filter(q => q.eq(q.field("isActive"), true)).collect(),
      ctx.db.query("brands").collect(),
      ctx.db.query("currentInventory").collect(),
      ctx.db.query("deadLetterQueue").filter(q => q.eq(q.field("resolvedAt"), undefined)).collect(),
    ]);
    
    const inStockCount = inventory.filter(i => i.inStock).length;
    const uniqueProductIds = new Set(inventory.map(i => i.productId.toString()));
    
    const regionCounts = retailers.reduce((acc, r) => {
      acc[r.region] = (acc[r.region] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      timestamp: now,
      retailers: {
        total: retailers.length,
        byRegion: regionCounts,
      },
      brands: {
        total: brands.length,
        verified: brands.filter(b => b.isVerified).length,
      },
      inventory: {
        totalRecords: inventory.length,
        uniqueProducts: uniqueProductIds.size,
        inStock: inStockCount,
        outOfStock: inventory.length - inStockCount,
        stockRate: inventory.length > 0
          ? Math.round((inStockCount / inventory.length) * 100)
          : 0,
      },
      scrapeHealth: {
        unresolvedErrors: deadLetters.length,
      },
      priceChanges: { last24h: 0, drops: 0 },
      fromCache: false,
    };
  },
});

/**
 * Refresh the global stats cache
 * Should be called periodically or after bulk data changes
 */
export const refreshGlobalCache = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    
    // Compute all stats
    const [retailers, brands, inventory, deadLetters, recentJobs] = await Promise.all([
      ctx.db.query("retailers").collect(),
      ctx.db.query("brands").collect(),
      ctx.db.query("currentInventory").collect(),
      ctx.db.query("deadLetterQueue").filter(q => q.eq(q.field("resolvedAt"), undefined)).collect(),
      ctx.db.query("scrapeJobs").filter(q => q.gte(q.field("startedAt"), oneDayAgo)).collect(),
    ]);
    
    const activeRetailers = retailers.filter(r => r.isActive);
    const inStockCount = inventory.filter(i => i.inStock).length;
    const uniqueProductIds = new Set(inventory.map(i => i.productId.toString()));
    
    const regionCounts = activeRetailers.reduce((acc, r) => {
      acc[r.region] = (acc[r.region] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const successfulJobs = recentJobs.filter(j => j.status === "completed");
    
    const statsData = {
      key: GLOBAL_CACHE_KEY,
      retailers: {
        total: activeRetailers.length,
        active: activeRetailers.length,
        byRegion: regionCounts,
      },
      brands: {
        total: brands.length,
        verified: brands.filter(b => b.isVerified).length,
      },
      inventory: {
        totalRecords: inventory.length,
        uniqueProducts: uniqueProductIds.size,
        inStock: inStockCount,
        outOfStock: inventory.length - inStockCount,
      },
      scrapeHealth: {
        unresolvedErrors: deadLetters.length,
        totalJobs24h: recentJobs.length,
        successfulJobs24h: successfulJobs.length,
      },
      computedAt: now,
      version: 1,
    };
    
    // Check for existing cache entry
    const existing = await ctx.db
      .query("statsCache")
      .withIndex("by_key", (q) => q.eq("key", GLOBAL_CACHE_KEY))
      .first();
    
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...statsData,
        version: existing.version + 1,
      });
      return { action: "updated", version: existing.version + 1 };
    } else {
      await ctx.db.insert("statsCache", statsData);
      return { action: "created", version: 1 };
    }
  },
});

// ============================================================
// INCREMENTAL CACHE UPDATES
// Call these after data mutations for real-time accuracy
// ============================================================

/**
 * Increment retailer count (call after retailer insert)
 */
export const incrementRetailerCount = internalMutation({
  args: {
    region: v.string(),
    delta: v.number(),
  },
  handler: async (ctx, args) => {
    const cached = await ctx.db
      .query("statsCache")
      .withIndex("by_key", (q) => q.eq("key", GLOBAL_CACHE_KEY))
      .first();
    
    if (!cached) return; // No cache yet, will be computed on next refresh
    
    const byRegion = cached.retailers.byRegion as Record<string, number>;
    byRegion[args.region] = (byRegion[args.region] || 0) + args.delta;
    
    await ctx.db.patch(cached._id, {
      retailers: {
        total: cached.retailers.total + args.delta,
        active: cached.retailers.active + args.delta,
        byRegion,
      },
      computedAt: Date.now(),
      version: cached.version + 1,
    });
  },
});

/**
 * Increment brand count (call after brand insert)
 */
export const incrementBrandCount = internalMutation({
  args: {
    delta: v.number(),
    verified: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const cached = await ctx.db
      .query("statsCache")
      .withIndex("by_key", (q) => q.eq("key", GLOBAL_CACHE_KEY))
      .first();
    
    if (!cached) return;
    
    await ctx.db.patch(cached._id, {
      brands: {
        total: cached.brands.total + args.delta,
        verified: cached.brands.verified + (args.verified ? args.delta : 0),
      },
      computedAt: Date.now(),
      version: cached.version + 1,
    });
  },
});

/**
 * Update inventory counts (call after inventory changes)
 */
export const updateInventoryCount = internalMutation({
  args: {
    totalDelta: v.number(),
    inStockDelta: v.number(),
    uniqueProductsDelta: v.number(),
  },
  handler: async (ctx, args) => {
    const cached = await ctx.db
      .query("statsCache")
      .withIndex("by_key", (q) => q.eq("key", GLOBAL_CACHE_KEY))
      .first();
    
    if (!cached) return;
    
    const newTotal = cached.inventory.totalRecords + args.totalDelta;
    const newInStock = cached.inventory.inStock + args.inStockDelta;
    
    await ctx.db.patch(cached._id, {
      inventory: {
        totalRecords: newTotal,
        uniqueProducts: cached.inventory.uniqueProducts + args.uniqueProductsDelta,
        inStock: newInStock,
        outOfStock: newTotal - newInStock,
      },
      computedAt: Date.now(),
      version: cached.version + 1,
    });
  },
});

/**
 * Update scrape health stats
 */
export const updateScrapeHealth = internalMutation({
  args: {
    unresolvedErrorsDelta: v.number(),
  },
  handler: async (ctx, args) => {
    const cached = await ctx.db
      .query("statsCache")
      .withIndex("by_key", (q) => q.eq("key", GLOBAL_CACHE_KEY))
      .first();
    
    if (!cached) return;
    
    await ctx.db.patch(cached._id, {
      scrapeHealth: {
        ...cached.scrapeHealth,
        unresolvedErrors: cached.scrapeHealth.unresolvedErrors + args.unresolvedErrorsDelta,
      },
      computedAt: Date.now(),
      version: cached.version + 1,
    });
  },
});

/**
 * Get cache metadata (for debugging)
 */
export const getCacheInfo = query({
  args: {},
  handler: async (ctx) => {
    const cached = await ctx.db
      .query("statsCache")
      .withIndex("by_key", (q) => q.eq("key", GLOBAL_CACHE_KEY))
      .first();
    
    if (!cached) {
      return { exists: false };
    }
    
    return {
      exists: true,
      version: cached.version,
      computedAt: cached.computedAt,
      ageMs: Date.now() - cached.computedAt,
      ageFormatted: formatAge(Date.now() - cached.computedAt),
    };
  },
});

function formatAge(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 3600000)}h`;
}
