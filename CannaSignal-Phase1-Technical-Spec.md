# CannaSignal — Phase 1: Market Intelligence Platform

## Technical Specification

**Version:** 1.0
**Date:** February 15, 2026
**Author:** Steven (Architect) + Claude (Technical Spec)
**Stack:** Convex + Cloudflare Workers + Hono + OpenClaw + React/Vite

---

## 1. Product Overview

### What It Is

A real-time cannabis market intelligence SaaS that scrapes publicly available dispensary menu data across New York State, normalizes it, and delivers actionable insights to brands, wholesalers, and retailers — including inventory alerts, sell-through velocity, competitive pricing, and brand performance rankings.

### How It Differs from LitAlerts

| Capability | LitAlerts | CannaSignal |
|---|---|---|
| Data collection | Menu scraping during business hours | Continuous scraping with historical snapshots |
| Delivery | Email alerts + web dashboard | OpenClaw agent via WhatsApp/Telegram/Slack + web dashboard + API |
| Intelligence layer | Directional estimates | AI-powered trend detection, anomaly alerts, demand forecasting |
| NYS depth | Recently launched in NY | NYS-native, deep indexed from day one |
| Architecture | Monolith SaaS | API-first, each feature is a composable service |
| Pricing intel | Basic price tracking | Price elasticity signals, discount pattern detection |

### Revenue Model

- **Starter (Brands/Wholesalers):** $199/mo — 50 retailer watchlists, daily alerts, basic analytics
- **Pro (Multi-brand operators):** $499/mo — Unlimited watchlists, hourly snapshots, competitor comparison, API access
- **Enterprise (MSOs, Distributors):** $1,500/mo — Full API, custom integrations, dedicated support, white-label reports
- **Data API:** Usage-based pricing for third-party integrations (Phase 2+ foundation)

---

## 2. System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │  React/Vite  │  │  OpenClaw    │  │  REST/Webhook API  │    │
│  │  Dashboard   │  │  Agent Bot   │  │  (for integrations)│    │
│  └──────┬───────┘  └──────┬───────┘  └────────┬───────────┘    │
└─────────┼─────────────────┼────────────────────┼────────────────┘
          │                 │                    │
          ▼                 ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API LAYER (Hono on Cloudflare Workers)     │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │  /api/menus  │  │  /api/alerts │  │  /api/analytics    │    │
│  │  /api/brands │  │  /api/users  │  │  /api/compare      │    │
│  └──────────────┘  └──────────────┘  └────────────────────┘    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CONVEX (Database + Backend Logic)           │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │   Queries    │  │  Mutations   │  │  Scheduled Jobs    │    │
│  │  (real-time) │  │  (writes)    │  │  (cron triggers)   │    │
│  └──────────────┘  └──────────────┘  └────────────────────┘    │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │   Actions    │  │  HTTP Routes │  │  Internal Functions│    │
│  │  (external)  │  │  (webhooks)  │  │  (helpers)         │    │
│  └──────────────┘  └──────────────┘  └────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DATA COLLECTION LAYER                       │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │  Cloudflare  │  │  Scraper     │  │  Normalizer        │    │
│  │  Workers     │  │  Orchestrator│  │  Pipeline           │    │
│  │  (per source)│  │  (scheduler) │  │  (product matching)│    │
│  └──────────────┘  └──────────────┘  └────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Why This Stack

**Convex** is the core database and backend logic layer. The choice is deliberate:

- Real-time subscriptions mean the dashboard updates live as new scrape data lands — no polling, no WebSocket plumbing
- Scheduled functions (crons) handle scrape orchestration natively
- Actions handle external API calls (scraping, AI inference) without leaving the Convex ecosystem
- TypeScript throughout — no SQL, no ORM, schema is code
- Built-in file storage for snapshot archives
- The reactive query model is perfect for alert conditions: when inventory changes, watchers get notified automatically

**Cloudflare Workers** handle the scraping layer because:

- Distributed edge execution avoids IP blocking (requests come from different PoPs)
- Workers are cheap at scale (~$5/10M requests)
- Native integration with your existing Hono + Workers experience
- Workers call back into Convex mutations to store scraped data

**Hono on Workers** provides the public API gateway for external consumers and the OpenClaw agent.

**OpenClaw** is the conversational interface layer — it calls the API and delivers insights through messaging platforms operators already use.

---

## 3. Convex Database Schema

