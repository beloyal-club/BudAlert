import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// ============================================================
// PRICE HISTORY QUERIES
// Get historical price data from menuSnapshots table
// ============================================================

/**
 * Get price history for a specific product at a specific retailer
 */
export const getProductPriceHistory = query({
  args: {
    productId: v.id("products"),
    retailerId: v.optional(v.id("retailers")),
    days: v.optional(v.number()), // Default 30 days
    limit: v.optional(v.number()), // Max records
  },
  handler: async (ctx, args) => {
    const days = args.days ?? 30;
    const limit = args.limit ?? 100;
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

    // Get product info
    const product = await ctx.db.get(args.productId);
    if (!product) return null;

    const brand = await ctx.db.get(product.brandId);

    // Query snapshots for this product
    let snapshots = await ctx.db
      .query("menuSnapshots")
      .withIndex("by_product_time", (q) => q.eq("productId", args.productId))
      .order("desc")
      .take(limit * 2); // Take extra to filter

    // Filter by time and optionally retailer
    snapshots = snapshots.filter((s) => {
      if (s.scrapedAt < cutoffTime) return false;
      if (args.retailerId && s.retailerId !== args.retailerId) return false;
      return true;
    }).slice(0, limit);

    // Build price timeline
    const timeline = snapshots.map((s) => ({
      timestamp: s.scrapedAt,
      price: s.price,
      originalPrice: s.originalPrice,
      isOnSale: s.isOnSale,
      discountPercent: s.discountPercent,
      inStock: s.inStock,
      retailerId: s.retailerId,
    })).reverse(); // Oldest first for charting

    // Calculate statistics
    const prices = snapshots.map((s) => s.price);
    const stats = prices.length > 0 ? {
      currentPrice: prices[0],
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      avgPrice: Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100,
      priceVariance: Math.round((Math.max(...prices) - Math.min(...prices)) * 100) / 100,
      dataPoints: prices.length,
    } : null;

    return {
      product: {
        id: product._id,
        name: product.name,
        category: product.category,
        strain: product.strain,
      },
      brand: brand ? {
        id: brand._id,
        name: brand.name,
      } : null,
      timeline,
      stats,
      periodDays: days,
    };
  },
});

/**
 * Get price history across all retailers for a product
 * Useful for price comparison view
 */
export const getProductPriceComparison = query({
  args: {
    productId: v.id("products"),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.days ?? 7;
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

    const product = await ctx.db.get(args.productId);
    if (!product) return null;

    const brand = await ctx.db.get(product.brandId);

    // Get recent snapshots
    const snapshots = await ctx.db
      .query("menuSnapshots")
      .withIndex("by_product_time", (q) => q.eq("productId", args.productId))
      .order("desc")
      .take(500);

    const recentSnapshots = snapshots.filter((s) => s.scrapedAt >= cutoffTime);

    // Group by retailer
    const byRetailer = new Map<string, {
      retailerId: Id<"retailers">;
      prices: number[];
      lastPrice: number;
      lastUpdated: number;
      inStock: boolean;
    }>();

    for (const s of recentSnapshots) {
      const key = s.retailerId.toString();
      if (!byRetailer.has(key)) {
        byRetailer.set(key, {
          retailerId: s.retailerId,
          prices: [],
          lastPrice: s.price,
          lastUpdated: s.scrapedAt,
          inStock: s.inStock,
        });
      }
      byRetailer.get(key)!.prices.push(s.price);
    }

    // Enrich with retailer data
    const retailers = await Promise.all(
      Array.from(byRetailer.entries()).map(async ([key, data]) => {
        const retailer = await ctx.db.get(data.retailerId);
        return {
          retailer: retailer ? {
            id: retailer._id,
            name: retailer.name,
            region: retailer.region,
          } : null,
          currentPrice: data.lastPrice,
          minPrice: Math.min(...data.prices),
          maxPrice: Math.max(...data.prices),
          avgPrice: Math.round((data.prices.reduce((a, b) => a + b, 0) / data.prices.length) * 100) / 100,
          lastUpdated: data.lastUpdated,
          inStock: data.inStock,
        };
      })
    );

    // Sort by current price
    retailers.sort((a, b) => a.currentPrice - b.currentPrice);

    return {
      product: {
        id: product._id,
        name: product.name,
        category: product.category,
      },
      brand: brand ? { id: brand._id, name: brand.name } : null,
      retailers,
      periodDays: days,
    };
  },
});

/**
 * Get recent price changes (price drops and increases)
 */
