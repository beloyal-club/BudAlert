/**
 * Dutchie Menu Scraper Worker
 * 
 * Scrapes cannabis dispensary menus from Dutchie's GraphQL API.
 * Called by the scraper orchestrator, posts results back to Convex.
 * 
 * REL-001: Added retry logic with exponential backoff and dead letter queue integration.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

app.use("/*", cors());

// ============================================================
// RETRY CONFIGURATION (REL-001)
// ============================================================

const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,      // Start with 1s delay
  maxDelayMs: 10000,      // Cap at 10s
  backoffMultiplier: 2,   // Double each retry
  retryableStatuses: [429, 500, 502, 503, 504],
};

// ============================================================
// TYPES
// ============================================================

interface ScrapedItem {
  rawProductName: string;
  rawBrandName: string;
  rawCategory?: string;
  subcategory?: string;
  strainType?: string;
  price: number;
  originalPrice?: number;
  inStock: boolean;
  quantity: number | null;
  quantityWarning: string | null;
  quantitySource: string;
  imageUrl?: string;
  thcFormatted?: string;
  cbdFormatted?: string;
  sourceUrl: string;
  sourcePlatform: string;
  scrapedAt: number;
}

interface RetailerToScrape {
  id: string;
  slug: string;
  name: string;
}

interface ScrapeResult {
  retailerId: string;
  items: ScrapedItem[];
  status: "ok" | "error";
  error?: string;
  retryCount?: number;
  statusCode?: number;
}

interface RetryState {
  attempts: number;
  firstAttemptAt: number;
  lastError?: string;
  lastStatusCode?: number;
  rawResponse?: string;
}

// ============================================================
// RETRY UTILITIES (REL-001)
// ============================================================

function getRetryDelay(attempt: number): number {
  const delay = RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
  // Add jitter (±25%) to prevent thundering herd
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, RETRY_CONFIG.maxDelayMs);
}

function isRetryableError(statusCode?: number, errorMessage?: string): boolean {
  if (statusCode && RETRY_CONFIG.retryableStatuses.includes(statusCode)) {
    return true;
  }
  if (errorMessage) {
    const msg = errorMessage.toLowerCase();
    // Retry on transient errors
    if (msg.includes("timeout") || msg.includes("network") || 
        msg.includes("econnreset") || msg.includes("socket")) {
      return true;
    }
  }
  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ============================================================
// DUTCHIE GRAPHQL API DOCUMENTATION
// ============================================================
//
// Endpoint: https://dutchie.com/graphql
// Method: POST
// Content-Type: application/json
//
// GRAPHQL RESPONSE STRUCTURE:
// ─────────────────────────────────────────────────────────────
// {
//   "data": {
//     "filteredProducts": {
//       "products": [
//         {
//           "id": "abc123",
//           "name": "Blue Dream",
//           "brand": { "name": "Empire Cannabis" },
//           "category": "flower",           // Main category
//           "subcategory": "hybrid",         // Subcategory
//           "strainType": "HYBRID",          // SATIVA, INDICA, HYBRID
//           "potencyThc": { "formatted": "24.5%" },
//           "potencyCbd": { "formatted": "0.1%" },
//           "image": "https://images.dutchie.com/...",
//           "variants": [
//             {
//               "option": "1g",              // Weight/size variant
//               "price": 15.00,              // Regular price
//               "specialPrice": null,        // Sale price (when isSpecial=true)
//               "isSpecial": false,          // Is on sale?
//               "quantity": 23               // ⭐ EXACT INVENTORY COUNT
//             },
//             {
//               "option": "3.5g",
//               "price": 45.00,
//               "specialPrice": 40.00,       // On sale for $40
//               "isSpecial": true,
//               "quantity": 7                // Low stock!
//             }
//           ]
//         }
//       ],
//       "totalCount": 156
//     }
//   }
// }
//
// INVENTORY EXTRACTION LOGIC:
// ─────────────────────────────────────────────────────────────
// 1. Each product has multiple variants (weight/size options)
// 2. Each variant has its own quantity field
// 3. quantity = null means unknown (rare)
// 4. quantity = 0 means out of stock
// 5. quantity > 0 means exact count available
// 6. Low stock warning generated when quantity <= 5
//
// PRICE EXTRACTION LOGIC:
// ─────────────────────────────────────────────────────────────
// - If variant.isSpecial is true:
//   - Current price = variant.specialPrice (sale price)
//   - Original price = variant.price (crossed-out price)
// - If variant.isSpecial is false:
//   - Current price = variant.price
//   - No original price
//
// QUANTITY SOURCE TRACKING:
// ─────────────────────────────────────────────────────────────
// quantitySource: "dutchie_graphql" - Direct from API (most reliable)
// quantitySource: "text_pattern"    - Scraped from page text
// quantitySource: "cart_hack"       - Inferred via cart max limit
// quantitySource: "unknown"         - Could not determine
//
// ============================================================

const DUTCHIE_MENU_QUERY = `
query FilteredProducts(
  $dispensarySlug: String!
  $byCategory: ProductFilter
  $offset: Int
  $limit: Int
) {
  filteredProducts(
    dispensarySlug: $dispensarySlug
    byCategory: $byCategory
    offset: $offset
    limit: $limit
  ) {
    products {
      id
      name
      brand {
        name
      }
      category
      subcategory
      strainType
      potencyCbd {
        formatted
      }
      potencyThc {
        formatted
      }
      variants {
        option
        price
        specialPrice
        isSpecial
        quantity
      }
      image
    }
    totalCount
  }
}
`;

// ============================================================
// SCRAPE WITH RETRIES (REL-001)
// ============================================================

async function scrapeRetailerWithRetry(
  retailer: RetailerToScrape
): Promise<{ result: ScrapeResult; retryState: RetryState }> {
  const retryState: RetryState = {
    attempts: 0,
    firstAttemptAt: Date.now(),
  };

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    retryState.attempts = attempt + 1;
    
    try {
      const response = await fetch("https://dutchie.com/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; CannaSignal/1.0; market-research)",
          Accept: "application/json",
        },
        body: JSON.stringify({
          operationName: "FilteredProducts",
          variables: {
            dispensarySlug: retailer.slug,
            byCategory: null,
            offset: 0,
            limit: 500,
          },
          query: DUTCHIE_MENU_QUERY,
        }),
      });

      retryState.lastStatusCode = response.status;

      if (!response.ok) {
        const responseText = await response.text().catch(() => "");
        retryState.rawResponse = responseText.slice(0, 500);
        const errorMsg = `HTTP ${response.status}: ${response.statusText}`;
        retryState.lastError = errorMsg;

        // Check if we should retry
        if (attempt < RETRY_CONFIG.maxRetries && isRetryableError(response.status, errorMsg)) {
          const delay = getRetryDelay(attempt);
          console.log(`[Dutchie Scraper] ⏳ ${retailer.name}: ${errorMsg}, retry ${attempt + 1}/${RETRY_CONFIG.maxRetries} in ${Math.round(delay)}ms`);
          await sleep(delay);
          continue;
        }
        
        throw new Error(errorMsg);
      }

      const data = await response.json() as any;
      
      if (data.errors) {
        const errorMsg = `GraphQL errors: ${JSON.stringify(data.errors)}`;
        retryState.lastError = errorMsg;
        retryState.rawResponse = JSON.stringify(data.errors).slice(0, 500);
        
        // GraphQL errors typically aren't retryable (bad query, invalid slug, etc.)
        throw new Error(errorMsg);
      }

      const products = data?.data?.filteredProducts?.products || [];
      const scrapedAt = Date.now();

      const items: ScrapedItem[] = products.flatMap((p: any) => {
        const variants = p.variants || [{ price: 0, quantity: 1 }];
        
        return variants.map((v: any) => {
          const qty = v.quantity ?? null;
          const quantityWarning = qty !== null && qty <= 5 ? `Low stock: ${qty} remaining` : null;
          
          return {
            rawProductName: `${p.name}${v.option ? ` - ${v.option}` : ""}`,
            rawBrandName: p.brand?.name || "Unknown",
            rawCategory: p.category,
            subcategory: p.subcategory,
            strainType: p.strainType,
            price: v.isSpecial && v.specialPrice ? v.specialPrice : v.price,
            originalPrice: v.isSpecial ? v.price : undefined,
            inStock: (v.quantity || 0) > 0,
            quantity: qty,
            quantityWarning,
            quantitySource: "dutchie_graphql",
            imageUrl: p.image,
            thcFormatted: p.potencyThc?.formatted,
            cbdFormatted: p.potencyCbd?.formatted,
            sourceUrl: `https://dutchie.com/dispensary/${retailer.slug}`,
            sourcePlatform: "dutchie",
            scrapedAt,
          };
        });
      });

      return {
        result: {
          retailerId: retailer.id,
          items,
          status: "ok",
          retryCount: attempt,
        },
        retryState,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      retryState.lastError = errorMessage;

      // Check if we should retry on network errors
      if (attempt < RETRY_CONFIG.maxRetries && isRetryableError(undefined, errorMessage)) {
        const delay = getRetryDelay(attempt);
        console.log(`[Dutchie Scraper] ⏳ ${retailer.name}: ${errorMessage}, retry ${attempt + 1}/${RETRY_CONFIG.maxRetries} in ${Math.round(delay)}ms`);
        await sleep(delay);
        continue;
      }

      // Final failure
      return {
        result: {
          retailerId: retailer.id,
          items: [],
          status: "error",
          error: errorMessage,
          retryCount: attempt,
          statusCode: retryState.lastStatusCode,
        },
        retryState,
      };
    }
  }

  // Should never reach here, but just in case
  return {
    result: {
      retailerId: retailer.id,
      items: [],
      status: "error",
      error: retryState.lastError || "Max retries exceeded",
      retryCount: RETRY_CONFIG.maxRetries,
      statusCode: retryState.lastStatusCode,
    },
    retryState,
  };
}

// ============================================================
// MAIN SCRAPING ENDPOINT
// ============================================================

app.post("/scrape/dutchie", async (c) => {
  const { retailers, batchId, convexUrl, convexToken } = await c.req.json<{
    retailers: RetailerToScrape[];
    batchId: string;
    convexUrl: string;
    convexToken: string;
  }>();

  console.log(`[Dutchie Scraper] Starting batch ${batchId} with ${retailers.length} retailers`);

  const results: ScrapeResult[] = [];
  const deadLetterEntries: any[] = [];

  for (const retailer of retailers) {
    console.log(`[Dutchie Scraper] Scraping ${retailer.name} (${retailer.slug})`);

    const { result, retryState } = await scrapeRetailerWithRetry(retailer);
    results.push(result);

    if (result.status === "ok") {
      const retryInfo = retryState.attempts > 1 ? ` (after ${retryState.attempts - 1} retries)` : "";
      console.log(`[Dutchie Scraper] ✓ ${retailer.name}: ${result.items.length} items${retryInfo}`);
    } else {
      console.error(`[Dutchie Scraper] ✗ ${retailer.name}: ${result.error} (${retryState.attempts} attempts)`);
      
      // Add to dead letter queue if exhausted retries
      if (retryState.attempts > RETRY_CONFIG.maxRetries) {
        deadLetterEntries.push({
          retailerId: retailer.id,
          retailerSlug: retailer.slug,
          retailerName: retailer.name,
          sourcePlatform: "dutchie",
          sourceUrl: `https://dutchie.com/dispensary/${retailer.slug}`,
          batchId,
          errorMessage: result.error || "Unknown error",
          statusCode: result.statusCode,
          totalRetries: retryState.attempts,
          firstAttemptAt: retryState.firstAttemptAt,
          lastAttemptAt: Date.now(),
          rawResponse: retryState.rawResponse,
        });
      }
    }

    // Rate limiting between retailers
    await sleep(500);
  }

  // Post results back to Convex
  if (convexUrl && convexToken) {
    try {
      const convexResponse = await fetch(`${convexUrl}/api/mutation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${convexToken}`,
        },
        body: JSON.stringify({
          path: "ingestion:ingestScrapedBatch",
          args: { batchId, results },
        }),
      });

      if (!convexResponse.ok) {
        console.error(`[Dutchie Scraper] Failed to post to Convex: ${convexResponse.statusText}`);
      } else {
        console.log(`[Dutchie Scraper] Posted ${results.length} results to Convex`);
      }

      // Post dead letter entries (REL-001)
      for (const entry of deadLetterEntries) {
        try {
          await fetch(`${convexUrl}/api/mutation`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${convexToken}`,
            },
            body: JSON.stringify({
              path: "deadLetterQueue:addFailedScrape",
              args: entry,
            }),
          });
          console.log(`[Dutchie Scraper] Added ${entry.retailerName} to dead letter queue`);
        } catch (dlqError) {
          console.error(`[Dutchie Scraper] Failed to add to dead letter queue:`, dlqError);
        }
      }
    } catch (error) {
      console.error("[Dutchie Scraper] Error posting to Convex:", error);
    }
  }

  const stats = {
    batchId,
    totalRetailers: retailers.length,
    successful: results.filter((r) => r.status === "ok").length,
    failed: results.filter((r) => r.status === "error").length,
    totalItems: results.reduce((sum, r) => sum + r.items.length, 0),
    retriedCount: results.filter((r) => (r.retryCount ?? 0) > 0).length,
    deadLettered: deadLetterEntries.length,
  };

  console.log(`[Dutchie Scraper] Batch complete:`, stats);

  return c.json(stats);
});

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/health", (c) => {
  return c.json({ 
    status: "ok", 
    service: "dutchie-scraper",
    retryConfig: RETRY_CONFIG,
  });
});

// ============================================================
// TEST ENDPOINTS
// ============================================================

// Test scrape single dispensary
app.get("/test/:slug", async (c) => {
  const slug = c.req.param("slug");

  try {
    const response = await fetch("https://dutchie.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; CannaSignal/1.0; market-research)",
      },
      body: JSON.stringify({
        operationName: "FilteredProducts",
        variables: {
          dispensarySlug: slug,
          byCategory: null,
          offset: 0,
          limit: 50,
        },
        query: DUTCHIE_MENU_QUERY,
      }),
    });

    const data = await response.json();
    return c.json(data);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// Test retry behavior (simulates failures)
app.get("/test-retry", (c) => {
  return c.json({
    message: "Retry configuration",
    config: RETRY_CONFIG,
    delays: Array.from({ length: RETRY_CONFIG.maxRetries + 1 }, (_, i) => ({
      attempt: i,
      baseDelay: getRetryDelay(i),
    })),
  });
});

// Introspection endpoint to discover current Dutchie GraphQL schema
app.get("/introspect", async (c) => {
  const INTROSPECTION_QUERY = `
    query IntrospectionQuery {
      __schema {
        queryType { name }
        types {
          name
          kind
          fields {
            name
            args { name type { name kind ofType { name kind } } }
            type { name kind ofType { name kind ofType { name } } }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch("https://dutchie.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; CannaSignal/1.0; market-research)",
      },
      body: JSON.stringify({ query: INTROSPECTION_QUERY }),
    });

    const data = await response.json();
    return c.json(data);
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// Test different query formats to find working schema
app.get("/test-query/:slug", async (c) => {
  const slug = c.req.param("slug");
  
  // Try different GraphQL endpoints Dutchie might use
  const endpoints = [
    { name: "dutchie.com/graphql", url: "https://dutchie.com/graphql" },
    { name: "api.dutchie.com/graphql", url: "https://api.dutchie.com/graphql" },
    { name: "consumer.dutchie.com/graphql", url: "https://consumer.dutchie.com/graphql" },
    { name: "dutchie.com/api/graphql", url: "https://dutchie.com/api/graphql" },
  ];

  const testQuery = `query { __typename }`;
  const results: Record<string, any> = {};

  for (const ep of endpoints) {
    try {
      const response = await fetch(ep.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; CannaSignal/1.0)",
        },
        body: JSON.stringify({ query: testQuery }),
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text.slice(0, 200) };
      }
      
      results[ep.name] = {
        status: response.status,
        ok: response.ok,
        data: data,
      };
    } catch (error) {
      results[ep.name] = { error: String(error) };
    }
  }

  // Also try the original query format on dutchie.com/graphql with Referer header
  try {
    const response = await fetch("https://dutchie.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": `https://dutchie.com/dispensary/${slug}`,
        "Origin": "https://dutchie.com",
      },
      body: JSON.stringify({
        operationName: "FilteredProducts",
        variables: { dispensarySlug: slug, limit: 5 },
        query: `query FilteredProducts($dispensarySlug: String!, $limit: Int) {
          filteredProducts(dispensarySlug: $dispensarySlug, limit: $limit) {
            products { id name }
            totalCount
          }
        }`,
      }),
    });
    
    const data = await response.json();
    results["with_referer"] = {
      status: response.status,
      errors: data.errors?.map((e: any) => e.message),
      hasData: !!data.data,
    };
  } catch (error) {
    results["with_referer"] = { error: String(error) };
  }

  return c.json({ slug, results });
});

export default app;