### Core Tables

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ============================================================
  // DISPENSARY / RETAILER DATA
  // ============================================================

  retailers: defineTable({
    name: v.string(),                          // "Culture House NYC"
    slug: v.string(),                          // "culture-house-nyc"
    licenseNumber: v.optional(v.string()),      // OCM license number
    licenseType: v.optional(v.string()),        // "adult_use_retail", "microbusiness", etc.
    address: v.object({
      street: v.string(),
      city: v.string(),
      state: v.string(),                       // "NY" — ready for multi-state
      zip: v.string(),
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
    }),
    region: v.string(),                        // "nyc", "long_island", "hudson_valley", etc.
    menuSources: v.array(v.object({
      platform: v.string(),                    // "dutchie", "iheartjane", "weedmaps", "meadow", "custom"
      url: v.string(),                         // direct menu URL
      embedType: v.string(),                   // "iframe", "subpath", "api"
      apiEndpoint: v.optional(v.string()),     // discovered API endpoint if available
      lastScrapedAt: v.optional(v.number()),
      scrapeStatus: v.string(),                // "active", "error", "paused", "new"
    })),
    operatingHours: v.optional(v.any()),       // flexible for now
    isActive: v.boolean(),
    firstSeenAt: v.number(),
    metadata: v.optional(v.any()),             // flexible catch-all for extra data
  })
    .index("by_slug", ["slug"])
    .index("by_state_region", ["address.state", "region"])
    .index("by_scrape_status", ["menuSources"]) // for scraper queue
    .index("by_license", ["licenseNumber"]),

  // ============================================================
  // BRAND / PRODUCT CANONICAL RECORDS
  // ============================================================

  brands: defineTable({
    name: v.string(),                          // "Cookies", "Tyson 2.0"
    normalizedName: v.string(),                // "cookies", "tyson-2-0" (for matching)
    aliases: v.array(v.string()),              // ["Cookies NYC", "Cookies NY"]
    category: v.optional(v.string()),          // "flower", "edibles", "concentrates"
    imageUrl: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    isVerified: v.boolean(),                   // manually verified vs auto-created
    firstSeenAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_normalized_name", ["normalizedName"])
    .index("by_category", ["category"]),

  products: defineTable({
    brandId: v.id("brands"),
    name: v.string(),                          // "Gary Payton 3.5g"
    normalizedName: v.string(),                // "gary-payton-3-5g"
    category: v.string(),                      // "flower", "pre_roll", "edible", "vape", "concentrate", "tincture", "topical"
    subcategory: v.optional(v.string()),       // "indica", "sativa", "hybrid", "gummy", "chocolate"
    strain: v.optional(v.string()),            // "Gary Payton"
    weight: v.optional(v.object({
      amount: v.number(),
      unit: v.string(),                        // "g", "oz", "mg", "ml"
    })),
    thcRange: v.optional(v.object({
      min: v.optional(v.number()),
      max: v.optional(v.number()),
      unit: v.string(),                        // "percent", "mg"
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
    scrapedAt: v.number(),                     // timestamp of this snapshot
    batchId: v.string(),                       // groups items from same scrape run

    // Price data
    price: v.number(),                         // listed price
    originalPrice: v.optional(v.number()),     // pre-discount price if on sale
    isOnSale: v.boolean(),
    discountPercent: v.optional(v.number()),

    // Availability
    inStock: v.boolean(),
    stockLevel: v.optional(v.string()),        // "high", "medium", "low", "out_of_stock" (inferred)

    // Raw source data
    sourceUrl: v.string(),
    sourcePlatform: v.string(),
    rawProductName: v.string(),                // exact text from menu before normalization
    rawBrandName: v.optional(v.string()),
    rawCategory: v.optional(v.string()),
    rawData: v.optional(v.any()),              // full raw JSON from source for debugging
  })
    .index("by_retailer_time", ["retailerId", "scrapedAt"])
    .index("by_product_time", ["productId", "scrapedAt"])
    .index("by_retailer_product", ["retailerId", "productId"])
    .index("by_batch", ["batchId"])
    .index("by_product_retailer_time", ["productId", "retailerId", "scrapedAt"]),

  // ============================================================
  // DERIVED / COMPUTED DATA (updated by background jobs)
  // ============================================================

  // Current state per retailer-product pair (latest snapshot, deduplicated)
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

    // Sell-through signals
    daysOnMenu: v.number(),                    // consecutive days seen
    estimatedVelocity: v.optional(v.string()), // "fast", "moderate", "slow" (inferred from stock changes)

    lastUpdatedAt: v.number(),
    lastSnapshotId: v.id("menuSnapshots"),
  })
    .index("by_retailer", ["retailerId"])
    .index("by_product", ["productId"])
    .index("by_brand", ["brandId"])
    .index("by_retailer_brand", ["retailerId", "brandId"])
    .index("by_stock_status", ["inStock", "brandId"])
    .index("by_retailer_product", ["retailerId", "productId"]),

  // Aggregated brand performance per region (computed daily)
  brandAnalytics: defineTable({
    brandId: v.id("brands"),
    region: v.string(),                        // "nyc", "long_island", "statewide"
    period: v.string(),                        // "daily", "weekly", "monthly"
    periodStart: v.number(),                   // start of period timestamp
    periodEnd: v.number(),

    // Distribution metrics
    totalRetailersCarrying: v.number(),
    newRetailersAdded: v.number(),
    retailersDropped: v.number(),

    // Product metrics
    totalSkusListed: v.number(),
    avgPrice: v.number(),
    minPrice: v.number(),
    maxPrice: v.number(),
    avgDiscountPercent: v.optional(v.number()),

    // Velocity signals
    outOfStockEvents: v.number(),              // proxy for sales velocity
    avgDaysOnMenu: v.number(),
    estimatedSellThrough: v.optional(v.string()), // "high", "medium", "low"

    // Category breakdown
    categoryBreakdown: v.optional(v.any()),     // { flower: { skus: 5, avgPrice: 45 }, ... }
  })
    .index("by_brand_period", ["brandId", "period", "periodStart"])
    .index("by_region_period", ["region", "period", "periodStart"])
    .index("by_brand_region", ["brandId", "region"]),

  // ============================================================
  // ALERT SYSTEM
  // ============================================================

  watchlists: defineTable({
    userId: v.id("users"),
    name: v.string(),                          // "My Brand Watch", "Competitor Track"
    type: v.string(),                          // "brand", "product", "retailer", "region"
    filters: v.object({
      brandIds: v.optional(v.array(v.id("brands"))),
      productIds: v.optional(v.array(v.id("products"))),
      retailerIds: v.optional(v.array(v.id("retailers"))),
      regions: v.optional(v.array(v.string())),
      categories: v.optional(v.array(v.string())),
    }),
    alertRules: v.array(v.object({
      condition: v.string(),                   // "out_of_stock", "low_stock", "price_drop", "price_increase", "new_listing", "delisted"
      threshold: v.optional(v.number()),       // e.g., price change > 10%
      channels: v.array(v.string()),           // ["email", "whatsapp", "telegram", "slack", "webhook"]
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
    type: v.string(),                          // same as alertRules.condition
    severity: v.string(),                      // "info", "warning", "critical"
    title: v.string(),
    body: v.string(),
    data: v.any(),                             // structured payload for the alert
    retailerId: v.optional(v.id("retailers")),
    productId: v.optional(v.id("products")),
    brandId: v.optional(v.id("brands")),
    deliveredVia: v.array(v.string()),         // channels it was sent through
    isRead: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user_time", ["userId", "createdAt"])
    .index("by_user_unread", ["userId", "isRead"])
    .index("by_watchlist", ["watchlistId"]),

  // ============================================================
  // USER / AUTH / SUBSCRIPTION
  // ============================================================

  users: defineTable({
    email: v.string(),
    name: v.optional(v.string()),
    company: v.optional(v.string()),
    role: v.optional(v.string()),              // "brand_owner", "wholesaler", "retailer", "analyst"
    plan: v.string(),                          // "free_trial", "starter", "pro", "enterprise"
    planExpiresAt: v.optional(v.number()),
    authProvider: v.string(),                  // "clerk", "convex_auth"
    externalAuthId: v.string(),
    preferences: v.optional(v.object({
      timezone: v.optional(v.string()),
      alertDigestTime: v.optional(v.string()), // "08:00" — when to send daily digest
      defaultRegion: v.optional(v.string()),
    })),
    openclawConfig: v.optional(v.object({
      channelType: v.optional(v.string()),     // "whatsapp", "telegram", "slack"
      channelId: v.optional(v.string()),       // their chat ID for bot delivery
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
    status: v.string(),                        // "pending", "running", "completed", "failed", "partial"
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
```

### Key Design Decisions

**Snapshot-based architecture:** Every scrape produces a new `menuSnapshot` row rather than updating in place. This gives you a full historical record — critical for trend analysis, sell-through estimation, and eventually compliance cross-referencing in Phase 2. The `currentInventory` table is a materialized view that gets updated by a Convex internal function after each scrape batch completes.

**Product normalization is a first-class concern:** The `products` table holds canonical product records with normalized names. The scraper pipeline matches raw menu text ("Cookies - Gary Payton Flower 3.5g Indica") against existing products using fuzzy matching, then links the snapshot to the canonical product ID. This is what makes cross-retailer comparison possible and is where AI-assisted normalization adds significant value.

**Separation of `menuSnapshots` vs `currentInventory`:** Snapshots are append-only (high write volume, used for historical queries). Current inventory is a small, frequently-read table optimized for the dashboard and alert engine. This follows Convex best practices for data segmentation — the dashboard queries won't be invalidated by every new snapshot write.

**Multi-state ready from day one:** The `address.state` field on retailers and the `region` field on `brandAnalytics` mean the schema works for NJ, MA, CT expansion without migration.

---

## 4. Data Collection Pipeline

### Scraping Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              CONVEX SCHEDULED FUNCTION (Cron)                │
│                                                             │
│  Runs every 2 hours during business hours (8am-10pm ET)     │
│  Runs every 6 hours overnight                               │
│                                                             │
│  1. Query retailers table for active retailers              │
│  2. Batch them by platform (dutchie, jane, weedmaps, etc.) │
│  3. Generate batchId                                        │
│  4. Create scrapeJob records (status: "pending")            │
│  5. Call Cloudflare Worker orchestrator via HTTP action      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│         CLOUDFLARE WORKER — SCRAPE ORCHESTRATOR             │
│         (Hono route: POST /scrape/batch)                    │
│                                                             │
│  Receives batch of retailer URLs + batchId                  │
│  Fans out to platform-specific scraper workers              │
│  Rate-limits per platform (avoid blocks)                    │
│  Handles retries with exponential backoff                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Dutchie    │ │  iHeartJane  │ │  Weedmaps    │
│   Scraper    │ │  Scraper     │ │  Scraper     │
│   Worker     │ │  Worker      │ │  Worker      │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       └────────────────┼────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────┐
│            NORMALIZER PIPELINE (Convex Action)              │
│                                                             │
│  1. Receive raw scraped items from Workers                  │
│  2. Match/create brand records (fuzzy + AI-assisted)        │
│  3. Match/create product records (fuzzy + AI-assisted)      │
│  4. Write menuSnapshot records (mutation)                   │
│  5. Update currentInventory records (mutation)              │
│  6. Evaluate alert conditions (internal function)           │
│  7. Update scrapeJob status                                 │
└─────────────────────────────────────────────────────────────┘
```

### Platform-Specific Scraper Details

**Dutchie** (dominant in NYS):
- Most Dutchie menus are embedded iframes or subpath menus on dispensary sites
- Dutchie has an internal GraphQL API that the iframe calls — the scraper intercepts these payloads
- Target endpoint pattern: `https://dutchie.com/graphql` with dispensary-specific variables
- Returns structured JSON with product name, brand, category, price, THC/CBD, availability
- This is the cleanest data source

**iHeartJane:**
- Jane menus use a REST-ish API under the hood
- Pattern: `https://api.iheartjane.com/v1/stores/{store_id}/products`
- Returns paginated product lists with pricing, availability, and basic lab data
- Good data quality, slightly different taxonomy than Dutchie

**Weedmaps:**
- Many NYS dispensaries also list on Weedmaps as a marketplace
- API pattern: `https://api-g.weedmaps.com/discovery/v2/listings/{slug}/menu_items`
- Data quality varies more — often operator-entered descriptions
- Good for catching dispensaries not on Dutchie/Jane

**Custom / Direct Sites:**
- Some NYS dispensaries run their own menus (Shopify-based, WordPress, etc.)
- These require per-site scraping rules or generic HTML parsing
- Lower priority — start with the big 3 platforms which cover ~80% of licensed NYS dispensaries

### Scraper Worker Example (Dutchie)

```typescript
// workers/scrapers/dutchie.ts
import { Hono } from "hono";

const app = new Hono();

app.post("/scrape/dutchie", async (c) => {
  const { retailers, batchId, convexUrl, convexToken } = await c.req.json();

  const results = [];

  for (const retailer of retailers) {
    try {
      // Dutchie GraphQL query for menu items
      const response = await fetch("https://dutchie.com/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; market-research-bot)",
        },
        body: JSON.stringify({
          operationName: "FilteredProducts",
          variables: {
            dispensarySlug: retailer.slug,
            byCategory: null,
            offset: 0,
            limit: 500,
          },
          query: `query FilteredProducts($dispensarySlug: String!, ...) {
            filteredProducts(dispensarySlug: $dispensarySlug, ...) {
              products {
                id name brand { name } category subcategory
                strainType potencyCbd { formatted range { ... } }
                potencyThc { formatted range { ... } }
                variants { option price specialPrice isSpecial }
                image
              }
            }
          }`,
        }),
      });

      const data = await response.json();
      const products = data?.data?.filteredProducts?.products || [];

      const scraped = products.map((p: any) => ({
        retailerId: retailer.id,
        rawProductName: p.name,
        rawBrandName: p.brand?.name || "Unknown",
        rawCategory: p.category,
        subcategory: p.subcategory,
        strainType: p.strainType,
        thcFormatted: p.potencyThc?.formatted,
        cbdFormatted: p.potencyCbd?.formatted,
        variants: p.variants,
        imageUrl: p.image,
        sourceUrl: `https://dutchie.com/dispensary/${retailer.slug}`,
        sourcePlatform: "dutchie",
        scrapedAt: Date.now(),
        batchId,
      }));

      results.push({ retailerId: retailer.id, items: scraped, status: "ok" });
    } catch (error) {
      results.push({
        retailerId: retailer.id,
        items: [],
        status: "error",
        error: (error as Error).message,
      });
    }

    // Rate limiting: 500ms between requests to same platform
    await new Promise((r) => setTimeout(r, 500));
  }

  // POST results back to Convex HTTP action for processing
  await fetch(`${convexUrl}/api/ingest/scraped-batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${convexToken}`,
    },
    body: JSON.stringify({ batchId, results }),
  });

  return c.json({ batchId, processed: results.length });
});

export default app;
```

### Product Normalization Pipeline

This is the most critical piece of IP in the system. Raw menu data is messy — the same product appears differently across dispensaries:

- "Cookies - Gary Payton 3.5g" (Dutchie)
- "Gary Payton by Cookies (1/8 oz)" (Jane)
- "COOKIES Gary Payton Flower Eighth" (Weedmaps)

The normalizer needs to resolve all three to the same canonical product.

**Step 1: Text Preprocessing**
- Lowercase, strip special characters
- Extract weight/quantity patterns (3.5g → { amount: 3.5, unit: "g" })
- Separate brand name from product name using known brand list + heuristics

**Step 2: Fuzzy Matching**
- Compare against existing `products` table using normalized names
- Use Levenshtein distance + token overlap scoring
- Threshold: score > 0.85 → auto-match, 0.6-0.85 → queue for review, < 0.6 → create new

**Step 3: AI-Assisted Resolution (for ambiguous cases)**
- Convex action calls Claude API or Workers AI
- Prompt: "Given these raw product strings, determine if they refer to the same product. Consider brand, strain name, weight, and category."
- Used sparingly to keep costs down — only for the review queue

**Step 4: Human Review Queue**
- Dashboard section for ops team to resolve unmatched products
- Each resolution trains the matching heuristics (feedback loop)

```typescript
// convex/functions/normalizer.ts
import { internalAction } from "./_generated/server";
import { v } from "convex/values";

export const normalizeProduct = internalAction({
  args: {
    rawProductName: v.string(),
    rawBrandName: v.string(),
    rawCategory: v.string(),
    sourceplatform: v.string(),
  },
  handler: async (ctx, args) => {
    // Step 1: Preprocess
    const cleaned = preprocessProductName(args.rawProductName);
    const weight = extractWeight(args.rawProductName);
    const category = mapCategory(args.rawCategory, args.sourcePlatform);

    // Step 2: Find or create brand
    const normalizedBrandName = args.rawBrandName.toLowerCase().trim();
    let brand = await ctx.runQuery(internal.queries.findBrandByNormalizedName, {
      normalizedName: normalizedBrandName,
    });

    if (!brand) {
      brand = await ctx.runMutation(internal.mutations.createBrand, {
        name: args.rawBrandName,
        normalizedName: normalizedBrandName,
        aliases: [],
        isVerified: false,
        firstSeenAt: Date.now(),
      });
    }

    // Step 3: Find or create product
    const normalizedProductName = buildNormalizedProductName(cleaned, weight);
    let product = await ctx.runQuery(internal.queries.findProductFuzzy, {
      brandId: brand._id,
      normalizedName: normalizedProductName,
      category,
    });

    if (!product) {
      product = await ctx.runMutation(internal.mutations.createProduct, {
        brandId: brand._id,
        name: cleaned,
        normalizedName: normalizedProductName,
        category,
        weight,
        isActive: true,
        firstSeenAt: Date.now(),
        lastSeenAt: Date.now(),
      });
    }

    return { brandId: brand._id, productId: product._id };
  },
});
```

---

## 5. Alert Engine

### How Alerts Work

The alert engine runs as a Convex internal function triggered after each `currentInventory` update. It's event-driven, not polled.

```typescript
// convex/functions/alertEngine.ts
import { internalMutation } from "./_generated/server";

export const evaluateAlerts = internalMutation({
  args: {
    retailerId: v.id("retailers"),
    productId: v.id("products"),
    brandId: v.id("brands"),
    changes: v.object({
      stockChanged: v.boolean(),
      previousInStock: v.optional(v.boolean()),
      currentInStock: v.boolean(),
      priceChanged: v.boolean(),
      previousPrice: v.optional(v.number()),
      currentPrice: v.number(),
      isNewListing: v.boolean(),
      wasDelisted: v.boolean(),
    }),
  },
  handler: async (ctx, args) => {
    // Find all watchlists that match this retailer/product/brand
    const matchingWatchlists = await findMatchingWatchlists(
      ctx, args.retailerId, args.productId, args.brandId
    );

    for (const watchlist of matchingWatchlists) {
      for (const rule of watchlist.alertRules) {
        if (!rule.isActive) continue;

        let shouldAlert = false;
        let alertType = rule.condition;
        let severity = "info";
        let title = "";
        let body = "";

        switch (rule.condition) {
          case "out_of_stock":
            if (args.changes.stockChanged && !args.changes.currentInStock) {
              shouldAlert = true;
              severity = "warning";
              title = `Out of Stock: ${productName} at ${retailerName}`;
              body = `${brandName} ${productName} is now out of stock.`;
            }
            break;

          case "low_stock":
            // Inferred from rapid stock changes
            if (args.changes.currentInStock && estimatedVelocity === "fast") {
              shouldAlert = true;
              severity = "info";
              title = `Low Stock Signal: ${productName} at ${retailerName}`;
            }
            break;

          case "price_drop":
            if (args.changes.priceChanged) {
              const dropPercent = ((args.changes.previousPrice! - args.changes.currentPrice)
                / args.changes.previousPrice!) * 100;
              if (dropPercent >= (rule.threshold || 5)) {
                shouldAlert = true;
                severity = "info";
                title = `Price Drop: ${productName} down ${dropPercent.toFixed(0)}%`;
              }
            }
            break;

          case "new_listing":
            if (args.changes.isNewListing) {
              shouldAlert = true;
              title = `New Listing: ${productName} at ${retailerName}`;
            }
            break;

          // ... more conditions
        }

        if (shouldAlert) {
          // Create alert record
          await ctx.db.insert("alerts", {
            watchlistId: watchlist._id,
            userId: watchlist.userId,
            type: alertType,
            severity,
            title,
            body,
            data: args.changes,
            retailerId: args.retailerId,
            productId: args.productId,
            brandId: args.brandId,
            deliveredVia: [],
            isRead: false,
            createdAt: Date.now(),
          });

          // Dispatch to delivery channels
          for (const channel of rule.channels) {
            await ctx.scheduler.runAfter(0, internal.delivery.sendAlert, {
              alertId: alert._id,
              channel,
              userId: watchlist.userId,
            });
          }
        }
      }
    }
  },
});
```

### Alert Delivery Channels

**Email:** Convex action calls Resend/SendGrid API for email delivery. Daily digest option batches alerts into a morning summary.

**OpenClaw Bot (WhatsApp/Telegram/Slack):** The delivery function calls the OpenClaw gateway HTTP endpoint, which routes the message to the user's connected channel. This is where the OpenClaw integration shines — users can also *query* the bot conversationally:

- "What's the hottest brand in Brooklyn right now?"
- "Show me all dispensaries carrying Cookies in NYC that are running sales"
- "Alert me when Gary Payton drops below $45 anywhere in Manhattan"

**Webhook:** For enterprise customers who want to pipe alerts into their own systems.

---

## 6. OpenClaw Integration

### Skill Architecture

OpenClaw skills live in `~/.openclaw/workspace/skills/`. CannaSignal ships as an OpenClaw skill package.

```
~/.openclaw/workspace/skills/cannasignal/
├── SKILL.md              # Skill definition + prompts
├── api.ts                # API client for CannaSignal backend
├── commands/
│   ├── search.ts         # "Find products/brands/retailers"
│   ├── alerts.ts         # "Set up / manage alerts"
│   ├── compare.ts        # "Compare brand X vs Y in region Z"
│   ├── trending.ts       # "What's trending in [region]?"
│   └── report.ts         # "Generate weekly market report"
└── templates/
    ├── alert-message.md   # Alert formatting template
    ├── daily-digest.md    # Daily summary template
    └── market-report.md   # Weekly report template
```

### Example SKILL.md

```markdown
# CannaSignal — Cannabis Market Intelligence

## Description
Real-time cannabis market data for New York State. Track inventory,
pricing, and brand performance across dispensaries.

## Commands
- `/cs search [query]` — Search products, brands, or retailers
- `/cs trending [region]` — Top brands and products in a region
- `/cs alerts` — View and manage your alert watchlists
- `/cs compare [brand1] vs [brand2]` — Side-by-side brand comparison
- `/cs report [weekly|monthly]` — Generate market intelligence report
- `/cs price [product]` — Price check across dispensaries

## Natural Language
Users can also ask naturally:
- "What's selling fastest in Brooklyn?"
- "Is Cookies carried at more dispensaries than Tyson 2.0?"
- "Alert me when any new vape brand launches in NYC"

## API
Base URL: https://api.cannasignal.com
Auth: Bearer token (user's CannaSignal API key)
```

### Conversational Flow Example

```
User (via WhatsApp): "What's hot in Manhattan right now?"

OpenClaw → CannaSignal API: GET /api/analytics/trending?region=manhattan&period=weekly

OpenClaw Response:
📊 Manhattan Cannabis Trends (This Week)

🔥 Top Selling Brands:
1. Cookies — 47 dispensaries, avg $52/eighth, 12 OOS events (high velocity)
2. Tyson 2.0 — 38 dispensaries, avg $48/eighth, 8 OOS events
3. Jeeter — 41 dispensaries, avg $18/pre-roll, 15 OOS events

📈 Fastest Growing:
• Backpack Boyz — +8 new retailer pickups this week
• Lemonnade — Price dropped 12% avg, velocity increasing

💰 Best Deals:
• Gary Payton 3.5g at Housing Works: $40 (usually $55)
• Jeeter Infused Pre-Roll at The Dispensary NYC: $15 (usually $20)

Want me to set up alerts for any of these brands?
```

---

## 7. Dashboard (React/Vite)

### Route Structure

```
/                          → Market overview (top brands, trending, alerts summary)
/brands                    → Brand directory with search/filter
/brands/:slug              → Brand detail (distribution map, pricing trends, velocity)
/retailers                 → Retailer directory with map view
/retailers/:slug           → Retailer detail (menu snapshot, brand mix, pricing)
/compare                   → Side-by-side brand or retailer comparison
/alerts                    → Alert management (watchlists, history, settings)
/analytics                 → Deep analytics (time series, regional heatmaps)
/settings                  → Account, billing, API keys, OpenClaw config
```

### Key Dashboard Views

**Market Overview:** Real-time feed of notable market events (new listings, OOS events, price drops) powered by Convex reactive queries. The `useQuery` hook subscribes to `currentInventory` changes — the dashboard updates without refresh.

**Brand Heatmap:** Regional distribution visualization showing where brands have presence vs gaps. Uses the `brandAnalytics` table aggregations.

**Price Tracker:** Time-series charts per product showing price history across retailers. Built from `menuSnapshots` historical data with Recharts.

**Velocity Rankings:** Estimated sell-through leaderboard based on OOS frequency and restock patterns. This is the "secret sauce" insight that brands pay for.

### Convex + React Integration

```typescript
// src/hooks/useMarketData.ts
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function useTrendingBrands(region: string, period: string) {
  return useQuery(api.analytics.getTrendingBrands, { region, period });
}

export function useRetailerInventory(retailerId: Id<"retailers">) {
  // This is reactive — updates in real-time as scraper data lands
  return useQuery(api.inventory.getCurrentByRetailer, { retailerId });
}

export function useBrandAlerts(userId: Id<"users">) {
  return useQuery(api.alerts.getUnreadByUser, { userId });
}

export function usePriceHistory(productId: Id<"products">, days: number) {
  return useQuery(api.analytics.getPriceHistory, { productId, days });
}
```

---

## 8. API Design (Hono on Cloudflare Workers)

### Public API Endpoints

All endpoints require `Authorization: Bearer <api_key>` header. Rate limits based on plan tier.

```
GET  /api/v1/brands
     ?region=nyc&category=flower&sort=velocity_desc&limit=20

GET  /api/v1/brands/:brandId
     → Full brand profile with current distribution + analytics

GET  /api/v1/brands/:brandId/analytics
     ?period=weekly&region=manhattan
     → Time-series brand performance data

GET  /api/v1/products
     ?brand=cookies&category=flower&inStock=true&region=nyc

GET  /api/v1/products/:productId/prices
     ?days=30
     → Price history across all retailers carrying this product

GET  /api/v1/retailers
     ?region=nyc&platform=dutchie&hasInStock=brandId

GET  /api/v1/retailers/:retailerId/menu
     → Current menu snapshot with prices and availability

GET  /api/v1/compare/brands
     ?ids=brand1,brand2&region=nyc&period=monthly
     → Side-by-side brand comparison

GET  /api/v1/trending
     ?region=nyc&period=weekly&category=flower
     → Trending brands and products

POST /api/v1/watchlists
     → Create a new watchlist with alert rules

GET  /api/v1/alerts
     ?unread=true&limit=50
     → User's alert history

POST /api/v1/webhooks
     → Register webhook endpoint for real-time alert delivery
```

### API → Convex Integration

The Hono Workers API acts as a thin gateway that authenticates requests, enforces rate limits, and proxies to Convex:

```typescript
// workers/api/src/index.ts
import { Hono } from "hono";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const app = new Hono();
const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

app.get("/api/v1/trending", async (c) => {
  const { region, period, category } = c.req.query();

  const data = await convex.query(api.analytics.getTrendingBrands, {
    region: region || "statewide",
    period: period || "weekly",
    category: category || undefined,
  });

  return c.json({ data, meta: { region, period, timestamp: Date.now() } });
});
```

---

## 9. NYS Retailer Discovery & Onboarding

### Building the Initial Retailer Database

Before scraping, we need a comprehensive list of licensed NYS dispensaries and their menu platform URLs.

**Source 1: OCM License Registry**
- NYS OCM publishes a list of all licensed adult-use retail dispensaries
- Scrape cannabis.ny.gov/licensing for current licensees
- Extract: business name, license number, license type, address

**Source 2: Dutchie/Jane/Weedmaps Directories**
- Dutchie: `dutchie.com/dispensaries?state=new-york`
- iHeartJane: directory search API by state
- Weedmaps: `weedmaps.com/dispensaries/in/new-york`
- Cross-reference with OCM data to validate legitimacy

**Source 3: Google Maps/Places API**
- Search for "cannabis dispensary" in NYS regions
- Extract website URLs, then detect menu platform from site

**Estimated NYS Coverage:**
- ~200 licensed adult-use dispensaries (as of early 2026)
- ~80% on Dutchie or iHeartJane
- Target: 90%+ coverage within first 30 days

---

## 10. Project Roadmap

### Phase 1A: Foundation (Weeks 1-3)

- [ ] Convex project setup with full schema
- [ ] Retailer discovery: build initial NYS dispensary database (manual + automated)
- [ ] Dutchie scraper worker (highest coverage platform)
- [ ] Basic product normalizer (exact match + simple fuzzy)
- [ ] `menuSnapshots` and `currentInventory` pipeline working end-to-end
- [ ] Scraper scheduler (Convex crons)

### Phase 1B: Intelligence Layer (Weeks 4-6)

- [ ] iHeartJane and Weedmaps scrapers
- [ ] AI-assisted product normalization (Claude API for ambiguous matches)
- [ ] `brandAnalytics` computation jobs (daily/weekly aggregations)
- [ ] Alert engine: watchlists, conditions, email delivery
- [ ] Price history tracking and trend computation

### Phase 1C: Interfaces (Weeks 7-9)

- [ ] React/Vite dashboard: market overview, brand detail, retailer detail
- [ ] Comparison views (brand vs brand, retailer vs retailer)
- [ ] Hono API gateway with auth and rate limiting
- [ ] OpenClaw skill: basic search, trending, alerts via chat
- [ ] User auth (Clerk or Convex Auth) + subscription tiers

### Phase 1D: Launch & Iterate (Weeks 10-12)

- [ ] Beta launch with 5-10 NYS brands/wholesalers
- [ ] Daily digest email system
- [ ] Webhook delivery for enterprise users
- [ ] Data quality monitoring dashboard (scrape success rates, normalization accuracy)
- [ ] Pricing page + Stripe integration
- [ ] Feedback loop: user-reported data corrections

---

## 11. Infrastructure & Cost Estimates

### Monthly Costs at Launch (~200 retailers, ~50 users)

| Service | Usage | Est. Cost |
|---|---|---|
| Convex | Pro plan, ~500K function calls/day | $25/mo |
| Cloudflare Workers | ~2M requests/mo (scraping + API) | $5/mo |
| Claude API (normalization) | ~10K calls/mo for fuzzy matching | $15/mo |
| Resend (email) | ~5K emails/mo | Free tier |
| Domain + DNS | cannasignal.com | $15/yr |
| Clerk (auth) | <1K MAU | Free tier |
| **Total** | | **~$50/mo** |

### At Scale (~2,000 retailers, ~500 users, multi-state)

| Service | Usage | Est. Cost |
|---|---|---|
| Convex | Pro/Team, ~5M function calls/day | $100-250/mo |
| Cloudflare Workers | ~20M requests/mo | $25/mo |
| Claude API | ~100K calls/mo | $150/mo |
| Resend | ~50K emails/mo | $20/mo |
| **Total** | | **~$350-500/mo** |

Revenue at 500 users averaging $350/mo = **$175K/mo ARR** — the margins are excellent.

---

## 12. Legal & Ethical Considerations

**Data sourcing:** All data comes from publicly available dispensary menus. This is the same approach LitAlerts uses and is standard practice in market intelligence. No login credentials are used, no terms of service are violated by reading public menu pages.

**Compliance with OCM:** CannaSignal is not a licensed cannabis business and does not need an OCM license. It is a technology/analytics provider. However, Phase 2 (compliance intelligence) will require closer engagement with OCM's data-sharing policies.

**Anti-scraping measures:** Some platforms may implement rate limiting or blocking. Mitigations include respectful rate limiting (built into the scraper), rotating Cloudflare Worker PoPs, and eventually pursuing official data partnerships with Dutchie/Jane (which is a stronger long-term play and aligns with Phase 4's marketplace vision).

**Data accuracy disclaimers:** Like LitAlerts, all data should be presented as "estimated" and "directional." Menu data reflects what's listed online, not necessarily physical shelf reality.

---

## 13. Phase 2 Hooks (Built Into Phase 1)

These schema and architectural decisions in Phase 1 directly enable the Phase 2 compliance intelligence pivot:

- **`licenseNumber` on retailers** → ready to cross-reference with Metrc/OCM data
- **`menuSnapshots` historical data** → can be compared against Metrc reported inventory for discrepancy detection
- **`scrapeJobs` infrastructure** → same pipeline can ingest Metrc API data when available
- **Alert engine** → compliance alert conditions (e.g., "inventory on menu doesn't match Metrc tags") slot right in
- **User roles** → "compliance_officer" role ready to be added
- **Multi-state architecture** → each state's regulatory integration is additive, not a rewrite
