/**
 * CannaSignal Cron Orchestrator Worker
 * 
 * Triggers every 15 minutes to:
 * 1. Fetch all active embedded-dutchie retailers
 * 2. Scrape each location via BrowserBase (Playwright over CDP)
 * 3. Post results to Convex ingestion
 * 4. Trigger delta detection
 * 5. Send Discord notifications for inventory changes
 * 
 * RESILIENCE IMPROVEMENTS (workflow-qa):
 * - Per-location retry with exponential backoff
 * - Circuit breaker for BrowserBase connection
 * - Retry logic for Convex ingestion
 * - Discord webhook retry with backoff
 * 
 * Deployed at: cannasignal-cron.prtl.workers.dev
 * Cron schedule: every 15 minutes
 */

import { chromium, Browser, Page } from 'playwright-core';
import { withRetry, fetchWithRetry, withCircuitBreaker, sleep } from '../lib/retry';

interface Env {
  BROWSERBASE_API_KEY: string;
  BROWSERBASE_PROJECT_ID: string;
  CONVEX_URL: string;
  DISCORD_WEBHOOK_URL: string;
}

interface Location {
  name: string;
  menuUrl: string;
  retailerSlug: string;
  retailerName: string;
  address: { city: string; state: string; street?: string };
  region: string;
}

interface ScrapedProduct {
  rawProductName: string;
  rawBrandName: string;
  rawCategory?: string;
  price: number;
  originalPrice?: number;
  inStock: boolean;
  quantity?: number | null;           // Actual inventory count (null = unknown)
  quantityWarning?: string | null;    // Raw warning text e.g., "Only 3 left"
  imageUrl?: string;
  thcFormatted?: string;
  cbdFormatted?: string;
  sourceUrl: string;
  sourcePlatform: string;
  scrapedAt: number;
}

// ============================================================
// EMBEDDED DUTCHIE LOCATIONS (18 total)
// ============================================================

