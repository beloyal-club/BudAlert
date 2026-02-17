/**
 * CannaSignal Browser Rendering Worker
 * 
 * Provides headless Chrome via Cloudflare Browser Rendering.
 * Deployed at: https://cannasignal-browser.prtl.workers.dev
 * 
 * REL-001: Added retry logic with exponential backoff for browser operations.
 */

import puppeteer from "@cloudflare/puppeteer";

interface Env {
  BROWSER: Fetcher;
  CDP_SECRET: string;
}

// ============================================================
// RETRY CONFIGURATION (REL-001)
// ============================================================

const RETRY_CONFIG = {
  maxRetries: 2,
  baseDelayMs: 2000,
  maxDelayMs: 8000,
  backoffMultiplier: 2,
};

function getRetryDelay(attempt: number): number {
  const delay = RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, RETRY_CONFIG.maxDelayMs);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ============================================================
// MAIN HANDLER
// ============================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Health check (no auth)
    if (url.pathname === "/health") {
      return Response.json({ 
        status: "ok", 
        service: "cannasignal-browser", 
        timestamp: Date.now(),
        retryConfig: RETRY_CONFIG,
      });
    }
    
    // Auth check
    const secret = url.searchParams.get("secret") || request.headers.get("X-CDP-Secret");
    if (secret !== env.CDP_SECRET) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // Screenshot
    if (url.pathname === "/screenshot") {
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) return Response.json({ error: "Missing url" }, { status: 400 });
      return handleScreenshotWithRetry(targetUrl, env);
    }
    
    // Menu scrape
    if (url.pathname === "/menu") {
      const dispensaryUrl = url.searchParams.get("url");
      if (!dispensaryUrl) return Response.json({ error: "Missing url" }, { status: 400 });
      return handleMenuScrapeWithRetry(dispensaryUrl, env);
    }
    
    return Response.json({ 
      endpoints: ["/health", "/screenshot?url=", "/menu?url="] 
    }, { status: 404 });
  },
};

// ============================================================
// SCREENSHOT WITH RETRY (REL-001)
// ============================================================

async function handleScreenshotWithRetry(targetUrl: string, env: Env): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    const browser = await puppeteer.launch(env.BROWSER);
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(targetUrl, { waitUntil: "networkidle0", timeout: 30000 });
      const screenshot = await page.screenshot({ type: "png" });
      return new Response(screenshot, { headers: { "Content-Type": "image/png" } });
    } catch (error) {
      lastError = error as Error;
      console.error(`[Browser] Screenshot attempt ${attempt + 1} failed:`, error);
      
      if (attempt < RETRY_CONFIG.maxRetries) {
        const delay = getRetryDelay(attempt);
        console.log(`[Browser] Retrying in ${Math.round(delay)}ms...`);
        await sleep(delay);
      }
    } finally {
      await browser.close();
    }
  }
  
  return Response.json({ 
    success: false, 
    error: lastError?.message || "Screenshot failed after retries",
    attempts: RETRY_CONFIG.maxRetries + 1,
  }, { status: 500 });
}

// ============================================================
// MENU SCRAPE WITH RETRY (REL-001)
// ============================================================

async function handleMenuScrapeWithRetry(dispensaryUrl: string, env: Env): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    const browser = await puppeteer.launch(env.BROWSER);
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36");
      
      await page.goto(dispensaryUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      
      // Wait for products to load with a shorter timeout for retry attempts
      const waitTimeout = attempt === 0 ? 10000 : 5000;
      await page.waitForSelector('[data-testid="product-list-item"], .product-card', { timeout: waitTimeout }).catch(() => null);
      
      const products = await page.evaluate(() => {
        const items: any[] = [];
        document.querySelectorAll('[data-testid="product-list-item"], .product-card').forEach(card => {
          const name = card.querySelector('[data-testid="product-title"], h2, h3')?.textContent?.trim();
          const price = card.querySelector('[data-testid="product-price"], .price')?.textContent?.trim();
          const brand = card.querySelector('[data-testid="product-brand"]')?.textContent?.trim();
          const stockEl = card.querySelector('[data-testid="product-low-inventory-message"]');
          const stockText = stockEl?.textContent || '';
          const stockMatch = stockText.match(/(\d+)\s*left/i);
          if (name) items.push({ name, brand, price, stock: stockMatch ? parseInt(stockMatch[1]) : null });
        });
        return items;
      });
      
      return Response.json({ 
        success: true, 
        url: dispensaryUrl, 
        products, 
        count: products.length,
        attempts: attempt + 1,
      });
    } catch (error) {
      lastError = error as Error;
      console.error(`[Browser] Menu scrape attempt ${attempt + 1} failed:`, error);
      
      if (attempt < RETRY_CONFIG.maxRetries) {
        const delay = getRetryDelay(attempt);
        console.log(`[Browser] Retrying in ${Math.round(delay)}ms...`);
        await sleep(delay);
      }
    } finally {
      await browser.close();
    }
  }
  
  return Response.json({ 
    success: false, 
    error: lastError?.message || "Menu scrape failed after retries",
    url: dispensaryUrl,
    attempts: RETRY_CONFIG.maxRetries + 1,
  }, { status: 500 });
}
