import { mutation, action, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// ============================================================
// HTTP ENDPOINT FOR SCRAPER CALLBACK
// ============================================================

export const ingestScrapedBatch = mutation({
  args: {
    batchId: v.string(),
    results: v.array(v.object({
      retailerId: v.id("retailers"),
      items: v.array(v.object({
        rawProductName: v.string(),
        rawBrandName: v.string(),
        rawCategory: v.optional(v.string()),
        subcategory: v.optional(v.string()),
        strainType: v.optional(v.string()),
        price: v.number(),
        originalPrice: v.optional(v.number()),
        inStock: v.boolean(),
        imageUrl: v.optional(v.string()),
        thcFormatted: v.optional(v.string()),
        cbdFormatted: v.optional(v.string()),
        sourceUrl: v.string(),
        sourcePlatform: v.string(),
        scrapedAt: v.number(),
      })),
      status: v.string(),
      error: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    let totalProcessed = 0;
    let totalFailed = 0;
    
    for (const result of args.results) {
      if (result.status !== "ok") {
        // Log failed scrape job
        await ctx.db.insert("scrapeJobs", {
          retailerId: result.retailerId,
          sourcePlatform: "unknown",
          sourceUrl: "",
          batchId: args.batchId,
          status: "failed",
          startedAt: Date.now(),
          completedAt: Date.now(),
          itemsScraped: 0,
          itemsFailed: result.items.length,
          errorMessage: result.error,
          retryCount: 0,
        });
        totalFailed += 1;
        continue;
      }
      
      // Process each scraped item
      for (const item of result.items) {
        try {
          // Normalize brand name
          const normalizedBrandName = item.rawBrandName
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "");
          
          // Find or create brand
          let brand = await ctx.db
            .query("brands")
            .withIndex("by_normalized_name", (q) => q.eq("normalizedName", normalizedBrandName))
            .first();
          
          if (!brand) {
            const brandId = await ctx.db.insert("brands", {
              name: item.rawBrandName,
              normalizedName: normalizedBrandName,
              aliases: [],
              category: mapCategory(item.rawCategory),
              isVerified: false,
              firstSeenAt: Date.now(),
            });
            brand = await ctx.db.get(brandId);
          }
          
          // Normalize product name
          const normalizedProductName = normalizeProductName(
            item.rawProductName,
            item.rawBrandName
          );
          
          // Find or create product
          const existingProducts = await ctx.db
            .query("products")
            .withIndex("by_brand", (q) => q.eq("brandId", brand!._id))
            .collect();
          
          let product = existingProducts.find((p) => p.normalizedName === normalizedProductName);
          
          if (!product) {
            const productId = await ctx.db.insert("products", {
              brandId: brand!._id,
              name: item.rawProductName,
              normalizedName: normalizedProductName,
              category: mapCategory(item.rawCategory) || "other",
              subcategory: item.subcategory,
              strain: item.strainType,
              weight: extractWeight(item.rawProductName),
              imageUrl: item.imageUrl,
              isActive: true,
              firstSeenAt: Date.now(),
              lastSeenAt: Date.now(),
            });
            product = await ctx.db.get(productId);
          } else {
            await ctx.db.patch(product._id, { lastSeenAt: Date.now() });
          }
          
          // Create menu snapshot
          const snapshotId = await ctx.db.insert("menuSnapshots", {
            retailerId: result.retailerId,
            productId: product!._id,
            scrapedAt: item.scrapedAt,
            batchId: args.batchId,
            price: item.price,
            originalPrice: item.originalPrice,
            isOnSale: item.originalPrice ? item.price < item.originalPrice : false,
            discountPercent: item.originalPrice
              ? Math.round(((item.originalPrice - item.price) / item.originalPrice) * 100)
              : undefined,
            inStock: item.inStock,
            sourceUrl: item.sourceUrl,
            sourcePlatform: item.sourcePlatform,
            rawProductName: item.rawProductName,
            rawBrandName: item.rawBrandName,
            rawCategory: item.rawCategory,
          });
          
          // Update current inventory
          await updateCurrentInventory(ctx, {
            retailerId: result.retailerId,
            productId: product!._id,
            brandId: brand!._id,
            snapshotId,
            price: item.price,
            inStock: item.inStock,
          });
          
          totalProcessed += 1;
        } catch (error) {
          console.error("Failed to process item:", error);
          totalFailed += 1;
        }
      }
      
      // Log successful scrape job
      await ctx.db.insert("scrapeJobs", {
        retailerId: result.retailerId,
        sourcePlatform: result.items[0]?.sourcePlatform || "unknown",
        sourceUrl: result.items[0]?.sourceUrl || "",
        batchId: args.batchId,
        status: "completed",
        startedAt: Date.now(),
        completedAt: Date.now(),
        itemsScraped: result.items.length,
        itemsFailed: 0,
        retryCount: 0,
      });
    }
    
    return { totalProcessed, totalFailed, batchId: args.batchId };
  },
});

// Helper to update current inventory
async function updateCurrentInventory(
  ctx: any,
  args: {
    retailerId: any;
    productId: any;
    brandId: any;
    snapshotId: any;
    price: number;
    inStock: boolean;
  }
) {
  const existing = await ctx.db
    .query("currentInventory")
    .withIndex("by_retailer_product", (q: any) =>
      q.eq("retailerId", args.retailerId).eq("productId", args.productId)
    )
    .first();
  
  const now = Date.now();
  
  if (existing) {
    const updates: any = {
      currentPrice: args.price,
      inStock: args.inStock,
      lastUpdatedAt: now,
      lastSnapshotId: args.snapshotId,
    };
    
    // Track price changes
    if (existing.currentPrice !== args.price) {
      updates.previousPrice = existing.currentPrice;
      updates.priceChangedAt = now;
    }
    
    // Track stock changes
    if (args.inStock && !existing.inStock) {
      updates.lastInStockAt = now;
      updates.outOfStockSince = undefined;
    } else if (!args.inStock && existing.inStock) {
      updates.outOfStockSince = now;
    }
    
    // Increment days on menu
    const daysSinceUpdate = (now - existing.lastUpdatedAt) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate >= 1) {
      updates.daysOnMenu = existing.daysOnMenu + Math.floor(daysSinceUpdate);
    }
    
    await ctx.db.patch(existing._id, updates);
  } else {
    // Create new inventory record
    await ctx.db.insert("currentInventory", {
      retailerId: args.retailerId,
      productId: args.productId,
      brandId: args.brandId,
      currentPrice: args.price,
      inStock: args.inStock,
      lastInStockAt: args.inStock ? now : undefined,
      daysOnMenu: 1,
      lastUpdatedAt: now,
      lastSnapshotId: args.snapshotId,
    });
  }
}

// ============================================================
// NORMALIZATION HELPERS
// ============================================================

function normalizeProductName(rawName: string, brandName: string): string {
  let name = rawName.toLowerCase().trim();
  
  // Remove brand name prefix
  const brandLower = brandName.toLowerCase();
  if (name.startsWith(brandLower)) {
    name = name.slice(brandLower.length).trim();
  }
  if (name.startsWith("-") || name.startsWith("—")) {
    name = name.slice(1).trim();
  }
  
  // Normalize separators
  name = name.replace(/[^a-z0-9]+/g, "-");
  name = name.replace(/-+/g, "-");
  name = name.replace(/^-|-$/g, "");
  
  return name;
}

function mapCategory(rawCategory?: string): string {
  if (!rawCategory) return "other";
  
  const cat = rawCategory.toLowerCase();
  
  if (cat.includes("flower") || cat.includes("bud")) return "flower";
  if (cat.includes("pre-roll") || cat.includes("preroll") || cat.includes("joint")) return "pre_roll";
  if (cat.includes("vape") || cat.includes("cartridge") || cat.includes("cart")) return "vape";
  if (cat.includes("edible") || cat.includes("gummy") || cat.includes("chocolate")) return "edible";
  if (cat.includes("concentrate") || cat.includes("wax") || cat.includes("shatter") || cat.includes("rosin")) return "concentrate";
  if (cat.includes("tincture") || cat.includes("oil")) return "tincture";
  if (cat.includes("topical") || cat.includes("cream") || cat.includes("balm")) return "topical";
  
  return "other";
}

function extractWeight(productName: string): { amount: number; unit: string } | undefined {
  // Common patterns: 3.5g, 1/8 oz, 1g, 28g, 1oz, etc.
  const patterns = [
    /(\d+\.?\d*)\s*g\b/i,           // 3.5g, 1g, 28g
    /(\d+\.?\d*)\s*gram/i,          // 3.5 gram
    /1\/8\s*oz/i,                   // 1/8 oz (= 3.5g)
    /1\/4\s*oz/i,                   // 1/4 oz (= 7g)
    /1\/2\s*oz/i,                   // 1/2 oz (= 14g)
    /(\d+)\s*oz/i,                  // 1 oz (= 28g)
    /eighth/i,                      // eighth (= 3.5g)
    /quarter/i,                     // quarter (= 7g)
    /half/i,                        // half (= 14g)
  ];
  
  const name = productName.toLowerCase();
  
  // Gram patterns
  const gramMatch = name.match(/(\d+\.?\d*)\s*g(?:ram)?s?\b/i);
  if (gramMatch) {
    return { amount: parseFloat(gramMatch[1]), unit: "g" };
  }
  
  // Fractional ounces
  if (/1\/8\s*oz|eighth/i.test(name)) return { amount: 3.5, unit: "g" };
  if (/1\/4\s*oz|quarter/i.test(name)) return { amount: 7, unit: "g" };
  if (/1\/2\s*oz|half/i.test(name)) return { amount: 14, unit: "g" };
  
  // Full ounces
  const ozMatch = name.match(/(\d+)\s*oz/i);
  if (ozMatch) {
    return { amount: parseFloat(ozMatch[1]) * 28, unit: "g" };
  }
  
  return undefined;
}
