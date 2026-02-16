import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ============================================================
// ANALYTICS QUERIES
// ============================================================

export const getTrending = query({
  args: {
    region: v.optional(v.string()),
    period: v.optional(v.string()),
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const region = args.region || "statewide";
    const limit = args.limit || 10;
    
    // Get current inventory aggregated by brand
    const inventory = await ctx.db.query("currentInventory").collect();
    
    // Aggregate by brand
    const brandStats = new Map<string, {
      brandId: string;
      totalRetailers: Set<string>;
      totalProducts: number;
      avgPrice: number;
      outOfStockCount: number;
      priceSum: number;
    }>();
    
    for (const item of inventory) {
      const key = item.brandId.toString();
      
      if (!brandStats.has(key)) {
        brandStats.set(key, {
          brandId: key,
          totalRetailers: new Set(),
          totalProducts: 0,
          avgPrice: 0,
          outOfStockCount: 0,
          priceSum: 0,
        });
      }
      
      const stats = brandStats.get(key)!;
      stats.totalRetailers.add(item.retailerId.toString());
      stats.totalProducts += 1;
      stats.priceSum += item.currentPrice;
      if (!item.inStock) {
        stats.outOfStockCount += 1;
      }
    }
    
    // Calculate averages and convert to array
    const brandArray = Array.from(brandStats.values()).map((stats) => ({
      brandId: stats.brandId,
      retailerCount: stats.totalRetailers.size,
      productCount: stats.totalProducts,
      avgPrice: Math.round((stats.priceSum / stats.totalProducts) * 100) / 100,
      outOfStockCount: stats.outOfStockCount,
      // Velocity proxy: more OOS events = faster selling
      velocityScore: stats.outOfStockCount / stats.totalProducts,
    }));
    
    // Sort by retailer count (distribution) for now
    brandArray.sort((a, b) => b.retailerCount - a.retailerCount);
    
    // Enrich top brands with full data
    const topBrands = await Promise.all(
      brandArray.slice(0, limit).map(async (stats) => {
        const brand = await ctx.db.get(stats.brandId as any);
        return { ...stats, brand };
      })
    );
    
    return {
      region,
      period: args.period || "weekly",
      timestamp: Date.now(),
      brands: topBrands,
    };
  },
});

export const getBrandAnalytics = query({
  args: {
    brandId: v.id("brands"),
    region: v.optional(v.string()),
    period: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const brand = await ctx.db.get(args.brandId);
    if (!brand) return null;
    
    // Get all inventory for this brand
    const inventory = await ctx.db
      .query("currentInventory")
      .withIndex("by_brand", (q) => q.eq("brandId", args.brandId))
      .collect();
    
    // Get unique retailers
    const retailerIds = [...new Set(inventory.map((i) => i.retailerId))];
    const retailers = await Promise.all(
      retailerIds.map((id) => ctx.db.get(id))
    );
    
    // Filter by region if specified
    const filteredRetailers = args.region
      ? retailers.filter((r) => r?.region === args.region)
      : retailers;
    
    const filteredRetailerIds = new Set(
      filteredRetailers.map((r) => r?._id.toString())
    );
    
    const filteredInventory = inventory.filter((i) =>
      filteredRetailerIds.has(i.retailerId.toString())
    );
    
    // Calculate metrics
    const prices = filteredInventory.map((i) => i.currentPrice);
    const inStockCount = filteredInventory.filter((i) => i.inStock).length;
    
    return {
      brand,
      region: args.region || "statewide",
      period: args.period || "weekly",
      metrics: {
        totalRetailers: filteredRetailers.length,
        totalSkus: filteredInventory.length,
        inStockCount,
        outOfStockCount: filteredInventory.length - inStockCount,
        avgPrice: prices.length
          ? Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100
          : 0,
        minPrice: prices.length ? Math.min(...prices) : 0,
        maxPrice: prices.length ? Math.max(...prices) : 0,
      },
      retailers: filteredRetailers.map((r) => ({
        id: r?._id,
        name: r?.name,
        region: r?.region,
      })),
    };
  },
});

export const getComparisonReport = query({
  args: {
    brandIds: v.array(v.id("brands")),
    region: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const comparisons = await Promise.all(
      args.brandIds.map(async (brandId) => {
        const brand = await ctx.db.get(brandId);
        const inventory = await ctx.db
          .query("currentInventory")
          .withIndex("by_brand", (q) => q.eq("brandId", brandId))
          .collect();
        
        const retailerIds = [...new Set(inventory.map((i) => i.retailerId))];
        const prices = inventory.map((i) => i.currentPrice);
        
        return {
          brand,
          retailerCount: retailerIds.length,
          skuCount: inventory.length,
          avgPrice: prices.length
            ? Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100
            : 0,
          inStockRate: inventory.length
            ? Math.round((inventory.filter((i) => i.inStock).length / inventory.length) * 100)
            : 0,
        };
      })
    );
    
    return {
      region: args.region || "statewide",
      timestamp: Date.now(),
      brands: comparisons,
    };
  },
});

// ============================================================
// ANALYTICS COMPUTATION (run periodically)
// ============================================================

export const computeBrandAnalytics = internalMutation({
  args: {
    period: v.string(),
    periodStart: v.number(),
    periodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const brands = await ctx.db.query("brands").collect();
    const regions = ["nyc", "long_island", "hudson_valley", "statewide"];
    
    let computed = 0;
    
    for (const brand of brands) {
      for (const region of regions) {
        // Get inventory for this brand
        const inventory = await ctx.db
          .query("currentInventory")
          .withIndex("by_brand", (q) => q.eq("brandId", brand._id))
          .collect();
        
        if (inventory.length === 0) continue;
        
        // Get retailers and filter by region
        const retailerIds = [...new Set(inventory.map((i) => i.retailerId))];
        const retailers = await Promise.all(
          retailerIds.map((id) => ctx.db.get(id))
        );
        
        const filteredRetailers = region === "statewide"
          ? retailers
          : retailers.filter((r) => r?.region === region);
        
        if (filteredRetailers.length === 0) continue;
        
        const filteredRetailerIds = new Set(
          filteredRetailers.map((r) => r?._id.toString())
        );
        
        const filteredInventory = inventory.filter((i) =>
          filteredRetailerIds.has(i.retailerId.toString())
        );
        
        const prices = filteredInventory.map((i) => i.currentPrice);
        
        // Upsert brand analytics
        const existing = await ctx.db
          .query("brandAnalytics")
          .withIndex("by_brand_period", (q) =>
            q.eq("brandId", brand._id).eq("period", args.period).eq("periodStart", args.periodStart)
          )
          .first();
        
        const analyticsData = {
          brandId: brand._id,
          region,
          period: args.period,
          periodStart: args.periodStart,
          periodEnd: args.periodEnd,
          totalRetailersCarrying: filteredRetailers.length,
          newRetailersAdded: 0, // TODO: compute from historical data
          retailersDropped: 0,
          totalSkusListed: filteredInventory.length,
          avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length,
          minPrice: Math.min(...prices),
          maxPrice: Math.max(...prices),
          outOfStockEvents: filteredInventory.filter((i) => !i.inStock).length,
          avgDaysOnMenu: filteredInventory.reduce((sum, i) => sum + i.daysOnMenu, 0) / filteredInventory.length,
        };
        
        if (existing) {
          await ctx.db.patch(existing._id, analyticsData);
        } else {
          await ctx.db.insert("brandAnalytics", analyticsData);
        }
        
        computed++;
      }
    }
    
    return { computed };
  },
});
