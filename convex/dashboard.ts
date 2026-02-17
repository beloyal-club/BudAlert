import { query } from "./_generated/server";
import { v } from "convex/values";

// ============================================================
// DASHBOARD QUERIES (real-time subscribed)
// ============================================================

/**
 * Get dashboard stats - uses cache when available (PERF-002)
 * Falls back to live computation if cache is stale/missing
 */
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
    
    // Try cache first (O(1) lookup)
    const cached = await ctx.db
      .query("statsCache")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .first();
    
    // Use cache if fresh
    if (cached && (now - cached.computedAt) < CACHE_TTL_MS) {
      return {
        timestamp: cached.computedAt,
        retailers: {
          total: cached.retailers.total,
          byRegion: cached.retailers.byRegion,
        },
        brands: cached.brands,
        inventory: {
          ...cached.inventory,
          stockRate: cached.inventory.totalRecords > 0
            ? Math.round((cached.inventory.inStock / cached.inventory.totalRecords) * 100)
            : 0,
        },
        priceChanges: { last24h: 0, drops: 0 }, // TODO: add to cache
        scrapeHealth: cached.scrapeHealth,
        fromCache: true,
        cacheVersion: cached.version,
      };
    }
    
    // Cache miss/stale - compute live (original logic)
    const [retailers, brands, inventory, deadLetters] = await Promise.all([
      ctx.db.query("retailers").filter(q => q.eq(q.field("isActive"), true)).collect(),
      ctx.db.query("brands").collect(),
      ctx.db.query("currentInventory").collect(),
      ctx.db.query("deadLetterQueue").filter(q => q.eq(q.field("resolvedAt"), undefined)).collect(),
    ]);
    
    // Calculate inventory stats
    const inStockCount = inventory.filter(i => i.inStock).length;
    const outOfStockCount = inventory.length - inStockCount;
    
    // Get unique product count
    const uniqueProductIds = new Set(inventory.map(i => i.productId.toString()));
    
    // Calculate price changes in last 24h
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const recentPriceChanges = inventory.filter(
      i => i.priceChangedAt && i.priceChangedAt > oneDayAgo
    );
    const priceDrops = recentPriceChanges.filter(
      i => i.previousPrice && i.currentPrice < i.previousPrice
    );
    
    // Region breakdown
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
        outOfStock: outOfStockCount,
        stockRate: inventory.length > 0 
          ? Math.round((inStockCount / inventory.length) * 100) 
          : 0,
      },
      priceChanges: {
        last24h: recentPriceChanges.length,
        drops: priceDrops.length,
      },
      scrapeHealth: {
        unresolvedErrors: deadLetters.length,
      },
      fromCache: false,
    };
  },
});

/**
 * Get recent activity feed (last N events)
 */
export const getActivityFeed = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;
    
    // Get recent scrape jobs (completed ones)
    const jobs = await ctx.db
      .query("scrapeJobs")
      .filter(q => q.eq(q.field("status"), "completed"))
      .order("desc")
      .take(limit);
    
    // Enrich with retailer names
    const activity = await Promise.all(
      jobs.map(async (job) => {
        const retailer = await ctx.db.get(job.retailerId);
        return {
          id: job._id,
          type: "scrape",
          retailerName: retailer?.name || "Unknown",
          productCount: job.itemsScraped,
          timestamp: job.completedAt || job.startedAt || job._creationTime,
        };
      })
    );
    
    return activity;
  },
});

/**
 * Health check query - can be used to verify connection
 */
export const ping = query({
  args: {},
  handler: async () => {
    return { 
      ok: true, 
      timestamp: Date.now(),
      serverTime: new Date().toISOString(),
    };
  },
});