export const getRecentPriceChanges = query({
  args: {
    region: v.optional(v.string()),
    category: v.optional(v.string()),
    changeType: v.optional(v.union(v.literal("drop"), v.literal("increase"), v.literal("all"))),
    minChangePercent: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const minChangePercent = args.minChangePercent ?? 5;
    const changeType = args.changeType ?? "all";

    // Get inventory records with price changes
    const inventory = await ctx.db
      .query("currentInventory")
      .order("desc")
      .take(500);

    // Filter for recent price changes
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    
    const changes = inventory.filter((inv) => {
      // Must have a previous price and recent change
      if (!inv.previousPrice || !inv.priceChangedAt) return false;
      if (inv.priceChangedAt < oneDayAgo) return false;
      
      const changePercent = Math.abs(
        ((inv.currentPrice - inv.previousPrice) / inv.previousPrice) * 100
      );
      if (changePercent < minChangePercent) return false;

      if (changeType === "drop" && inv.currentPrice >= inv.previousPrice) return false;
      if (changeType === "increase" && inv.currentPrice <= inv.previousPrice) return false;

      return true;
    });

    // Enrich with product/retailer data
    const enriched = await Promise.all(
      changes.slice(0, limit).map(async (inv) => {
        const [product, retailer, brand] = await Promise.all([
          ctx.db.get(inv.productId),
          ctx.db.get(inv.retailerId),
          ctx.db.get(inv.brandId),
        ]);

        // Apply region/category filters
        if (args.region && retailer?.region !== args.region) return null;
        if (args.category && product?.category !== args.category) return null;

        const changeAmount = inv.currentPrice - (inv.previousPrice ?? inv.currentPrice);
        const changePercent = inv.previousPrice
          ? Math.round(((changeAmount) / inv.previousPrice) * 100 * 10) / 10
          : 0;

        return {
          product: product ? {
            id: product._id,
            name: product.name,
            category: product.category,
          } : null,
          brand: brand ? {
            id: brand._id,
            name: brand.name,
          } : null,
          retailer: retailer ? {
            id: retailer._id,
            name: retailer.name,
            region: retailer.region,
          } : null,
          previousPrice: inv.previousPrice,
          currentPrice: inv.currentPrice,
          changeAmount: Math.round(changeAmount * 100) / 100,
          changePercent,
          changedAt: inv.priceChangedAt,
          inStock: inv.inStock,
        };
      })
    );

    return {
      changes: enriched.filter(Boolean),
      filters: {
        region: args.region,
        category: args.category,
        changeType,
        minChangePercent,
      },
    };
  },
});

/**
 * Get price trends for a brand across the market
 */
