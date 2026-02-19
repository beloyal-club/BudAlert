/**
 * Subscriptions & Monetization - Phase 6
 * 
 * Tier-based subscription management with Stripe integration
 */

import { mutation, query, action, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ============================================================
// TIER DEFINITIONS
// ============================================================

export const TIERS = {
  free: {
    name: "Free",
    price: 0,
    stripePriceId: null,
    features: {
      maxWatches: 3,
      smsAlerts: false,
      priorityAlerts: false,
      predictions: false,
      exportData: false,
      apiAccess: false,
    },
  },
  premium: {
    name: "Premium",
    price: 799, // $7.99/month
    stripePriceId: "price_PLACEHOLDER_PREMIUM", // Replace with real Stripe price ID
    features: {
      maxWatches: -1, // unlimited
      smsAlerts: true,
      priorityAlerts: true,
      predictions: true,
      exportData: true,
      apiAccess: false,
    },
  },
  pro: {
    name: "Pro",
    price: 1499, // $14.99/month
    stripePriceId: "price_PLACEHOLDER_PRO", // Replace with real Stripe price ID
    features: {
      maxWatches: -1,
      smsAlerts: true,
      priorityAlerts: true,
      predictions: true,
      exportData: true,
      apiAccess: true,
    },
  },
} as const;

export const RETAILER_TIERS = {
  starter: {
    name: "Retailer Starter",
    price: 4900, // $49/month
    stripePriceId: "price_PLACEHOLDER_RETAILER_STARTER",
    features: {
      competitorPricing: true,
      demandSignals: false,
      stockAlerts: true,
      analyticsDepth: "basic",
      apiAccess: false,
      whiteLabel: false,
    },
  },
  growth: {
    name: "Retailer Growth",
    price: 14900, // $149/month
    stripePriceId: "price_PLACEHOLDER_RETAILER_GROWTH",
    features: {
      competitorPricing: true,
      demandSignals: true,
      stockAlerts: true,
      analyticsDepth: "advanced",
      apiAccess: true,
      whiteLabel: false,
    },
  },
  enterprise: {
    name: "Retailer Enterprise",
    price: 49900, // $499/month
    stripePriceId: "price_PLACEHOLDER_RETAILER_ENTERPRISE",
    features: {
      competitorPricing: true,
      demandSignals: true,
      stockAlerts: true,
      analyticsDepth: "enterprise",
      apiAccess: true,
      whiteLabel: true,
    },
  },
} as const;

// ============================================================
// CONSUMER SUBSCRIPTION QUERIES
// ============================================================

export const getSubscription = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    
    if (!sub) {
      // Return default free tier
      return {
        email,
        tier: "free" as const,
        status: "active" as const,
        features: TIERS.free.features,
        isFreeTier: true,
      };
    }
    
    return {
      ...sub,
      isFreeTier: sub.tier === "free",
      tierDetails: TIERS[sub.tier as keyof typeof TIERS] || TIERS.free,
    };
  },
});

export const checkFeatureAccess = query({
  args: { 
    email: v.string(),
    feature: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    
    const features = sub?.features || TIERS.free.features;
    return (features as Record<string, any>)[args.feature] ?? false;
  },
});

export const canAddWatch = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    
    // Get subscription
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    
    const maxWatches = sub?.features?.maxWatches ?? TIERS.free.features.maxWatches;
    
    // -1 means unlimited
    if (maxWatches === -1) return { canAdd: true, remaining: -1, limit: -1 };
    
    // Count current watches
    const watches = await ctx.db
      .query("productWatches")
      .withIndex("by_email", (q) => q.eq("email", email))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    
    const currentCount = watches.length;
    const remaining = maxWatches - currentCount;
    
    return {
      canAdd: remaining > 0,
      remaining,
      limit: maxWatches,
      currentCount,
    };
  },
});

export const getWatchUsage = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    
    // Get subscription
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    
    const maxWatches = sub?.features?.maxWatches ?? TIERS.free.features.maxWatches;
    const tier = sub?.tier || "free";
    
    // Count current watches
    const watches = await ctx.db
      .query("productWatches")
      .withIndex("by_email", (q) => q.eq("email", email))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    
    const currentCount = watches.length;
    
    return {
      currentCount,
      maxWatches,
      isUnlimited: maxWatches === -1,
      tier,
      percentUsed: maxWatches === -1 ? 0 : Math.round((currentCount / maxWatches) * 100),
    };
  },
});

// ============================================================
// CONSUMER SUBSCRIPTION MUTATIONS
// ============================================================

