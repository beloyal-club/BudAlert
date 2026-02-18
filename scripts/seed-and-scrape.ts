#!/usr/bin/env npx tsx
/**
 * Seed retailers to Convex and run a full cost-tracked scrape
 */

import { chromium, type Page, type Browser } from 'playwright';
import fs from 'fs';

const BROWSERBASE_API_KEY = 'bb_live_9DOgx7Trvyon7_zMAvtVxrpugDI';
const BROWSERBASE_PROJECT_ID = '5838b775-9417-42f0-b272-c0142eec43b7';
const CONVEX_URL = 'https://quick-weasel-225.convex.site';

// Cost tracking
const BROWSERBASE_HOURLY_RATE = 0.06; // $0.06/hr
const BROWSERBASE_PROXY_RATE = 10; // $10/GB (residential proxy)

interface CostMetrics {
  startTime: number;
  endTime?: number;
  productsScraped: number;
  pagesLoaded: number;
  modalsOpened: number;
  browserTimeMs: number;
  estimatedDataMB: number;
}

// Retailer data for CONBUD LES
const CONBUD_LES = {
  name: "CONBUD LES",
  slug: "conbud-les",
  licenseNumber: "OCM-AUCC-24-000020",
  address: {
    street: "147 Essex Street",
    city: "New York",
    state: "NY",
    zip: "10002",
  },
  region: "nyc",
  menuSources: [{
    platform: "dutchie",
    url: "https://conbud.com/stores/conbud-les/products",
    embedType: "dutchie-custom-theme",
    scrapeStatus: "active",
  }],
  isActive: true,
  firstSeenAt: Date.now(),
};

async function seedRetailer(): Promise<string | null> {
  console.log('📦 Seeding CONBUD LES to Convex...');
  
  try {
    // First check if retailer exists
    const checkRes = await fetch(`${CONVEX_URL}/retailers?slug=conbud-les`);
    if (checkRes.ok) {
      const existing = await checkRes.json();
      if (existing && existing._id) {
        console.log(`   Retailer already exists: ${existing._id}`);
        return existing._id;
      }
    }
  } catch (e) {
    // Continue to create
  }

  // Create retailer via Convex HTTP action
  // Note: We'll need to use the mutation endpoint or create an HTTP route
  console.log('   Creating retailer record...');
  
  // For now, just log - the ingestion endpoint should handle retailer lookup/creation
  console.log('   ⚠️ Retailer seeding requires direct Convex mutation');
  console.log('   Proceeding with scrape - will use slug for tracking\n');
  return null;
}

