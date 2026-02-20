import { mutation, action, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { normalizeProductName, extractStrainName, type NormalizedProduct } from "./lib/productNormalizer";

// ============================================================
// CONSTANTS
// ============================================================

// Low stock threshold - alert when quantity drops below this
const LOW_STOCK_THRESHOLD = 5;

// Maximum entries in quantity history array
const MAX_QUANTITY_HISTORY = 10;

// Minimum quantity change to record as an event (avoid noise)
const MIN_QUANTITY_CHANGE_PERCENT = 20; // 20% change

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
        // === ENHANCED QUANTITY TRACKING ===
        quantity: v.optional(v.union(v.number(), v.null())),        // Actual inventory count
        quantityWarning: v.optional(v.union(v.string(), v.null())), // Raw warning text
        quantitySource: v.optional(v.string()),                      // "cart_hack" | "text_pattern" | "graphql" | "inferred"
        quantityCheckedAt: v.optional(v.number()),                   // When quantity was checked
        // ==================================
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
    let totalEventsDetected = 0;
    const eventBreakdown: Record<string, number> = {};
    
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
          
          // Parse product name using DATA-005 normalizer
          const parsed = normalizeProductName(
            item.rawProductName,
            item.rawBrandName,
            item.rawCategory,
            item.thcFormatted,
            item.cbdFormatted
          );
          const normalizedProductName = parsed.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "");
          
          // Find or create product
          const existingProducts = await ctx.db
            .query("products")
            .withIndex("by_brand", (q) => q.eq("brandId", brand!._id))
            .collect();
          
          let product = existingProducts.find((p) => p.normalizedName === normalizedProductName);
          
          if (!product) {
            // Use DATA-005 parsed data for clean product records
            const productId = await ctx.db.insert("products", {
              brandId: brand!._id,
              name: parsed.name,                                    // Clean name from normalizer
              normalizedName: normalizedProductName,
              category: parsed.category || mapCategory(item.rawCategory) || "other",
              subcategory: item.subcategory,
              strain: parsed.strain || item.strainType,             // Parsed strain type
              weight: parsed.weight || extractWeight(item.rawProductName),
              thcRange: parsed.thc ? { min: parsed.thc, max: parsed.thc, unit: "%" } : undefined,
              cbdRange: parsed.cbd ? { min: parsed.cbd, max: parsed.cbd, unit: "%" } : undefined,
              imageUrl: item.imageUrl,
              isActive: true,
              firstSeenAt: Date.now(),
              lastSeenAt: Date.now(),
            });
            product = (await ctx.db.get(productId)) ?? undefined;
          } else {
            await ctx.db.patch(product._id, { lastSeenAt: Date.now() });
          }
          
          // Create menu snapshot with enhanced quantity tracking
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
            // Enhanced quantity fields
            quantity: item.quantity ?? undefined,
            quantityWarning: item.quantityWarning ?? undefined,
            quantitySource: item.quantitySource ?? inferQuantitySource(item.quantity, item.quantityWarning),
            quantityCheckedAt: item.quantityCheckedAt ?? (item.quantity !== undefined ? item.scrapedAt : undefined),
            sourceUrl: item.sourceUrl,
            sourcePlatform: item.sourcePlatform,
            rawProductName: item.rawProductName,
            rawBrandName: item.rawBrandName,
            rawCategory: item.rawCategory,
          });
          
          // Update current inventory (with enhanced delta detection)
          const eventsGenerated = await updateCurrentInventory(ctx, {
            retailerId: result.retailerId,
            productId: product!._id,
            brandId: brand!._id,
            snapshotId,
            price: item.price,
            inStock: item.inStock,
            quantity: item.quantity ?? undefined,
            quantityWarning: item.quantityWarning ?? undefined,
            quantitySource: item.quantitySource ?? inferQuantitySource(item.quantity, item.quantityWarning),
            rawProductName: item.rawProductName,
            batchId: args.batchId,
          });
          
          // Track event breakdown
          for (const eventType of eventsGenerated.eventTypes) {
            eventBreakdown[eventType] = (eventBreakdown[eventType] || 0) + 1;
          }
          
          totalEventsDetected += eventsGenerated.count;
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
    
    return { 
      totalProcessed, 
      totalFailed, 
      totalEventsDetected, 
      eventBreakdown,
      batchId: args.batchId 
    };
  },
});

// ============================================================
// HELPER: Infer quantity source from available data
// ============================================================

function inferQuantitySource(
  quantity: number | null | undefined, 
  quantityWarning: string | null | undefined
): string | undefined {
  if (quantity === undefined || quantity === null) {
    return undefined;
  }
  
  // If we have a warning text, it was likely parsed from text
  if (quantityWarning) {
    return "text_pattern";
  }
  
  // Default to inferred if we have a number but no clear source
  return "inferred";
}

