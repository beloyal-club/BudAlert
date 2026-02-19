/**
 * Inventory Events - Delta Detection System
 * 
 * Tracks changes between scrape snapshots:
 * - new_product: Product appears for first time at location
 * - restock: Product goes from out-of-stock to in-stock
 * - sold_out: Product goes from in-stock to out-of-stock  
 * - price_drop: Price decreased
 * - price_increase: Price increased
 * - removed: Product disappeared from menu (not seen in 2+ scrapes)
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
  | "removed";

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
          newValue: { price: item.price, inStock: item.inStock },
          metadata: { rawName: item.rawProductName },
        });
        continue;
      }
      
      // Check for stock changes
      if (item.inStock && !existing.inStock) {
        events.push({
          eventType: "restock",
          productId: item.productId,
          brandId: item.brandId,
          previousValue: { inStock: false, outOfStockSince: existing.outOfStockSince },
          newValue: { inStock: true, price: item.price },
          metadata: { rawName: item.rawProductName },
        });
      } else if (!item.inStock && existing.inStock) {
        events.push({
          eventType: "sold_out",
          productId: item.productId,
          brandId: item.brandId,
          previousValue: { inStock: true, lastInStockAt: existing.lastInStockAt },
          newValue: { inStock: false },
          metadata: { rawName: item.rawProductName },
        });
      }
      
      // Check for price changes (only if both in stock)
      if (item.inStock && existing.inStock && item.price !== existing.currentPrice) {
        const changePercent = ((item.price - existing.currentPrice) / existing.currentPrice) * 100;
        
        // Only record significant price changes (> 1%)
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
    
    // Check for removed products (were in inventory but not in current scrape)
    // Only mark as removed if they've been missing for 2+ scrapes (via lastUpdatedAt check)
    const hourAgo = Date.now() - (60 * 60 * 1000);
    for (const existing of existingInventory) {
      const productKey = existing.productId.toString();
      if (!seenProducts.has(productKey) && existing.lastUpdatedAt < hourAgo) {
        // Product was in inventory but not in current scrape AND hasn't been updated recently
        events.push({
          eventType: "removed",
          productId: existing.productId,
          brandId: existing.brandId,
          previousValue: { 
            price: existing.currentPrice, 
            inStock: existing.inStock,
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
      },
    };
  },
});

// ============================================================
// DISCORD NOTIFICATION ACTION
// ============================================================

export const sendDiscordNotifications = action({
  args: {
    webhookUrl: v.string(),
    maxEvents: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Get unnotified events
    const events = await ctx.runQuery(internal.inventoryEvents.getUnnotifiedEvents, {});
    
    if (events.length === 0) {
      return { sent: 0, message: "No new events to notify" };
    }
    
    // Limit events per notification
    const maxEvents = args.maxEvents || 25;
    const eventsToSend = events.slice(0, maxEvents);
    
    // Group events by type for better formatting
    const grouped: Record<string, typeof eventsToSend> = {};
    for (const event of eventsToSend) {
      const type = event.eventType;
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(event);
    }
    
    // Build Discord embeds
    const embeds: any[] = [];
    
    // Event type emojis and colors
    const typeConfig: Record<string, { emoji: string; color: number }> = {
      new_product: { emoji: "🆕", color: 0x00ff00 },
      restock: { emoji: "📦", color: 0x00ff00 },
      sold_out: { emoji: "❌", color: 0xff0000 },
      price_drop: { emoji: "📉", color: 0x00ff00 },
      price_increase: { emoji: "📈", color: 0xffaa00 },
      removed: { emoji: "🗑️", color: 0x888888 },
    };
    
    // Create embed for each event type
    for (const [eventType, typeEvents] of Object.entries(grouped)) {
      const config = typeConfig[eventType] || { emoji: "📝", color: 0x5865f2 };
      
      const lines = typeEvents.slice(0, 10).map(event => {
        const brandName = event.brand?.name || "Unknown Brand";
        const productName = event.product?.name || event.metadata?.rawName || "Unknown Product";
        const retailerName = event.retailer?.name || "Unknown Retailer";
        
        let detail = "";
        if (eventType === "price_drop" || eventType === "price_increase") {
          const prev = event.previousValue?.price?.toFixed(2) || "?";
          const curr = event.newValue?.price?.toFixed(2) || "?";
          const pct = event.metadata?.changePercent || 0;
          detail = ` ($${prev} → $${curr}, ${pct > 0 ? "+" : ""}${pct}%)`;
        } else if (eventType === "restock") {
          const price = event.newValue?.price?.toFixed(2) || "?";
          detail = ` ($${price})`;
        }
        
        return `**${brandName}** - ${productName}${detail}\n└ @ ${retailerName}`;
      });
      
      if (typeEvents.length > 10) {
        lines.push(`\n_...and ${typeEvents.length - 10} more_`);
      }
      
      embeds.push({
        title: `${config.emoji} ${eventType.replace("_", " ").toUpperCase()} (${typeEvents.length})`,
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
        eventIds: eventsToSend.map(e => e._id),
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