const EMBEDDED_LOCATIONS: Location[] = [
  // CONBUD (3 locations)
  { name: "CONBUD LES", menuUrl: "https://conbud.com/stores/conbud-les/products", retailerSlug: "conbud-les", retailerName: "CONBUD", address: { city: "New York", state: "NY" }, region: "nyc" },
  { name: "CONBUD Bronx", menuUrl: "https://conbud.com/stores/conbud-bronx/products", retailerSlug: "conbud-bronx", retailerName: "CONBUD", address: { city: "Bronx", state: "NY" }, region: "nyc" },
  { name: "CONBUD Yankee Stadium", menuUrl: "https://conbud.com/stores/conbud-yankee-stadium/products", retailerSlug: "conbud-yankee-stadium", retailerName: "CONBUD", address: { city: "Bronx", state: "NY" }, region: "nyc" },
  
  // Gotham (4 locations - shared menu URL, location selector needed)
  { name: "Gotham CAURD", menuUrl: "https://gotham.nyc/menu/", retailerSlug: "gotham-caurd", retailerName: "Gotham", address: { street: "3 E 3rd St", city: "New York", state: "NY" }, region: "nyc" },
  { name: "Gotham Hudson", menuUrl: "https://gotham.nyc/menu/", retailerSlug: "gotham-hudson", retailerName: "Gotham", address: { street: "260 Warren St", city: "Hudson", state: "NY" }, region: "hudson_valley" },
  { name: "Gotham Williamsburg", menuUrl: "https://gotham.nyc/menu/", retailerSlug: "gotham-williamsburg", retailerName: "Gotham", address: { street: "300 Kent Ave", city: "Brooklyn", state: "NY" }, region: "nyc" },
  { name: "Gotham Chelsea", menuUrl: "https://gotham.nyc/menu/", retailerSlug: "gotham-chelsea", retailerName: "Gotham", address: { street: "146 10th Ave", city: "New York", state: "NY" }, region: "nyc" },
  
  // Housing Works (1 location)
  { name: "Housing Works Cannabis", menuUrl: "https://hwcannabis.co/", retailerSlug: "housing-works-cannabis", retailerName: "Housing Works Cannabis", address: { street: "750 Broadway", city: "New York", state: "NY" }, region: "nyc" },
  
  // Travel Agency (1 location)
  { name: "Travel Agency Union Square", menuUrl: "https://www.thetravelagency.co/menu/", retailerSlug: "travel-agency-union-square", retailerName: "The Travel Agency", address: { street: "835 Broadway", city: "New York", state: "NY" }, region: "nyc" },
  
  // Strain Stars (2 locations)
  { name: "Strain Stars Farmingdale", menuUrl: "https://strainstarsny.com/menu/", retailerSlug: "strain-stars-farmingdale", retailerName: "Strain Stars", address: { street: "1815 Broadhollow Rd", city: "Farmingdale", state: "NY" }, region: "long_island" },
  { name: "Strain Stars Riverhead", menuUrl: "https://strainstarsny.com/menu/", retailerSlug: "strain-stars-riverhead", retailerName: "Strain Stars", address: { street: "1871 Old Country Rd", city: "Riverhead", state: "NY" }, region: "long_island" },
  
  // Dagmar (1 location)
  { name: "Dagmar Cannabis SoHo", menuUrl: "https://dagmarcannabis.com/menu/", retailerSlug: "dagmar-cannabis-soho", retailerName: "Dagmar Cannabis", address: { street: "412 W Broadway", city: "New York", state: "NY" }, region: "nyc" },
  
  // Smacked (1 location)
  { name: "Smacked Village", menuUrl: "https://getsmacked.online/menu/", retailerSlug: "smacked-village", retailerName: "Get Smacked", address: { street: "144 Bleecker St", city: "New York", state: "NY" }, region: "nyc" },
  
  // Just Breathe (3 locations)
  { name: "Just Breathe Syracuse", menuUrl: "https://justbreathelife.org/menu/", retailerSlug: "just-breathe-syracuse", retailerName: "Just Breathe", address: { street: "185 W Seneca St", city: "Manlius", state: "NY" }, region: "upstate" },
  { name: "Just Breathe Binghamton", menuUrl: "https://justbreathelife.org/menu/", retailerSlug: "just-breathe-binghamton", retailerName: "Just Breathe", address: { street: "75 Court St", city: "Binghamton", state: "NY" }, region: "upstate" },
  { name: "Just Breathe Finger Lakes", menuUrl: "https://justbreatheflx.com/", retailerSlug: "just-breathe-finger-lakes", retailerName: "Just Breathe", address: { street: "2988 US Route 20", city: "Seneca Falls", state: "NY" }, region: "upstate" },
];

// ============================================================
// BROWSERBASE CONNECTION (with circuit breaker + retry - CRIT-005)
// ============================================================

async function connectBrowserBase(env: Env): Promise<Browser> {
  return withCircuitBreaker('browserbase', async () => {
    return withRetry(
      async () => {
        console.log('[Cron] Connecting to BrowserBase...');
        const browser = await chromium.connectOverCDP(
          `wss://connect.browserbase.com?apiKey=${env.BROWSERBASE_API_KEY}&projectId=${env.BROWSERBASE_PROJECT_ID}`,
          { timeout: 30000 }
        );
        console.log('[Cron] Connected to BrowserBase');
        return browser;
      },
      {
        maxRetries: 3,
        baseDelayMs: 2000,
        onRetry: (attempt, error, delay) => {
          console.log(`[Cron] BrowserBase retry ${attempt}: ${error.message}, waiting ${delay}ms`);
        }
      }
    );
  }, {
    failureThreshold: 3,
    resetTimeMs: 120000, // 2 minutes before retry after circuit opens
    halfOpenRequests: 1,
  });
}

// ============================================================
// SCRAPER (with navigation retry - HIGH-002)
// ============================================================