export const getBrandPriceTrends = query({
  args: {
    brandId: v.id("brands"),
    days: v.optional(v.number()),
    granularity: v.optional(v.union(v.literal("hourly"), v.literal("daily"), v.literal("weekly"))),
  },
  handler: async (ctx, args) => {
    const days = args.days ?? 30;
    const granularity = args.granularity ?? "daily";
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

    const brand = await ctx.db.get(args.brandId);
    if (!brand) return null;

    // Get all products for this brand
    const products = await ctx.db
      .query("products")
      .withIndex("by_brand", (q) => q.eq("brandId", args.brandId))
      .collect();

    const productIds = new Set(products.map((p) => p._id.toString()));

    // Get snapshots for all brand products
    const allSnapshots: Array<{
      timestamp: number;
      price: number;
      productId: string;
    }> = [];

    for (const product of products.slice(0, 20)) { // Limit to top 20 products
      const snapshots = await ctx.db
        .query("menuSnapshots")
        .withIndex("by_product_time", (q) => q.eq("productId", product._id))
        .order("desc")
        .take(100);

      for (const s of snapshots) {
        if (s.scrapedAt >= cutoffTime) {
          allSnapshots.push({
            timestamp: s.scrapedAt,
            price: s.price,
            productId: s.productId.toString(),
          });
        }
      }
    }

    // Bucket by time period
    const getBucket = (timestamp: number): number => {
      const date = new Date(timestamp);
      if (granularity === "hourly") {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()).getTime();
      } else if (granularity === "daily") {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      } else {
        // Weekly - start of week (Sunday)
        const dayOfWeek = date.getDay();
        return new Date(date.getFullYear(), date.getMonth(), date.getDate() - dayOfWeek).getTime();
      }
    };

    const buckets = new Map<number, number[]>();
    for (const s of allSnapshots) {
      const bucket = getBucket(s.timestamp);
      if (!buckets.has(bucket)) {
        buckets.set(bucket, []);
      }
      buckets.get(bucket)!.push(s.price);
    }

    // Calculate avg per bucket
    const timeline = Array.from(buckets.entries())
      .map(([timestamp, prices]) => ({
        timestamp,
        avgPrice: Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100,
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        dataPoints: prices.length,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    // Overall stats
    const allPrices = allSnapshots.map((s) => s.price);
    const stats = allPrices.length > 0 ? {
      currentAvg: timeline.length > 0 ? timeline[timeline.length - 1].avgPrice : 0,
      overallAvg: Math.round((allPrices.reduce((a, b) => a + b, 0) / allPrices.length) * 100) / 100,
      minPrice: Math.min(...allPrices),
      maxPrice: Math.max(...allPrices),
      priceRange: Math.round((Math.max(...allPrices) - Math.min(...allPrices)) * 100) / 100,
      totalDataPoints: allPrices.length,
    } : null;

    return {
      brand: {
        id: brand._id,
        name: brand.name,
      },
      timeline,
      stats,
      periodDays: days,
      granularity,
      productCount: products.length,
    };
  },
});

/**
 * Get price drop alerts (products that dropped price in last 24h)
 */
export const getPriceDrops = query({
  args: {
    region: v.optional(v.string()),
    category: v.optional(v.string()),
    minDropPercent: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 25;
    const minDropPercent = args.minDropPercent ?? 10;
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    const inventory = await ctx.db
      .query("currentInventory")
      .order("desc")
      .take(1000);

    const drops = [];

    for (const inv of inventory) {
      if (!inv.previousPrice || !inv.priceChangedAt) continue;
      if (inv.priceChangedAt < oneDayAgo) continue;
      if (inv.currentPrice >= inv.previousPrice) continue;

      const dropPercent = ((inv.previousPrice - inv.currentPrice) / inv.previousPrice) * 100;
      if (dropPercent < minDropPercent) continue;

      const [product, retailer, brand] = await Promise.all([
        ctx.db.get(inv.productId),
        ctx.db.get(inv.retailerId),
        ctx.db.get(inv.brandId),
      ]);

      if (args.region && retailer?.region !== args.region) continue;
      if (args.category && product?.category !== args.category) continue;

      drops.push({
        product: product ? {
          id: product._id,
          name: product.name,
          category: product.category,
        } : null,
        brand: brand ? {
          id: brand._id,
          name: brand.name,
        } : null,
        retailer: retailer ? {
          id: retailer._id,
          name: retailer.name,
          region: retailer.region,
        } : null,
        previousPrice: inv.previousPrice,
        currentPrice: inv.currentPrice,
        dropAmount: Math.round((inv.previousPrice - inv.currentPrice) * 100) / 100,
        dropPercent: Math.round(dropPercent * 10) / 10,
        changedAt: inv.priceChangedAt,
        inStock: inv.inStock,
      });

      if (drops.length >= limit) break;
    }

    // Sort by drop percent
    drops.sort((a, b) => b.dropPercent - a.dropPercent);

    return {
      drops,
      filters: {
        region: args.region,
        category: args.category,
        minDropPercent,
      },
      timestamp: Date.now(),
    };
  },
});

/**
 * Get price summary for dashboard
 */
export const getPriceSummary = query({
  args: {},
  handler: async (ctx) => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const inventory = await ctx.db
      .query("currentInventory")
      .collect();

    let priceDrops24h = 0;
    let priceIncreases24h = 0;
    let totalWithPriceHistory = 0;

    for (const inv of inventory) {
      if (inv.previousPrice) {
        totalWithPriceHistory++;
        if (inv.priceChangedAt && inv.priceChangedAt >= oneDayAgo) {
          if (inv.currentPrice < inv.previousPrice) {
            priceDrops24h++;
          } else if (inv.currentPrice > inv.previousPrice) {
            priceIncreases24h++;
          }
        }
      }
    }

    // Get recent snapshots count
    const recentSnapshots = await ctx.db
      .query("menuSnapshots")
      .order("desc")
      .take(1000);
    
    const snapshots24h = recentSnapshots.filter((s) => s.scrapedAt >= oneDayAgo).length;
    const snapshotsWeek = recentSnapshots.filter((s) => s.scrapedAt >= oneWeekAgo).length;

    // Calculate average prices by category
    const byCategory = new Map<string, number[]>();
    for (const inv of inventory) {
      const product = await ctx.db.get(inv.productId);
      if (product) {
        if (!byCategory.has(product.category)) {
          byCategory.set(product.category, []);
        }
        byCategory.get(product.category)!.push(inv.currentPrice);
      }
    }

    const categoryAvgs = Array.from(byCategory.entries()).map(([category, prices]) => ({
      category,
      avgPrice: Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100,
      count: prices.length,
    }));

    return {
      summary: {
        priceDrops24h,
        priceIncreases24h,
        totalTracked: inventory.length,
        totalWithHistory: totalWithPriceHistory,
        snapshots24h,
        snapshotsWeek,
      },
      categoryAverages: categoryAvgs,
      timestamp: Date.now(),
    };
  },
});
