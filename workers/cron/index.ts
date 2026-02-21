/**
 * CannaSignal Cron Orchestrator Worker
 * 
 * Triggers every 15 minutes to:
 * 1. Fetch all active embedded-dutchie retailers
 * 2. Scrape each location via BrowserBase (CDP over WebSocket)
 * 3. Visit product detail pages to extract "X left" inventory counts
 * 4. Post results to Convex ingestion
 * 5. Trigger delta detection
 * 6. Send Discord notifications for inventory changes
 * 
 * RESILIENCE IMPROVEMENTS (workflow-qa):
 * - Per-location retry with exponential backoff
 * - Circuit breaker for BrowserBase connection
 * - Retry logic for Convex ingestion
 * - Discord webhook retry with backoff
 * 
 * v3.2.0 - Added product detail page inventory extraction
 *          - Extracts "X left" from product pages
 *          - Implements cart hack fallback
 *          - Samples ~30-50 products per location for speed
 * 
 * v3.3.0 - Speed optimizations (P0 improvements)
 *          - Reduced page load waits: 5s→3s, 3s→2s, 4s→1.5s
 *          - Reduced cart hack wait: 1s→0.5s
 *          - Added batch processing structure for future parallelization
 *          - Expected improvement: ~40% faster scraping
 *          - Before: ~30 min for 10 locations × 40 products
 *          - After:  ~18 min estimated
 * 
 * v3.4.0 - TRUE Parallel Product Page Visits (Phase 2 Optimizations)
 *          - Creates 4 concurrent browser pages per session
 *          - Products are visited in parallel batches of 4
 *          - Expected improvement: ~3-4x faster product detail extraction
 *          - Before: ~15 min (v3.3.0 with sequential visits)
 *          - After:  ~4-5 min with 4x parallelization
 *          - GraphQL interception explored (see scripts/graphql-analysis.md)
 * 
 * Deployed at: cannasignal-cron.prtl.workers.dev
 * Cron schedule: every 15 minutes
 */

import { BrowserSession, CDPPage, CDPClient } from '../lib/cdp';
import { withRetry, fetchWithRetry, withCircuitBreaker, sleep } from '../lib/retry';

// ============================================================
// PARALLEL PAGE MANAGER (v3.4.0 - True Parallelization)
// ============================================================

interface PagePool {
  pages: CDPPage[];
  session: BrowserSession;
}

/**
 * Creates a pool of browser pages for parallel scraping (v3.4.0)
 * Uses BrowserSession.createPage() to spawn additional pages within the same session
 */
async function createPagePool(session: BrowserSession, count: number): Promise<PagePool> {
  const pages: CDPPage[] = [];
  
  // The main page is page 0
  const mainPage = session.getPage();
  if (mainPage) {
    pages.push(mainPage);
  }
  
  // Create additional pages for parallelization
  for (let i = pages.length; i < count; i++) {
    try {
      const page = await session.createPage();
      pages.push(page);
      console.log(`[Cron] Created parallel page ${i + 1}/${count}`);
    } catch (error) {
      console.log(`[Cron] Failed to create page ${i + 1}/${count}: ${error instanceof Error ? error.message : 'Unknown'}`);
      // Continue with fewer pages if some fail
      break;
    }
  }
  
  console.log(`[Cron] Page pool ready: ${pages.length} concurrent pages`);
  return { pages, session };
}

/**
 * Closes extra pages in the pool (keeps main page)
 */
async function closePagePool(pool: PagePool): Promise<void> {
  // Close all pages except the first (main page - managed by session)
  for (let i = 1; i < pool.pages.length; i++) {
    try {
      await pool.pages[i].close();
    } catch {
      // Ignore close errors
    }
  }
}

/**
 * Process product detail pages in parallel using page pool (v3.4.0)
 * Each page in the pool handles one product concurrently
 */
