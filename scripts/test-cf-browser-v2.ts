#!/usr/bin/env npx tsx
/**
 * Test script for CF Browser Rendering Worker v2.0.0
 * 
 * Tests:
 * 1. Health endpoint
 * 2. Bandwidth optimization (blocked request count)
 * 3. Menu scraping with product extraction
 * 4. Error handling for blocked sites
 * 
 * Usage:
 *   npx tsx scripts/test-cf-browser-v2.ts
 *   npx tsx scripts/test-cf-browser-v2.ts --url https://example.com/menu
 */

const WORKER_URL = "https://cannasignal-browser.prtl.workers.dev";
const CDP_SECRET = process.env.CDP_SECRET;

if (!CDP_SECRET) {
  console.error("❌ CDP_SECRET environment variable required");
  console.error("   Set it: export CDP_SECRET=your_secret");
  process.exit(1);
}

// Test sites
const TEST_SITES = {
  // Sites that should work (not known to block CF)
  "housing-works": "https://housing-works.com/menu",
  
  // Sites that previously got IP-blocked (may fail)
  "conbud-les": "https://conbud.com/stores/conbud-les/products",
  "gotham": "https://gotham.nyc/menu/",
  
  // Simple test site
  "example": "https://example.com",
};

interface ScrapeResponse {
  success: boolean;
  url: string;
  products?: Array<{
    name: string | null;
    brand: string | null;
    price: string | null;
    stock: number | null;
  }>;
  count?: number;
  error?: string;
  attempts: number;
  blockedRequests: number;
  timing: {
    totalMs: number;
    navigationMs?: number;
  };
  note?: string;
}

interface HealthResponse {
  status: string;
  service: string;
  version: string;
  features: {
    bandwidthOptimization: boolean;
    trackingBlocking: boolean;
    markdownSupport: boolean;
    proxySupport: boolean;
  };
  note: string;
}

async function testHealth(): Promise<void> {
  console.log("\n🏥 Testing health endpoint...");
  
  const res = await fetch(`${WORKER_URL}/health`);
  const data = await res.json() as HealthResponse;
  
  console.log(`   Status: ${data.status}`);
  console.log(`   Version: ${data.version}`);
  console.log(`   Features:`);
  console.log(`     - Bandwidth optimization: ${data.features.bandwidthOptimization ? "✅" : "❌"}`);
  console.log(`     - Tracking blocking: ${data.features.trackingBlocking ? "✅" : "❌"}`);
  console.log(`     - Markdown support: ${data.features.markdownSupport ? "✅" : "❌"}`);
  console.log(`     - Proxy support: ${data.features.proxySupport ? "✅" : "❌ (NOT SUPPORTED)"}`);
  console.log(`   Note: ${data.note}`);
}

async function testMenuScrape(name: string, url: string): Promise<void> {
  console.log(`\n🔍 Testing menu scrape: ${name}`);
  console.log(`   URL: ${url}`);
  
  const startTime = Date.now();
  
  try {
    const res = await fetch(`${WORKER_URL}/menu?url=${encodeURIComponent(url)}&secret=${CDP_SECRET}`);
    const data = await res.json() as ScrapeResponse;
    
    if (data.success) {
      console.log(`   ✅ Success!`);
      console.log(`   Products found: ${data.count || 0}`);
      console.log(`   Blocked requests: ${data.blockedRequests}`);
      console.log(`   Total time: ${data.timing.totalMs}ms`);
      console.log(`   Attempts: ${data.attempts}`);
      
      if (data.products && data.products.length > 0) {
        console.log(`   Sample products:`);
        data.products.slice(0, 3).forEach((p, i) => {
          console.log(`     ${i + 1}. ${p.name?.slice(0, 50) || "Unknown"} - ${p.price || "No price"}`);
        });
      }
      
      if (data.note) {
        console.log(`   Note: ${data.note}`);
      }
    } else {
      console.log(`   ❌ Failed: ${data.error}`);
      console.log(`   Attempts: ${data.attempts}`);
      console.log(`   Blocked requests: ${data.blockedRequests}`);
      console.log(`   Total time: ${data.timing.totalMs}ms`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  console.log(`   Client-side time: ${Date.now() - startTime}ms`);
}

async function testAdvancedScrape(url: string): Promise<void> {
  console.log(`\n🔬 Testing advanced scrape endpoint...`);
  console.log(`   URL: ${url}`);
  
  const body = {
    url,
    waitSelector: '[data-testid="product-list-item"], .product-card',
    blockImages: true,
    useMarkdown: false,
    extractJs: `
      const products = [];
      document.querySelectorAll('[data-testid="product-list-item"], .product-card').forEach(card => {
        const name = card.querySelector('[data-testid="product-title"], h2, h3')?.textContent?.trim();
        if (name) products.push({ name });
      });
      return { productCount: products.length, sampleNames: products.slice(0, 5).map(p => p.name) };
    `,
  };
  
  try {
    const res = await fetch(`${WORKER_URL}/scrape`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CDP-Secret": CDP_SECRET,
      },
      body: JSON.stringify(body),
    });
    
    const data = await res.json();
    
    if (data.success) {
      console.log(`   ✅ Success!`);
      console.log(`   Blocked requests: ${data.blockedRequests}`);
      console.log(`   Navigation time: ${data.timing.navigationMs}ms`);
      console.log(`   Total time: ${data.timing.totalMs}ms`);
      console.log(`   Extracted data:`, data.extractedData);
    } else {
      console.log(`   ❌ Failed: ${data.error}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("CF Browser Rendering Worker v2.0.0 Test Suite");
  console.log("=".repeat(60));
  
  // Parse args
  const args = process.argv.slice(2);
  const urlArg = args.find(a => a.startsWith("--url="));
  const customUrl = urlArg?.split("=")[1];
  
  // Test health
  await testHealth();
  
  // Test menu scraping
  if (customUrl) {
    await testMenuScrape("custom", customUrl);
    await testAdvancedScrape(customUrl);
  } else {
    // Test a few sites
    for (const [name, url] of Object.entries(TEST_SITES)) {
      await testMenuScrape(name, url);
      
      // Small delay between tests
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("Test suite complete!");
  console.log("=".repeat(60));
  console.log("\n⚠️  REMINDER: CF Browser Rendering does NOT support proxy routing.");
  console.log("    All requests originate from Cloudflare IPs.");
  console.log("    Sites blocking CF IPs will still fail - use BrowserBase for those.\n");
}

main().catch(console.error);