async function scrapeLocation(
  page: Page,
  location: Location
): Promise<{ products: ScrapedProduct[]; error?: string }> {
  const scrapedAt = Date.now();
  
  try {
    // Navigate with retry
    await withRetry(
      async () => {
        await page.goto(location.menuUrl, { waitUntil: 'load', timeout: 30000 });
      },
      {
        maxRetries: 2,
        baseDelayMs: 2000,
        onRetry: (attempt, error) => {
          console.log(`[Cron] Navigation retry ${attempt} for ${location.name}: ${error.message}`);
        }
      }
    );
    
    // Wait for content to render
    await page.waitForTimeout(5000);
    
    // Handle age verification if present
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      buttons.forEach(btn => {
        const text = btn.textContent?.trim().toLowerCase() || '';
        if (text === 'yes' || text === 'i am 21' || text.includes('21+')) {
          btn.click();
        }
      });
    });
    
    // Wait more for menu to load after age gate
    await page.waitForTimeout(3000);
    
    // Extract products
    const products = await page.evaluate((sourceUrl: string, timestamp: number) => {
      const items: any[] = [];
      
      // Multiple selector patterns for different Dutchie embed types
      const selectors = [
        '[data-testid="product-card"]',
        '.product-card',
        '[class*="ProductCard"]',
        '[class*="product-card"]',
        'div[class*="styles_productCard"]',
      ];
      
      let productCards: Element[] = [];
      for (const selector of selectors) {
        const found = document.querySelectorAll(selector);
        if (found.length > 0) {
          productCards = Array.from(found);
          break;
        }
      }
      
      // Fallback: find via price elements
      if (productCards.length === 0) {
        const priceEls = document.querySelectorAll('[class*="price"], [class*="Price"]');
        const seen = new Set<Element>();
        priceEls.forEach(priceEl => {
          const card = priceEl.closest('a') || priceEl.closest('div[class*="product"]') || priceEl.parentElement?.parentElement;
          if (card && !seen.has(card)) {
            seen.add(card);
            productCards.push(card);
          }
        });
      }
      
      productCards.forEach((card) => {
        try {
          // Product name
          const nameEl = card.querySelector('h2, h3, [class*="productName"], [class*="ProductName"], [class*="name"]');
          const name = nameEl?.textContent?.trim();
          if (!name || name.length < 3) return;
          
          // Brand
          const brandEl = card.querySelector('[class*="brandName"], [class*="BrandName"], [class*="brand"]');
          const brand = brandEl?.textContent?.trim() || "Unknown";
          
          // Price extraction - FIXED: flexible decimal handling & better selectors
          // Try current/sale price first, then original, then any price
          const currentPriceSelectors = [
            '[class*="DiscountedPrice"]',
            '[class*="SalePrice"]',
            '[class*="CurrentPrice"]',
            '[class*="FinalPrice"]',
          ];
          const genericPriceSelectors = [
            '[class*="price"]:not([class*="original"]):not([class*="strikethrough"])',
            '[class*="Price"]:not([class*="Original"]):not([class*="Strikethrough"])',
            '.price',
            '[data-testid*="price"]',
          ];
          
          let price = 0;
          
          // Try specific current price selectors first
          for (const sel of [...currentPriceSelectors, ...genericPriceSelectors]) {
            const el = card.querySelector(sel);
            if (el && el.textContent) {
              // Match $XX, $XX.X, or $XX.XX (flexible decimal handling)
              const match = el.textContent.match(/\$(\d+(?:\.\d{1,2})?)/);
              if (match) {
                price = parseFloat(match[1]);
                if (price > 0) break;
              }
            }
          }
          
          // Fallback: scan card text for any price pattern
          if (!price) {
            const cardText = card.textContent || '';
            const allPrices = [...cardText.matchAll(/\$(\d+(?:\.\d{1,2})?)/g)]
              .map(m => parseFloat(m[1]))
              .filter(p => p > 0);
            if (allPrices.length > 0) {
              // Take the lowest price (likely the current/sale price)
              price = Math.min(...allPrices);
            }
          }
          
          // Original price (for sales) - FIXED: flexible decimal handling
          const origPriceEl = card.querySelector('[class*="original"], [class*="strikethrough"], [class*="Original"], del, s');
          let originalPrice: number | undefined;
          if (origPriceEl) {
            const origMatch = origPriceEl.textContent?.match(/\$?(\d+(?:\.\d{1,2})?)/);
            if (origMatch) {
              const parsedOrig = parseFloat(origMatch[1]);
              // Only use as original if it's higher than current price (makes sense as sale)
              if (parsedOrig > price) {
                originalPrice = parsedOrig;
              }
            }
          }
          
          // Category
          const categoryEl = card.querySelector('[class*="category"]');
          const category = categoryEl?.textContent?.trim();
          
          // Image
          const imgEl = card.querySelector('img');
          const imageUrl = imgEl?.src;
          
          // Stock status & Quantity detection
          const stockEl = card.querySelector('[class*="outOfStock"], [class*="soldOut"], [class*="OutOfStock"], [class*="SoldOut"], [class*="unavailable"]');
          let inStock = !stockEl;
          let quantity: number | null = null;
          let quantityWarning: string | null = null;
          
          // Check for out of stock
          if (stockEl) {
            inStock = false;
            quantity = 0;
            quantityWarning = stockEl.textContent?.trim() || 'Out of stock';
          }
          
          // Look for quantity warnings (e.g., "Only 3 left", "Low stock: 5")
          if (inStock) {
            const cardText = card.textContent || '';
            
            // Patterns for quantity extraction
            const quantityPatterns = [
              /only\s*(\d+)\s*left/i,
              /(\d+)\s*left\s*(?:in\s*stock)?/i,
              /(\d+)\s*remaining/i,
              /limited[:\s]*(\d+)/i,
              /low\s*stock[:\s]*(\d+)/i,
              /(\d+)\s*available/i,
              /hurry[,!]?\s*only\s*(\d+)/i,
            ];
            
            for (const pattern of quantityPatterns) {
              const match = cardText.match(pattern);
              if (match) {
                quantity = parseInt(match[1], 10);
                quantityWarning = match[0].trim();
                break;
              }
            }
            
            // Check for generic low stock without number
            if (!quantityWarning) {
              const lowStockEl = card.querySelector('[class*="LowStock"], [class*="low-stock"], [class*="StockWarning"], [class*="stock-warning"]');
              if (lowStockEl) {
                quantityWarning = lowStockEl.textContent?.trim() || 'Low stock';
                // Try to extract number if present
                const numMatch = quantityWarning.match(/(\d+)/);
                if (numMatch) {
                  quantity = parseInt(numMatch[1], 10);
                }
              } else if (/low\s*stock/i.test(cardText)) {
                quantityWarning = 'Low stock';
              }
            }
          }
          
          // THC/CBD
          const thcEl = card.querySelector('[class*="thc"], [class*="THC"]');
          const cbdEl = card.querySelector('[class*="cbd"], [class*="CBD"]');
          const thcFormatted = thcEl?.textContent?.trim();
          const cbdFormatted = cbdEl?.textContent?.trim();
          
          if (price > 0) {
            items.push({
              rawProductName: name,
              rawBrandName: brand,
              rawCategory: category,
              price,
              originalPrice,
              inStock,
              quantity,
              quantityWarning,
              imageUrl,
              thcFormatted,
              cbdFormatted,
              sourceUrl,
              sourcePlatform: "dutchie-embedded",
              scrapedAt: timestamp,
            });
          }
        } catch (e) {
          // Skip malformed cards
        }
      });
      
      return items;
    }, location.menuUrl, scrapedAt);
    
    return { products };
  } catch (error) {
    return {
      products: [],
      error: error instanceof Error ? error.message : "Unknown scraping error",
    };
  }
}

