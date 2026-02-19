/**
 * Discord Alert Actions
 * 
 * Convenience actions that read webhook URLs from environment variables.
 * Designed for use with Convex crons or external triggers.
 * 
 * Environment Variables:
 * - DISCORD_WEBHOOK_PRODUCT_ALERTS: For product alerts (price drops, restocks)
 * - DISCORD_WEBHOOK_SCRAPER_ALERTS: For scraper health alerts
 */

import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";

/**
 * Process and send product alerts using environment webhook
 * 
 * Checks for unnotified inventory events (restocks, price drops, new products)
 * and sends Discord notifications to watchers.
 */
export const processProductAlerts = action({
  args: {
    maxEvents: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const webhookUrl = process.env.DISCORD_WEBHOOK_PRODUCT_ALERTS;
    
    if (!webhookUrl) {
      return {
        success: false,
        error: "DISCORD_WEBHOOK_PRODUCT_ALERTS not configured",
        hint: "Set this in Convex Dashboard → Settings → Environment Variables",
      };
    }
    
    return await ctx.runAction(api.alerts.processWatchedAlerts, {
      defaultWebhookUrl: webhookUrl,
      maxEvents: args.maxEvents || 50,
    });
  },
});

/**
 * Check scraper health and send alerts using environment webhook
 * 
 * Monitors for failures, stale scrapers, rate limits and sends alerts
 * when thresholds are exceeded.
 */
export const checkScraperHealth = action({
  args: {
    forceAlert: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const webhookUrl = process.env.DISCORD_WEBHOOK_SCRAPER_ALERTS;
    
    if (!webhookUrl) {
      return {
        success: false,
        error: "DISCORD_WEBHOOK_SCRAPER_ALERTS not configured",
        hint: "Set this in Convex Dashboard → Settings → Environment Variables",
      };
    }
    
    return await ctx.runAction(api.scraperAlerts.checkAndAlert, {
      webhookUrl,
      forceAlert: args.forceAlert || false,
    });
  },
});

/**
 * Test both configured webhooks
 */
export const testAllWebhooks = action({
  args: {},
  handler: async (ctx) => {
    const results: Record<string, { success: boolean; error?: string }> = {};
    
    // Test product alerts webhook
    const productWebhook = process.env.DISCORD_WEBHOOK_PRODUCT_ALERTS;
    if (productWebhook) {
      results.productAlerts = await ctx.runAction(api.scraperAlerts.testWebhook, {
        webhookUrl: productWebhook,
      });
    } else {
      results.productAlerts = {
        success: false,
        error: "DISCORD_WEBHOOK_PRODUCT_ALERTS not configured",
      };
    }
    
    // Test scraper alerts webhook
    const scraperWebhook = process.env.DISCORD_WEBHOOK_SCRAPER_ALERTS;
    if (scraperWebhook) {
      results.scraperAlerts = await ctx.runAction(api.scraperAlerts.testWebhook, {
        webhookUrl: scraperWebhook,
      });
    } else {
      results.scraperAlerts = {
        success: false,
        error: "DISCORD_WEBHOOK_SCRAPER_ALERTS not configured",
      };
    }
    
    return {
      results,
      allConfigured: !!productWebhook && !!scraperWebhook,
      allWorking: results.productAlerts?.success && results.scraperAlerts?.success,
    };
  },
});

/**
 * Get current webhook configuration status
 */
export const getWebhookStatus = action({
  args: {},
  handler: async () => {
    const productWebhook = process.env.DISCORD_WEBHOOK_PRODUCT_ALERTS;
    const scraperWebhook = process.env.DISCORD_WEBHOOK_SCRAPER_ALERTS;
    
    return {
      productAlerts: {
        configured: !!productWebhook,
        // Show partial URL for debugging (redact token)
        urlPreview: productWebhook 
          ? productWebhook.replace(/\/[\w-]{40,}$/, "/[REDACTED]")
          : null,
      },
      scraperAlerts: {
        configured: !!scraperWebhook,
        urlPreview: scraperWebhook
          ? scraperWebhook.replace(/\/[\w-]{40,}$/, "/[REDACTED]")
          : null,
      },
      allConfigured: !!productWebhook && !!scraperWebhook,
    };
  },
});

/**
 * Send a custom Discord message
 * 
 * Useful for sending manual notifications or announcements.
 */
export const sendCustomAlert = action({
  args: {
    webhookType: v.union(v.literal("product"), v.literal("scraper")),
    title: v.string(),
    message: v.string(),
    color: v.optional(v.number()),
    fields: v.optional(v.array(v.object({
      name: v.string(),
      value: v.string(),
      inline: v.optional(v.boolean()),
    }))),
  },
  handler: async (ctx, args) => {
    const webhookUrl = args.webhookType === "product"
      ? process.env.DISCORD_WEBHOOK_PRODUCT_ALERTS
      : process.env.DISCORD_WEBHOOK_SCRAPER_ALERTS;
    
    if (!webhookUrl) {
      return {
        success: false,
        error: `DISCORD_WEBHOOK_${args.webhookType.toUpperCase()}_ALERTS not configured`,
      };
    }
    
    const payload = {
      embeds: [{
        title: args.title,
        description: args.message,
        color: args.color || 0x5865f2,
        fields: args.fields,
        footer: { text: "CannaSignal" },
        timestamp: new Date().toISOString(),
      }],
    };
    
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
