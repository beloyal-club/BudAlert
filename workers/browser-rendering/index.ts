/**
 * CannaSignal Browser Rendering Worker (v2.0.0)
 * 
 * Provides headless Chrome via Cloudflare Browser Rendering.
 * Deployed at: https://cannasignal-browser.prtl.workers.dev
 * 
 * FEATURES:
 * - REL-001: Retry logic with exponential backoff
 * - OPT-001: Bandwidth optimization (blocks images, CSS, fonts, media)
 * - OPT-002: Tracking/analytics script blocking
 * - OPT-003: Accept: text/markdown header for compatible sites
 * 
 * IMPORTANT LIMITATION - READ THIS:
 * ============================================================
 * Cloudflare Browser Rendering CANNOT route through external proxies.
 * Per CF FAQ: "Browser Rendering requests originate from Cloudflare's 
 * global network and you cannot configure per-request IP rotation."
 * 
 * This means:
 * - All browser requests come from Cloudflare IP ranges
 * - Sites that block Cloudflare IPs will still block these requests
 * - IPRoyal/residential proxy integration is NOT POSSIBLE with CF Browser
 * 
 * For IP-sensitive sites, you must use:
 * - BrowserBase (with residential proxy)
 * - Bright Data Scraping Browser
 * - Self-hosted browser with proxy (VPS/container)
 * ============================================================
 */

import puppeteer, { Page, Browser, HTTPRequest } from "@cloudflare/puppeteer";

interface Env {
  BROWSER: Fetcher;
  CDP_SECRET: string;
}

// ============================================================
// CONFIGURATION
// ============================================================

const RETRY_CONFIG = {
  maxRetries: 2,
  baseDelayMs: 2000,
  maxDelayMs: 8000,
  backoffMultiplier: 2,
};

// Resource types to block for bandwidth optimization
const BLOCKED_RESOURCE_TYPES: Set<string> = new Set([
  'image',
  'stylesheet', 
  'font',
  'media',
]);

// URL patterns to block (tracking, analytics, ads)
const BLOCKED_URL_PATTERNS: RegExp[] = [
  // Analytics
  /google-analytics\.com/i,
  /googletagmanager\.com/i,
  /analytics\.google\.com/i,
  /segment\.io/i,
  /segment\.com/i,
  /mixpanel\.com/i,
  /amplitude\.com/i,
  /heap\.io/i,
  /heapanalytics\.com/i,
  /hotjar\.com/i,
  /fullstory\.com/i,
  /logrocket\.com/i,
  
  // Ads
  /doubleclick\.net/i,
  /googlesyndication\.com/i,
  /googleadservices\.com/i,
  /adnxs\.com/i,
  /adsrvr\.org/i,
  
  // Social widgets
  /connect\.facebook\.net/i,
  /platform\.twitter\.com/i,
  /platform\.linkedin\.com/i,
  
  // Other tracking
  /sentry\.io/i,
  /bugsnag\.com/i,
  /newrelic\.com/i,
  /nr-data\.net/i,
  /datadoghq\.com/i,
  /intercom\.io/i,
  /zendesk\.com/i,
  /drift\.com/i,
  /crisp\.chat/i,
];

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function getRetryDelay(attempt: number): number {
  const delay = RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, RETRY_CONFIG.maxDelayMs);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function shouldBlockRequest(request: HTTPRequest, blockImages: boolean): boolean {
  const resourceType = request.resourceType();
  const url = request.url();
  
  // Block by resource type (if enabled)
  if (blockImages && BLOCKED_RESOURCE_TYPES.has(resourceType)) {
    return true;
  }
  
  // Always block tracking/analytics regardless of blockImages setting
  for (const pattern of BLOCKED_URL_PATTERNS) {
    if (pattern.test(url)) {
      return true;
    }
  }
  
  return false;
}

// ============================================================
// REQUEST/RESPONSE TYPES
// ============================================================

interface ScrapeRequest {
  url: string;
  waitSelector?: string;           // CSS selector to wait for
  waitTimeout?: number;            // Timeout in ms for selector (default: 10000)
  blockImages?: boolean;           // Block images/CSS/fonts (default: true)
  useMarkdown?: boolean;           // Add Accept: text/markdown header (default: false)
  extractJs?: string;              // JavaScript to evaluate for extraction
}

interface ScrapeResponse {
  success: boolean;
  url: string;
  html?: string;
  markdown?: string;
  extractedData?: unknown;
  error?: string;
  attempts: number;
  blockedRequests: number;
  timing: {
    totalMs: number;
    navigationMs?: number;
    extractionMs?: number;
  };
}

