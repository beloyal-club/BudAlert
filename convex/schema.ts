import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ============================================================
  // DISPENSARY / RETAILER DATA
  // ============================================================

  retailers: defineTable({
    name: v.string(),
    slug: v.string(),
    licenseNumber: v.optional(v.string()),
    licenseType: v.optional(v.string()),
    address: v.object({
      street: v.string(),
      city: v.string(),
      state: v.string(),
      zip: v.string(),
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
    }),
    region: v.string(),
    menuSources: v.array(v.object({
      platform: v.string(),
      url: v.string(),
      embedType: v.string(),
      apiEndpoint: v.optional(v.string()),
      lastScrapedAt: v.optional(v.number()),
      scrapeStatus: v.string(),
    })),
    operatingHours: v.optional(v.any()),
    isActive: v.boolean(),
    firstSeenAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_slug", ["slug"])
    .index("by_region", ["region"])
    .index("by_license", ["licenseNumber"]),

  // ============================================================
  // BRAND / PRODUCT CANONICAL RECORDS
  // ============================================================

  brands: defineTable({
    name: v.string(),
    normalizedName: v.string(),
    aliases: v.array(v.string()),
    category: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    isVerified: v.boolean(),
    firstSeenAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_normalized_name", ["normalizedName"])
    .index("by_category", ["category"]),

  products: defineTable({
    brandId: v.id("brands"),
    name: v.string(),
    normalizedName: v.string(),
    category: v.string(),
    subcategory: v.optional(v.string()),
    strain: v.optional(v.string()),
    weight: v.optional(v.object({
      amount: v.number(),
      unit: v.string(),
    })),
    thcRange: v.optional(v.object({
      min: v.optional(v.number()),
      max: v.optional(v.number()),
      unit: v.string(),
    })),
    cbdRange: v.optional(v.object({
      min: v.optional(v.number()),
      max: v.optional(v.number()),
      unit: v.string(),
    })),
    imageUrl: v.optional(v.string()),
    isActive: v.boolean(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_brand", ["brandId"])
    .index("by_category", ["category"])
    .index("by_normalized_name", ["normalizedName"])
    .index("by_brand_category", ["brandId", "category"]),

  // ============================================================
  // MENU SNAPSHOTS (the core data asset)
  // ============================================================

  menuSnapshots: defineTable({
    retailerId: v.id("retailers"),
    productId: v.id("products"),
    scrapedAt: v.number(),
    batchId: v.string(),
    price: v.number(),
    originalPrice: v.optional(v.number()),
    isOnSale: v.boolean(),
    discountPercent: v.optional(v.number()),
    inStock: v.boolean(),
    stockLevel: v.optional(v.string()),
    quantity: v.optional(v.number()),           // Actual inventory count (null = unknown)
    quantityWarning: v.optional(v.string()),    // Raw warning text e.g., "Only 3 left"
    sourceUrl: v.string(),
    sourcePlatform: v.string(),
    rawProductName: v.string(),
    rawBrandName: v.optional(v.string()),
    rawCategory: v.optional(v.string()),
    rawData: v.optional(v.any()),
  })
    .index("by_retailer_time", ["retailerId", "scrapedAt"])
    .index("by_product_time", ["productId", "scrapedAt"])
    .index("by_retailer_product", ["retailerId", "productId"])
    .index("by_batch", ["batchId"]),

  // ============================================================
  // CURRENT INVENTORY (materialized view)
  // ============================================================

  currentInventory: defineTable({
    retailerId: v.id("retailers"),
    productId: v.id("products"),
    brandId: v.id("brands"),
    currentPrice: v.number(),
    previousPrice: v.optional(v.number()),
    priceChangedAt: v.optional(v.number()),
    inStock: v.boolean(),
    stockLevel: v.optional(v.string()),
    quantity: v.optional(v.number()),           // Actual inventory count (null = unknown)
    quantityWarning: v.optional(v.string()),    // Raw warning text e.g., "Only 3 left"
    lastInStockAt: v.optional(v.number()),
    outOfStockSince: v.optional(v.number()),
    daysOnMenu: v.number(),
    estimatedVelocity: v.optional(v.string()),
    lastUpdatedAt: v.number(),
    lastSnapshotId: v.id("menuSnapshots"),
  })
    .index("by_retailer", ["retailerId"])
    .index("by_product", ["productId"])
    .index("by_brand", ["brandId"])
    .index("by_retailer_brand", ["retailerId", "brandId"])
    .index("by_stock_status", ["inStock", "brandId"])
    .index("by_retailer_product", ["retailerId", "productId"]),

  // ============================================================
  // BRAND ANALYTICS (computed daily)
  // ============================================================

  brandAnalytics: defineTable({
    brandId: v.id("brands"),
    region: v.string(),
    period: v.string(),
    periodStart: v.number(),
    periodEnd: v.number(),
    totalRetailersCarrying: v.number(),
    newRetailersAdded: v.number(),
    retailersDropped: v.number(),
    totalSkusListed: v.number(),
    avgPrice: v.number(),
    minPrice: v.number(),
    maxPrice: v.number(),
    avgDiscountPercent: v.optional(v.number()),
    outOfStockEvents: v.number(),
    avgDaysOnMenu: v.number(),
    estimatedSellThrough: v.optional(v.string()),
    categoryBreakdown: v.optional(v.any()),
  })
    .index("by_brand_period", ["brandId", "period", "periodStart"])
    .index("by_region_period", ["region", "period", "periodStart"])
    .index("by_brand_region", ["brandId", "region"]),

  // ============================================================
  // ALERT SYSTEM
  // ============================================================

  watchlists: defineTable({
    userId: v.id("users"),
    name: v.string(),
    type: v.string(),
    filters: v.object({
      brandIds: v.optional(v.array(v.id("brands"))),
      productIds: v.optional(v.array(v.id("products"))),
      retailerIds: v.optional(v.array(v.id("retailers"))),
      regions: v.optional(v.array(v.string())),
      categories: v.optional(v.array(v.string())),
    }),
    alertRules: v.array(v.object({
      condition: v.string(),
      threshold: v.optional(v.number()),
      channels: v.array(v.string()),
      isActive: v.boolean(),
    })),
    isActive: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_type", ["userId", "type"]),

  alerts: defineTable({
    watchlistId: v.id("watchlists"),
    userId: v.id("users"),
    type: v.string(),
    severity: v.string(),
    title: v.string(),
    body: v.string(),
    data: v.any(),
    retailerId: v.optional(v.id("retailers")),
    productId: v.optional(v.id("products")),
    brandId: v.optional(v.id("brands")),
    deliveredVia: v.array(v.string()),
    isRead: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user_time", ["userId", "createdAt"])
    .index("by_user_unread", ["userId", "isRead"])
    .index("by_watchlist", ["watchlistId"]),

  // ============================================================
  // USER / AUTH
  // ============================================================

  users: defineTable({
    email: v.string(),
    name: v.optional(v.string()),
    company: v.optional(v.string()),
    role: v.optional(v.string()),
    plan: v.string(),
    planExpiresAt: v.optional(v.number()),
    authProvider: v.string(),
    externalAuthId: v.string(),
    preferences: v.optional(v.object({
      timezone: v.optional(v.string()),
      alertDigestTime: v.optional(v.string()),
      defaultRegion: v.optional(v.string()),
    })),
    openclawConfig: v.optional(v.object({
      channelType: v.optional(v.string()),
      channelId: v.optional(v.string()),
    })),
    createdAt: v.number(),
    lastActiveAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_external_auth", ["authProvider", "externalAuthId"])
    .index("by_plan", ["plan"]),

  // ============================================================
  // SCRAPER OPERATIONS
  // ============================================================

  scrapeJobs: defineTable({
    retailerId: v.id("retailers"),
    sourcePlatform: v.string(),
    sourceUrl: v.string(),
    batchId: v.string(),
    status: v.string(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    itemsScraped: v.number(),
    itemsFailed: v.number(),
    errorMessage: v.optional(v.string()),
    retryCount: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_status", ["status"])
    .index("by_retailer_time", ["retailerId", "startedAt"])
    .index("by_batch", ["batchId"]),

  // ============================================================
  // DEAD LETTER QUEUE (REL-001)
  // Failed scrapes that exceeded max retries for manual review
  // ============================================================

  deadLetterQueue: defineTable({
    retailerId: v.id("retailers"),
    retailerSlug: v.string(),
    retailerName: v.string(),
    sourcePlatform: v.string(),
    sourceUrl: v.string(),
    batchId: v.string(),
    errorMessage: v.string(),
    errorType: v.string(),              // "http_error" | "parse_error" | "timeout" | "rate_limit" | "unknown"
    statusCode: v.optional(v.number()), // HTTP status code if applicable
    totalRetries: v.number(),           // How many times we tried
    firstAttemptAt: v.number(),         // When first attempt was made
    lastAttemptAt: v.number(),          // When final attempt failed
    resolvedAt: v.optional(v.number()), // When manually resolved/dismissed
    resolvedBy: v.optional(v.string()), // Who resolved it
    resolution: v.optional(v.string()), // "retry_success" | "skipped" | "fixed" | "permanent_failure"
    notes: v.optional(v.string()),      // Manual notes
    rawResponse: v.optional(v.string()),// First 1000 chars of failed response for debugging
  })
    .index("by_status", ["resolvedAt"])
    .index("by_retailer", ["retailerId"])
    .index("by_error_type", ["errorType"])
    .index("by_platform", ["sourcePlatform"])
    .index("by_time", ["lastAttemptAt"]),

  // ============================================================
  // STATS CACHE (PERF-002)
  // Precomputed aggregates for fast dashboard queries
  // ============================================================

  // ============================================================
  // SCRAPER ALERTS (REL-002)
  // Alert history for scraper monitoring
  // ============================================================

  // ============================================================
  // PRODUCT WATCHES (Consumer MVP - Phase 3)
  // Simple email-based product watch subscriptions
  // ============================================================

  productWatches: defineTable({
    email: v.string(),                  // User identifier (no auth needed)
    productId: v.id("products"),
    brandId: v.id("brands"),
    alertTypes: v.array(v.string()),    // ["restock", "price_drop", "new_drop"]
    retailerIds: v.optional(v.array(v.id("retailers"))), // Optional: only these locations
    discordWebhook: v.optional(v.string()), // Optional: personal webhook
    isActive: v.boolean(),
    createdAt: v.number(),
    lastNotifiedAt: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_product", ["productId"])
    .index("by_email_product", ["email", "productId"])
    .index("by_active", ["isActive"]),

  scraperAlerts: defineTable({
    type: v.string(),                   // "new_failures" | "high_failure_rate" | "stale_scraper" | "rate_limit_spike"
    severity: v.string(),               // "low" | "medium" | "high" | "critical"
    title: v.string(),
    message: v.string(),
    data: v.optional(v.any()),          // Additional context (summary, conditions)
    deliveredTo: v.array(v.string()),   // ["discord", "email", etc.]
    acknowledged: v.boolean(),
    acknowledgedAt: v.optional(v.number()),
    acknowledgedBy: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_type", ["type", "createdAt"])
    .index("by_severity", ["severity", "createdAt"])
    .index("by_acknowledged", ["acknowledged", "createdAt"])
    .index("by_time", ["createdAt"]),

  statsCache: defineTable({
    key: v.string(),                    // "global" | "region:nyc" | etc.
    retailers: v.object({
      total: v.number(),
      active: v.number(),
      byRegion: v.any(),                // Record<string, number>
    }),
    brands: v.object({
      total: v.number(),
      verified: v.number(),
    }),
    inventory: v.object({
      totalRecords: v.number(),
      uniqueProducts: v.number(),
      inStock: v.number(),
      outOfStock: v.number(),
    }),
    scrapeHealth: v.object({
      unresolvedErrors: v.number(),
      totalJobs24h: v.number(),
      successfulJobs24h: v.number(),
    }),
    computedAt: v.number(),
    version: v.number(),                // Incremented on each refresh
  })
    .index("by_key", ["key"]),

  // ============================================================
  // INVENTORY EVENTS (Delta Detection - Phase 1)
  // Tracks changes between scrape snapshots
  // ============================================================

  inventoryEvents: defineTable({
    retailerId: v.id("retailers"),
    productId: v.optional(v.id("products")),
    brandId: v.optional(v.id("brands")),
    eventType: v.string(),              // "new_product" | "restock" | "sold_out" | "price_drop" | "price_increase" | "removed"
    previousValue: v.optional(v.any()), // Previous state (price, inStock, etc.)
    newValue: v.optional(v.any()),      // New state
    metadata: v.optional(v.any()),      // Additional context (rawName, changePercent, etc.)
    batchId: v.string(),                // Links to scrape batch
    timestamp: v.number(),              // When the change was detected
    notified: v.boolean(),              // Has notification been sent?
    notifiedAt: v.optional(v.number()), // When notification was sent
  })
    .index("by_time", ["timestamp"])
    .index("by_retailer", ["retailerId", "timestamp"])
    .index("by_product", ["productId", "timestamp"])
    .index("by_type", ["eventType", "timestamp"])
    .index("by_notified", ["notified", "timestamp"])
    .index("by_batch", ["batchId"]),

  // ============================================================
  // SUBSCRIPTIONS & MONETIZATION (Phase 6)
  // ============================================================

  subscriptions: defineTable({
    email: v.string(),                      // User identifier (matches productWatches.email)
    tier: v.string(),                       // "free" | "premium" | "pro"
    status: v.string(),                     // "active" | "canceled" | "past_due" | "trialing"
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    stripePriceId: v.optional(v.string()),
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.boolean(),
    features: v.object({
      maxWatches: v.number(),               // 3 for free, unlimited (-1) for premium
      smsAlerts: v.boolean(),
      priorityAlerts: v.boolean(),          // Faster notification delivery
      predictions: v.boolean(),             // Access to restock predictions
      exportData: v.boolean(),
      apiAccess: v.boolean(),
    }),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_stripe_customer", ["stripeCustomerId"])
    .index("by_stripe_subscription", ["stripeSubscriptionId"])
    .index("by_tier", ["tier", "status"]),

  // ============================================================
  // RETAILER ACCOUNTS (B2B - Phase 6)
  // ============================================================

  retailerAccounts: defineTable({
    retailerId: v.id("retailers"),          // Links to retailers table
    email: v.string(),                      // Primary contact
    companyName: v.string(),
    tier: v.string(),                       // "starter" | "growth" | "enterprise"
    status: v.string(),                     // "active" | "canceled" | "past_due" | "trialing"
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.number()),
    features: v.object({
      competitorPricing: v.boolean(),       // See competitor prices
      demandSignals: v.boolean(),           // Customer watch/interest data
      stockAlerts: v.boolean(),             // Alerts for their own inventory
      analyticsDepth: v.string(),           // "basic" | "advanced" | "enterprise"
      apiAccess: v.boolean(),
      whiteLabel: v.boolean(),              // Remove CannaSignal branding
    }),
    teamMembers: v.array(v.object({
      email: v.string(),
      role: v.string(),                     // "admin" | "viewer"
      addedAt: v.number(),
    })),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_retailer", ["retailerId"])
    .index("by_email", ["email"])
    .index("by_stripe_customer", ["stripeCustomerId"]),

  // ============================================================
  // PAYMENT EVENTS (Audit Trail)
  // ============================================================

  paymentEvents: defineTable({
    email: v.string(),
    eventType: v.string(),                  // "checkout_started" | "checkout_completed" | "subscription_updated" | "payment_failed" | "canceled"
    stripeEventId: v.optional(v.string()),
    tier: v.optional(v.string()),
    amount: v.optional(v.number()),         // In cents
    currency: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_email", ["email", "createdAt"])
    .index("by_type", ["eventType", "createdAt"])
    .index("by_stripe_event", ["stripeEventId"]),

  // ============================================================
  // NOTIFICATION QUEUE (CRIT-004)
  // Retry queue for failed Discord webhook deliveries
  // ============================================================

  notificationQueue: defineTable({
    webhookUrl: v.string(),               // Discord webhook URL
    payload: v.any(),                     // The message payload to send
    eventIds: v.optional(v.array(v.id("inventoryEvents"))), // Related events
    notificationType: v.string(),         // "product_alert" | "scraper_alert" | etc.
    errorMessage: v.string(),             // Last error message
    attemptNumber: v.number(),            // Current retry attempt
    status: v.string(),                   // "pending" | "delivered" | "failed"
    createdAt: v.number(),
    lastAttemptAt: v.number(),
    nextRetryAt: v.number(),              // When to retry next
    deliveredAt: v.optional(v.number()),  // When successfully delivered
  })
    .index("by_status", ["status", "nextRetryAt"])
    .index("by_webhook", ["webhookUrl", "status"]),

  // ============================================================
  // B2B: COMPETITOR MONITORING (Phase 7 - B2B Pivot)
  // Tracks which competitors a retailer account is monitoring
  // ============================================================

  competitorMonitors: defineTable({
    accountId: v.id("retailerAccounts"),    // The retailer account doing the monitoring
    competitorId: v.id("retailers"),        // The competitor being monitored
    alertsEnabled: v.boolean(),             // Whether to send alerts for this competitor
    alertTypes: v.array(v.string()),        // ["new_product", "price_drop", "stock_out", "restock"]
    customNotes: v.optional(v.string()),    // User notes about this competitor
    isActive: v.boolean(),                  // Soft delete
    addedAt: v.number(),
  })
    .index("by_account", ["accountId"])
    .index("by_competitor", ["competitorId"])
    .index("by_account_competitor", ["accountId", "competitorId"]),

  // ============================================================
  // B2B: ALERTS (Phase 7 - B2B Pivot)
  // Alerts generated for retailer accounts
  // ============================================================

  b2bAlerts: defineTable({
    accountId: v.id("retailerAccounts"),    // The retailer account receiving the alert
    type: v.string(),                       // "new_product" | "price_drop" | "price_increase" | "stock_out" | "restock" | "trending" | "opportunity"
    severity: v.string(),                   // "low" | "medium" | "high" | "critical"
    competitorId: v.optional(v.id("retailers")),   // Which competitor triggered this
    productId: v.optional(v.id("products")),       // Related product
    brandId: v.optional(v.id("brands")),           // Related brand
    title: v.string(),
    message: v.string(),
    actionHint: v.optional(v.string()),            // Suggested action
    data: v.optional(v.any()),                     // Additional context (prices, changes, etc.)
    isRead: v.boolean(),
    readAt: v.optional(v.number()),
    deliveredVia: v.array(v.string()),             // ["email", "slack", "dashboard"]
    createdAt: v.number(),
  })
    .index("by_account_time", ["accountId", "createdAt"])
    .index("by_account_unread", ["accountId", "isRead"])
    .index("by_type", ["type", "createdAt"])
    .index("by_severity", ["severity", "createdAt"]),

  // ============================================================
  // B2B: PRICE HISTORY CACHE (Phase 7 - B2B Pivot)
  // Pre-computed price comparisons for fast dashboard loads
  // ============================================================

  b2bPriceCache: defineTable({
    accountId: v.id("retailerAccounts"),
    productId: v.id("products"),
    yourPrice: v.optional(v.number()),
    yourInStock: v.boolean(),
    marketLow: v.number(),
    marketHigh: v.number(),
    marketAvg: v.number(),
    competitorPrices: v.array(v.object({
      competitorId: v.id("retailers"),
      price: v.number(),
      inStock: v.boolean(),
    })),
    computedAt: v.number(),
  })
    .index("by_account", ["accountId"])
    .index("by_account_product", ["accountId", "productId"]),
});