// ============================================================
// CONVEX API (with retry - CRIT-002)
// ============================================================

async function postToConvex(
  convexUrl: string,
  batchId: string,
  results: any[]
): Promise<any> {
  const response = await fetchWithRetry(
    `${convexUrl}/ingest/scraped-batch`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId, results }),
      timeoutMs: 60000, // 60s timeout for large batches
    },
    {
      maxRetries: 3,
      baseDelayMs: 2000,
      onRetry: (attempt, error, delay) => {
        console.log(`[Cron] Convex retry ${attempt}: ${error.message}, waiting ${delay}ms`);
      }
    }
  );
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Convex ingestion failed: ${response.status} - ${text}`);
  }
  
  return response.json();
}

// ============================================================
// DISCORD NOTIFICATIONS (with retry - CRIT-004)
// ============================================================

async function triggerDiscordNotifications(convexUrl: string, webhookUrl: string) {
  const response = await fetchWithRetry(
    `${convexUrl}/events/notify`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhookUrl, maxEvents: 25 }),
      timeoutMs: 30000,
    },
    {
      maxRetries: 2,
      baseDelayMs: 1000,
    }
  );
  
  if (!response.ok) {
    console.error(`Discord notification trigger failed: ${response.status}`);
    return null;
  }
  
  return response.json();
}

async function sendDiscordSummary(webhookUrl: string, embed: any): Promise<boolean> {
  try {
    const response = await fetchWithRetry(
      webhookUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] }),
        timeoutMs: 10000,
      },
      {
        maxRetries: 3,
        baseDelayMs: 1000,
      }
    );
    return response.ok;
  } catch (error) {
    console.error('[Cron] Discord summary failed after retries:', error);
    return false;
  }
}

// ============================================================
// MAIN CRON HANDLER (with per-location retry - CRIT-001)
// ============================================================

export default {
  // Scheduled handler - runs every 15 minutes
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();
    
    console.log(`[Cron] Starting scrape batch ${batchId}`);
    console.log(`[Cron] Scraping ${EMBEDDED_LOCATIONS.length} locations`);
    
    let browser: Browser | null = null;
    const results: any[] = [];
    const errors: string[] = [];
    let totalProducts = 0;
    
    try {
      // Connect to BrowserBase (with circuit breaker + retry)
      browser = await connectBrowserBase(env);
      const context = browser.contexts()[0] || await browser.newContext();
      const page = await context.newPage();
      await page.setViewportSize({ width: 1280, height: 800 });
      
      // Scrape each location with per-location retry (CRIT-001)
      for (const location of EMBEDDED_LOCATIONS) {
        let attempts = 0;
        let success = false;
        let lastError: string | undefined;
        
        // Try up to 3 times per location
        for (let attempt = 1; attempt <= 3 && !success; attempt++) {
          attempts = attempt;
          console.log(`[Cron] Scraping ${location.name} (attempt ${attempt}/3)...`);
          
          const { products, error } = await scrapeLocation(page, location);
          
          if (error) {
            lastError = error;
            console.error(`[Cron] ✗ ${location.name} attempt ${attempt}: ${error}`);
            
            if (attempt < 3) {
              // Wait before retry with exponential backoff
              const delay = 2000 * attempt;
              await sleep(delay);
            }
          } else {
            console.log(`[Cron] ✓ ${location.name}: ${products.length} products`);
            totalProducts += products.length;
            results.push({
              retailerId: location.retailerSlug,
              items: products,
              status: "ok",
              attempts,
            });
            success = true;
          }
        }
        
        // If all retries failed, record error
        if (!success && lastError) {
          errors.push(`${location.name}: ${lastError}`);
          results.push({
            retailerId: location.retailerSlug,
            items: [],
            status: "error",
            error: lastError,
            attempts,
          });
        }
        
        // Rate limit: 2 second delay between locations
        await sleep(2000);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Cron] Browser connection failed:`, errorMsg);
      errors.push(`BrowserBase: ${errorMsg}`);
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (e) {
          // Ignore close errors
        }
      }
    }
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    // Post results to Convex (with retry)
    let ingestionResult = null;
    try {
      ingestionResult = await postToConvex(env.CONVEX_URL, batchId, results);
      console.log(`[Cron] Posted ${results.length} results to Convex:`, ingestionResult);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Cron] Convex ingestion failed after retries:`, errorMsg);
      errors.push(`Convex ingestion: ${errorMsg}`);
    }
    
    // Trigger inventory event notifications (with retry)
    try {
      const notifyResult = await triggerDiscordNotifications(env.CONVEX_URL, env.DISCORD_WEBHOOK_URL);
      if (notifyResult) {
        console.log(`[Cron] Discord notifications:`, notifyResult);
      }
    } catch (e) {
      console.error(`[Cron] Discord notification trigger failed:`, e);
    }
    
    // Send summary to Discord (with retry)
    const successCount = results.filter((r) => r.status === "ok").length;
    const failCount = results.filter((r) => r.status === "error").length;
    
    const summaryEmbed = {
      title: "🌿 CannaSignal Scrape Complete",
      color: failCount === 0 ? 0x00ff00 : failCount < successCount ? 0xffaa00 : 0xff0000,
      fields: [
        { name: "Batch ID", value: batchId, inline: true },
        { name: "Duration", value: `${duration}s`, inline: true },
        { name: "Locations", value: `${successCount}/${EMBEDDED_LOCATIONS.length}`, inline: true },
        { name: "Products", value: totalProducts.toString(), inline: true },
        { name: "Events", value: ingestionResult?.totalEventsDetected?.toString() || "N/A", inline: true },
        { name: "Errors", value: failCount.toString(), inline: true },
      ],
      footer: { text: "workflow-qa resilience v2.0" },
      timestamp: new Date().toISOString(),
    };
    
    if (errors.length > 0) {
      summaryEmbed.fields.push({
        name: "Error Details",
        value: errors.slice(0, 5).join("\n").slice(0, 1000),
        inline: false,
      });
    }
    
    // Retry summary notification
    const summarySuccess = await sendDiscordSummary(env.DISCORD_WEBHOOK_URL, summaryEmbed);
    if (!summarySuccess) {
      console.error('[Cron] Failed to send Discord summary after all retries');
    }
    
    console.log(`[Cron] Batch ${batchId} complete: ${successCount}/${EMBEDDED_LOCATIONS.length} locations, ${totalProducts} products, ${duration}s`);
  },
  
  // HTTP handler for manual triggers and status
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        service: "cannasignal-cron",
        version: "2.0.0-resilient",
        locations: EMBEDDED_LOCATIONS.length,
        schedule: "*/15 * * * *",
        convexUrl: env.CONVEX_URL,
        features: [
          "per-location-retry",
          "circuit-breaker",
          "exponential-backoff",
          "webhook-retry",
        ],
      });
    }
    
    if (url.pathname === "/trigger" && request.method === "POST") {
      // Manual trigger - run scrape
      const event = { cron: "manual", scheduledTime: Date.now() } as ScheduledEvent;
      
      // @ts-ignore - We're manually triggering
      this.scheduled(event, env, {
        waitUntil: (p: Promise<any>) => p,
        passThroughOnException: () => {},
      });
      
      return Response.json({
        triggered: true,
        timestamp: new Date().toISOString(),
        message: "Scrape triggered, check Discord for results",
      });
    }
    
    if (url.pathname === "/locations") {
      return Response.json({
        count: EMBEDDED_LOCATIONS.length,
        locations: EMBEDDED_LOCATIONS.map((l) => ({
          name: l.name,
          retailer: l.retailerName,
          url: l.menuUrl,
          region: l.region,
        })),
      });
    }
    
    return Response.json({
      service: "cannasignal-cron",
      endpoints: ["/health", "/trigger (POST)", "/locations"],
    });
  },
};