async function scrapeWithCostTracking(): Promise<void> {
  const metrics: CostMetrics = {
    startTime: Date.now(),
    productsScraped: 0,
    pagesLoaded: 0,
    modalsOpened: 0,
    browserTimeMs: 0,
    estimatedDataMB: 0,
  };

  console.log('🚀 Starting cost-tracked scrape of CONBUD LES');
  console.log('=' .repeat(50));
  console.log(`URL: ${CONBUD_LES.menuSources[0].url}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  const browserStartTime = Date.now();
  let browser: Browser | null = null;

  try {
    console.log('🔌 Connecting to BrowserBase...');
    browser = await chromium.connectOverCDP(
      `wss://connect.browserbase.com?apiKey=${BROWSERBASE_API_KEY}&projectId=${BROWSERBASE_PROJECT_ID}`,
      { timeout: 30000 }
    );
    console.log('   Connected!\n');

    const context = browser.contexts()[0] || await browser.newContext();
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });

    // Load main menu page
    console.log('📄 Loading menu page...');
    await page.goto(CONBUD_LES.menuSources[0].url, { 
      waitUntil: 'load', 
      timeout: 30000 
    });
    await page.waitForTimeout(5000);
    metrics.pagesLoaded++;

    // Get all product cards
    const productButtons = await page.locator('button:has-text("Add")').all();
    const totalProducts = productButtons.length;
    console.log(`   Found ${totalProducts} products\n`);

    const products: any[] = [];

    // Scrape each product
    for (let i = 0; i < totalProducts; i++) {
      console.log(`📦 Product ${i + 1}/${totalProducts}...`);
      
      try {
        // Click on product card to open modal
        // First find product cards (links/clickable elements)
        const productCards = await page.locator('a[href*="/product/"], [class*="product-card"] img, [class*="ProductCard"]').all();
        
        if (i < productCards.length) {
          await productCards[i].click({ timeout: 5000 });
          metrics.modalsOpened++;
          await page.waitForTimeout(2000);

          // Extract data from modal
          const productData = await page.evaluate(() => {
            const modal = document.querySelector('[class*="modal"], [class*="Modal"], [role="dialog"]') || document.body;
            const text = modal.innerText;
            
            // Inventory pattern
            const inventoryMatch = text.match(/(\d+)\s*left\s*in\s*stock/i);
            const inventory = inventoryMatch ? parseInt(inventoryMatch[1]) : null;
            
            // Price
            const priceMatch = text.match(/\$(\d+\.?\d*)/);
            const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
            
            // THC
            const thcMatch = text.match(/THC[:\s]*(\d+\.?\d*)%?/i);
            const thc = thcMatch ? parseFloat(thcMatch[1]) : null;
            
            // Product name (usually first heading in modal)
            const nameEl = modal.querySelector('h1, h2, h3, [class*="title"], [class*="Title"]');
            const name = nameEl?.textContent?.trim() || 'Unknown';
            
            // Brand
            const brandMatch = text.match(/^([A-Za-z0-9\s&]+)\n/);
            const brand = brandMatch ? brandMatch[1].trim() : null;
            
            // Weight
            const weightMatch = text.match(/(\d+\.?\d*\s*(?:g|oz|mg))/i);
            const weight = weightMatch ? weightMatch[1] : null;

            return { name, brand, price, thc, inventory, weight };
          });

          console.log(`   ${productData.name?.slice(0, 40)}... | $${productData.price} | ${productData.inventory ?? '?'} in stock`);
          
          products.push({
            ...productData,
            scrapedAt: new Date().toISOString(),
          });
          metrics.productsScraped++;

          // Close modal - press Escape or click outside
          await page.keyboard.press('Escape');
          await page.waitForTimeout(1000);
        }
      } catch (e: any) {
        console.log(`   ⚠️ Error: ${e.message?.slice(0, 50)}`);
      }
    }

    metrics.browserTimeMs = Date.now() - browserStartTime;
    metrics.endTime = Date.now();
    metrics.estimatedDataMB = JSON.stringify(products).length / 1024 / 1024;

    // Calculate costs
    const browserHours = metrics.browserTimeMs / 1000 / 60 / 60;
    const browserCost = browserHours * BROWSERBASE_HOURLY_RATE;
    const proxyCost = metrics.estimatedDataMB * BROWSERBASE_PROXY_RATE / 1000; // Very rough
    const totalCost = browserCost + proxyCost;

    console.log('\n' + '='.repeat(50));
    console.log('📊 SCRAPE RESULTS');
    console.log('='.repeat(50));
    console.log(`Products scraped: ${metrics.productsScraped}/${totalProducts}`);
    console.log(`Modals opened: ${metrics.modalsOpened}`);
    console.log(`Total time: ${(metrics.browserTimeMs / 1000).toFixed(1)}s`);
    console.log(`Data size: ${(metrics.estimatedDataMB * 1024).toFixed(1)} KB`);
    
    console.log('\n💰 COST BREAKDOWN');
    console.log('-'.repeat(30));
    console.log(`Browser time: ${(browserHours * 60).toFixed(2)} min`);
    console.log(`Browser cost: $${browserCost.toFixed(4)}`);
    console.log(`Proxy cost: $${proxyCost.toFixed(4)} (est)`);
    console.log(`TOTAL COST: $${totalCost.toFixed(4)}`);
    console.log(`Cost per product: $${(totalCost / Math.max(metrics.productsScraped, 1)).toFixed(5)}`);

    // Save results
    const resultsDir = '/root/clawd/cannasignal/data/scrape-logs';
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
    
    const resultsFile = `${resultsDir}/conbud-les-full-${Date.now()}.json`;
    fs.writeFileSync(resultsFile, JSON.stringify({
      retailer: CONBUD_LES.slug,
      timestamp: new Date().toISOString(),
      metrics,
      costs: {
        browserHours,
        browserCost,
        proxyCost,
        totalCost,
        costPerProduct: totalCost / Math.max(metrics.productsScraped, 1),
      },
      products,
    }, null, 2));
    console.log(`\n📁 Results saved: ${resultsFile}`);

    // Try to push to Convex
    console.log('\n📤 Pushing to Convex...');
    try {
      const payload = {
        retailerSlug: CONBUD_LES.slug,
        scrapedAt: Date.now(),
        items: products.map(p => ({
          rawProductName: p.name,
          rawBrandName: p.brand || 'Unknown',
          priceInCents: Math.round((p.price || 0) * 100),
          inventoryCount: p.inventory,
          thcFormatted: p.thc ? `${p.thc}%` : null,
          sourceUrl: CONBUD_LES.menuSources[0].url,
          sourcePlatform: 'dutchie-embedded',
        })),
      };

      const res = await fetch(`${CONVEX_URL}/ingest/scraped-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      const result = await res.json();
      console.log('   Convex response:', JSON.stringify(result).slice(0, 200));
    } catch (e: any) {
      console.log('   ⚠️ Convex push failed:', e.message);
    }

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run
seedRetailer()
  .then(() => scrapeWithCostTracking())
  .catch(e => console.error('Fatal error:', e));
