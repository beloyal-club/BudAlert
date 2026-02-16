import { query } from "./_generated/server";
import { v } from "convex/values";

// ============================================================
// CURRENT INVENTORY QUERIES
// ============================================================

export const getByRetailer = query({
  args: { retailerId: v.id("retailers") },
  handler: async (ctx, args) => {
    const inventory = await ctx.db
      .query("currentInventory")
      .withIndex("by_retailer", (q) => q.eq("retailerId", args.retailerId))
      .collect();
    
    // Enrich with product and brand data
    const enriched = await Promise.all(
      inventory.map(async (item) => {
        const product = await ctx.db.get(item.productId);
        const brand = await ctx.db.get(item.brandId);
        return { ...item, product, brand };
      })
    );
    
    return enriched;
  },
});

export const getByBrand = query({
  args: { brandId: v.id("brands") },
  handler: async (ctx, args) => {
    const inventory = await ctx.db
      .query("currentInventory")
      .withIndex("by_brand", (q) => q.eq("brandId", args.brandId))
      .collect();
    
    // Enrich with retailer and product data
    const enriched = await Promise.all(
      inventory.map(async (item) => {
        const retailer = await ctx.db.get(item.retailerId);
        const product = await ctx.db.get(item.productId);
        return { ...item, retailer, product };
      })
    );
    
    return enriched;
  },
});

export const getByProduct = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const inventory = await ctx.db
      .query("currentInventory")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();
    
    // Enrich with retailer data
    const enriched = await Promise.all(
      inventory.map(async (item) => {
        const retailer = await ctx.db.get(item.retailerId);
        return { ...item, retailer };
      })
    );
    
    // Sort by price
    enriched.sort((a, b) => a.currentPrice - b.currentPrice);
    
    return enriched;
  },
});

export const getOutOfStock = query({
  args: {
    brandId: v.optional(v.id("brands")),
    region: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query("currentInventory");
    
    if (args.brandId) {
      q = q.withIndex("by_stock_status", (q) =>
        q.eq("inStock", false).eq("brandId", args.brandId)
      );
    } else {
      q = q.filter((q) => q.eq(q.field("inStock"), false));
    }
    
    const outOfStock = await q.take(args.limit || 50);
    
    // Enrich with retailer, product, and brand data
    const enriched = await Promise.all(
      outOfStock.map(async (item) => {
        const retailer = await ctx.db.get(item.retailerId);
        const product = await ctx.db.get(item.productId);
        const brand = await ctx.db.get(item.brandId);
        
        // Filter by region if specified
        if (args.region && retailer?.region !== args.region) {
          return null;
        }
        
        return { ...item, retailer, product, brand };
      })
    );
    
    return enriched.filter(Boolean);
  },
});

export const getPriceChanges = query({
  args: {
    hoursAgo: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - (args.hoursAgo || 24) * 60 * 60 * 1000;
    
    const inventory = await ctx.db
      .query("currentInventory")
      .filter((q) =>
        q.and(
          q.neq(q.field("previousPrice"), undefined),
          q.gte(q.field("priceChangedAt"), cutoff)
        )
      )
      .take(args.limit || 50);
    
    // Enrich and calculate change percentage
    const enriched = await Promise.all(
      inventory.map(async (item) => {
        const retailer = await ctx.db.get(item.retailerId);
        const product = await ctx.db.get(item.productId);
        const brand = await ctx.db.get(item.brandId);
        
        const changePercent = item.previousPrice
          ? ((item.currentPrice - item.previousPrice) / item.previousPrice) * 100
          : 0;
        
        return {
          ...item,
          retailer,
          product,
          brand,
          changePercent: Math.round(changePercent * 10) / 10,
          direction: changePercent > 0 ? "up" : "down",
        };
      })
    );
    
    // Sort by absolute change percentage
    enriched.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
    
    return enriched;
  },
});