// ============================================================
// HELPER: Update current inventory with enhanced delta detection
// ============================================================

async function updateCurrentInventory(
  ctx: any,
  args: {
    retailerId: any;
    productId: any;
    brandId: any;
    snapshotId: any;
    price: number;
    inStock: boolean;
    quantity?: number;
    quantityWarning?: string;
    quantitySource?: string;
    rawProductName: string;
    batchId: string;
  }
): Promise<{ count: number; eventTypes: string[] }> {
  const existing = await ctx.db
    .query("currentInventory")
    .withIndex("by_retailer_product", (q: any) =>
      q.eq("retailerId", args.retailerId).eq("productId", args.productId)
    )
    .first();
  
  const now = Date.now();
  const events: Array<{
    eventType: string;
    previousValue?: any;
    newValue?: any;
    metadata?: any;
  }> = [];
  
  if (existing) {
    const updates: any = {
      currentPrice: args.price,
      inStock: args.inStock,
      lastUpdatedAt: now,
      lastSnapshotId: args.snapshotId,
    };
    
    // === ENHANCED QUANTITY TRACKING ===
    if (args.quantity !== undefined) {
      updates.previousQuantity = existing.quantity;
      updates.quantity = args.quantity;
      updates.quantityWarning = args.quantityWarning;
      updates.quantitySource = args.quantitySource;
      updates.lastQuantityAt = now;
      
      // Update quantity history (keep last N entries)
      const history = existing.quantityHistory || [];
      const newHistory = [
        { quantity: args.quantity, timestamp: now, source: args.quantitySource },
        ...history.slice(0, MAX_QUANTITY_HISTORY - 1),
      ];
      updates.quantityHistory = newHistory;
      
      // Detect quantity changes
      if (existing.quantity !== undefined && existing.quantity !== null) {
        const prevQty = existing.quantity;
        const newQty = args.quantity;
        
        // Check for low stock transition
        if (prevQty >= LOW_STOCK_THRESHOLD && newQty < LOW_STOCK_THRESHOLD && newQty > 0) {
          events.push({
            eventType: "low_stock",
            previousValue: { quantity: prevQty },
            newValue: { quantity: newQty, warning: args.quantityWarning },
            metadata: { 
              rawName: args.rawProductName,
              quantitySource: args.quantitySource,
              threshold: LOW_STOCK_THRESHOLD,
            },
          });
        }
        
        // Check for significant quantity change
        if (prevQty > 0) {
          const changePercent = ((newQty - prevQty) / prevQty) * 100;
          
          // Only record if change is significant
          if (Math.abs(changePercent) >= MIN_QUANTITY_CHANGE_PERCENT) {
            events.push({
              eventType: "quantity_change",
              previousValue: { quantity: prevQty },
              newValue: { quantity: newQty },
              metadata: { 
                rawName: args.rawProductName,
                changePercent: Math.round(changePercent * 10) / 10,
                quantitySource: args.quantitySource,
                direction: newQty > prevQty ? "increase" : "decrease",
              },
            });
          }
        }
      }
    } else if (args.quantityWarning) {
      // We have a warning but no exact quantity
      updates.quantityWarning = args.quantityWarning;
      
      // Try to detect low stock from warning text
      const lowStockMatch = args.quantityWarning.match(/only\s+(\d+)\s+left/i) ||
                           args.quantityWarning.match(/(\d+)\s+remaining/i) ||
                           args.quantityWarning.match(/low\s+stock/i);
      
      if (lowStockMatch) {
        const extractedQty = parseInt(lowStockMatch[1]) || 1;
        if (!existing.quantityWarning || extractedQty < LOW_STOCK_THRESHOLD) {
          events.push({
            eventType: "low_stock",
            previousValue: { warning: existing.quantityWarning },
            newValue: { warning: args.quantityWarning, estimatedQuantity: extractedQty },
            metadata: { 
              rawName: args.rawProductName,
              quantitySource: "text_pattern",
            },
          });
        }
      }
    }
    
    // Track price changes (with events)
    if (existing.currentPrice !== args.price) {
      updates.previousPrice = existing.currentPrice;
      updates.priceChangedAt = now;
      
      const changePercent = ((args.price - existing.currentPrice) / existing.currentPrice) * 100;
      
      // Only record significant price changes (> 1%)
      if (Math.abs(changePercent) > 1) {
        events.push({
          eventType: args.price < existing.currentPrice ? "price_drop" : "price_increase",
          previousValue: { price: existing.currentPrice },
          newValue: { price: args.price },
          metadata: { 
            rawName: args.rawProductName,
            changePercent: Math.round(changePercent * 10) / 10,
          },
        });
      }
    }
    
    // Track stock changes (with events)
    if (args.inStock && !existing.inStock) {
      updates.lastInStockAt = now;
      updates.outOfStockSince = undefined;
      
      events.push({
        eventType: "restock",
        previousValue: { inStock: false, outOfStockSince: existing.outOfStockSince },
        newValue: { inStock: true, price: args.price, quantity: args.quantity },
        metadata: { 
          rawName: args.rawProductName,
          quantitySource: args.quantitySource,
        },
      });
    } else if (!args.inStock && existing.inStock) {
      updates.outOfStockSince = now;
      
      events.push({
        eventType: "sold_out",
        previousValue: { inStock: true, lastInStockAt: existing.lastInStockAt, lastQuantity: existing.quantity },
        newValue: { inStock: false },
        metadata: { rawName: args.rawProductName },
      });
    }
    
    // Increment days on menu
    const daysSinceUpdate = (now - existing.lastUpdatedAt) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate >= 1) {
      updates.daysOnMenu = existing.daysOnMenu + Math.floor(daysSinceUpdate);
    }
    
    await ctx.db.patch(existing._id, updates);
  } else {
    // Create new inventory record
    const initialHistory = args.quantity !== undefined 
      ? [{ quantity: args.quantity, timestamp: now, source: args.quantitySource }]
      : undefined;
    
    await ctx.db.insert("currentInventory", {
      retailerId: args.retailerId,
      productId: args.productId,
      brandId: args.brandId,
      currentPrice: args.price,
      inStock: args.inStock,
      quantity: args.quantity,
      quantityWarning: args.quantityWarning,
      quantitySource: args.quantitySource,
      lastQuantityAt: args.quantity !== undefined ? now : undefined,
      quantityHistory: initialHistory,
      lastInStockAt: args.inStock ? now : undefined,
      daysOnMenu: 1,
      lastUpdatedAt: now,
      lastSnapshotId: args.snapshotId,
    });
    
    // New product event
    events.push({
      eventType: "new_product",
      newValue: { price: args.price, inStock: args.inStock, quantity: args.quantity },
      metadata: { 
        rawName: args.rawProductName, 
        quantityWarning: args.quantityWarning,
        quantitySource: args.quantitySource,
      },
    });
    
    // If new product is already low stock, also emit low_stock event
    if (args.quantity !== undefined && args.quantity < LOW_STOCK_THRESHOLD && args.quantity > 0) {
      events.push({
        eventType: "low_stock",
        newValue: { quantity: args.quantity, warning: args.quantityWarning },
        metadata: { 
          rawName: args.rawProductName,
          quantitySource: args.quantitySource,
          threshold: LOW_STOCK_THRESHOLD,
          isNewProduct: true,
        },
      });
    }
  }
  
  // Record inventory events
  const eventTypes: string[] = [];
  for (const event of events) {
    eventTypes.push(event.eventType);
    await ctx.db.insert("inventoryEvents", {
      retailerId: args.retailerId,
      productId: args.productId,
      brandId: args.brandId,
      eventType: event.eventType,
      previousValue: event.previousValue,
      newValue: event.newValue,
      metadata: event.metadata,
      batchId: args.batchId,
      timestamp: now,
      notified: false,
    });
  }
  
  return { count: events.length, eventTypes };
}

