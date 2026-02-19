/**
 * Notification Queue (CRIT-004)
 * 
 * Handles retry logic for failed Discord webhook deliveries.
 * Stores failed notifications for later retry.
 */

import { mutation, query, action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";

// ============================================================
// CONFIGURATION
// ============================================================

const RETRY_CONFIG = {
  maxRetries: 5,
  baseDelayMs: 5000,        // 5 seconds
  maxDelayMs: 300000,       // 5 minutes
  backoffMultiplier: 2,
};

// ============================================================
// MUTATIONS
// ============================================================

/**
 * Add a failed notification to the retry queue
 */
export const addToQueue = mutation({
  args: {
    webhookUrl: v.string(),
    payload: v.any(),
    eventIds: v.optional(v.array(v.id("inventoryEvents"))),
    notificationType: v.string(),  // "inventory" | "alert" | "watch"
    errorMessage: v.string(),
    attemptNumber: v.number(),
  },
  handler: async (ctx, args) => {
    // Check if there's already a pending retry for this webhook + type
    const existing = await ctx.db
      .query("notificationQueue")
      .filter(q => 
        q.and(
          q.eq(q.field("webhookUrl"), args.webhookUrl),
          q.eq(q.field("status"), "pending")
        )
      )
      .first();
    
    if (existing) {
      // Update existing entry
      await ctx.db.patch(existing._id, {
        payload: args.payload,
        errorMessage: args.errorMessage,
        attemptNumber: args.attemptNumber,
        lastAttemptAt: Date.now(),
      });
      return existing._id;
    }
    
    // Calculate next retry time with exponential backoff
    const delay = Math.min(
      RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, args.attemptNumber - 1),
      RETRY_CONFIG.maxDelayMs
    );
    
    return await ctx.db.insert("notificationQueue", {
      webhookUrl: args.webhookUrl,
      payload: args.payload,
      eventIds: args.eventIds,
      notificationType: args.notificationType,
      errorMessage: args.errorMessage,
      attemptNumber: args.attemptNumber,
      status: "pending",
      createdAt: Date.now(),
      lastAttemptAt: Date.now(),
      nextRetryAt: Date.now() + delay,
    });
  },
});

/**
 * Mark a queued notification as succeeded
 */
export const markSuccess = mutation({
  args: {
    id: v.id("notificationQueue"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "delivered",
      deliveredAt: Date.now(),
    });
  },
});

/**
 * Mark a queued notification as permanently failed
 */
export const markFailed = mutation({
  args: {
    id: v.id("notificationQueue"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "failed",
      errorMessage: args.errorMessage,
    });
  },
});

/**
 * Update retry attempt
 */
export const updateRetryAttempt = internalMutation({
  args: {
    id: v.id("notificationQueue"),
    attemptNumber: v.number(),
    errorMessage: v.string(),
    nextRetryAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      attemptNumber: args.attemptNumber,
      lastAttemptAt: Date.now(),
      errorMessage: args.errorMessage,
      nextRetryAt: args.nextRetryAt,
    });
  },
});

// ============================================================
// QUERIES
// ============================================================

/**
 * Get pending notifications ready for retry
 */
export const getPendingRetries = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    
    const pending = await ctx.db
      .query("notificationQueue")
      .filter(q => 
        q.and(
          q.eq(q.field("status"), "pending"),
          q.lte(q.field("nextRetryAt"), now)
        )
      )
      .take(10);
    
    return pending;
  },
});

/**
 * Get queue stats
 */
export const getQueueStats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("notificationQueue").collect();
    
    const pending = all.filter(n => n.status === "pending").length;
    const delivered = all.filter(n => n.status === "delivered").length;
    const failed = all.filter(n => n.status === "failed").length;
    
    const oldestPending = all
      .filter(n => n.status === "pending")
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    
    return {
      pending,
      delivered,
      failed,
      total: all.length,
      oldestPending: oldestPending?.createdAt || null,
    };
  },
});

// ============================================================
// RETRY ACTION
// ============================================================

interface QueuedNotification {
  _id: any;
  webhookUrl: string;
  payload: any;
  eventIds?: any[];
  notificationType: string;
  attemptNumber: number;
}

/**
 * Process pending retries
 */
export const processRetries = action({
  args: {},
  handler: async (ctx) => {
    const pending: QueuedNotification[] = await ctx.runQuery(
      internal.notificationQueue.getPendingRetries, 
      {}
    );
    
    if (pending.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0, exhausted: 0 };
    }
    
    let succeeded = 0;
    let failed = 0;
    let exhausted = 0;
    
    for (const notification of pending) {
      const attemptNumber = notification.attemptNumber + 1;
      
      try {
        const response = await fetch(notification.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(notification.payload),
        });
        
        if (response.ok) {
          // Success!
          await ctx.runMutation(api.notificationQueue.markSuccess, {
            id: notification._id,
          });
          succeeded++;
          
          // Mark events as notified if this was an inventory notification
          if (notification.eventIds && notification.eventIds.length > 0) {
            await ctx.runMutation(internal.inventoryEvents.markEventsNotified, {
              eventIds: notification.eventIds,
            });
          }
        } else {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        
        if (attemptNumber >= RETRY_CONFIG.maxRetries) {
          // Exhausted retries
          await ctx.runMutation(api.notificationQueue.markFailed, {
            id: notification._id,
            errorMessage: `Exhausted ${RETRY_CONFIG.maxRetries} retries. Last error: ${errorMsg}`,
          });
          exhausted++;
        } else {
          // Schedule next retry
          const delay = Math.min(
            RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attemptNumber - 1),
            RETRY_CONFIG.maxDelayMs
          );
          
          await ctx.runMutation(internal.notificationQueue.updateRetryAttempt, {
            id: notification._id,
            attemptNumber,
            errorMessage: errorMsg,
            nextRetryAt: Date.now() + delay,
          });
          failed++;
        }
      }
    }
    
    return {
      processed: pending.length,
      succeeded,
      failed,
      exhausted,
    };
  },
});