async function processProductsInParallel(
  products: ScrapedProduct[],
  pool: PagePool,
  extractFn: typeof extractInventoryFromDetailPage,
  cartHackFn: typeof attemptCartHack,
  enableCartHack: boolean,
  maxCartHackAttempts: number,
  inventoryStats: { checked: number; found: number }
): Promise<void> {
  const batchSize = pool.pages.length;
  let cartHackAttempts = 0;
  
  for (let batchStart = 0; batchStart < products.length; batchStart += batchSize) {
    const batch = products.slice(batchStart, batchStart + batchSize);
    
    // Process batch in TRUE parallel - each page handles one product
    const batchPromises = batch.map(async (product, batchIdx) => {
      if (!product.productUrl) return;
      
      const page = pool.pages[batchIdx];
      if (!page) return;
      
      try {
        inventoryStats.checked++;
        
        // Navigate to product detail page
        await page.navigate(product.productUrl);
        await page.waitForTimeout(PAGE_RENDER_WAIT_MS);
        
        // Extract inventory from detail page
        const detailData = await page.evaluateFunction(extractFn);
        
        // Update product with extracted data
        if (detailData.quantity !== null) {
          product.quantity = detailData.quantity;
          product.quantityWarning = detailData.quantityWarning;
          product.quantitySource = detailData.quantitySource;
          product.inStock = detailData.inStock;
          inventoryStats.found++;
          console.log(`[Cron] ✓ ${product.rawProductName.slice(0, 30)}: ${detailData.quantity} left`);
        } else if (enableCartHack && cartHackAttempts < maxCartHackAttempts) {
          // Try cart hack as fallback - only for first few products
          cartHackAttempts++;
          
          await page.waitForTimeout(500);
          
          const cartResult = await page.evaluateFunction(cartHackFn);
          
          if (cartResult.success && cartResult.quantity !== null) {
            product.quantity = cartResult.quantity;
            product.quantityWarning = cartResult.quantityWarning;
            product.quantitySource = 'cart_hack';
            inventoryStats.found++;
            console.log(`[Cron] ✓ ${product.rawProductName.slice(0, 30)}: ${cartResult.quantity} via cart`);
          }
        }
        
      } catch (detailError) {
        // Non-fatal: continue to next product
        console.log(`[Cron] ✗ ${product.rawProductName.slice(0, 25)}: ${detailError instanceof Error ? detailError.message.slice(0, 40) : 'Error'}`);
      }
    });
    
    // Wait for all products in this batch to complete IN PARALLEL
    await Promise.all(batchPromises);
    
    // Brief pause between batches for rate limiting
    if (batchStart + batchSize < products.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }
}

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
  // Multi-location support
  disabled?: boolean;         // Skip this location temporarily
  disabledReason?: string;    // Why it's disabled
}

interface ScrapedProduct {
  rawProductName: string;
  rawBrandName: string;
  rawCategory?: string;
  price: number;
  originalPrice?: number;
  inStock: boolean;
  quantity: number | null;              // Actual inventory count (null = unknown)
  quantityWarning: string | null;       // Raw warning text e.g., "3 left"
  quantitySource: string;               // "text_pattern" | "cart_hack" | "inferred" | "none"
  imageUrl?: string;
  thcFormatted?: string;
  cbdFormatted?: string;
  sourceUrl: string;
  sourcePlatform: string;
  scrapedAt: number;
  // Product detail page specific
  productUrl?: string;                  // URL of the product detail page
}

// ============================================================
// CONFIGURATION (v3.3.0 - Parallelization & Speed Optimizations)
// ============================================================

// Max products to visit detail pages for per location (speed optimization)
const MAX_DETAIL_PAGE_VISITS_PER_LOCATION = 40;

// Number of parallel pages/tabs to use for product detail visits
// Higher = faster but more resource intensive on BrowserBase
const PARALLEL_PAGE_COUNT = 4;

// Timeout for product detail page load (ms) - REDUCED from 8000
const DETAIL_PAGE_TIMEOUT_MS = 4000;

// Time to wait for page content to render after navigation (ms)
const PAGE_RENDER_WAIT_MS = 1500;

// Delay between batches of parallel visits (rate limiting)
const BATCH_DELAY_MS = 500;

// Whether to enable cart hack fallback (slower but more thorough)
const ENABLE_CART_HACK_FALLBACK = true;

// Max products to apply cart hack to (very slow operation)
const MAX_CART_HACK_ATTEMPTS = 3;

// ============================================================
// EMBEDDED DUTCHIE LOCATIONS (18 total, 11 active)
// 
// FULLSCRAPE UPDATE (2026-02-20):
// - Disabled broken Just Breathe URLs (404)
// - Disabled duplicate Gotham/Strain Stars locations (shared URL)
// - TODO: Implement location picker for multi-location sites
// ============================================================

