/**
 * Test Cart Hack Module
 * 
 * Run with: npx tsx test-cart-hack.ts
 */

import { chromium } from 'playwright';
import { 
  getExactInventory, 
  extractInventoryFromListing,
  InventoryResult 
} from './workers/lib/cartHack';
import { 
  getInventoryWithFallback, 
  getBatchInventory 
} from './workers/lib/inventoryFallback';

const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY || 'bb_live_9DOgx7Trvyon7_zMAvtVxrpugDI';
const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID || '5838b775-9417-42f0-b272-c0142eec43b7';

const TEST_URLS = [
  'https://conbud.com/stores/conbud-les/products/flower',
  'https://conbud.com/stores/conbud-les/product/grocery-28g-flower-sativa-black-diesel',
];

async function testListingExtraction() {
  console.log('='.repeat(70));
  console.log('TEST 1: Batch Inventory Extraction from Listing Page');
  console.log('='.repeat(70));

  const browser = await chromium.connectOverCDP(
    `wss://connect.browserbase.com?apiKey=${BROWSERBASE_API_KEY}&projectId=${BROWSERBASE_PROJECT_ID}`,
    { timeout: 30000 }
  );

  try {
    const context = browser.contexts()[0] || await browser.newContext();
    const page = await context.newPage();

    console.log(`\n📍 Navigating to: ${TEST_URLS[0]}`);
    await page.goto(TEST_URLS[0], { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(5000); // Wait for React hydration

    // Handle age verification
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      buttons.forEach(btn => {
        const text = btn.textContent?.trim().toLowerCase() || '';
        if (text === 'yes' || text.includes('21')) {
          btn.click();
        }
      });
    });
    await page.waitForTimeout(2000);

    console.log('\n🔍 Extracting inventory from listing...');
    const inventoryMap = await extractInventoryFromListing(page);

    console.log(`\n📦 Found ${inventoryMap.size} products with inventory data:\n`);

    let exactCount = 0;
    let estimatedCount = 0;
    let booleanCount = 0;

    for (const [name, result] of inventoryMap) {
      const shortName = name.substring(0, 50);
      const qtyStr = result.quantity !== null ? `${result.quantity}` : '?';
      console.log(`  ${shortName}`);
      console.log(`    Qty: ${qtyStr} | In Stock: ${result.inStock} | Source: ${result.source} | Confidence: ${result.confidence}`);
      if (result.quantityWarning) {
        console.log(`    Warning: "${result.quantityWarning}"`);
      }
      console.log();

      if (result.confidence === 'exact') exactCount++;
      else if (result.confidence === 'estimated') estimatedCount++;
      else booleanCount++;
    }

    console.log('='.repeat(70));
    console.log(`SUMMARY: ${exactCount} exact | ${estimatedCount} estimated | ${booleanCount} boolean-only`);
    console.log('='.repeat(70));

  } finally {
    await browser.close();
  }
}

async function testProductPageExtraction() {
  console.log('\n\n');
  console.log('='.repeat(70));
  console.log('TEST 2: Single Product Inventory with Fallback Hierarchy');
  console.log('='.repeat(70));

  const browser = await chromium.connectOverCDP(
    `wss://connect.browserbase.com?apiKey=${BROWSERBASE_API_KEY}&projectId=${BROWSERBASE_PROJECT_ID}`,
    { timeout: 30000 }
  );

  try {
    const context = browser.contexts()[0] || await browser.newContext();
    const page = await context.newPage();

    console.log(`\n📍 Navigating to: ${TEST_URLS[1]}`);
    await page.goto(TEST_URLS[1], { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(5000);

    // Handle age verification
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      buttons.forEach(btn => {
        const text = btn.textContent?.trim().toLowerCase() || '';
        if (text === 'yes' || text.includes('21')) {
          btn.click();
        }
      });
    });
    await page.waitForTimeout(3000);

    console.log('\n🔍 Running full fallback hierarchy...');
    const result = await getInventoryWithFallback(page, undefined, { 
      debug: true,
      fastMode: false, // Try cart overflow if needed
    });

    console.log('\n📦 RESULT:');
    console.log(`  Quantity: ${result.quantity !== null ? result.quantity : 'Unknown'}`);
    console.log(`  In Stock: ${result.inStock}`);
    console.log(`  Source: ${result.source}`);
    console.log(`  Confidence: ${result.confidence}`);
    console.log(`  Warning Text: ${result.quantityWarning || 'None'}`);
    console.log(`  Methods Attempted: ${result.methodsAttempted.join(' → ')}`);
    console.log(`  Time: ${result.timeMs}ms`);
    if (result.rawError) {
      console.log(`  Error: ${result.rawError}`);
    }

  } finally {
    await browser.close();
  }
}

async function testCartOverflow() {
  console.log('\n\n');
  console.log('='.repeat(70));
  console.log('TEST 3: Cart Overflow Technique (Direct)');
  console.log('='.repeat(70));

  const browser = await chromium.connectOverCDP(
    `wss://connect.browserbase.com?apiKey=${BROWSERBASE_API_KEY}&projectId=${BROWSERBASE_PROJECT_ID}`,
    { timeout: 30000 }
  );

  try {
    const context = browser.contexts()[0] || await browser.newContext();
    const page = await context.newPage();

    // Go to product page
    console.log(`\n📍 Navigating to: ${TEST_URLS[1]}`);
    await page.goto(TEST_URLS[1], { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(5000);

    // Handle age verification
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      buttons.forEach(btn => {
        const text = btn.textContent?.trim().toLowerCase() || '';
        if (text === 'yes' || text.includes('21')) {
          btn.click();
        }
      });
    });
    await page.waitForTimeout(3000);

    console.log('\n🛒 Attempting cart overflow technique...');
    const result = await getExactInventory(page, undefined, {
      targetQuantity: 99,
      cleanupCart: true,
      debug: true,
    });

    console.log('\n📦 CART OVERFLOW RESULT:');
    console.log(`  Quantity: ${result.quantity !== null ? result.quantity : 'Not revealed'}`);
    console.log(`  Source: ${result.source}`);
    console.log(`  Confidence: ${result.confidence}`);
    console.log(`  Warning: ${result.quantityWarning || 'None'}`);
    if (result.rawError) {
      console.log(`  Error: ${result.rawError}`);
    }

    // Take screenshot
    await page.screenshot({ path: '/tmp/cart-hack-test.png', fullPage: true });
    console.log('\n📸 Screenshot saved to /tmp/cart-hack-test.png');

  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('🚀 Cart Hack Module Tests\n');
  console.log('Testing with BrowserBase cloud browser...\n');

  try {
    await testListingExtraction();
    await testProductPageExtraction();
    await testCartOverflow();

    console.log('\n\n✅ All tests completed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();