// ============================================================
// QUERY: Get low stock items
// ============================================================

export const getLowStockItems = mutation({
  args: {
    threshold: v.optional(v.number()),
    retailerId: v.optional(v.id("retailers")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const threshold = args.threshold ?? LOW_STOCK_THRESHOLD;
    const limit = args.limit ?? 50;
    
    let query = ctx.db
      .query("currentInventory")
      .withIndex("by_low_stock", (q: any) => q.eq("inStock", true));
    
    if (args.retailerId) {
      query = ctx.db
        .query("currentInventory")
        .withIndex("by_retailer", (q: any) => q.eq("retailerId", args.retailerId));
    }
    
    const items = await query.collect();
    
    // Filter by quantity threshold
    const lowStock = items
      .filter(item => 
        item.inStock && 
        item.quantity !== undefined && 
        item.quantity !== null &&
        item.quantity < threshold &&
        item.quantity > 0
      )
      .slice(0, limit);
    
    // Enrich with product/brand/retailer data
    const enriched = await Promise.all(
      lowStock.map(async (item) => {
        const product = await ctx.db.get(item.productId);
        const brand = await ctx.db.get(item.brandId);
        const retailer = await ctx.db.get(item.retailerId);
        return { ...item, product, brand, retailer };
      })
    );
    
    return enriched;
  },
});

// ============================================================
// NORMALIZATION HELPERS (legacy - kept for mapCategory/extractWeight)
// ============================================================

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