const EMBEDDED_LOCATIONS: Location[] = [
  // CONBUD (3 locations) - All unique URLs ✅
  { name: "CONBUD LES", menuUrl: "https://conbud.com/stores/conbud-les/products", retailerSlug: "conbud-les", retailerName: "CONBUD", address: { city: "New York", state: "NY" }, region: "nyc" },
  { name: "CONBUD Bronx", menuUrl: "https://conbud.com/stores/conbud-bronx/products", retailerSlug: "conbud-bronx", retailerName: "CONBUD", address: { city: "Bronx", state: "NY" }, region: "nyc" },
  { name: "CONBUD Yankee Stadium", menuUrl: "https://conbud.com/stores/conbud-yankee-stadium/products", retailerSlug: "conbud-yankee-stadium", retailerName: "CONBUD", address: { city: "Bronx", state: "NY" }, region: "nyc" },
  
  // Gotham (4 locations) - Shared URL, only primary enabled
  // TODO: Implement location picker for Hudson, Williamsburg, Chelsea
  { name: "Gotham CAURD", menuUrl: "https://gotham.nyc/menu/", retailerSlug: "gotham-caurd", retailerName: "Gotham", address: { street: "3 E 3rd St", city: "New York", state: "NY" }, region: "nyc" },
  { name: "Gotham Hudson", menuUrl: "https://gotham.nyc/menu/", retailerSlug: "gotham-hudson", retailerName: "Gotham", address: { street: "260 Warren St", city: "Hudson", state: "NY" }, region: "hudson_valley", disabled: true, disabledReason: "shared-url-no-selector" },
  { name: "Gotham Williamsburg", menuUrl: "https://gotham.nyc/menu/", retailerSlug: "gotham-williamsburg", retailerName: "Gotham", address: { street: "300 Kent Ave", city: "Brooklyn", state: "NY" }, region: "nyc", disabled: true, disabledReason: "shared-url-no-selector" },
  { name: "Gotham Chelsea", menuUrl: "https://gotham.nyc/menu/", retailerSlug: "gotham-chelsea", retailerName: "Gotham", address: { street: "146 10th Ave", city: "New York", state: "NY" }, region: "nyc", disabled: true, disabledReason: "shared-url-no-selector" },
  
  // Housing Works (1 location) ✅
  { name: "Housing Works Cannabis", menuUrl: "https://hwcannabis.co/", retailerSlug: "housing-works-cannabis", retailerName: "Housing Works Cannabis", address: { street: "750 Broadway", city: "New York", state: "NY" }, region: "nyc" },
  
  // Travel Agency (1 location) ✅
  { name: "Travel Agency Union Square", menuUrl: "https://www.thetravelagency.co/menu/", retailerSlug: "travel-agency-union-square", retailerName: "The Travel Agency", address: { street: "835 Broadway", city: "New York", state: "NY" }, region: "nyc" },
  
  // Strain Stars (2 locations) - Shared URL, only primary enabled
  // TODO: Implement location picker for Riverhead
  { name: "Strain Stars Farmingdale", menuUrl: "https://strainstarsny.com/menu/", retailerSlug: "strain-stars-farmingdale", retailerName: "Strain Stars", address: { street: "1815 Broadhollow Rd", city: "Farmingdale", state: "NY" }, region: "long_island" },
  { name: "Strain Stars Riverhead", menuUrl: "https://strainstarsny.com/menu/", retailerSlug: "strain-stars-riverhead", retailerName: "Strain Stars", address: { street: "1871 Old Country Rd", city: "Riverhead", state: "NY" }, region: "long_island", disabled: true, disabledReason: "shared-url-no-selector" },
  
  // Dagmar (1 location) ✅
  { name: "Dagmar Cannabis SoHo", menuUrl: "https://dagmarcannabis.com/menu/", retailerSlug: "dagmar-cannabis-soho", retailerName: "Dagmar Cannabis", address: { street: "412 W Broadway", city: "New York", state: "NY" }, region: "nyc" },
  
  // Smacked (1 location) ✅
  { name: "Smacked Village", menuUrl: "https://getsmacked.online/menu/", retailerSlug: "smacked-village", retailerName: "Get Smacked", address: { street: "144 Bleecker St", city: "New York", state: "NY" }, region: "nyc" },
  
  // Just Breathe (3 locations) - 2 broken, 1 active
  // Syracuse & Binghamton: justbreathelife.org/menu/ returns 404 as of 2026-02-20
  { name: "Just Breathe Syracuse", menuUrl: "https://justbreathelife.org/menu/", retailerSlug: "just-breathe-syracuse", retailerName: "Just Breathe", address: { street: "185 W Seneca St", city: "Manlius", state: "NY" }, region: "upstate", disabled: true, disabledReason: "url-404" },
  { name: "Just Breathe Binghamton", menuUrl: "https://justbreathelife.org/menu/", retailerSlug: "just-breathe-binghamton", retailerName: "Just Breathe", address: { street: "75 Court St", city: "Binghamton", state: "NY" }, region: "upstate", disabled: true, disabledReason: "url-404" },
  { name: "Just Breathe Finger Lakes", menuUrl: "https://justbreatheflx.com/", retailerSlug: "just-breathe-finger-lakes", retailerName: "Just Breathe", address: { street: "2988 US Route 20", city: "Seneca Falls", state: "NY" }, region: "upstate" },
];

