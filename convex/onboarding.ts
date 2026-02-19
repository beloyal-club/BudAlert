/**
 * Onboarding Module - CannaSignal B2B
 * 
 * Handles dispensary signup flow:
 * - Account creation
 * - Store selection/creation
 * - Competitor selection
 * - Trial activation
 */

import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ============================================================
// TYPES
// ============================================================

const planTiers = v.union(
  v.literal("starter"),
  v.literal("growth"),
  v.literal("enterprise")
);

const billingCycles = v.union(
  v.literal("monthly"),
  v.literal("annual")
);

// Plan limits
const PLAN_LIMITS = {
  starter: {
    competitors: 10,
    teamMembers: 1,
    features: {
      competitorPricing: true,
      demandSignals: false,
      stockAlerts: true,
      analyticsDepth: "basic" as const,
      apiAccess: false,
      whiteLabel: false,
    },
  },
  growth: {
    competitors: 25,
    teamMembers: 5,
    features: {
      competitorPricing: true,
      demandSignals: true,
      stockAlerts: true,
      analyticsDepth: "advanced" as const,
      apiAccess: true,
      whiteLabel: false,
    },
  },
  enterprise: {
    competitors: Infinity,
    teamMembers: Infinity,
    features: {
      competitorPricing: true,
      demandSignals: true,
      stockAlerts: true,
      analyticsDepth: "enterprise" as const,
      apiAccess: true,
      whiteLabel: true,
    },
  },
};

// ============================================================
// QUERIES
// ============================================================

/**
 * Get available retailers for store selection
 */
export const getAvailableStores = query({
  args: {
    region: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let retailers = await ctx.db
      .query("retailers")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Filter by region if specified
    if (args.region) {
      retailers = retailers.filter(r => r.region === args.region);
    }

    // Filter by search query if specified
    if (args.search) {
      const search = args.search.toLowerCase();
      retailers = retailers.filter(r =>
        r.name.toLowerCase().includes(search) ||
        r.address.city.toLowerCase().includes(search) ||
        r.address.street.toLowerCase().includes(search)
      );
    }

    // Return simplified store data
    return retailers.map(r => ({
      id: r._id,
      name: r.name,
      slug: r.slug,
      address: {
        street: r.address.street,
        city: r.address.city,
        state: r.address.state,
        zip: r.address.zip,
      },
      region: r.region,
      coordinates: r.address.lat && r.address.lng
        ? { lat: r.address.lat, lng: r.address.lng }
        : null,
    }));
  },
});

/**
 * Get nearby competitors for a given store
 */
export const getNearbyCompetitors = query({
  args: {
    storeId: v.id("retailers"),
    radiusMiles: v.number(),
  },
  handler: async (ctx, args) => {
    const store = await ctx.db.get(args.storeId);
    if (!store) throw new Error("Store not found");

    if (!store.address.lat || !store.address.lng) {
      throw new Error("Store coordinates not available");
    }

    // Get all active retailers
    const retailers = await ctx.db
      .query("retailers")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Calculate distances and filter
    const R = 3959; // Earth's radius in miles
    const nearby = retailers
      .filter(r => r._id !== args.storeId && r.address.lat && r.address.lng)
      .map(r => {
        const lat1 = store.address.lat! * Math.PI / 180;
        const lat2 = r.address.lat! * Math.PI / 180;
        const dLat = (r.address.lat! - store.address.lat!) * Math.PI / 180;
        const dLng = (r.address.lng! - store.address.lng!) * Math.PI / 180;

        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) *
          Math.sin(dLng / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        return {
          id: r._id,
          name: r.name,
          slug: r.slug,
          address: {
            street: r.address.street,
            city: r.address.city,
            state: r.address.state,
          },
          region: r.region,
          coordinates: { lat: r.address.lat!, lng: r.address.lng! },
          distanceMiles: distance,
        };
      })
      .filter(r => r.distanceMiles <= args.radiusMiles)
      .sort((a, b) => a.distanceMiles - b.distanceMiles);

    return nearby;
  },
});

/**
 * Check if email is already registered
 */
export const checkEmailAvailability = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("retailerAccounts")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();

    return {
      available: !existing,
      message: existing ? "An account with this email already exists" : null,
    };
  },
});

// ============================================================
// MUTATIONS
// ============================================================

/**
 * Create a new retailer account (Step 1)
 */
