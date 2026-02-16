/**
 * CannaSignal Browser Rendering Worker
 * 
 * Provides headless Chrome via Cloudflare Browser Rendering.
 * Deployed at: https://cannasignal-browser.prtl.workers.dev
 */

import puppeteer from "@cloudflare/puppeteer";

interface Env {
  BROWSER: Fetcher;
  CDP_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Health check (no auth)
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "cannasignal-browser", timestamp: Date.now() });
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
      return handleScreenshot(targetUrl, env);
    }
    
    // Menu scrape
    if (url.pathname === "/menu") {
      const dispensaryUrl = url.searchParams.get("url");
      if (!dispensaryUrl) return Response.json({ error: "Missing url" }, { status: 400 });
      return handleMenuScrape(dispensaryUrl, env);
    }
    
    return Response.json({ 
      endpoints: ["/health", "/screenshot?url=", "/menu?url="] 
    }, { status: 404 });
  },
};

async function handleScreenshot(targetUrl: string, env: Env): Promise<Response> {
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(targetUrl, { waitUntil: "networkidle0", timeout: 30000 });
    const screenshot = await page.screenshot({ type: "png" });
    return new Response(screenshot, { headers: { "Content-Type": "image/png" } });
  } finally {
    await browser.close();
  }
}

async function handleMenuScrape(dispensaryUrl: string, env: Env): Promise<Response> {
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36");
    
    await page.goto(dispensaryUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector('[data-testid="product-list-item"], .product-card', { timeout: 10000 }).catch(() => null);
    
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
    
    return Response.json({ success: true, url: dispensaryUrl, products, count: products.length });
  } catch (error) {
    return Response.json({ success: false, error: String(error) }, { status: 500 });
  } finally {
    await browser.close();
  }
}
