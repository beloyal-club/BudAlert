import { query } from "./_generated/server";
import { v } from "convex/values";

// ============================================================
// DASHBOARD QUERIES (real-time subscribed)
// ============================================================

/**
 * Get live dashboard stats - subscribed to all relevant tables
 */
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const [retailers, brands, inventory, deadLetters] = await Promise.all([
      ctx.db.query("retailers").filter(q => q.eq(q.field("isActive"), true)).collect(),
      ctx.db.query("brands").collect(),
      ctx.db.query("currentInventory").collect(),
      // Dead letters without resolvedAt are unresolved
      ctx.db.query("deadLetterQueue").filter(q => q.eq(q.field("resolvedAt"), undefined)).collect(),
    ]);
    
    // Calculate inventory stats
    const inStockCount = inventory.filter(i => i.inStock).length;
    const outOfStockCount = inventory.length - inStockCount;
    
    // Get unique product count
    const uniqueProductIds = new Set(inventory.map(i => i.productId.toString()));
    
    // Calculate price changes in last 24h
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
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
      timestamp: Date.now(),
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
