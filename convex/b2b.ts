/**
 * B2B Module - CannaSignal for Business
 * 
 * Core functionality for dispensary customers:
 * - Competitor monitoring
 * - Price intelligence
 * - Stock-out alerts
 * - Market trends
 */

import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ============================================================
// COMPETITOR MANAGEMENT
// ============================================================

/**
 * Get competitors for a retailer account
 */
export const getCompetitors = query({
  args: {
    retailerAccountId: v.id("retailerAccounts"),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.retailerAccountId);
    if (!account) throw new Error("Account not found");

    // Get competitor monitoring entries
    const monitors = await ctx.db
      .query("competitorMonitors")
      .withIndex("by_account", (q) => q.eq("accountId", args.retailerAccountId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Enrich with retailer data
    const competitors = await Promise.all(
      monitors.map(async (monitor) => {
        const retailer = await ctx.db.get(monitor.competitorId);
        if (!retailer) return null;

        // Get latest inventory stats
        const inventoryCount = await ctx.db
          .query("currentInventory")
          .withIndex("by_retailer", (q) => q.eq("retailerId", monitor.competitorId))
          .collect();

        return {
          id: monitor._id,
          competitorId: retailer._id,
          name: retailer.name,
          address: retailer.address,
          region: retailer.region,
          lastUpdated: retailer.menuSources[0]?.lastScrapedAt,
          productsInStock: inventoryCount.filter((i) => i.inStock).length,
          totalProducts: inventoryCount.length,
          alertsEnabled: monitor.alertsEnabled,
          addedAt: monitor.addedAt,
        };
      })
    );

    return competitors.filter(Boolean);
  },
});

/**
 * Add a competitor to monitor
 */
export const addCompetitor = mutation({
  args: {
    retailerAccountId: v.id("retailerAccounts"),
    competitorId: v.id("retailers"),
    alertsEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.retailerAccountId);
    if (!account) throw new Error("Account not found");

    // Check plan limits
    const currentCount = await ctx.db
      .query("competitorMonitors")
      .withIndex("by_account", (q) => q.eq("accountId", args.retailerAccountId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const limits = {
      starter: 10,
      growth: 25,
      enterprise: Infinity,
    };

    const limit = limits[account.tier as keyof typeof limits] || 10;
    if (currentCount.length >= limit) {
      throw new Error(`Plan limit reached (${limit} competitors). Upgrade to add more.`);
    }

    // Check if already monitoring
    const existing = await ctx.db
      .query("competitorMonitors")
      .withIndex("by_account_competitor", (q) =>
        q.eq("accountId", args.retailerAccountId).eq("competitorId", args.competitorId)
      )
      .first();

    if (existing) {
      if (existing.isActive) {
        throw new Error("Already monitoring this competitor");
      }
      // Reactivate
      await ctx.db.patch(existing._id, { isActive: true });
      return existing._id;
    }

    // Create new monitor
    return await ctx.db.insert("competitorMonitors", {
      accountId: args.retailerAccountId,
      competitorId: args.competitorId,
      alertsEnabled: args.alertsEnabled ?? true,
      alertTypes: ["new_product", "price_drop", "stock_out"],
      isActive: true,
      addedAt: Date.now(),
    });
  },
});

/**
 * Remove a competitor from monitoring
 */
export const removeCompetitor = mutation({
  args: {
    monitorId: v.id("competitorMonitors"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.monitorId, { isActive: false });
  },
});

// ============================================================
// ALERTS & NOTIFICATIONS
// ============================================================

/**
 * Get alerts for a retailer account
 */
export const getAlerts = query({
  args: {
    retailerAccountId: v.id("retailerAccounts"),
    limit: v.optional(v.number()),
    unreadOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let alertsQuery = ctx.db
      .query("b2bAlerts")
      .withIndex("by_account_time", (q) => q.eq("accountId", args.retailerAccountId))
      .order("desc");

    const alerts = await alertsQuery.take(args.limit || 50);

    const filtered = args.unreadOnly ? alerts.filter((a) => !a.isRead) : alerts;

    // Enrich with retailer names
    return await Promise.all(
      filtered.map(async (alert) => {
        let competitorName = "";
        if (alert.competitorId) {
          const competitor = await ctx.db.get(alert.competitorId);
          competitorName = competitor?.name || "Unknown";
        }

        let productName = "";
        let brandName = "";
        if (alert.productId) {
          const product = await ctx.db.get(alert.productId);
          productName = product?.name || "";
          if (product?.brandId) {
            const brand = await ctx.db.get(product.brandId);
            brandName = brand?.name || "";
          }
        }

        return {
          ...alert,
          competitorName,
          productName,
          brandName,
        };
      })
    );
  },
});

/**
 * Mark alert as read
 */
export const markAlertRead = mutation({
  args: {
    alertId: v.id("b2bAlerts"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.alertId, { isRead: true, readAt: Date.now() });
  },
});

/**
 * Mark all alerts as read
 */
export const markAllAlertsRead = mutation({
  args: {
    retailerAccountId: v.id("retailerAccounts"),
  },
  handler: async (ctx, args) => {
    const unreadAlerts = await ctx.db
      .query("b2bAlerts")
      .withIndex("by_account_unread", (q) =>
        q.eq("accountId", args.retailerAccountId).eq("isRead", false)
      )
      .collect();

    for (const alert of unreadAlerts) {
      await ctx.db.patch(alert._id, { isRead: true, readAt: Date.now() });
    }

    return unreadAlerts.length;
  },
});

// ============================================================
// PRICE INTELLIGENCE
// ============================================================

/**
 * Get price comparisons for monitored products
 */
export const getPriceComparisons = query({
  args: {
    retailerAccountId: v.id("retailerAccounts"),
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.retailerAccountId);
    if (!account) throw new Error("Account not found");

    // Get monitored competitors
    const monitors = await ctx.db
      .query("competitorMonitors")
      .withIndex("by_account", (q) => q.eq("accountId", args.retailerAccountId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const competitorIds = monitors.map((m) => m.competitorId);

    // Get your own inventory (the retailer associated with this account)
    const yourInventory = await ctx.db
      .query("currentInventory")
      .withIndex("by_retailer", (q) => q.eq("retailerId", account.retailerId))
      .collect();

    // Get products to compare
    const productIds = [...new Set(yourInventory.map((i) => i.productId))];

    // For each product, get competitor prices
    const comparisons = await Promise.all(
      productIds.slice(0, args.limit || 50).map(async (productId) => {
        const product = await ctx.db.get(productId);
        if (!product) return null;

        // Filter by category if specified
        if (args.category && product.category !== args.category) return null;

        const brand = await ctx.db.get(product.brandId);

        // Your price
        const yourItem = yourInventory.find((i) => i.productId === productId);

        // Competitor prices
        const competitorPrices = await Promise.all(
          competitorIds.map(async (competitorId) => {
            const inv = await ctx.db
              .query("currentInventory")
              .withIndex("by_retailer_product", (q) =>
                q.eq("retailerId", competitorId).eq("productId", productId)
              )
              .first();

            if (!inv) return null;

            const retailer = await ctx.db.get(competitorId);
            return {
              competitorId,
              competitorName: retailer?.name || "Unknown",
              price: inv.currentPrice,
              inStock: inv.inStock,
            };
          })
        );

        const validPrices = competitorPrices.filter(Boolean) as {
          competitorId: Id<"retailers">;
          competitorName: string;
          price: number;
          inStock: boolean;
        }[];

        if (validPrices.length === 0) return null;

        const allPrices = validPrices.map((p) => p.price);

        return {
          productId,
          productName: product.name,
          brandName: brand?.name || "Unknown",
          category: product.category,
          yourPrice: yourItem?.currentPrice || null,
          yourInStock: yourItem?.inStock || false,
          marketLow: Math.min(...allPrices),
          marketHigh: Math.max(...allPrices),
          marketAvg: allPrices.reduce((a, b) => a + b, 0) / allPrices.length,
          competitorPrices: validPrices,
        };
      })
    );

    return comparisons.filter(Boolean);
  },
});

// ============================================================
// MARKET TRENDS
// ============================================================

/**
 * Get trending products in the market
 */
export const getMarketTrends = query({
  args: {
    retailerAccountId: v.id("retailerAccounts"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.retailerAccountId);
    if (!account) throw new Error("Account not found");

    // Get products with most watches (consumer demand signals)
    const watches = await ctx.db.query("productWatches").collect();

    // Count watches per product
    const watchCounts: Record<string, number> = {};
    for (const watch of watches) {
      if (watch.isActive) {
        const key = watch.productId.toString();
        watchCounts[key] = (watchCounts[key] || 0) + 1;
      }
    }

    // Sort by watch count
    const topProductIds = Object.entries(watchCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, args.limit || 10)
      .map(([id]) => id);

    // Enrich with product data
    const trends = await Promise.all(
      topProductIds.map(async (productIdStr) => {
        const productId = productIdStr as Id<"products">;
        const product = await ctx.db.get(productId);
        if (!product) return null;

        const brand = await ctx.db.get(product.brandId);

        // Check if retailer has this product
        const yourInventory = await ctx.db
          .query("currentInventory")
          .withIndex("by_retailer_product", (q) =>
            q.eq("retailerId", account.retailerId).eq("productId", productId)
          )
          .first();

        // Count how many retailers carry it
        const allInventory = await ctx.db
          .query("currentInventory")
          .withIndex("by_product", (q) => q.eq("productId", productId))
          .collect();

        const retailersCarrying = new Set(allInventory.map((i) => i.retailerId)).size;

        return {
          productId,
          productName: product.name,
          brandName: brand?.name || "Unknown",
          category: product.category,
          searchVolume: watchCounts[productIdStr] || 0,
          retailersCarrying,
          yourStore: yourInventory
            ? yourInventory.inStock
              ? "in_stock"
              : "out_of_stock"
            : "not_carried",
        };
      })
    );

    return trends.filter(Boolean);
  },
});

// ============================================================
// STOCK-OUT OPPORTUNITIES
// ============================================================

/**
 * Find products where competitors are out of stock but you have stock
 */
export const getStockOutOpportunities = query({
  args: {
    retailerAccountId: v.id("retailerAccounts"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.retailerAccountId);
    if (!account) throw new Error("Account not found");

    // Get your in-stock inventory
    const yourInventory = await ctx.db
      .query("currentInventory")
      .withIndex("by_retailer", (q) => q.eq("retailerId", account.retailerId))
      .filter((q) => q.eq(q.field("inStock"), true))
      .collect();

    // Get monitored competitors
    const monitors = await ctx.db
      .query("competitorMonitors")
      .withIndex("by_account", (q) => q.eq("accountId", args.retailerAccountId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const competitorIds = monitors.map((m) => m.competitorId);

    // For each of your in-stock products, check if competitors are out
    const opportunities = await Promise.all(
      yourInventory.slice(0, args.limit || 20).map(async (yourItem) => {
        const product = await ctx.db.get(yourItem.productId);
        if (!product) return null;

        const brand = await ctx.db.get(product.brandId);

        // Check competitor stock
        let outOfStockCount = 0;
        for (const competitorId of competitorIds) {
          const compInv = await ctx.db
            .query("currentInventory")
            .withIndex("by_retailer_product", (q) =>
              q.eq("retailerId", competitorId).eq("productId", yourItem.productId)
            )
            .first();

          if (compInv && !compInv.inStock) {
            outOfStockCount++;
          }
        }

        if (outOfStockCount === 0) return null;

        return {
          productId: yourItem.productId,
          productName: product.name,
          brandName: brand?.name || "Unknown",
          category: product.category,
          yourPrice: yourItem.currentPrice,
          competitorsOutOfStock: outOfStockCount,
          totalCompetitors: competitorIds.length,
        };
      })
    );

    // Sort by most competitors out of stock
    return opportunities.filter(Boolean).sort((a, b) => {
      if (!a || !b) return 0;
      return b.competitorsOutOfStock - a.competitorsOutOfStock;
    });
  },
});

// ============================================================
// ACCOUNT MANAGEMENT
// ============================================================

/**
 * Get retailer account by email
 */
export const getAccountByEmail = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("retailerAccounts")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!account) return null;

    const retailer = await ctx.db.get(account.retailerId);

    return {
      ...account,
      retailerName: retailer?.name || "Unknown",
      retailerAddress: retailer?.address,
    };
  },
});

/**
 * Update account settings
 */
export const updateAccountSettings = mutation({
  args: {
    retailerAccountId: v.id("retailerAccounts"),
    alertPreferences: v.optional(
      v.object({
        email: v.boolean(),
        slack: v.boolean(),
        sms: v.boolean(),
        digest: v.optional(v.string()), // "realtime" | "daily" | "weekly"
      })
    ),
    teamMembers: v.optional(
      v.array(
        v.object({
          email: v.string(),
          role: v.string(),
          addedAt: v.number(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const update: Partial<{
      alertPreferences: { email: boolean; slack: boolean; sms: boolean; digest?: string };
      teamMembers: { email: string; role: string; addedAt: number }[];
      updatedAt: number;
    }> = { updatedAt: Date.now() };

    if (args.alertPreferences) {
      update.alertPreferences = args.alertPreferences;
    }
    if (args.teamMembers) {
      update.teamMembers = args.teamMembers;
    }

    await ctx.db.patch(args.retailerAccountId, update as any);
  },
});

// ============================================================
// REGION/RADIUS FILTERING (Phase 7.1 - Conbud LES Focus)
// ============================================================

import { haversineDistance, formatDistance, NYC_RETAILER_COORDINATES, CONBUD_LES_COORDINATES, type Coordinates } from "./lib/geo";

/**
 * Get all retailers within a radius from an anchor point
 */
export const getRetailersInRadius = query({
  args: {
    anchorLat: v.optional(v.number()),
    anchorLng: v.optional(v.number()),
    radiusMiles: v.number(),
    excludeSelf: v.optional(v.string()), // Slug to exclude (your own store)
  },
  handler: async (ctx, args) => {
    // Default to Conbud LES if no anchor provided
    const anchor: Coordinates = {
      lat: args.anchorLat ?? CONBUD_LES_COORDINATES.lat,
      lng: args.anchorLng ?? CONBUD_LES_COORDINATES.lng,
    };

    // Get all active retailers
    const retailers = await ctx.db
      .query("retailers")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Calculate distances and filter
    const retailersWithDistance = retailers
      .map((retailer) => {
        // Get coordinates from address or lookup table
        let coords: Coordinates | null = null;

        // First check if retailer has coords in address
        if (retailer.address?.lat && retailer.address?.lng) {
          coords = { lat: retailer.address.lat, lng: retailer.address.lng };
        } else {
          // Look up from our coordinate database
          const slug = retailer.slug;
          if (slug && NYC_RETAILER_COORDINATES[slug]) {
            coords = NYC_RETAILER_COORDINATES[slug];
          }
        }

        if (!coords) return null;

        const distance = haversineDistance(anchor, coords);

        return {
          ...retailer,
          coordinates: coords,
          distanceMiles: distance,
          distanceFormatted: formatDistance(distance),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .filter((r) => r.distanceMiles <= args.radiusMiles)
      .filter((r) => !args.excludeSelf || r.slug !== args.excludeSelf)
      .sort((a, b) => a.distanceMiles - b.distanceMiles);

    return {
      anchor,
      radiusMiles: args.radiusMiles,
      count: retailersWithDistance.length,
      retailers: retailersWithDistance,
    };
  },
});

/**
 * Get competitors for a retailer account with distance filtering
 */
export const getCompetitorsInRadius = query({
  args: {
    retailerAccountId: v.id("retailerAccounts"),
    radiusMiles: v.number(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.retailerAccountId);
    if (!account) throw new Error("Account not found");

    // Get the anchor retailer's location
    const anchorRetailer = await ctx.db.get(account.retailerId);
    if (!anchorRetailer) throw new Error("Retailer not found");

    // Get anchor coordinates
    let anchorCoords: Coordinates;
    if (anchorRetailer.address?.lat && anchorRetailer.address?.lng) {
      anchorCoords = { lat: anchorRetailer.address.lat, lng: anchorRetailer.address.lng };
    } else if (anchorRetailer.slug && NYC_RETAILER_COORDINATES[anchorRetailer.slug]) {
      anchorCoords = NYC_RETAILER_COORDINATES[anchorRetailer.slug];
    } else {
      // Default to Conbud LES as fallback
      anchorCoords = CONBUD_LES_COORDINATES;
    }

    // Get all active retailers except self
    const retailers = await ctx.db
      .query("retailers")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const competitorsWithDistance = retailers
      .filter((r) => r._id !== account.retailerId)
      .map((retailer) => {
        let coords: Coordinates | null = null;

        if (retailer.address?.lat && retailer.address?.lng) {
          coords = { lat: retailer.address.lat, lng: retailer.address.lng };
        } else if (retailer.slug && NYC_RETAILER_COORDINATES[retailer.slug]) {
          coords = NYC_RETAILER_COORDINATES[retailer.slug];
        }

        if (!coords) return null;

        const distance = haversineDistance(anchorCoords, coords);

        return {
          id: retailer._id,
          name: retailer.name,
          slug: retailer.slug,
          address: retailer.address,
          region: retailer.region,
          coordinates: coords,
          distanceMiles: distance,
          distanceFormatted: formatDistance(distance),
          lastUpdated: retailer.menuSources?.[0]?.lastScrapedAt,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .filter((r) => r.distanceMiles <= args.radiusMiles)
      .sort((a, b) => a.distanceMiles - b.distanceMiles);

    // Check which are already being monitored
    const monitors = await ctx.db
      .query("competitorMonitors")
      .withIndex("by_account", (q) => q.eq("accountId", args.retailerAccountId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const monitoredIds = new Set(monitors.map((m) => m.competitorId.toString()));

    return {
      anchor: {
        retailerId: account.retailerId,
        name: anchorRetailer.name,
        coordinates: anchorCoords,
      },
      radiusMiles: args.radiusMiles,
      count: competitorsWithDistance.length,
      competitors: competitorsWithDistance.map((c) => ({
        ...c,
        isMonitored: monitoredIds.has(c.id.toString()),
      })),
    };
  },
});

/**
 * Update retailer location coordinates
 */
export const updateRetailerCoordinates = mutation({
  args: {
    retailerId: v.id("retailers"),
    lat: v.number(),
    lng: v.number(),
  },
  handler: async (ctx, args) => {
    const retailer = await ctx.db.get(args.retailerId);
    if (!retailer) throw new Error("Retailer not found");

    const updatedAddress = {
      ...retailer.address,
      lat: args.lat,
      lng: args.lng,
    };

    await ctx.db.patch(args.retailerId, {
      address: updatedAddress,
    });

    return { success: true };
  },
});

/**
 * Bulk add competitors within radius
 */
export const addCompetitorsInRadius = mutation({
  args: {
    retailerAccountId: v.id("retailerAccounts"),
    radiusMiles: v.number(),
    maxCompetitors: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.retailerAccountId);
    if (!account) throw new Error("Account not found");

    // Check plan limits
    const existingMonitors = await ctx.db
      .query("competitorMonitors")
      .withIndex("by_account", (q) => q.eq("accountId", args.retailerAccountId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const limits = {
      starter: 10,
      growth: 25,
      enterprise: Infinity,
    };
    const limit = limits[account.tier as keyof typeof limits] || 10;
    const available = limit - existingMonitors.length;

    if (available <= 0) {
      throw new Error(`Plan limit reached (${limit} competitors). Upgrade to add more.`);
    }

    // Get anchor retailer location
    const anchorRetailer = await ctx.db.get(account.retailerId);
    if (!anchorRetailer) throw new Error("Retailer not found");

    let anchorCoords: Coordinates;
    if (anchorRetailer.address?.lat && anchorRetailer.address?.lng) {
      anchorCoords = { lat: anchorRetailer.address.lat, lng: anchorRetailer.address.lng };
    } else if (anchorRetailer.slug && NYC_RETAILER_COORDINATES[anchorRetailer.slug]) {
      anchorCoords = NYC_RETAILER_COORDINATES[anchorRetailer.slug];
    } else {
      anchorCoords = CONBUD_LES_COORDINATES;
    }

    // Get all retailers
    const retailers = await ctx.db
      .query("retailers")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Calculate distances and filter
    const eligibleCompetitors = retailers
      .filter((r) => r._id !== account.retailerId)
      .filter((r) => !existingMonitors.some((m) => m.competitorId === r._id))
      .map((retailer) => {
        let coords: Coordinates | null = null;
        if (retailer.address?.lat && retailer.address?.lng) {
          coords = { lat: retailer.address.lat, lng: retailer.address.lng };
        } else if (retailer.slug && NYC_RETAILER_COORDINATES[retailer.slug]) {
          coords = NYC_RETAILER_COORDINATES[retailer.slug];
        }
        if (!coords) return null;

        return {
          retailer,
          distance: haversineDistance(anchorCoords, coords),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .filter((r) => r.distance <= args.radiusMiles)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, Math.min(available, args.maxCompetitors ?? available));

    // Add competitors
    const added: { id: Id<"competitorMonitors">; name: string; distance: number }[] = [];
    for (const { retailer, distance } of eligibleCompetitors) {
      const monitorId = await ctx.db.insert("competitorMonitors", {
        accountId: args.retailerAccountId,
        competitorId: retailer._id,
        alertsEnabled: true,
        alertTypes: ["new_product", "price_drop", "stock_out", "restock"],
        isActive: true,
        addedAt: Date.now(),
      });
      added.push({ id: monitorId, name: retailer.name, distance });
    }

    return {
      added: added.length,
      competitors: added,
      remaining: available - added.length,
    };
  },
});