// ============================================================
// MAIN HANDLER
// ============================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Health check (no auth required)
    if (url.pathname === "/health") {
      return Response.json({ 
        status: "ok", 
        service: "cannasignal-browser",
        version: "2.0.0",
        timestamp: Date.now(),
        features: {
          bandwidthOptimization: true,
          trackingBlocking: true,
          markdownSupport: true,
          proxySupport: false, // IMPORTANT: Not supported!
        },
        retryConfig: RETRY_CONFIG,
        note: "Proxy routing is NOT supported. CF Browser requests originate from Cloudflare IPs.",
      });
    }
    
    // Auth check for all other endpoints
    const secret = url.searchParams.get("secret") || request.headers.get("X-CDP-Secret");
    if (secret !== env.CDP_SECRET) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // POST /scrape - Full scraping with options
    if (url.pathname === "/scrape" && request.method === "POST") {
      try {
        const body = await request.json() as ScrapeRequest;
        if (!body.url) {
          return Response.json({ error: "Missing url in request body" }, { status: 400 });
        }
        return handleScrapeWithRetry(body, env);
      } catch (e) {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
      }
    }
    
    // GET /screenshot - Simple screenshot (backward compatible)
    if (url.pathname === "/screenshot") {
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) return Response.json({ error: "Missing url" }, { status: 400 });
      return handleScreenshotWithRetry(targetUrl, env);
    }
    
    // GET /menu - Menu scrape (backward compatible)
    if (url.pathname === "/menu") {
      const dispensaryUrl = url.searchParams.get("url");
      if (!dispensaryUrl) return Response.json({ error: "Missing url" }, { status: 400 });
      return handleMenuScrapeWithRetry(dispensaryUrl, env);
    }
    
    return Response.json({ 
      endpoints: [
        "GET /health",
        "POST /scrape - Full scraping with options",
        "GET /screenshot?url=",
        "GET /menu?url=",
      ],
      documentation: "https://github.com/Perk4/BudAlert/blob/main/docs/BROWSER-WORKER.md",
    }, { status: 404 });
  },
};

// ============================================================
// SCRAPE WITH OPTIONS (v2.0.0)
// ============================================================

async function handleScrapeWithRetry(options: ScrapeRequest, env: Env): Promise<Response> {
  const startTime = Date.now();
  let lastError: Error | null = null;
  let totalBlockedRequests = 0;
  
  const {
    url: targetUrl,
    waitSelector,
    waitTimeout = 10000,
    blockImages = true,
    useMarkdown = false,
    extractJs,
  } = options;
  
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    let browser: Browser | null = null;
    
    try {
      browser = await puppeteer.launch(env.BROWSER);
      const page = await browser.newPage();
      let blockedCount = 0;
      
      // Set up request interception for bandwidth optimization
      await page.setRequestInterception(true);
      
      page.on('request', (request: HTTPRequest) => {
        if (shouldBlockRequest(request, blockImages)) {
          blockedCount++;
          request.abort();
        } else {
          // Add markdown header if requested
          if (useMarkdown) {
            const headers = {
              ...request.headers(),
              'Accept': 'text/markdown, text/html;q=0.9, */*;q=0.8',
            };
            request.continue({ headers });
          } else {
            request.continue();
          }
        }
      });
      
      // Set viewport and user agent
      await page.setViewport({ width: 1280, height: 800 });
      await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36");
      
      // Navigate to page
      const navigationStart = Date.now();
      await page.goto(targetUrl, { 
        waitUntil: "domcontentloaded", 
        timeout: 30000,
      });
      const navigationMs = Date.now() - navigationStart;
      
      // Wait for selector if specified
      if (waitSelector) {
        await page.waitForSelector(waitSelector, { timeout: waitTimeout }).catch(() => null);
      }
      
      // Give page time to render JS content
      await sleep(2000);
      
      // Extract data if JS provided
      const extractionStart = Date.now();
      let extractedData: unknown = null;
      let html: string | undefined;
      let markdown: string | undefined;
      
      if (extractJs) {
        extractedData = await page.evaluate(extractJs);
      } else {
        // Default: get page content
        html = await page.content();
        
        // Check if response is markdown
        if (useMarkdown) {
          const contentType = await page.evaluate(() => {
            return document.contentType;
          });
          if (contentType?.includes('markdown')) {
            markdown = await page.evaluate(() => document.body.innerText);
            html = undefined;
          }
        }
      }
      const extractionMs = Date.now() - extractionStart;
      
      totalBlockedRequests = blockedCount;
      
      const response: ScrapeResponse = {
        success: true,
        url: targetUrl,
        html,
        markdown,
        extractedData,
        attempts: attempt + 1,
        blockedRequests: blockedCount,
        timing: {
          totalMs: Date.now() - startTime,
          navigationMs,
          extractionMs,
        },
      };
      
      await browser.close();
      return Response.json(response);
      
    } catch (error) {
      lastError = error as Error;
      console.error(`[Browser] Scrape attempt ${attempt + 1} failed:`, error);
      
      if (browser) {
        try { await browser.close(); } catch {}
      }
      
      if (attempt < RETRY_CONFIG.maxRetries) {
        const delay = getRetryDelay(attempt);
        console.log(`[Browser] Retrying in ${Math.round(delay)}ms...`);
        await sleep(delay);
      }
    }
  }
  
  const response: ScrapeResponse = {
    success: false,
    url: targetUrl,
    error: lastError?.message || "Scrape failed after retries",
    attempts: RETRY_CONFIG.maxRetries + 1,
    blockedRequests: totalBlockedRequests,
    timing: {
      totalMs: Date.now() - startTime,
    },
  };
  
  return Response.json(response, { status: 500 });
}

