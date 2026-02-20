/**
 * Inventory Events - Enhanced Delta Detection System
 * 
 * Tracks changes between scrape snapshots:
 * - new_product: Product appears for first time at location
 * - restock: Product goes from out-of-stock to in-stock
 * - sold_out: Product goes from in-stock to out-of-stock  
 * - price_drop: Price decreased
 * - price_increase: Price increased
 * - removed: Product disappeared from menu (not seen in 2+ scrapes)
 * - low_stock: Quantity dropped below threshold (default: 5)
 * - quantity_change: Significant quantity change (>20%)
 */

import { mutation, query, action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";

// ============================================================
// TYPES
// ============================================================

export type EventType = 
  | "new_product"
  | "restock" 
  | "sold_out"
  | "price_drop"
  | "price_increase"
  | "removed"
  | "low_stock"
  | "quantity_change";

// Event type configuration for display
const EVENT_CONFIG: Record<string, { emoji: string; color: number; priority: number }> = {
  new_product: { emoji: "🆕", color: 0x00ff00, priority: 3 },
  restock: { emoji: "📦", color: 0x00ff00, priority: 5 },
  sold_out: { emoji: "❌", color: 0xff0000, priority: 4 },
  price_drop: { emoji: "📉", color: 0x00ff00, priority: 4 },
  price_increase: { emoji: "📈", color: 0xffaa00, priority: 2 },
  removed: { emoji: "🗑️", color: 0x888888, priority: 1 },
  low_stock: { emoji: "⚠️", color: 0xff9500, priority: 4 },
  quantity_change: { emoji: "📊", color: 0x5865f2, priority: 2 },
};

// ============================================================
// QUERIES
// ============================================================

export const getRecentEvents = query({
  args: {
    limit: v.optional(v.number()),
    eventTypes: v.optional(v.array(v.string())),
    region: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let events = await ctx.db
      .query("inventoryEvents")
      .withIndex("by_time")
      .order("desc")
      .take(args.limit || 100);
    
    // Filter by event types if specified
    if (args.eventTypes && args.eventTypes.length > 0) {
      events = events.filter(e => args.eventTypes!.includes(e.eventType));
    }
    
    // Enrich with retailer/product data
    const enriched = await Promise.all(
      events.map(async (event) => {
        const retailer = await ctx.db.get(event.retailerId);
        const product = event.productId ? await ctx.db.get(event.productId) : null;
        const brand = event.brandId ? await ctx.db.get(event.brandId) : null;
        
        // Filter by region if specified
        if (args.region && retailer?.region !== args.region) {
          return null;
        }
        
        return { ...event, retailer, product, brand };
      })
    );
    
    return enriched.filter(Boolean);
  },
});

export const getEventsByRetailer = query({
  args: {
    retailerId: v.id("retailers"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("inventoryEvents")
      .withIndex("by_retailer", (q) => q.eq("retailerId", args.retailerId))
      .order("desc")
      .take(args.limit || 50);
    
    return events;
  },
});

export const getEventsByProduct = query({
  args: {
    productId: v.id("products"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("inventoryEvents")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .order("desc")
      .take(args.limit || 50);
    
    return events;
  },
});

export const getUnnotifiedEvents = internalQuery({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db
      .query("inventoryEvents")
      .withIndex("by_notified", (q) => q.eq("notified", false))
      .take(100);
    
    // Enrich with retailer/product/brand data
    const enriched = await Promise.all(
      events.map(async (event) => {
        const retailer = await ctx.db.get(event.retailerId);
        const product = event.productId ? await ctx.db.get(event.productId) : null;
        const brand = event.brandId ? await ctx.db.get(event.brandId) : null;
        
        return { ...event, retailer, product, brand };
      })
    );
    
    return enriched;
  },
});

// Query for low stock events specifically
export const getLowStockEvents = query({
  args: {
    limit: v.optional(v.number()),
    includeNotified: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("inventoryEvents")
      .withIndex("by_type", (q) => q.eq("eventType", "low_stock"));
    
    const events = await query
      .order("desc")
      .take(args.limit || 50);
    
    // Filter out notified unless requested
    const filtered = args.includeNotified 
      ? events 
      : events.filter(e => !e.notified);
    
    // Enrich
    const enriched = await Promise.all(
      filtered.map(async (event) => {
        const retailer = await ctx.db.get(event.retailerId);
        const product = event.productId ? await ctx.db.get(event.productId) : null;
        const brand = event.brandId ? await ctx.db.get(event.brandId) : null;
        return { ...event, retailer, product, brand };
      })
    );
    
    return enriched;
  },
});

// ============================================================
// MUTATIONS  
// ============================================================

export const recordEvent = mutation({
  args: {
    retailerId: v.id("retailers"),
    productId: v.optional(v.id("products")),
    brandId: v.optional(v.id("brands")),
    eventType: v.string(),
    previousValue: v.optional(v.any()),
    newValue: v.optional(v.any()),
    metadata: v.optional(v.any()),
    batchId: v.string(),
  },
  handler: async (ctx, args) => {
    const eventId = await ctx.db.insert("inventoryEvents", {
      retailerId: args.retailerId,
      productId: args.productId,
      brandId: args.brandId,
      eventType: args.eventType as EventType,
      previousValue: args.previousValue,
      newValue: args.newValue,
      metadata: args.metadata,
      batchId: args.batchId,
      timestamp: Date.now(),
      notified: false,
    });
    
    return eventId;
  },
});

export const markEventsNotified = internalMutation({
  args: {
    eventIds: v.array(v.id("inventoryEvents")),
  },
  handler: async (ctx, args) => {
    for (const eventId of args.eventIds) {
      await ctx.db.patch(eventId, { 
        notified: true,
        notifiedAt: Date.now(),
      });
    }
    return { marked: args.eventIds.length };
  },
});

// ============================================================
// DELTA DETECTION
// ============================================================

export const detectDeltas = mutation({
  args: {
    retailerId: v.id("retailers"),
    batchId: v.string(),
    currentItems: v.array(v.object({
      productId: v.id("products"),
      brandId: v.id("brands"),
      price: v.number(),
      inStock: v.boolean(),
      quantity: v.optional(v.number()),
      quantityWarning: v.optional(v.string()),
      quantitySource: v.optional(v.string()),
      rawProductName: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const events: Array<{
      eventType: string;
      productId?: any;
      brandId?: any;
      previousValue?: any;
      newValue?: any;
      metadata?: any;
    }> = [];
    
    // Get current inventory for this retailer
    const existingInventory = await ctx.db
      .query("currentInventory")
      .withIndex("by_retailer", (q) => q.eq("retailerId", args.retailerId))
      .collect();
    
    const existingByProduct = new Map(
      existingInventory.map(inv => [inv.productId.toString(), inv])
    );
    
    const seenProducts = new Set<string>();
    const LOW_STOCK_THRESHOLD = 5;
    
    // Check each current item against existing inventory
    for (const item of args.currentItems) {
      const productKey = item.productId.toString();
      seenProducts.add(productKey);
      
      const existing = existingByProduct.get(productKey);
      
      if (!existing) {
        // New product at this location
        events.push({
          eventType: "new_product",
          productId: item.productId,
          brandId: item.brandId,
          newValue: { price: item.price, inStock: item.inStock, quantity: item.quantity },
          metadata: { rawName: item.rawProductName, quantitySource: item.quantitySource },
        });
        
        // Also check if new product is low stock
        if (item.quantity !== undefined && item.quantity < LOW_STOCK_THRESHOLD && item.quantity > 0) {
          events.push({
            eventType: "low_stock",
            productId: item.productId,
            brandId: item.brandId,
            newValue: { quantity: item.quantity, warning: item.quantityWarning },
            metadata: { rawName: item.rawProductName, isNewProduct: true },
          });
        }
        continue;
      }
      
      // Check for stock changes
      if (item.inStock && !existing.inStock) {
        events.push({
          eventType: "restock",
          productId: item.productId,
          brandId: item.brandId,
          previousValue: { inStock: false, outOfStockSince: existing.outOfStockSince },
          newValue: { inStock: true, price: item.price, quantity: item.quantity },
          metadata: { rawName: item.rawProductName, quantitySource: item.quantitySource },
        });
      } else if (!item.inStock && existing.inStock) {
        events.push({
          eventType: "sold_out",
          productId: item.productId,
          brandId: item.brandId,
          previousValue: { inStock: true, lastInStockAt: existing.lastInStockAt, lastQuantity: existing.quantity },
          newValue: { inStock: false },
          metadata: { rawName: item.rawProductName },
        });
      }
      
      // Check for quantity changes (only if in stock)
      if (item.inStock && existing.inStock) {
        // Check for low stock transition
        if (existing.quantity !== undefined && existing.quantity !== null &&
            item.quantity !== undefined && item.quantity !== null) {
          
          // Low stock transition
          if (existing.quantity >= LOW_STOCK_THRESHOLD && item.quantity < LOW_STOCK_THRESHOLD && item.quantity > 0) {
            events.push({
              eventType: "low_stock",
              productId: item.productId,
              brandId: item.brandId,
              previousValue: { quantity: existing.quantity },
              newValue: { quantity: item.quantity, warning: item.quantityWarning },
              metadata: { rawName: item.rawProductName, quantitySource: item.quantitySource },
            });
          }
          
          // Significant quantity change (>20%)
          if (existing.quantity > 0) {
            const changePercent = ((item.quantity - existing.quantity) / existing.quantity) * 100;
            if (Math.abs(changePercent) >= 20) {
              events.push({
                eventType: "quantity_change",
                productId: item.productId,
                brandId: item.brandId,
                previousValue: { quantity: existing.quantity },
                newValue: { quantity: item.quantity },
                metadata: { 
                  rawName: item.rawProductName,
                  changePercent: Math.round(changePercent * 10) / 10,
                  direction: item.quantity > existing.quantity ? "increase" : "decrease",
                  quantitySource: item.quantitySource,
                },
              });
            }
          }
        }
        
        // Price changes
        if (item.price !== existing.currentPrice) {
          const changePercent = ((item.price - existing.currentPrice) / existing.currentPrice) * 100;
          
          if (Math.abs(changePercent) > 1) {
            events.push({
              eventType: item.price < existing.currentPrice ? "price_drop" : "price_increase",
              productId: item.productId,
              brandId: item.brandId,
              previousValue: { price: existing.currentPrice },
              newValue: { price: item.price },
              metadata: { 
                rawName: item.rawProductName,
                changePercent: Math.round(changePercent * 10) / 10,
              },
            });
          }
        }
      }
    }
    
    // Check for removed products
    const hourAgo = Date.now() - (60 * 60 * 1000);
    for (const existing of existingInventory) {
      const productKey = existing.productId.toString();
      if (!seenProducts.has(productKey) && existing.lastUpdatedAt < hourAgo) {
        events.push({
          eventType: "removed",
          productId: existing.productId,
          brandId: existing.brandId,
          previousValue: { 
            price: existing.currentPrice, 
            inStock: existing.inStock,
            quantity: existing.quantity,
            lastUpdatedAt: existing.lastUpdatedAt,
          },
          newValue: null,
        });
      }
    }
    
    // Record all events
    const eventIds = [];
    for (const event of events) {
      const eventId = await ctx.db.insert("inventoryEvents", {
        retailerId: args.retailerId,
        productId: event.productId,
        brandId: event.brandId,
        eventType: event.eventType as EventType,
        previousValue: event.previousValue,
        newValue: event.newValue,
        metadata: event.metadata,
        batchId: args.batchId,
        timestamp: Date.now(),
        notified: false,
      });
      eventIds.push(eventId);
    }
    
    return {
      eventsDetected: events.length,
      eventIds,
      breakdown: {
        newProducts: events.filter(e => e.eventType === "new_product").length,
        restocks: events.filter(e => e.eventType === "restock").length,
        soldOuts: events.filter(e => e.eventType === "sold_out").length,
        priceDrops: events.filter(e => e.eventType === "price_drop").length,
        priceIncreases: events.filter(e => e.eventType === "price_increase").length,
        removed: events.filter(e => e.eventType === "removed").length,
        lowStock: events.filter(e => e.eventType === "low_stock").length,
        quantityChanges: events.filter(e => e.eventType === "quantity_change").length,
      },
    };
  },
});

// ============================================================
// DISCORD NOTIFICATION ACTION
// ============================================================

interface EnrichedEvent {
  _id: any;
  eventType: string;
  brand?: { name?: string } | null;
  product?: { name?: string } | null;
  retailer?: { name?: string } | null;
  metadata?: { 
    rawName?: string; 
    changePercent?: number; 
    quantitySource?: string;
    direction?: string;
    threshold?: number;
  } | null;
  previousValue?: { price?: number; quantity?: number } | null;
  newValue?: { price?: number; quantity?: number; warning?: string } | null;
}

export const sendDiscordNotifications = action({
  args: {
    webhookUrl: v.string(),
    maxEvents: v.optional(v.number()),
    includeQuantityEvents: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ sent: number; message?: string; remaining?: number; breakdown?: Record<string, number> }> => {
    // Get unnotified events
    const events: EnrichedEvent[] = await ctx.runQuery(internal.inventoryEvents.getUnnotifiedEvents, {});
    
    if (events.length === 0) {
      return { sent: 0, message: "No new events to notify" };
    }
    
    // Filter events - optionally exclude low-priority quantity changes
    let filteredEvents = events;
    if (!args.includeQuantityEvents) {
      // Keep all events except low-priority quantity_change events
      filteredEvents = events.filter(e => 
        e.eventType !== "quantity_change" || 
        (e.metadata?.direction === "decrease" && Math.abs(e.metadata?.changePercent || 0) > 50)
      );
    }
    
    // Limit events per notification
    const maxEvents = args.maxEvents || 25;
    const eventsToSend: EnrichedEvent[] = filteredEvents.slice(0, maxEvents);
    
    // Group events by type for better formatting
    const grouped: Record<string, EnrichedEvent[]> = {};
    for (const event of eventsToSend) {
      const type = event.eventType;
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(event);
    }
    
    // Build Discord embeds
    const embeds: Array<{ title: string; description: string; color: number; timestamp: string }> = [];
    
    // Sort event types by priority
    const sortedTypes = Object.keys(grouped).sort((a, b) => {
      const priorityA = EVENT_CONFIG[a]?.priority || 0;
      const priorityB = EVENT_CONFIG[b]?.priority || 0;
      return priorityB - priorityA;
    });
    
    // Create embed for each event type
    for (const eventType of sortedTypes) {
      const typeEvents = grouped[eventType];
      const config = EVENT_CONFIG[eventType] || { emoji: "📝", color: 0x5865f2 };
      
      const lines = typeEvents.slice(0, 10).map((event: EnrichedEvent) => {
        const brandName = event.brand?.name || "Unknown Brand";
        const productName = event.product?.name || event.metadata?.rawName || "Unknown Product";
        const retailerName = event.retailer?.name || "Unknown Retailer";
        
        let detail = "";
        switch (eventType) {
          case "price_drop":
          case "price_increase": {
            const prev = event.previousValue?.price?.toFixed(2) || "?";
            const curr = event.newValue?.price?.toFixed(2) || "?";
            const pct = event.metadata?.changePercent || 0;
            detail = ` ($${prev} → $${curr}, ${pct > 0 ? "+" : ""}${pct}%)`;
            break;
          }
          case "restock": {
            const price = event.newValue?.price?.toFixed(2) || "?";
            const qty = event.newValue?.quantity;
            detail = qty !== undefined ? ` ($${price}, ${qty} in stock)` : ` ($${price})`;
            break;
          }
          case "low_stock": {
            const qty = event.newValue?.quantity;
            const warning = event.newValue?.warning;
            detail = qty !== undefined ? ` (${qty} left)` : warning ? ` (${warning})` : " (low stock)";
            break;
          }
          case "quantity_change": {
            const prev = event.previousValue?.quantity;
            const curr = event.newValue?.quantity;
            const pct = event.metadata?.changePercent || 0;
            const dir = event.metadata?.direction === "increase" ? "↑" : "↓";
            detail = ` (${prev} → ${curr}, ${dir}${Math.abs(pct)}%)`;
            break;
          }
          case "sold_out": {
            const lastQty = event.previousValue?.quantity;
            detail = lastQty !== undefined ? ` (was ${lastQty})` : "";
            break;
          }
          case "new_product": {
            const price = event.newValue?.price?.toFixed(2) || "?";
            const qty = event.newValue?.quantity;
            detail = qty !== undefined ? ` ($${price}, ${qty} avail)` : ` ($${price})`;
            break;
          }
        }
        
        return `**${brandName}** - ${productName}${detail}\n└ @ ${retailerName}`;
      });
      
      if (typeEvents.length > 10) {
        lines.push(`\n_...and ${typeEvents.length - 10} more_`);
      }
      
      // Format title based on event type
      let title = eventType.replace(/_/g, " ").toUpperCase();
      if (eventType === "low_stock") title = "LOW STOCK ALERT";
      if (eventType === "quantity_change") title = "QUANTITY CHANGES";
      
      embeds.push({
        title: `${config.emoji} ${title} (${typeEvents.length})`,
        description: lines.join("\n"),
        color: config.color,
        timestamp: new Date().toISOString(),
      });
    }
    
    // Send to Discord
    try {
      const response = await fetch(args.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `🌿 **CannaSignal Inventory Update** - ${eventsToSend.length} changes detected`,
          embeds: embeds.slice(0, 10), // Discord limit
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Discord webhook failed: ${response.status} ${response.statusText}`);
      }
      
      // Mark events as notified
      await ctx.runMutation(internal.inventoryEvents.markEventsNotified, {
        eventIds: eventsToSend.map((e: EnrichedEvent) => e._id),
      });
      
      return {
        sent: eventsToSend.length,
        remaining: events.length - eventsToSend.length,
        breakdown: Object.fromEntries(
          Object.entries(grouped).map(([k, v]) => [k, v.length])
        ),
      };
    } catch (error) {
      console.error("Discord notification failed:", error);
      throw error;
    }
  },
});

// ============================================================
// DEDICATED LOW STOCK ALERT ACTION
// ============================================================

export const sendLowStockAlerts = action({
  args: {
    webhookUrl: v.string(),
    maxAlerts: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ sent: number; products: string[] }> => {
    // Get unnotified low stock events
    const events = await ctx.runQuery(internal.inventoryEvents.getUnnotifiedEvents, {});
    
    const lowStockEvents = events.filter(e => e.eventType === "low_stock");
    
    if (lowStockEvents.length === 0) {
      return { sent: 0, products: [] };
    }
    
    const maxAlerts = args.maxAlerts || 20;
    const eventsToSend = lowStockEvents.slice(0, maxAlerts);
    
    // Build a single embed for all low stock alerts
    const lines = eventsToSend.map((event: EnrichedEvent) => {
      const brandName = event.brand?.name || "Unknown";
      const productName = event.product?.name || event.metadata?.rawName || "Unknown";
      const retailerName = event.retailer?.name || "Unknown";
      const qty = event.newValue?.quantity;
      const warning = event.newValue?.warning;
      
      const qtyText = qty !== undefined ? `**${qty}** left` : warning || "low";
      
      return `⚠️ **${brandName}** - ${productName}\n└ ${qtyText} @ ${retailerName}`;
    });
    
    if (lowStockEvents.length > maxAlerts) {
      lines.push(`\n_...and ${lowStockEvents.length - maxAlerts} more items running low_`);
    }
    
    const embed = {
      title: `⚠️ LOW STOCK ALERT (${eventsToSend.length} products)`,
      description: lines.join("\n\n"),
      color: 0xff9500, // Orange
      footer: { text: "CannaSignal • Inventory Intelligence" },
      timestamp: new Date().toISOString(),
    };
    
    try {
      const response = await fetch(args.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "🚨 **Products running low on stock!**",
          embeds: [embed],
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Discord webhook failed: ${response.status}`);
      }
      
      // Mark as notified
      await ctx.runMutation(internal.inventoryEvents.markEventsNotified, {
        eventIds: eventsToSend.map((e: EnrichedEvent) => e._id),
      });
      
      return {
        sent: eventsToSend.length,
        products: eventsToSend.map((e: EnrichedEvent) => 
          `${e.brand?.name || "?"} - ${e.product?.name || e.metadata?.rawName || "?"}`
        ),
      };
    } catch (error) {
      console.error("Low stock alert failed:", error);
      throw error;
    }
  },
});
