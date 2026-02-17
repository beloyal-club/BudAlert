/**
 * Dead Letter Queue Management (REL-001)
 * 
 * Stores failed scrape attempts that exceeded max retries.
 * Allows manual review, retry, and resolution tracking.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ============================================================
// ERROR TYPE CLASSIFICATION
// ============================================================

export function classifyError(error: string, statusCode?: number): string {
  if (statusCode) {
    if (statusCode === 429) return "rate_limit";
    if (statusCode >= 500) return "server_error";
    if (statusCode === 403 || statusCode === 401) return "auth_error";
    if (statusCode === 404) return "not_found";
    if (statusCode >= 400) return "http_error";
  }
  
  const errorLower = error.toLowerCase();
  if (errorLower.includes("timeout")) return "timeout";
  if (errorLower.includes("rate limit") || errorLower.includes("too many")) return "rate_limit";
  if (errorLower.includes("parse") || errorLower.includes("json")) return "parse_error";
  if (errorLower.includes("network") || errorLower.includes("fetch")) return "network_error";
  if (errorLower.includes("graphql")) return "graphql_error";
  
  return "unknown";
}

// ============================================================
// MUTATIONS
// ============================================================

/**
 * Add a failed scrape to the dead letter queue
 */
export const addFailedScrape = mutation({
  args: {
    retailerId: v.id("retailers"),
    retailerSlug: v.string(),
    retailerName: v.string(),
    sourcePlatform: v.string(),
    sourceUrl: v.string(),
    batchId: v.string(),
    errorMessage: v.string(),
    statusCode: v.optional(v.number()),
    totalRetries: v.number(),
    firstAttemptAt: v.number(),
    lastAttemptAt: v.number(),
    rawResponse: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const errorType = classifyError(args.errorMessage, args.statusCode);
    
    // Check if there's already an unresolved entry for this retailer
    const existing = await ctx.db
      .query("deadLetterQueue")
      .withIndex("by_retailer", (q) => q.eq("retailerId", args.retailerId))
      .filter((q) => q.eq(q.field("resolvedAt"), undefined))
      .first();
    
    if (existing) {
      // Update existing entry with latest failure info
      await ctx.db.patch(existing._id, {
        lastAttemptAt: args.lastAttemptAt,
        totalRetries: existing.totalRetries + args.totalRetries,
        errorMessage: args.errorMessage,
        errorType,
        statusCode: args.statusCode,
        rawResponse: args.rawResponse?.slice(0, 1000),
      });
      return existing._id;
    }
    
    // Create new entry
    return await ctx.db.insert("deadLetterQueue", {
      ...args,
      errorType,
      rawResponse: args.rawResponse?.slice(0, 1000),
    });
  },
});

/**
 * Mark a dead letter entry as resolved
 */
export const resolve = mutation({
  args: {
    id: v.id("deadLetterQueue"),
    resolution: v.string(),
    resolvedBy: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      resolvedAt: Date.now(),
      resolution: args.resolution,
      resolvedBy: args.resolvedBy,
      notes: args.notes,
    });
  },
});

/**
 * Bulk resolve multiple entries
 */
export const bulkResolve = mutation({
  args: {
    ids: v.array(v.id("deadLetterQueue")),
    resolution: v.string(),
    resolvedBy: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const id of args.ids) {
      await ctx.db.patch(id, {
        resolvedAt: now,
        resolution: args.resolution,
        resolvedBy: args.resolvedBy,
        notes: args.notes,
      });
    }
    return { resolved: args.ids.length };
  },
});

// ============================================================
// QUERIES
// ============================================================

/**
 * Get all unresolved dead letter entries
 */
export const listUnresolved = query({
  args: {
    limit: v.optional(v.number()),
    errorType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query("deadLetterQueue")
      .filter((f) => f.eq(f.field("resolvedAt"), undefined));
    
    if (args.errorType) {
      q = q.filter((f) => f.eq(f.field("errorType"), args.errorType));
    }
    
    const entries = await q.order("desc").take(args.limit ?? 50);
    return entries;
  },
});

/**
 * Get dead letter stats summary
 */
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const unresolved = await ctx.db
      .query("deadLetterQueue")
      .filter((f) => f.eq(f.field("resolvedAt"), undefined))
      .collect();
    
    const byErrorType: Record<string, number> = {};
    const byPlatform: Record<string, number> = {};
    
    for (const entry of unresolved) {
      byErrorType[entry.errorType] = (byErrorType[entry.errorType] || 0) + 1;
      byPlatform[entry.sourcePlatform] = (byPlatform[entry.sourcePlatform] || 0) + 1;
    }
    
    // Get recent 24h resolved count
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentResolved = await ctx.db
      .query("deadLetterQueue")
      .filter((f) => 
        f.and(
          f.neq(f.field("resolvedAt"), undefined),
          f.gte(f.field("resolvedAt"), dayAgo)
        )
      )
      .collect();
    
    return {
      unresolvedCount: unresolved.length,
      resolvedLast24h: recentResolved.length,
      byErrorType,
      byPlatform,
      oldestUnresolved: unresolved.length > 0 
        ? Math.min(...unresolved.map(e => e.lastAttemptAt))
        : null,
    };
  },
});

/**
 * Get entries for a specific retailer
 */
export const getByRetailer = query({
  args: {
    retailerId: v.id("retailers"),
    includeResolved: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let entries = await ctx.db
      .query("deadLetterQueue")
      .withIndex("by_retailer", (q) => q.eq("retailerId", args.retailerId))
      .collect();
    
    if (!args.includeResolved) {
      entries = entries.filter(e => !e.resolvedAt);
    }
    
    return entries;
  },
});
