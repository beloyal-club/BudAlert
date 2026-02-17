/**
 * Quick test scrape of embedded Dutchie menus
 * DATA-007: Validate embedded menu URLs work with stealth scraper
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

const TEST_URLS = [
  'https://conbud.com/stores/conbud-les/products',
  'https://gotham.nyc/menu/',
  'https://dagmarcannabis.com/menu/'
];

interface TestResult {
  url: string;
  success: boolean;
  productCount: number;
  blocked: boolean;
  error?: string;
  sampleProducts: string[];
  timing: number;
}

async function testScrape(url: string): Promise<TestResult> {
  const start = Date.now();
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();
    
    console.log(`\nScraping: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // Check for Cloudflare block
    const content = await page.content();
    if (content.includes('cf-browser-verification') || content.includes('Checking your browser')) {
      return {
        url,
        success: false,
        productCount: 0,
        blocked: true,
        error: 'Cloudflare blocked',
        sampleProducts: [],
        timing: Date.now() - start
      };
    }
    
    // Handle age verification
    try {
      const yesButton = await page.locator('button', { hasText: /^(YES|Yes|I am 21|Enter)$/i }).first();
      if (await yesButton.isVisible({ timeout: 2000 })) {
        console.log('  Clicking age verification...');
        await yesButton.click();
        await page.waitForTimeout(2000);
      }
    } catch { /* no age gate */ }
    
    // Extract products
    const products = await page.evaluate(`
      (function() {
        var items = [];
        var seen = {};
        var selectors = '[data-testid="product-card"], .product-card, [class*="ProductCard"], [class*="product-tile"], article[class*="product"]';
        document.querySelectorAll(selectors).forEach(function(el) {
          var name = (el.querySelector('h1,h2,h3,h4,[class*="name"],[class*="title"]') || {}).textContent;
          if (name) {
            name = name.trim().substring(0, 50);
            if (!seen[name.toLowerCase()]) {
              seen[name.toLowerCase()] = true;
              items.push(name);
            }
          }
        });
        return items;
      })()
    `) as string[];
    
    await browser.close();
    
    return {
      url,
      success: products.length > 0,
      productCount: products.length,
      blocked: false,
      sampleProducts: products.slice(0, 5),
      timing: Date.now() - start
    };
  } catch (error: any) {
    await browser.close();
    return {
      url,
      success: false,
      productCount: 0,
      blocked: false,
      error: error.message,
      sampleProducts: [],
      timing: Date.now() - start
    };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('DATA-007: Testing Embedded Dutchie Menu Scraping');
  console.log('='.repeat(60));
  
  const results: TestResult[] = [];
  
  for (const url of TEST_URLS) {
    const result = await testScrape(url);
    results.push(result);
    
    if (result.success) {
      console.log(`  ✅ SUCCESS: ${result.productCount} products found (${result.timing}ms)`);
      console.log(`     Sample: ${result.sampleProducts.slice(0, 3).join(', ')}`);
    } else if (result.blocked) {
      console.log(`  ❌ BLOCKED: ${result.error}`);
    } else {
      console.log(`  ❌ FAILED: ${result.error || 'No products found'}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  
  const successful = results.filter(r => r.success).length;
  const blocked = results.filter(r => r.blocked).length;
  const totalProducts = results.reduce((sum, r) => sum + r.productCount, 0);
  
  console.log(`Tested: ${results.length} URLs`);
  console.log(`Success: ${successful}/${results.length}`);
  console.log(`Blocked: ${blocked}/${results.length}`);
  console.log(`Total products: ${totalProducts}`);
  console.log(`Avg time: ${Math.round(results.reduce((s, r) => s + r.timing, 0) / results.length)}ms`);
  
  // Save results
  const fs = await import('fs');
  fs.writeFileSync(
    '/root/clawd/cannasignal/data/stealth-test-data007/test-results.json',
    JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2)
  );
  console.log('\nResults saved to data/stealth-test-data007/test-results.json');
}

main().catch(console.error);