export const createRetailerAccount = mutation({
  args: {
    dispensaryName: v.string(),
    contactEmail: v.string(),
    retailerId: v.optional(v.id("retailers")),
    // For new stores
    newStore: v.optional(v.object({
      name: v.string(),
      address: v.object({
        street: v.string(),
        city: v.string(),
        state: v.string(),
        zip: v.string(),
      }),
    })),
    tier: planTiers,
    billingCycle: billingCycles,
  },
  handler: async (ctx, args) => {
    const email = args.contactEmail.toLowerCase().trim();

    // Check for existing account
    const existing = await ctx.db
      .query("retailerAccounts")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (existing) {
      throw new Error("An account with this email already exists");
    }

    // Get or create retailer record
    let retailerId: Id<"retailers">;

    if (args.retailerId) {
      // Verify retailer exists
      const retailer = await ctx.db.get(args.retailerId);
      if (!retailer) {
        throw new Error("Selected store not found");
      }
      retailerId = args.retailerId;
    } else if (args.newStore) {
      // Create new retailer record
      retailerId = await ctx.db.insert("retailers", {
        name: args.newStore.name,
        slug: args.newStore.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
        address: {
          ...args.newStore.address,
          lat: undefined,
          lng: undefined,
        },
        region: "nyc", // Default for now
        menuSources: [],
        isActive: true,
        firstSeenAt: Date.now(),
        metadata: {
          source: "onboarding",
          createdBy: email,
        },
      });
    } else {
      throw new Error("Either retailerId or newStore must be provided");
    }

    // Get plan features
    const planConfig = PLAN_LIMITS[args.tier];

    // Create the retailer account
    const accountId = await ctx.db.insert("retailerAccounts", {
      retailerId,
      email,
      companyName: args.dispensaryName,
      tier: args.tier,
      status: "trialing",
      currentPeriodEnd: Date.now() + 14 * 24 * 60 * 60 * 1000, // 14-day trial
      features: planConfig.features,
      teamMembers: [
        {
          email,
          role: "admin",
          addedAt: Date.now(),
        },
      ],
      metadata: {
        billingCycle: args.billingCycle,
        signupSource: "onboarding_wizard",
        signupAt: Date.now(),
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return {
      accountId,
      retailerId,
      trialEndsAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
    };
  },
});

/**
 * Add competitors to monitor (Step 3)
 */
export const selectCompetitors = mutation({
  args: {
    accountId: v.id("retailerAccounts"),
    competitorIds: v.array(v.id("retailers")),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) throw new Error("Account not found");

    // Check plan limits
    const planConfig = PLAN_LIMITS[account.tier as keyof typeof PLAN_LIMITS];
    if (args.competitorIds.length > planConfig.competitors) {
      throw new Error(
        `Your ${account.tier} plan allows up to ${planConfig.competitors} competitors. ` +
        `You selected ${args.competitorIds.length}.`
      );
    }

    // Add competitor monitors
    const addedIds: Id<"competitorMonitors">[] = [];

    for (const competitorId of args.competitorIds) {
      // Check if already monitoring
      const existing = await ctx.db
        .query("competitorMonitors")
        .withIndex("by_account_competitor", (q) =>
          q.eq("accountId", args.accountId).eq("competitorId", competitorId)
        )
        .first();

      if (existing) {
        // Reactivate if inactive
        if (!existing.isActive) {
          await ctx.db.patch(existing._id, { isActive: true });
        }
        addedIds.push(existing._id);
      } else {
        // Create new monitor
        const id = await ctx.db.insert("competitorMonitors", {
          accountId: args.accountId,
          competitorId,
          alertsEnabled: true,
          alertTypes: ["new_product", "price_drop", "stock_out", "restock"],
          isActive: true,
          addedAt: Date.now(),
        });
        addedIds.push(id);
      }
    }

    return {
      addedCount: addedIds.length,
      monitorIds: addedIds,
    };
  },
});

/**
 * Start trial / activate account (Final step)
 */
export const startTrial = mutation({
  args: {
    accountId: v.id("retailerAccounts"),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) throw new Error("Account not found");

    if (account.status !== "trialing") {
      throw new Error("Account is not in trial state");
    }

    // Update account status
    await ctx.db.patch(args.accountId, {
      status: "trialing",
      currentPeriodEnd: Date.now() + 14 * 24 * 60 * 60 * 1000,
      updatedAt: Date.now(),
      metadata: {
        ...account.metadata,
        trialStartedAt: Date.now(),
      },
    });

    // Create welcome alert
    await ctx.db.insert("b2bAlerts", {
      accountId: args.accountId,
      type: "welcome",
      severity: "low",
      title: "Welcome to CannaSignal! 🎉",
      message: "Your 14-day free trial has started. Explore your dashboard to see competitor insights.",
      actionHint: "Check out the Competitors tab to see real-time inventory data.",
      isRead: false,
      deliveredVia: ["dashboard"],
      createdAt: Date.now(),
    });

    return {
      success: true,
      trialEndsAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
    };
  },
});

/**
 * Complete onboarding in a single transaction
 * Combines account creation, competitor selection, and trial start
 */
export const completeOnboarding = mutation({
  args: {
    // Account info
    dispensaryName: v.string(),
    contactEmail: v.string(),
    
    // Store selection
    retailerId: v.optional(v.id("retailers")),
    newStore: v.optional(v.object({
      name: v.string(),
      address: v.object({
        street: v.string(),
        city: v.string(),
        state: v.string(),
        zip: v.string(),
      }),
    })),
    
    // Competitors (by slug for now, since we don't have actual IDs from static data)
    competitorSlugs: v.array(v.string()),
    
    // Plan
    tier: planTiers,
    billingCycle: billingCycles,
  },
  handler: async (ctx, args) => {
    const email = args.contactEmail.toLowerCase().trim();

    // Check for existing account
    const existing = await ctx.db
      .query("retailerAccounts")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (existing) {
      throw new Error("An account with this email already exists");
    }

    // Get or create retailer record
    let retailerId: Id<"retailers">;

    if (args.retailerId) {
      const retailer = await ctx.db.get(args.retailerId);
      if (!retailer) throw new Error("Selected store not found");
      retailerId = args.retailerId;
    } else if (args.newStore) {
      retailerId = await ctx.db.insert("retailers", {
        name: args.newStore.name,
        slug: args.newStore.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
        address: {
          ...args.newStore.address,
          lat: undefined,
          lng: undefined,
        },
        region: "nyc",
        menuSources: [],
        isActive: true,
        firstSeenAt: Date.now(),
        metadata: { source: "onboarding", createdBy: email },
      });
    } else {
      throw new Error("Either retailerId or newStore must be provided");
    }

    // Get plan features
    const planConfig = PLAN_LIMITS[args.tier];

    // Create the retailer account
    const trialEndsAt = Date.now() + 14 * 24 * 60 * 60 * 1000;
    
    const accountId = await ctx.db.insert("retailerAccounts", {
      retailerId,
      email,
      companyName: args.dispensaryName,
      tier: args.tier,
      status: "trialing",
      currentPeriodEnd: trialEndsAt,
      features: planConfig.features,
      teamMembers: [{ email, role: "admin", addedAt: Date.now() }],
      metadata: {
        billingCycle: args.billingCycle,
        signupSource: "onboarding_wizard",
        signupAt: Date.now(),
        trialStartedAt: Date.now(),
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Find and add competitors by slug
    let competitorCount = 0;
    
    if (args.competitorSlugs.length > 0) {
      // Limit to plan capacity
      const slugsToAdd = args.competitorSlugs.slice(0, planConfig.competitors);
      
      for (const slug of slugsToAdd) {
        const competitor = await ctx.db
          .query("retailers")
          .withIndex("by_slug", (q) => q.eq("slug", slug))
          .first();

        if (competitor && competitor._id !== retailerId) {
          await ctx.db.insert("competitorMonitors", {
            accountId,
            competitorId: competitor._id,
            alertsEnabled: true,
            alertTypes: ["new_product", "price_drop", "stock_out", "restock"],
            isActive: true,
            addedAt: Date.now(),
          });
          competitorCount++;
        }
      }
    }

    // Create welcome alert
    await ctx.db.insert("b2bAlerts", {
      accountId,
      type: "welcome",
      severity: "low",
      title: "Welcome to CannaSignal! 🎉",
      message: `Your 14-day free trial has started. You're monitoring ${competitorCount} competitor${competitorCount !== 1 ? 's' : ''}.`,
      actionHint: "Check out the Competitors tab to see real-time inventory data.",
      isRead: false,
      deliveredVia: ["dashboard"],
      createdAt: Date.now(),
    });

    return {
      accountId,
      retailerId,
      competitorsAdded: competitorCount,
      tier: args.tier,
      trialEndsAt,
    };
  },
});

// ============================================================
// HELPERS
// ============================================================

/**
 * Get onboarding status for an email
 */
export const getOnboardingStatus = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("retailerAccounts")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();

    if (!account) {
      return { hasAccount: false };
    }

    const competitors = await ctx.db
      .query("competitorMonitors")
      .withIndex("by_account", (q) => q.eq("accountId", account._id))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    return {
      hasAccount: true,
      accountId: account._id,
      status: account.status,
      tier: account.tier,
      competitorCount: competitors.length,
      trialEndsAt: account.currentPeriodEnd,
    };
  },
});
