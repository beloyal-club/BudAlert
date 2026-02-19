/**
 * Alerts System - Phase 3
 * 
 * Consumer-friendly product watching and alert delivery
 */

import { mutation, query, action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// ============================================================
// QUERIES
// ============================================================

export const getWatchesByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const watches = await ctx.db
      .query("productWatches")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .collect();
    
    // Enrich with product/brand data
    const enriched = await Promise.all(
      watches.map(async (watch) => {
        const product = await ctx.db.get(watch.productId);
        const brand = await ctx.db.get(watch.brandId);
        return { ...watch, product, brand };
      })
    );
    
    return enriched;
  },
});

export const checkWatchExists = query({
  args: {
    email: v.string(),
    productId: v.id("products"),
  },
  handler: async (ctx, args) => {
    const watch = await ctx.db
      .query("productWatches")
      .withIndex("by_email_product", (q) => 
        q.eq("email", args.email.toLowerCase()).eq("productId", args.productId)
      )
      .first();
    
    return watch !== null;
  },
});

export const getWatcherCount = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const watches = await ctx.db
      .query("productWatches")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    
    return watches.length;
  },
});

// Get watchers for a specific product (internal)
export const getWatchersByProduct = internalQuery({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("productWatches")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

// ============================================================
// MUTATIONS
// ============================================================

export const watchProduct = mutation({
  args: {
    email: v.string(),
    productId: v.id("products"),
    alertTypes: v.optional(v.array(v.string())),
    discordWebhook: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    
    // Validate email format
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      throw new Error("Invalid email format");
    }
    
    // Check if already watching
    const existing = await ctx.db
      .query("productWatches")
      .withIndex("by_email_product", (q) => 
        q.eq("email", email).eq("productId", args.productId)
      )
      .first();
    
    if (existing) {
      // Update existing watch
      await ctx.db.patch(existing._id, {
        alertTypes: args.alertTypes || ["restock", "price_drop"],
        discordWebhook: args.discordWebhook,
        isActive: true,
      });
      return existing._id;
    }
    
    // Get product to get brandId
    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new Error("Product not found");
    }
    
    // Create new watch
    return await ctx.db.insert("productWatches", {
      email,
      productId: args.productId,
      brandId: product.brandId,
      alertTypes: args.alertTypes || ["restock", "price_drop"],
      discordWebhook: args.discordWebhook,
      isActive: true,
      createdAt: Date.now(),
    });
  },
});

export const unwatchProduct = mutation({
  args: {
    email: v.string(),
    productId: v.id("products"),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    
    const watch = await ctx.db
      .query("productWatches")
      .withIndex("by_email_product", (q) => 
        q.eq("email", email).eq("productId", args.productId)
      )
      .first();
    
    if (watch) {
      await ctx.db.delete(watch._id);
      return true;
    }
    return false;
  },
});

export const toggleWatch = mutation({
  args: { watchId: v.id("productWatches") },
  handler: async (ctx, args) => {
    const watch = await ctx.db.get(args.watchId);
    if (!watch) throw new Error("Watch not found");
    
    await ctx.db.patch(args.watchId, {
      isActive: !watch.isActive,
    });
    return !watch.isActive;
  },
});

export const deleteWatch = mutation({
  args: { watchId: v.id("productWatches") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.watchId);
    return true;
  },
});

export const updateWatchNotified = internalMutation({
  args: { watchId: v.id("productWatches") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.watchId, {
      lastNotifiedAt: Date.now(),
    });
  },
});

// ============================================================
// ALERT PROCESSING ACTION
// ============================================================

interface WatchedEvent {
  _id: any;
  eventType: string;
  productId?: any;
  brandId?: any;
  retailerId: any;
  metadata?: any;
  newValue?: { price?: number; inStock?: boolean };
  previousValue?: { price?: number; inStock?: boolean };
}

interface Watcher {
  _id: any;
  email: string;
  alertTypes: string[];
  productId: any;
  discordWebhook?: string;
  retailerIds?: any[];
}

interface ProductInfo {
  name?: string;
  brand?: { name?: string };
}

interface RetailerInfo {
  name?: string;
  address?: { city?: string; state?: string };
}

