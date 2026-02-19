/**
 * Smart Analytics - Phase 5: Intelligent Product Insights
 * 
 * Analyzes inventoryEvents to provide:
 * - Sell-out velocity (how fast products sell out)
 * - Restock patterns (when do restocks typically happen)
 * - Drop patterns (when do new products appear)
 * - Popularity scores (based on sell-out speed + restock frequency)
 * - "Hot right now" feed (trending across multiple locations)
 */

import { query, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// ============================================================
// TYPES
// ============================================================

interface VelocityStats {
  avgHoursToSellout: number | null;
  medianHoursToSellout: number | null;
  fastestSellout: number | null;
  selloutCount: number;
  confidence: "high" | "medium" | "low" | "insufficient";
  recentTrend: "faster" | "slower" | "stable" | "unknown";
}

interface RestockPattern {
  avgDaysBetweenRestocks: number | null;
  preferredDays: string[]; // e.g., ["Tuesday", "Friday"]
  preferredHours: number[]; // e.g., [10, 14] for 10AM, 2PM
  restockCount: number;
  confidence: "high" | "medium" | "low" | "insufficient";
  nextPredictedRestock: number | null; // timestamp
}

interface DropPattern {
  preferredDays: string[];
  preferredHours: number[];
  avgDropsPerWeek: number;
  totalDrops: number;
  confidence: "high" | "medium" | "low" | "insufficient";
}

// ============================================================
// SELL-OUT VELOCITY
// ============================================================

export const getSelloutVelocity = query({
  args: {
    productId: v.id("products"),
  },
  handler: async (ctx, args): Promise<VelocityStats> => {
    // Get all events for this product
    const events = await ctx.db
      .query("inventoryEvents")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .order("asc")
      .collect();

    if (events.length < 2) {
      return {
        avgHoursToSellout: null,
        medianHoursToSellout: null,
        fastestSellout: null,
        selloutCount: 0,
        confidence: "insufficient",
        recentTrend: "unknown",
      };
    }

    // Find restock -> sold_out pairs to calculate velocity
    const selloutDurations: number[] = [];
    const recentSellouts: number[] = []; // last 5 for trend
    
    // Group events by location
    const eventsByLocation = new Map<string, typeof events>();
    for (const event of events) {
      const key = event.retailerId.toString();
      if (!eventsByLocation.has(key)) eventsByLocation.set(key, []);
      eventsByLocation.get(key)!.push(event);
    }

    // For each location, find restock->sold_out sequences
    for (const locationEvents of eventsByLocation.values()) {
      let lastRestockTime: number | null = null;
      let lastNewProductTime: number | null = null;

      for (const event of locationEvents) {
        if (event.eventType === "restock" || event.eventType === "new_product") {
          if (event.eventType === "restock") {
            lastRestockTime = event.timestamp;
          } else {
            lastNewProductTime = event.timestamp;
          }
        } else if (event.eventType === "sold_out") {
          const referenceTime = lastRestockTime || lastNewProductTime;
          if (referenceTime) {
            const hoursToSellout = (event.timestamp - referenceTime) / (1000 * 60 * 60);
            // Only count reasonable durations (< 30 days)
            if (hoursToSellout > 0 && hoursToSellout < 720) {
              selloutDurations.push(hoursToSellout);
            }
          }
          // Reset after sold out
          lastRestockTime = null;
          lastNewProductTime = null;
        }
      }
    }

    if (selloutDurations.length === 0) {
      return {
        avgHoursToSellout: null,
        medianHoursToSellout: null,
        fastestSellout: null,
        selloutCount: 0,
        confidence: "insufficient",
        recentTrend: "unknown",
      };
    }

    // Calculate stats
    selloutDurations.sort((a, b) => a - b);
    const avg = selloutDurations.reduce((a, b) => a + b, 0) / selloutDurations.length;
    const median = selloutDurations[Math.floor(selloutDurations.length / 2)];
    const fastest = selloutDurations[0];

    // Determine confidence based on sample size
    let confidence: "high" | "medium" | "low" | "insufficient";
    if (selloutDurations.length >= 10) confidence = "high";
    else if (selloutDurations.length >= 5) confidence = "medium";
    else if (selloutDurations.length >= 2) confidence = "low";
    else confidence = "insufficient";

    // Trend: compare last 3 to previous 3
    let recentTrend: "faster" | "slower" | "stable" | "unknown" = "unknown";
    if (selloutDurations.length >= 6) {
      const recent = selloutDurations.slice(-3);
      const previous = selloutDurations.slice(-6, -3);
      const recentAvg = recent.reduce((a, b) => a + b, 0) / 3;
      const previousAvg = previous.reduce((a, b) => a + b, 0) / 3;
      const change = (recentAvg - previousAvg) / previousAvg;
      
      if (change < -0.15) recentTrend = "faster";
      else if (change > 0.15) recentTrend = "slower";
      else recentTrend = "stable";
    }

    return {
      avgHoursToSellout: Math.round(avg * 10) / 10,
      medianHoursToSellout: Math.round(median * 10) / 10,
      fastestSellout: Math.round(fastest * 10) / 10,
      selloutCount: selloutDurations.length,
      confidence,
      recentTrend,
    };
  },
});

// ============================================================
// RESTOCK PATTERNS
// ============================================================

export const getRestockPattern = query({
  args: {
    productId: v.id("products"),
    locationId: v.optional(v.id("retailers")),
  },
  handler: async (ctx, args): Promise<RestockPattern> => {
    // Get restock events
    let events = await ctx.db
      .query("inventoryEvents")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .order("asc")
      .collect();

    // Filter to restocks only
    events = events.filter(e => e.eventType === "restock");

    // If location specified, filter further
    if (args.locationId) {
      events = events.filter(e => e.retailerId.toString() === args.locationId!.toString());
    }

    if (events.length < 2) {
      return {
        avgDaysBetweenRestocks: null,
        preferredDays: [],
        preferredHours: [],
        restockCount: events.length,
        confidence: "insufficient",
        nextPredictedRestock: null,
      };
    }

    // Calculate days between restocks
    const daysBetween: number[] = [];
    for (let i = 1; i < events.length; i++) {
      const days = (events[i].timestamp - events[i - 1].timestamp) / (1000 * 60 * 60 * 24);
      if (days > 0 && days < 60) { // Filter outliers
        daysBetween.push(days);
      }
    }

    // Analyze day-of-week patterns
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayCounts = new Map<string, number>();
    const hourCounts = new Map<number, number>();

    for (const event of events) {
      const date = new Date(event.timestamp);
      const dayName = dayNames[date.getUTCDay()];
      const hour = date.getUTCHours();
      
      dayCounts.set(dayName, (dayCounts.get(dayName) || 0) + 1);
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    }

    // Find preferred days (>= 20% of restocks)
    const threshold = events.length * 0.2;
    const preferredDays = Array.from(dayCounts.entries())
      .filter(([_, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .map(([day]) => day);

    // Find preferred hours (>= 20% of restocks)
    const preferredHours = Array.from(hourCounts.entries())
      .filter(([_, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .map(([hour]) => hour)
      .slice(0, 3);

    // Calculate average days between
    const avgDays = daysBetween.length > 0 
      ? daysBetween.reduce((a, b) => a + b, 0) / daysBetween.length 
      : null;

    // Predict next restock
    let nextPredictedRestock: number | null = null;
    if (avgDays && events.length > 0) {
      const lastRestock = events[events.length - 1].timestamp;
      nextPredictedRestock = lastRestock + (avgDays * 24 * 60 * 60 * 1000);
      
      // If predicted date is in the past, project forward
      const now = Date.now();
      while (nextPredictedRestock && nextPredictedRestock < now) {
        nextPredictedRestock += avgDays * 24 * 60 * 60 * 1000;
      }
    }

    // Confidence
    let confidence: "high" | "medium" | "low" | "insufficient";
    if (events.length >= 10) confidence = "high";
    else if (events.length >= 5) confidence = "medium";
    else if (events.length >= 2) confidence = "low";
    else confidence = "insufficient";

    return {
      avgDaysBetweenRestocks: avgDays ? Math.round(avgDays * 10) / 10 : null,
      preferredDays,
      preferredHours,
      restockCount: events.length,
      confidence,
      nextPredictedRestock,
    };
  },
});

// ============================================================
// DROP PATTERNS (New Product Arrivals)
// ============================================================

export const getDropPatterns = query({
  args: {
    brandId: v.optional(v.id("brands")),
    retailerId: v.optional(v.id("retailers")),
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<DropPattern> => {
    const daysBack = args.daysBack || 30;
    const since = Date.now() - (daysBack * 24 * 60 * 60 * 1000);

    // Get new_product events
    let events = await ctx.db
      .query("inventoryEvents")
      .withIndex("by_type", (q) => q.eq("eventType", "new_product"))
      .filter((q) => q.gte(q.field("timestamp"), since))
      .collect();

    // Filter by brand or retailer if specified
    if (args.brandId) {
      events = events.filter(e => e.brandId?.toString() === args.brandId!.toString());
    }
    if (args.retailerId) {
      events = events.filter(e => e.retailerId.toString() === args.retailerId!.toString());
    }

    if (events.length === 0) {
      return {
        preferredDays: [],
        preferredHours: [],
        avgDropsPerWeek: 0,
        totalDrops: 0,
        confidence: "insufficient",
      };
    }

    // Analyze patterns
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayCounts = new Map<string, number>();
    const hourCounts = new Map<number, number>();

    for (const event of events) {
      const date = new Date(event.timestamp);
      const dayName = dayNames[date.getUTCDay()];
      const hour = date.getUTCHours();
      
      dayCounts.set(dayName, (dayCounts.get(dayName) || 0) + 1);
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    }

    const threshold = events.length * 0.15;
    const preferredDays = Array.from(dayCounts.entries())
      .filter(([_, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .map(([day]) => day);

    const preferredHours = Array.from(hourCounts.entries())
      .filter(([_, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .map(([hour]) => hour)
      .slice(0, 4);

    const weeksInPeriod = daysBack / 7;
    const avgDropsPerWeek = events.length / weeksInPeriod;

    let confidence: "high" | "medium" | "low" | "insufficient";
    if (events.length >= 20) confidence = "high";
    else if (events.length >= 10) confidence = "medium";
    else if (events.length >= 3) confidence = "low";
    else confidence = "insufficient";

    return {
      preferredDays,
      preferredHours,
      avgDropsPerWeek: Math.round(avgDropsPerWeek * 10) / 10,
      totalDrops: events.length,
      confidence,
    };
  },
});

// ============================================================
// POPULARITY SCORE
// ============================================================

export const getPopularityScore = query({
  args: {
    productId: v.id("products"),
  },
  handler: async (ctx, args) => {
    // Get all events for this product
    const events = await ctx.db
      .query("inventoryEvents")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();

    const product = await ctx.db.get(args.productId);
    const brand = product?.brandId ? await ctx.db.get(product.brandId) : null;

    // Get current inventory status
    const inventory = await ctx.db
      .query("currentInventory")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();

    // Calculate various signals
    const restockEvents = events.filter(e => e.eventType === "restock");
    const soldOutEvents = events.filter(e => e.eventType === "sold_out");
    const locationsCarrying = inventory.length;
    const locationsInStock = inventory.filter(i => i.inStock).length;

    // Calculate sell-out velocity (reuse logic)
    let avgHoursToSellout: number | null = null;
    const selloutDurations: number[] = [];
    
    const eventsByLocation = new Map<string, typeof events>();
    for (const event of events) {
      const key = event.retailerId.toString();
      if (!eventsByLocation.has(key)) eventsByLocation.set(key, []);
      eventsByLocation.get(key)!.push(event);
    }

    for (const locationEvents of eventsByLocation.values()) {
      const sorted = locationEvents.sort((a, b) => a.timestamp - b.timestamp);
      let lastRestockTime: number | null = null;

      for (const event of sorted) {
        if (event.eventType === "restock" || event.eventType === "new_product") {
          lastRestockTime = event.timestamp;
        } else if (event.eventType === "sold_out" && lastRestockTime) {
          const hours = (event.timestamp - lastRestockTime) / (1000 * 60 * 60);
          if (hours > 0 && hours < 720) selloutDurations.push(hours);
          lastRestockTime = null;
        }
      }
    }

    if (selloutDurations.length > 0) {
      avgHoursToSellout = selloutDurations.reduce((a, b) => a + b, 0) / selloutDurations.length;
    }

    // Calculate popularity score (0-100)
    // Factors:
    // - Fast sell-out = higher score (max 40 points)
    // - More locations = higher score (max 20 points)
    // - Frequent restocks = higher score (max 20 points)
    // - High stock rate across locations = lower score (max 20 points inverse)

    let score = 0;

    // Velocity score (fast = popular)
    if (avgHoursToSellout !== null) {
      if (avgHoursToSellout < 4) score += 40;
      else if (avgHoursToSellout < 12) score += 30;
      else if (avgHoursToSellout < 24) score += 20;
      else if (avgHoursToSellout < 48) score += 10;
    }

    // Location spread score
    if (locationsCarrying >= 10) score += 20;
    else if (locationsCarrying >= 5) score += 15;
    else if (locationsCarrying >= 3) score += 10;
    else if (locationsCarrying >= 1) score += 5;

    // Restock frequency score (more restocks = high demand)
    if (restockEvents.length >= 20) score += 20;
    else if (restockEvents.length >= 10) score += 15;
    else if (restockEvents.length >= 5) score += 10;
    else if (restockEvents.length >= 2) score += 5;

    // Scarcity bonus (if usually out of stock, it's desirable)
    const stockRate = locationsCarrying > 0 ? locationsInStock / locationsCarrying : 0;
    if (stockRate < 0.3 && soldOutEvents.length > 0) score += 20;
    else if (stockRate < 0.5 && soldOutEvents.length > 0) score += 10;

    // Cap at 100
    score = Math.min(100, score);

    // Determine tier
    let tier: "fire" | "hot" | "warm" | "normal" | "cold";
    if (score >= 80) tier = "fire";
    else if (score >= 60) tier = "hot";
    else if (score >= 40) tier = "warm";
    else if (score >= 20) tier = "normal";
    else tier = "cold";

    return {
      productId: args.productId,
      productName: product?.name || "Unknown",
      brandName: brand?.name || "Unknown",
      score,
      tier,
      metrics: {
        avgHoursToSellout: avgHoursToSellout ? Math.round(avgHoursToSellout * 10) / 10 : null,
        locationsCarrying,
        locationsInStock,
        restockCount: restockEvents.length,
        soldOutCount: soldOutEvents.length,
        stockRate: Math.round(stockRate * 100),
      },
      confidence: events.length >= 10 ? "high" : events.length >= 3 ? "medium" : "low",
    };
  },
});

// ============================================================
// HOT PRODUCTS FEED
// ============================================================

export const getHotProducts = query({
  args: {
    limit: v.optional(v.number()),
    region: v.optional(v.string()),
    category: v.optional(v.string()),
    hoursBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;
    const hoursBack = args.hoursBack || 24;
    const since = Date.now() - (hoursBack * 60 * 60 * 1000);

    // Get recent high-signal events (restocks + sold_outs = demand)
    const recentEvents = await ctx.db
      .query("inventoryEvents")
      .withIndex("by_time")
      .order("desc")
      .filter((q) => q.gte(q.field("timestamp"), since))
      .collect();

    // Count activity per product
    const productActivity = new Map<string, {
      productId: any;
      brandId: any;
      restocks: number;
      soldOuts: number;
      priceDrops: number;
      newAt: number[];
      locations: Set<string>;
    }>();

    for (const event of recentEvents) {
      if (!event.productId) continue;
      
      const key = event.productId.toString();
      if (!productActivity.has(key)) {
        productActivity.set(key, {
          productId: event.productId,
          brandId: event.brandId,
          restocks: 0,
          soldOuts: 0,
          priceDrops: 0,
          newAt: [],
          locations: new Set(),
        });
      }

      const activity = productActivity.get(key)!;
      activity.locations.add(event.retailerId.toString());
      
      if (event.eventType === "restock") activity.restocks++;
      else if (event.eventType === "sold_out") activity.soldOuts++;
      else if (event.eventType === "price_drop") activity.priceDrops++;
      else if (event.eventType === "new_product") activity.newAt.push(event.timestamp);
    }

    // Score and sort products
    const scored = Array.from(productActivity.values()).map(activity => {
      // Hot score formula:
      // - Each restock = high demand signal (2 points)
      // - Each sold out = product is popular (2 points)
      // - Multiple locations = widespread demand (1 point per location)
      // - Price drop = buzz factor (1 point)
      // - New product bonus (3 points)
      let hotScore = 
        activity.restocks * 2 +
        activity.soldOuts * 2 +
        activity.locations.size +
        activity.priceDrops +
        (activity.newAt.length > 0 ? 3 : 0);

      return {
        ...activity,
        locationCount: activity.locations.size,
        hotScore,
        isNewDrop: activity.newAt.length > 0,
        mostRecentEvent: Math.max(
          ...recentEvents
            .filter(e => e.productId?.toString() === activity.productId.toString())
            .map(e => e.timestamp)
        ),
      };
    });

    // Sort by hot score, then recency
    scored.sort((a, b) => {
      if (b.hotScore !== a.hotScore) return b.hotScore - a.hotScore;
      return b.mostRecentEvent - a.mostRecentEvent;
    });

    // Take top N and enrich with product/brand data
    const topProducts = scored.slice(0, limit);
    
    const enriched = await Promise.all(
      topProducts.map(async (item) => {
        // Explicitly get product and brand from their respective tables
        const productDoc = await ctx.db.get(item.productId);
        const product = productDoc as { _id: any; name?: string; category?: string } | null;
        const brandDoc = item.brandId ? await ctx.db.get(item.brandId) : null;
        const brand = brandDoc as { _id: any; name?: string } | null;
        
        // Filter by category if specified
        if (args.category && product?.category !== args.category) {
          return null;
        }

        // Get current inventory status
        const inventory = await ctx.db
          .query("currentInventory")
          .withIndex("by_product", (q) => q.eq("productId", item.productId))
          .collect();

        // Filter by region if specified
        let filteredInventory = inventory;
        if (args.region) {
          const regionRetailers = new Set<string>();
          for (const inv of inventory) {
            const retailer = await ctx.db.get(inv.retailerId);
            if (retailer?.region === args.region) {
              regionRetailers.add(inv.retailerId.toString());
            }
          }
          if (regionRetailers.size === 0) return null;
          filteredInventory = inventory.filter(i => regionRetailers.has(i.retailerId.toString()));
        }

        const inStockCount = filteredInventory.filter(i => i.inStock).length;
        const avgPrice = filteredInventory.length > 0
          ? filteredInventory.reduce((sum, i) => sum + i.currentPrice, 0) / filteredInventory.length
          : null;

        // Determine reason for being hot
        let hotReason: string;
        if (item.isNewDrop && item.soldOuts > 0) hotReason = "New drop selling fast! 🔥";
        else if (item.isNewDrop) hotReason = "Just dropped! 🆕";
        else if (item.soldOuts >= 3) hotReason = "Selling out everywhere! 💨";
        else if (item.restocks >= 3) hotReason = "High demand, restocking often 📦";
        else if (item.locationCount >= 5) hotReason = "Trending at multiple spots 📍";
        else if (item.priceDrops > 0) hotReason = "Price drop alert! 💰";
        else hotReason = "Popular right now";

        return {
          productId: item.productId,
          productName: product?.name || "Unknown Product",
          brandName: brand?.name || "Unknown Brand",
          category: product?.category,
          hotScore: item.hotScore,
          hotReason,
          isNewDrop: item.isNewDrop,
          metrics: {
            restocks: item.restocks,
            soldOuts: item.soldOuts,
            priceDrops: item.priceDrops,
            locationCount: item.locationCount,
            inStockLocations: inStockCount,
            avgPrice: avgPrice ? Math.round(avgPrice * 100) / 100 : null,
          },
          mostRecentEvent: item.mostRecentEvent,
        };
      })
    );

    return enriched.filter(Boolean);
  },
});

// ============================================================
// PRODUCT INSIGHTS (Combined view for UI)
// ============================================================

export const getProductInsights = query({
  args: {
    productId: v.id("products"),
  },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) return null;

    const brand = product.brandId ? await ctx.db.get(product.brandId) : null;

    // Get all events
    const events = await ctx.db
      .query("inventoryEvents")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .order("desc")
      .take(100);

    // Get current inventory
    const inventory = await ctx.db
      .query("currentInventory")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();

    // Calculate velocity
    const selloutDurations: number[] = [];
    const eventsByLocation = new Map<string, typeof events>();
    
    for (const event of events) {
      const key = event.retailerId.toString();
      if (!eventsByLocation.has(key)) eventsByLocation.set(key, []);
      eventsByLocation.get(key)!.push(event);
    }

    for (const locationEvents of eventsByLocation.values()) {
      const sorted = [...locationEvents].sort((a, b) => a.timestamp - b.timestamp);
      let lastRestockTime: number | null = null;

      for (const event of sorted) {
        if (event.eventType === "restock" || event.eventType === "new_product") {
          lastRestockTime = event.timestamp;
        } else if (event.eventType === "sold_out" && lastRestockTime) {
          const hours = (event.timestamp - lastRestockTime) / (1000 * 60 * 60);
          if (hours > 0 && hours < 720) selloutDurations.push(hours);
          lastRestockTime = null;
        }
      }
    }

    const avgVelocity = selloutDurations.length > 0
      ? selloutDurations.reduce((a, b) => a + b, 0) / selloutDurations.length
      : null;

    // Restock pattern
    const restockEvents = events.filter(e => e.eventType === "restock");
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const restockDays = new Map<string, number>();
    
    for (const e of restockEvents) {
      const day = dayNames[new Date(e.timestamp).getUTCDay()];
      restockDays.set(day, (restockDays.get(day) || 0) + 1);
    }

    const topRestockDays = Array.from(restockDays.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([day]) => day);

    // Format velocity for display
    let velocityText: string | null = null;
    if (avgVelocity !== null) {
      if (avgVelocity < 4) velocityText = "Sells out in ~" + Math.round(avgVelocity) + " hours 🔥";
      else if (avgVelocity < 24) velocityText = "Usually sells out same day";
      else if (avgVelocity < 72) velocityText = "Typically available 1-3 days";
      else velocityText = "Usually stays in stock";
    }

    // Restock prediction
    let restockPrediction: string | null = null;
    if (restockEvents.length >= 3 && topRestockDays.length > 0) {
      restockPrediction = `Usually restocks on ${topRestockDays.join(" or ")}`;
    }

    return {
      productId: args.productId,
      productName: product.name,
      brandName: brand?.name || "Unknown",
      category: product.category,
      insights: {
        velocity: velocityText,
        avgHoursToSellout: avgVelocity ? Math.round(avgVelocity * 10) / 10 : null,
        restockPrediction,
        topRestockDays,
        totalEvents: events.length,
        restockCount: restockEvents.length,
        soldOutCount: events.filter(e => e.eventType === "sold_out").length,
      },
      currentStatus: {
        locationsCarrying: inventory.length,
        locationsInStock: inventory.filter(i => i.inStock).length,
        avgPrice: inventory.length > 0 
          ? Math.round(inventory.reduce((s, i) => s + i.currentPrice, 0) / inventory.length * 100) / 100
          : null,
      },
      recentEvents: events.slice(0, 10).map(e => ({
        type: e.eventType,
        timestamp: e.timestamp,
        retailerId: e.retailerId,
      })),
    };
  },
});
