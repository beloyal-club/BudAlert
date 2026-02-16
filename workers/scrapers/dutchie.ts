/**
 * Dutchie Menu Scraper Worker
 * 
 * Scrapes cannabis dispensary menus from Dutchie's GraphQL API.
 * Called by the scraper orchestrator, posts results back to Convex.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

app.use("/*", cors());

// Types
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
}

// Dutchie GraphQL query for menu items
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

// Main scraping endpoint
app.post("/scrape/dutchie", async (c) => {
  const { retailers, batchId, convexUrl, convexToken } = await c.req.json<{
    retailers: RetailerToScrape[];
    batchId: string;
    convexUrl: string;
    convexToken: string;
  }>();

  console.log(`[Dutchie Scraper] Starting batch ${batchId} with ${retailers.length} retailers`);

  const results: ScrapeResult[] = [];

  for (const retailer of retailers) {
    try {
      console.log(`[Dutchie Scraper] Scraping ${retailer.name} (${retailer.slug})`);

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

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as any;
      
      if (data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
      }

      const products = data?.data?.filteredProducts?.products || [];
      const scrapedAt = Date.now();

      const items: ScrapedItem[] = products.flatMap((p: any) => {
        // Each variant is a separate menu item (different sizes/prices)
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

      results.push({
        retailerId: retailer.id,
        items,
        status: "ok",
      });

      console.log(`[Dutchie Scraper] ✓ ${retailer.name}: ${items.length} items`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`[Dutchie Scraper] ✗ ${retailer.name}: ${errorMessage}`);
      
      results.push({
        retailerId: retailer.id,
        items: [],
        status: "error",
        error: errorMessage,
      });
    }

    // Rate limiting: 500ms between requests
    await new Promise((r) => setTimeout(r, 500));
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
  };

  console.log(`[Dutchie Scraper] Batch complete:`, stats);

  return c.json(stats);
});

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok", service: "dutchie-scraper" });
});

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

export default app;