export const processWatchedAlerts = action({
  args: {
    defaultWebhookUrl: v.string(),
    maxEvents: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Get unnotified events that users might care about
    const events: WatchedEvent[] = await ctx.runQuery(
      internal.inventoryEvents.getUnnotifiedEvents, 
      {}
    );
    
    // Filter to alert-worthy events
    const alertableTypes = ["restock", "price_drop", "new_product"];
    const alertableEvents = events.filter((e) => 
      alertableTypes.includes(e.eventType) && e.productId
    );
    
    if (alertableEvents.length === 0) {
      return { processed: 0, alerts_sent: 0 };
    }
    
    let alertsSent = 0;
    const notifiedWatches: any[] = [];
    
    // For each event, check if anyone is watching
    for (const event of alertableEvents.slice(0, args.maxEvents || 50)) {
      if (!event.productId) continue;
      
      const watchers: Watcher[] = await ctx.runQuery(
        internal.alerts.getWatchersByProduct,
        { productId: event.productId }
      );
      
      if (watchers.length === 0) continue;
      
      // Get product and retailer info
      const product = await ctx.runQuery(
        internal.alerts.getProductInfo,
        { productId: event.productId }
      ) as ProductInfo | null;
      const retailer = await ctx.runQuery(
        internal.alerts.getRetailerInfo,
        { retailerId: event.retailerId }
      ) as RetailerInfo | null;
      
      // Check each watcher
      for (const watcher of watchers) {
        // Check if watcher wants this alert type
        const alertType = event.eventType === "new_product" ? "new_drop" : event.eventType;
        if (!watcher.alertTypes.includes(alertType)) continue;
        
        // Check if watcher cares about this retailer
        if (watcher.retailerIds && watcher.retailerIds.length > 0) {
          if (!watcher.retailerIds.includes(event.retailerId)) continue;
        }
        
        // Build notification
        const productName = product?.name || "Unknown Product";
        const brandName = product?.brand?.name || "Unknown Brand";
        const retailerName = retailer?.name || "Unknown Retailer";
        const location = retailer?.address ? 
          `${retailer.address.city}, ${retailer.address.state}` : "";
        
        let message = "";
        let emoji = "📦";
        let color = 0x00ff00;
        
        switch (event.eventType) {
          case "restock":
            emoji = "🔔";
            color = 0x00ff00;
            message = `**${brandName} - ${productName}** is back in stock!`;
            if (event.newValue?.price) {
              message += `\n💵 Price: $${event.newValue.price.toFixed(2)}`;
            }
            break;
          case "price_drop":
            emoji = "📉";
            color = 0x00ff00;
            const prev = event.previousValue?.price?.toFixed(2) || "?";
            const curr = event.newValue?.price?.toFixed(2) || "?";
            const pct = event.metadata?.changePercent || 0;
            message = `**${brandName} - ${productName}** price dropped!`;
            message += `\n💵 $${prev} → $${curr} (${pct}% off)`;
            break;
          case "new_product":
            emoji = "🆕";
            color = 0x5865f2;
            message = `**${brandName}** just dropped **${productName}**!`;
            if (event.newValue?.price) {
              message += `\n💵 Price: $${event.newValue.price.toFixed(2)}`;
            }
            break;
        }
        
        message += `\n📍 @ ${retailerName}${location ? ` (${location})` : ""}`;
        
        // Send to Discord
        const webhookUrl = watcher.discordWebhook || args.defaultWebhookUrl;
        
        try {
          const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: null,
              embeds: [{
                title: `${emoji} Product Alert`,
                description: message,
                color,
                footer: { text: `Watching: ${watcher.email}` },
                timestamp: new Date().toISOString(),
              }],
            }),
          });
          
          if (response.ok) {
            alertsSent++;
            notifiedWatches.push(watcher._id);
            
            // Update last notified
            await ctx.runMutation(internal.alerts.updateWatchNotified, {
              watchId: watcher._id,
            });
          }
        } catch (error) {
          console.error(`Failed to send alert to ${watcher.email}:`, error);
        }
      }
    }
    
    return {
      processed: alertableEvents.length,
      alerts_sent: alertsSent,
      watches_notified: notifiedWatches.length,
    };
  },
});

// Helper queries for the action
export const getProductInfo = internalQuery({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) return null;
    const brand = await ctx.db.get(product.brandId);
    return { ...product, brand };
  },
});

export const getRetailerInfo = internalQuery({
  args: { retailerId: v.id("retailers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.retailerId);
  },
});
