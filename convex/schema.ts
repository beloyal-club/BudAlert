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
});