// ============================================================
// SCREENSHOT WITH RETRY (backward compatible)
// ============================================================

async function handleScreenshotWithRetry(targetUrl: string, env: Env): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    let browser: Browser | null = null;
    
    try {
      browser = await puppeteer.launch(env.BROWSER);
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(targetUrl, { waitUntil: "networkidle0", timeout: 30000 });
      const screenshot = await page.screenshot({ type: "png" });
      await browser.close();
      return new Response(screenshot, { headers: { "Content-Type": "image/png" } });
    } catch (error) {
      lastError = error as Error;
      console.error(`[Browser] Screenshot attempt ${attempt + 1} failed:`, error);
      
      if (browser) {
        try { await browser.close(); } catch {}
      }
      
      if (attempt < RETRY_CONFIG.maxRetries) {
        const delay = getRetryDelay(attempt);
        await sleep(delay);
      }
    }
  }
  
  return Response.json({ 
    success: false, 
    error: lastError?.message || "Screenshot failed after retries",
    attempts: RETRY_CONFIG.maxRetries + 1,
  }, { status: 500 });
}

// ============================================================
// MENU SCRAPE WITH RETRY (backward compatible, now with optimizations)
// ============================================================

async function handleMenuScrapeWithRetry(dispensaryUrl: string, env: Env): Promise<Response> {
  const startTime = Date.now();
  let lastError: Error | null = null;
  let blockedCount = 0;
  
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    let browser: Browser | null = null;
    
    try {
      browser = await puppeteer.launch(env.BROWSER);
      const page = await browser.newPage();
      
      // Enable bandwidth optimization
      await page.setRequestInterception(true);
      page.on('request', (request: HTTPRequest) => {
        if (shouldBlockRequest(request, true)) {
          blockedCount++;
          request.abort();
        } else {
          request.continue();
        }
      });
      
      await page.setViewport({ width: 1280, height: 800 });
      await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36");
      
      await page.goto(dispensaryUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      
      // Wait for products to load
      const waitTimeout = attempt === 0 ? 10000 : 5000;
      await page.waitForSelector('[data-testid="product-list-item"], .product-card', { timeout: waitTimeout }).catch(() => null);
      
      // Give JS time to render
      await sleep(2000);
      
      const products = await page.evaluate(() => {
        const items: {
          name: string | null;
          brand: string | null;
          price: string | null;
          stock: number | null;
        }[] = [];
        
        document.querySelectorAll('[data-testid="product-list-item"], .product-card').forEach(card => {
          const name = card.querySelector('[data-testid="product-title"], h2, h3')?.textContent?.trim() || null;
          const price = card.querySelector('[data-testid="product-price"], .price')?.textContent?.trim() || null;
          const brand = card.querySelector('[data-testid="product-brand"]')?.textContent?.trim() || null;
          const stockEl = card.querySelector('[data-testid="product-low-inventory-message"]');
          const stockText = stockEl?.textContent || '';
          const stockMatch = stockText.match(/(\d+)\s*left/i);
          if (name) items.push({ name, brand, price, stock: stockMatch ? parseInt(stockMatch[1]) : null });
        });
        return items;
      });
      
      await browser.close();
      
      return Response.json({ 
        success: true, 
        url: dispensaryUrl, 
        products, 
        count: products.length,
        attempts: attempt + 1,
        blockedRequests: blockedCount,
        timing: {
          totalMs: Date.now() - startTime,
        },
        note: "Requests from Cloudflare IPs. If IP-blocked, use BrowserBase with proxy.",
      });
      
    } catch (error) {
      lastError = error as Error;
      console.error(`[Browser] Menu scrape attempt ${attempt + 1} failed:`, error);
      
      if (browser) {
        try { await browser.close(); } catch {}
      }
      
      if (attempt < RETRY_CONFIG.maxRetries) {
        const delay = getRetryDelay(attempt);
        await sleep(delay);
      }
    }
  }
  
  return Response.json({ 
    success: false, 
    error: lastError?.message || "Menu scrape failed after retries",
    url: dispensaryUrl,
    attempts: RETRY_CONFIG.maxRetries + 1,
    blockedRequests: blockedCount,
    timing: {
      totalMs: Date.now() - startTime,
    },
  }, { status: 500 });
}
