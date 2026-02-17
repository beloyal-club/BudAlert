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
// DUTCHIE GRAPHQL
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
        
        return variants.map((v: any) => ({
          rawProductName: `${p.name}${v.option ? ` - ${v.option}` : ""}`,
          rawBrandName: p.brand?.name || "Unknown",
          rawCategory: p.category,
          subcategory: p.subcategory,
          strainType: p.strainType,
          price: v.isSpecial && v.specialPrice ? v.specialPrice : v.price,
          originalPrice: v.isSpecial ? v.price : undefined,
          inStock: (v.quantity || 0) > 0,
          imageUrl: p.image,
          thcFormatted: p.potencyThc?.formatted,
          cbdFormatted: p.potencyCbd?.formatted,
          sourceUrl: `https://dutchie.com/dispensary/${retailer.slug}`,
          sourcePlatform: "dutchie",
          scrapedAt,
        }));
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

export default app;