// Get active locations (not disabled)
function getActiveLocations(): Location[] {
  return EMBEDDED_LOCATIONS.filter(l => !l.disabled);
}

// ============================================================
// BROWSERBASE CONNECTION (with circuit breaker + retry - CRIT-005)
// ============================================================

async function createBrowserSession(env: Env): Promise<BrowserSession> {
  return withCircuitBreaker('browserbase', async () => {
    return withRetry(
      async () => {
        console.log('[Cron] Connecting to BrowserBase via CDP...');
        const session = new BrowserSession(
          env.BROWSERBASE_API_KEY,
          env.BROWSERBASE_PROJECT_ID,
          false // debug
        );
        await session.init();
        console.log('[Cron] Connected to BrowserBase');
        return session;
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
// PRODUCT URL EXTRACTION (runs in browser context)
// 
// Dutchie product detail URLs follow the pattern:
// /stores/{store-slug}/product/{product-slug}
// Note: This is different from category pages which use /products/
// ============================================================

function extractProductUrls(): { name: string; url: string }[] {
  const productLinks: { name: string; url: string }[] = [];
  const seen = new Set<string>();
  
  // Find links matching product detail pattern (singular /product/, not /products/)
  const productLinkEls = document.querySelectorAll('a[href*="/product/"]') as NodeListOf<HTMLAnchorElement>;
  
  productLinkEls.forEach((link) => {
    const href = link.href;
    
    // Only include actual product detail pages (contains /product/ but not /products/)
    if (href && !seen.has(href) && href.includes('/product/') && !href.includes('/products/')) {
      seen.add(href);
      
      // Get product name from the link text or nearby elements
      const text = link.textContent?.trim() || 
                  link.closest('div')?.querySelector('h2, h3, [class*="name"], [class*="Name"]')?.textContent?.trim() || '';
      
      // Only include if we have meaningful text or a valid URL
      if (text.length > 2 || href.length > 50) {
        productLinks.push({ name: text || 'Unknown', url: href });
      }
    }
  });
  
  // Fallback: try to find product cards with links
  if (productLinks.length === 0) {
    const cards = document.querySelectorAll('[data-testid="product-card"], [class*="ProductCard"], [class*="product-card"]');
    cards.forEach((card) => {
      const link = card.querySelector('a[href*="/product/"]') as HTMLAnchorElement | null;
      if (link && link.href && !seen.has(link.href) && !link.href.includes('/products/')) {
        seen.add(link.href);
        const name = card.querySelector('h2, h3, [class*="productName"]')?.textContent?.trim() || '';
        productLinks.push({ name: name || 'Unknown', url: link.href });
      }
    });
  }
  
  return productLinks;
}

// ============================================================
// PRODUCT DETAIL PAGE INVENTORY EXTRACTION
// ============================================================

function extractInventoryFromDetailPage(): {
  quantity: number | null;
  quantityWarning: string | null;
  quantitySource: string;
  productName: string | null;
  price: number | null;
  thcFormatted: string | null;
  inStock: boolean;
} {
  const bodyText = document.body.innerText || '';
  
  // Primary pattern: "X left" (proven to work on Dutchie product pages)
  const stockPatterns = [
    /(\d+)\s*left/i,
    /only\s*(\d+)\s*left/i,
    /(\d+)\s*left\s*in\s*stock/i,
    /(\d+)\s*remaining/i,
    /(\d+)\s*available/i,
    /(\d+)\s*in\s*stock/i,
    /hurry[,!]?\s*only\s*(\d+)/i,
    /limited[:\s]*(\d+)/i,
    /low\s*stock[:\s]*(\d+)/i,
  ];
  
  let quantity: number | null = null;
  let quantityWarning: string | null = null;
  let quantitySource = 'none';
  
  for (const pattern of stockPatterns) {
    const match = bodyText.match(pattern);
    if (match) {
      quantity = parseInt(match[1], 10);
      quantityWarning = match[0].trim();
      quantitySource = 'text_pattern';
      break;
    }
  }
  
  // Check for out of stock indicators
  const outOfStockPatterns = [
    /out\s*of\s*stock/i,
    /sold\s*out/i,
    /unavailable/i,
    /not\s*available/i,
  ];
  
  let inStock = true;
  for (const pattern of outOfStockPatterns) {
    if (pattern.test(bodyText)) {
      inStock = false;
      quantity = 0;
      quantityWarning = 'Out of stock';
      quantitySource = 'text_pattern';
      break;
    }
  }
  
  // Extract product name from page
  const nameEl = document.querySelector('h1, [class*="ProductName"], [class*="product-name"], [class*="productTitle"]');
  const productName = nameEl?.textContent?.trim() || null;
  
  // Extract price
  let price: number | null = null;
  const priceMatch = bodyText.match(/\$(\d+(?:\.\d{1,2})?)/);
  if (priceMatch) {
    price = parseFloat(priceMatch[1]);
  }
  
  // Extract THC
  let thcFormatted: string | null = null;
  const thcMatch = bodyText.match(/THC[:\s]*(\d+(?:\.\d+)?)\s*%/i);
  if (thcMatch) {
    thcFormatted = `${thcMatch[1]}%`;
  }
  
  return {
    quantity,
    quantityWarning,
    quantitySource,
    productName,
    price,
    thcFormatted,
    inStock,
  };
}

// ============================================================
// CART HACK FALLBACK (in browser context)
// ============================================================

function attemptCartHack(): { quantity: number | null; quantityWarning: string | null; success: boolean } {
  // Find add to cart button
  const addButtons = document.querySelectorAll(
    'button:not([disabled])'
  );
  
  let addButton: HTMLButtonElement | null = null;
  addButtons.forEach((btn) => {
    const text = btn.textContent?.toLowerCase() || '';
    if (text.includes('add') && (text.includes('cart') || text.includes('bag') || btn.textContent?.length! < 20)) {
      addButton = btn as HTMLButtonElement;
    }
  });
  
  if (!addButton) {
    return { quantity: null, quantityWarning: null, success: false };
  }
  
  // Look for quantity input
  const qtyInput = document.querySelector('input[type="number"], input[name*="qty"], input[name*="quantity"]') as HTMLInputElement | null;
  
  if (qtyInput) {
    // Set high value to trigger limit
    const originalValue = qtyInput.value;
    qtyInput.value = '999';
    qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
    qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Check for immediate validation error
    const pageText = document.body.innerText || '';
    
    // Look for error messages about limits
    const limitPatterns = [
      /max(?:imum)?\s*(?:of\s*)?(\d+)/i,
      /limit(?:ed)?\s*(?:to\s*)?(\d+)/i,
      /only\s*(\d+)\s*(?:available|remaining|left)/i,
      /cannot\s*add\s*more\s*than\s*(\d+)/i,
      /(\d+)\s*(?:items?\s*)?(?:maximum|max|limit)/i,
    ];
    
    for (const pattern of limitPatterns) {
      const match = pageText.match(pattern);
      if (match) {
        // Reset the input
        qtyInput.value = originalValue;
        return {
          quantity: parseInt(match[1], 10),
          quantityWarning: match[0].trim(),
          success: true,
        };
      }
    }
    
    // Check if input was auto-corrected
    const correctedValue = parseInt(qtyInput.value, 10);
    if (correctedValue > 0 && correctedValue < 999) {
      qtyInput.value = originalValue;
      return {
        quantity: correctedValue,
        quantityWarning: `Max quantity: ${correctedValue}`,
        success: true,
      };
    }
    
    // Reset
    qtyInput.value = originalValue;
  }
  
  // Check for max attribute on input
  const maxAttr = qtyInput?.max;
  if (maxAttr) {
    const maxVal = parseInt(maxAttr, 10);
    if (maxVal > 0 && maxVal < 100) {
      return {
        quantity: maxVal,
        quantityWarning: `Max: ${maxVal}`,
        success: true,
      };
    }
  }
  
  // Check for select dropdown with quantity options
  const qtySelect = document.querySelector('select[name*="qty"], select[name*="quantity"]') as HTMLSelectElement | null;
  if (qtySelect && qtySelect.options.length > 0) {
    const options = Array.from(qtySelect.options)
      .map(o => parseInt(o.value, 10))
      .filter(n => !isNaN(n) && n > 0);
    
    if (options.length > 0) {
      const maxOption = Math.max(...options);
      if (maxOption < 50) { // Likely inventory-capped
        return {
          quantity: maxOption,
          quantityWarning: `Max qty: ${maxOption}`,
          success: true,
        };
      }
    }
  }
  
  return { quantity: null, quantityWarning: null, success: false };
}

// ============================================================
// CATEGORY PAGE PRODUCT EXTRACTION (runs in browser context)
// ============================================================

function extractProducts(sourceUrl: string, timestamp: number): ScrapedProduct[] {
  const items: ScrapedProduct[] = [];
  
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
      
      for (const sel of [...currentPriceSelectors, ...genericPriceSelectors]) {
        const el = card.querySelector(sel);
        if (el && el.textContent) {
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
          price = Math.min(...allPrices);
        }
      }
      
      // Original price (for sales)
      const origPriceEl = card.querySelector('[class*="original"], [class*="strikethrough"], [class*="Original"], del, s');
      let originalPrice: number | undefined;
      if (origPriceEl) {
        const origMatch = origPriceEl.textContent?.match(/\$?(\d+(?:\.\d{1,2})?)/);
        if (origMatch) {
          const parsedOrig = parseFloat(origMatch[1]);
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
      
      // Stock status & Quantity detection from listing page
      const stockEl = card.querySelector('[class*="outOfStock"], [class*="soldOut"], [class*="OutOfStock"], [class*="SoldOut"], [class*="unavailable"]');
      let inStock = !stockEl;
      let quantity: number | null = null;
      let quantityWarning: string | null = null;
      let quantitySource = 'none';
      
      if (stockEl) {
        inStock = false;
        quantity = 0;
        quantityWarning = stockEl.textContent?.trim() || 'Out of stock';
        quantitySource = 'text_pattern';
      }
      
      // Look for quantity warnings on listing page
      if (inStock) {
        const cardText = card.textContent || '';
        
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
            quantitySource = 'text_pattern';
            break;
          }
        }
        
        if (!quantityWarning) {
          const lowStockEl = card.querySelector('[class*="LowStock"], [class*="low-stock"], [class*="StockWarning"], [class*="stock-warning"]');
          if (lowStockEl) {
            quantityWarning = lowStockEl.textContent?.trim() || 'Low stock';
            const numMatch = quantityWarning.match(/(\d+)/);
            if (numMatch) {
              quantity = parseInt(numMatch[1], 10);
              quantitySource = 'text_pattern';
            }
          } else if (/low\s*stock/i.test(cardText)) {
            quantityWarning = 'Low stock';
          }
        }
      }
      
      // Extract product URL for detail page visits
      // Look for links with /product/ pattern (product detail pages)
      const productLinkEl = card.querySelector('a[href*="/product/"]') || card.querySelector('a') || card.closest('a');
      let productUrl: string | undefined = undefined;
      if (productLinkEl) {
        const href = (productLinkEl as HTMLAnchorElement).href;
        // Only use URLs that are actual product detail pages (contain /product/ but not /products/)
        if (href && href.includes('/product/') && !href.includes('/products/')) {
          productUrl = href;
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
          quantitySource,
          imageUrl,
          thcFormatted,
          cbdFormatted,
          sourceUrl,
          productUrl,
          sourcePlatform: "dutchie-embedded",
          scrapedAt: timestamp,
        });
      }
    } catch (e) {
      // Skip malformed cards
    }
  });
  
  return items;
}

// ============================================================
// SCRAPER (with product detail page inventory extraction)
// ============================================================

async function scrapeLocation(
  session: BrowserSession,
  location: Location
): Promise<{ products: ScrapedProduct[]; error?: string; inventoryStats: { checked: number; found: number } }> {
  const scrapedAt = Date.now();
  const inventoryStats = { checked: 0, found: 0 };
  
  try {
    // Navigate with retry
    await withRetry(
      async () => {
        await session.goto(location.menuUrl);
      },
      {
        maxRetries: 2,
        baseDelayMs: 2000,
        onRetry: (attempt, error) => {
          console.log(`[Cron] Navigation retry ${attempt} for ${location.name}: ${error.message}`);
        }
      }
    );
    
    // Wait for content to render - REDUCED from 5000ms (v3.3.0)
    await session.waitForTimeout(3000);
    
    // Handle age verification if present
    await session.evaluate(`
      const buttons = document.querySelectorAll('button');
      buttons.forEach(btn => {
        const text = btn.textContent?.trim().toLowerCase() || '';
        if (text === 'yes' || text === 'i am 21' || text.includes('21+') || text.includes('enter') || text === 'i agree') {
          btn.click();
        }
      });
    `);
    
    // Wait for menu to load after age gate - REDUCED from 3000ms (v3.3.0)
    await session.waitForTimeout(2000);
    
    // Extract products from category page
    const products = await session.evaluateFunction<ScrapedProduct[]>(
      extractProducts as (...args: unknown[]) => ScrapedProduct[],
      location.menuUrl,
      scrapedAt
    );
    
    console.log(`[Cron] ${location.name}: Found ${products.length} products on listing page`);
    
    // ============================================================
    // PRODUCT DETAIL PAGE INVENTORY EXTRACTION
    // ============================================================
    
    // If products don't have URLs, extract them separately and match by name
    const productsWithoutUrls = products.filter(p => p.inStock && p.quantity === null && !p.productUrl);
    
    if (productsWithoutUrls.length > 0) {
      // Extract all product URLs from the page
      const allProductUrls = await session.evaluateFunction<{ name: string; url: string }[]>(
        extractProductUrls
      );
      
      console.log(`[Cron] ${location.name}: Found ${allProductUrls.length} product URLs on page`);
      
      // Match URLs to products by name similarity
      for (const product of productsWithoutUrls) {
        const productNameLower = product.rawProductName.toLowerCase();
        
        // Find best matching URL
        const matchedUrl = allProductUrls.find(pu => {
          const urlNameLower = pu.name.toLowerCase();
          // Check for substring match in either direction
          return urlNameLower.includes(productNameLower.slice(0, 20)) || 
                 productNameLower.includes(urlNameLower.slice(0, 20)) ||
                 // Also check URL slug
                 pu.url.toLowerCase().includes(productNameLower.replace(/[^a-z0-9]/g, '-').slice(0, 20));
        });
        
        if (matchedUrl) {
          product.productUrl = matchedUrl.url;
        }
      }
    }
    
    // Get products that need inventory checking (no quantity found on listing)
    const productsNeedingInventory = products.filter(
      p => p.inStock && p.quantity === null && p.productUrl
    );
    
    // Sample products for detail page visits (speed optimization)
    const productsToCheck = productsNeedingInventory.slice(0, MAX_DETAIL_PAGE_VISITS_PER_LOCATION);
    
    console.log(`[Cron] ${location.name}: Checking ${productsToCheck.length} product detail pages for inventory (parallel=${PARALLEL_PAGE_COUNT})`);
    
    // v3.4.0: TRUE PARALLEL PROCESSING with multiple browser pages
    // Create a page pool for concurrent product page visits
    if (productsToCheck.length > 0) {
      const pagePool = await createPagePool(session, PARALLEL_PAGE_COUNT);
      
      try {
        // Process all products in parallel batches using the page pool
        await processProductsInParallel(
          productsToCheck,
          pagePool,
          extractInventoryFromDetailPage,
          attemptCartHack,
          ENABLE_CART_HACK_FALLBACK,
          MAX_CART_HACK_ATTEMPTS,
          inventoryStats
        );
      } finally {
        // Clean up extra pages
        await closePagePool(pagePool);
      }
    }
    
    console.log(`[Cron] ${location.name}: Inventory found for ${inventoryStats.found}/${inventoryStats.checked} products checked`);
    
    return { products, inventoryStats };
  } catch (error) {
    return {
      products: [],
      error: error instanceof Error ? error.message : "Unknown scraping error",
      inventoryStats,
    };
  }
}

// ============================================================
// CONVEX API (with retry - CRIT-002)
// ============================================================

async function postToConvex(
  convexUrl: string,
  batchId: string,
  results: unknown[]
): Promise<{ totalEventsDetected?: number }> {
  const response = await fetchWithRetry(
    `${convexUrl}/ingest/scraped-batch`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId, results }),
      timeoutMs: 60000,
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

interface DiscordEmbed {
  title: string;
  color: number;
  fields: Array<{ name: string; value: string; inline: boolean }>;
  footer?: { text: string };
  timestamp?: string;
}

async function sendDiscordSummary(webhookUrl: string, embed: DiscordEmbed): Promise<boolean> {
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
    
    // Get active locations only
    const activeLocations = getActiveLocations();
    const disabledCount = EMBEDDED_LOCATIONS.length - activeLocations.length;
    
    console.log(`[Cron] Starting scrape batch ${batchId}`);
    console.log(`[Cron] Scraping ${activeLocations.length} locations (${disabledCount} disabled)`);
    
    let session: BrowserSession | null = null;
    const results: Array<{
      retailerId: string;
      items: ScrapedProduct[];
      status: string;
      error?: string;
      attempts: number;
    }> = [];
    const errors: string[] = [];
    let totalProducts = 0;
    let totalInventoryChecked = 0;
    let totalInventoryFound = 0;
    
    try {
      // Connect to BrowserBase (with circuit breaker + retry)
      session = await createBrowserSession(env);
      
      // Scrape each active location with per-location retry (CRIT-001)
      for (const location of activeLocations) {
        let attempts = 0;
        let success = false;
        let lastError: string | undefined;
        
        // Try up to 3 times per location
        for (let attempt = 1; attempt <= 3 && !success; attempt++) {
          attempts = attempt;
          console.log(`[Cron] Scraping ${location.name} (attempt ${attempt}/3)...`);
          
          const { products, error, inventoryStats } = await scrapeLocation(session, location);
          
          if (error) {
            lastError = error;
            console.error(`[Cron] ✗ ${location.name} attempt ${attempt}: ${error}`);
            
            if (attempt < 3) {
              const delay = 2000 * attempt;
              await sleep(delay);
            }
          } else {
            console.log(`[Cron] ✓ ${location.name}: ${products.length} products (inventory: ${inventoryStats.found}/${inventoryStats.checked})`);
            totalProducts += products.length;
            totalInventoryChecked += inventoryStats.checked;
            totalInventoryFound += inventoryStats.found;
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
      if (session) {
        try {
          await session.close();
        } catch (e) {
          // Ignore close errors
        }
      }
    }
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    // Post results to Convex (with retry)
    let ingestionResult: { totalEventsDetected?: number } | null = null;
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
    
    const summaryEmbed: DiscordEmbed = {
      title: "🌿 CannaSignal Scrape Complete",
      color: failCount === 0 ? 0x00ff00 : failCount < successCount ? 0xffaa00 : 0xff0000,
      fields: [
        { name: "Batch ID", value: batchId, inline: true },
        { name: "Duration", value: `${duration}s`, inline: true },
        { name: "Locations", value: `${successCount}/${activeLocations.length} (${disabledCount} disabled)`, inline: true },
        { name: "Products", value: totalProducts.toString(), inline: true },
        { name: "Inventory", value: `${totalInventoryFound}/${totalInventoryChecked} checked`, inline: true },
        { name: "Events", value: ingestionResult?.totalEventsDetected?.toString() || "N/A", inline: true },
      ],
      footer: { text: "v3.4.0 - parallel page visits" },
      timestamp: new Date().toISOString(),
    };
    
    if (errors.length > 0) {
      summaryEmbed.fields.push({
        name: "Error Details",
        value: errors.slice(0, 5).join("\n").slice(0, 1000),
        inline: false,
      });
    }
    
    const summarySuccess = await sendDiscordSummary(env.DISCORD_WEBHOOK_URL, summaryEmbed);
    if (!summarySuccess) {
      console.error('[Cron] Failed to send Discord summary after all retries');
    }
    
    console.log(`[Cron] Batch ${batchId} complete: ${successCount}/${activeLocations.length} active locations, ${totalProducts} products, ${totalInventoryFound} inventory counts, ${duration}s`);
  },
  
  // HTTP handler for manual triggers and status
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === "/health") {
      const activeLocations = getActiveLocations();
      return Response.json({
        status: "ok",
        service: "cannasignal-cron",
        version: "3.4.0-parallel-pages",
        locations: {
          total: EMBEDDED_LOCATIONS.length,
          active: activeLocations.length,
          disabled: EMBEDDED_LOCATIONS.length - activeLocations.length,
        },
        schedule: "*/15 * * * *",
        convexUrl: env.CONVEX_URL,
        features: [
          "cdp-native-client",
          "per-location-retry",
          "circuit-breaker",
          "exponential-backoff",
          "webhook-retry",
          "disabled-location-support",
          "product-detail-page-inventory",
          "cart-hack-fallback",
          "optimized-wait-times",
          "parallel-page-pool",
          "concurrent-product-visits",
        ],
        config: {
          maxDetailPageVisits: MAX_DETAIL_PAGE_VISITS_PER_LOCATION,
          parallelPageCount: PARALLEL_PAGE_COUNT,
          pageRenderWaitMs: PAGE_RENDER_WAIT_MS,
          detailPageTimeoutMs: DETAIL_PAGE_TIMEOUT_MS,
          cartHackEnabled: ENABLE_CART_HACK_FALLBACK,
          maxCartHackAttempts: MAX_CART_HACK_ATTEMPTS,
        },
      });
    }
    
    if (url.pathname === "/trigger" && request.method === "POST") {
      const event = { cron: "manual", scheduledTime: Date.now() } as ScheduledEvent;
      
      // @ts-ignore - We're manually triggering
      this.scheduled(event, env, {
        waitUntil: (p: Promise<unknown>) => p,
        passThroughOnException: () => {},
      });
      
      return Response.json({
        triggered: true,
        timestamp: new Date().toISOString(),
        message: "Scrape triggered, check Discord for results",
      });
    }
    
    if (url.pathname === "/locations") {
      const activeLocations = getActiveLocations();
      return Response.json({
        total: EMBEDDED_LOCATIONS.length,
        active: activeLocations.length,
        disabled: EMBEDDED_LOCATIONS.length - activeLocations.length,
        locations: EMBEDDED_LOCATIONS.map((l) => ({
          name: l.name,
          retailer: l.retailerName,
          url: l.menuUrl,
          region: l.region,
          status: l.disabled ? "disabled" : "active",
          disabledReason: l.disabledReason,
        })),
      });
    }
    
    return Response.json({
      service: "cannasignal-cron",
      version: "3.4.0-parallel-pages",
      endpoints: [
        "GET /health - Service health with location stats",
        "POST /trigger - Manual scrape trigger",
        "GET /locations - All locations with status",
      ],
    });
  },
};
