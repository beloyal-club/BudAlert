import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Data Quality Statistics for Scraper Improvement Loop
 */

export const getInventoryQualityStats = query({
  args: {},
  handler: async (ctx) => {
    // Get all current inventory records
    const inventory = await ctx.db.query("currentInventory").collect();
    
    const total = inventory.length;
    const withQuantity = inventory.filter(i => i.quantity !== null && i.quantity !== undefined).length;
    const withWarning = inventory.filter(i => i.quantityWarning !== null).length;
    
    // Group by quantity source
    const bySource: Record<string, number> = {};
    for (const item of inventory) {
      const source = item.quantitySource || 'unknown';
      bySource[source] = (bySource[source] || 0) + 1;
    }
    
    // Group by retailer
    const byRetailer: Record<string, { total: number; withQty: number }> = {};
    for (const item of inventory) {
      const retailerId = item.retailerId as string;
      if (!byRetailer[retailerId]) {
        byRetailer[retailerId] = { total: 0, withQty: 0 };
      }
      byRetailer[retailerId].total++;
      if (item.quantity !== null && item.quantity !== undefined) {
        byRetailer[retailerId].withQty++;
      }
    }
    
    // Calculate per-retailer quality scores
    const retailerScores = Object.entries(byRetailer).map(([id, stats]) => ({
      retailerId: id,
      total: stats.total,
      withQuantity: stats.withQty,
      score: stats.total > 0 ? Math.round((stats.withQty / stats.total) * 100) : 0,
    }));
    
    return {
      timestamp: new Date().toISOString(),
      overall: {
        totalProducts: total,
        withQuantity,
        withWarning,
        qualityScore: total > 0 ? Math.round((withQuantity / total) * 100) : 0,
      },
      bySource,
      byRetailer: retailerScores.sort((a, b) => b.score - a.score),
    };
  },
});

export const getRecentScrapeQuality = query({
  args: {
    hours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const hoursAgo = args.hours || 1;
    const cutoff = Date.now() - (hoursAgo * 60 * 60 * 1000);
    
    // Get recent menu snapshots
    const snapshots = await ctx.db
      .query("menuSnapshots")
      .filter((q) => q.gt(q.field("scrapedAt"), cutoff))
      .collect();
    
    const total = snapshots.length;
    const withQuantity = snapshots.filter(s => s.quantity !== null && s.quantity !== undefined).length;
    
    // Group by source
    const bySource: Record<string, number> = {};
    for (const snap of snapshots) {
      const source = snap.quantitySource || 'unknown';
      bySource[source] = (bySource[source] || 0) + 1;
    }
    
    return {
      timestamp: new Date().toISOString(),
      periodHours: hoursAgo,
      totalSnapshots: total,
      withQuantity,
      qualityScore: total > 0 ? Math.round((withQuantity / total) * 100) : 0,
      bySource,
    };
  },
});