export const createOrUpdateSubscription = mutation({
  args: {
    email: v.string(),
    tier: v.string(),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    stripePriceId: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    const tierConfig = TIERS[args.tier as keyof typeof TIERS];
    
    if (!tierConfig) {
      throw new Error(`Invalid tier: ${args.tier}`);
    }
    
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    
    const now = Date.now();
    
    if (existing) {
      await ctx.db.patch(existing._id, {
        tier: args.tier,
        status: "active",
        stripeCustomerId: args.stripeCustomerId || existing.stripeCustomerId,
        stripeSubscriptionId: args.stripeSubscriptionId || existing.stripeSubscriptionId,
        stripePriceId: args.stripePriceId || existing.stripePriceId,
        currentPeriodEnd: args.currentPeriodEnd,
        cancelAtPeriodEnd: false,
        features: tierConfig.features,
        updatedAt: now,
      });
      return existing._id;
    }
    
    return await ctx.db.insert("subscriptions", {
      email,
      tier: args.tier,
      status: "active",
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      stripePriceId: args.stripePriceId,
      currentPeriodEnd: args.currentPeriodEnd,
      cancelAtPeriodEnd: false,
      features: tierConfig.features,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const cancelSubscription = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    
    if (!sub) {
      throw new Error("No subscription found");
    }
    
    await ctx.db.patch(sub._id, {
      cancelAtPeriodEnd: true,
      updatedAt: Date.now(),
    });
    
    // Log payment event
    await ctx.db.insert("paymentEvents", {
      email,
      eventType: "canceled",
      tier: sub.tier,
      createdAt: Date.now(),
    });
    
    return true;
  },
});

export const downgradeToFree = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    
    const now = Date.now();
    
    if (sub) {
      await ctx.db.patch(sub._id, {
        tier: "free",
        status: "active",
        stripeSubscriptionId: undefined,
        currentPeriodEnd: undefined,
        cancelAtPeriodEnd: false,
        features: TIERS.free.features,
        updatedAt: now,
      });
    }
    
    // Log payment event
    await ctx.db.insert("paymentEvents", {
      email,
      eventType: "subscription_updated",
      tier: "free",
      metadata: { action: "downgrade" },
      createdAt: now,
    });
    
    return true;
  },
});

// ============================================================
// STRIPE WEBHOOK HANDLERS (Internal)
// ============================================================

export const handleStripeWebhook = internalMutation({
  args: {
    eventType: v.string(),
    email: v.string(),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    stripePriceId: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.number()),
    stripeEventId: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    const now = Date.now();
    
    // Determine tier from price ID
    let tier = "free";
    for (const [tierKey, tierConfig] of Object.entries(TIERS)) {
      if (tierConfig.stripePriceId === args.stripePriceId) {
        tier = tierKey;
        break;
      }
    }
    
    const tierConfig = TIERS[tier as keyof typeof TIERS] || TIERS.free;
    
    switch (args.eventType) {
      case "checkout.session.completed":
      case "customer.subscription.created":
        const existing = await ctx.db
          .query("subscriptions")
          .withIndex("by_email", (q) => q.eq("email", email))
          .first();
        
        if (existing) {
          await ctx.db.patch(existing._id, {
            tier,
            status: "active",
            stripeCustomerId: args.stripeCustomerId,
            stripeSubscriptionId: args.stripeSubscriptionId,
            stripePriceId: args.stripePriceId,
            currentPeriodEnd: args.currentPeriodEnd,
            cancelAtPeriodEnd: false,
            features: tierConfig.features,
            updatedAt: now,
          });
        } else {
          await ctx.db.insert("subscriptions", {
            email,
            tier,
            status: "active",
            stripeCustomerId: args.stripeCustomerId,
            stripeSubscriptionId: args.stripeSubscriptionId,
            stripePriceId: args.stripePriceId,
            currentPeriodEnd: args.currentPeriodEnd,
            cancelAtPeriodEnd: false,
            features: tierConfig.features,
            createdAt: now,
            updatedAt: now,
          });
        }
        break;
        
      case "customer.subscription.deleted":
        const subToDelete = await ctx.db
          .query("subscriptions")
          .withIndex("by_email", (q) => q.eq("email", email))
          .first();
        
        if (subToDelete) {
          await ctx.db.patch(subToDelete._id, {
            tier: "free",
            status: "canceled",
            features: TIERS.free.features,
            updatedAt: now,
          });
        }
        break;
        
      case "invoice.payment_failed":
        const subFailed = await ctx.db
          .query("subscriptions")
          .withIndex("by_email", (q) => q.eq("email", email))
          .first();
        
        if (subFailed) {
          await ctx.db.patch(subFailed._id, {
            status: "past_due",
            updatedAt: now,
          });
        }
        break;
    }
    
    // Log payment event
    await ctx.db.insert("paymentEvents", {
      email,
      eventType: args.eventType,
      stripeEventId: args.stripeEventId,
      tier,
      createdAt: now,
    });
  },
});

// ============================================================
// PRICING INFO (Public)
// ============================================================

export const getPricingTiers = query({
  args: {},
  handler: async () => {
    return {
      consumer: Object.entries(TIERS).map(([key, tier]) => ({
        id: key,
        name: tier.name,
        price: tier.price,
        priceFormatted: tier.price === 0 ? "Free" : `$${(tier.price / 100).toFixed(2)}/mo`,
        features: tier.features,
        popular: key === "premium",
      })),
      retailer: Object.entries(RETAILER_TIERS).map(([key, tier]) => ({
        id: key,
        name: tier.name,
        price: tier.price,
        priceFormatted: `$${(tier.price / 100).toFixed(0)}/mo`,
        features: tier.features,
        popular: key === "growth",
      })),
    };
  },
});
