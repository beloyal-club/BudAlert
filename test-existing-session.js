// Connect to existing BrowserBase session and run inventory test
import { chromium } from 'playwright';

// Get connect URL for existing session
async function getConnectUrl() {
  const resp = await fetch('https://api.browserbase.com/v1/sessions/962d10a9-8ebc-4e3a-82ec-108162c55d2e', {
    headers: { 'X-BB-API-Key': 'bb_live_9DOgx7Trvyon7_zMAvtVxrpugDI' }
  });
  const data = await resp.json();
  return data.connectUrl;
}

const TEST_URL = 'https://conbud.com/stores/conbud-les/products/flower';

async function test() {
  console.log('🔌 Getting connection URL for existing session...');
  const connectUrl = await getConnectUrl();
  console.log('✅ Got connection URL');

  console.log('🔗 Connecting...');
  const browser = await chromium.connectOverCDP(connectUrl);
  console.log('✅ Connected!');

  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();

  console.log(`📄 Navigating to ${TEST_URL}...`);
  await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });

  console.log('⏳ Waiting for content...');
  await page.waitForTimeout(5000);

  // Check frames
  const frames = page.frames();
  console.log(`📐 Found ${frames.length} frames:`);
  for (const frame of frames) {
    console.log(`  - ${frame.name() || 'main'}: ${frame.url().substring(0, 80)}...`);
  }

  // Find Dutchie iframe
  let targetFrame = page;
  for (const frame of frames) {
    if (frame.url().includes('dutchie.com')) {
      targetFrame = frame;
      console.log('✅ Found Dutchie iframe!');
      break;
    }
  }

  // Extract products
  console.log('\n📦 Extracting products...');
  const products = await targetFrame.evaluate(() => {
    const results = [];
    
    // Try multiple selectors
    const selectors = [
      '[data-testid="product-card"]',
      '[class*="ProductCard"]',
      '[class*="product-card"]',
      'article[class*="product"]',
      '[class*="MenuProduct"]'
    ];

    let cards = [];
    for (const sel of selectors) {
      cards = document.querySelectorAll(sel);
      if (cards.length > 0) {
        console.log(`Found ${cards.length} products with selector: ${sel}`);
        break;
      }
    }

    cards.forEach((card, i) => {
      if (i >= 10) return;
      
      const nameEl = card.querySelector('[class*="name"], [class*="Name"], [class*="title"], h2, h3, h4');
      const priceEl = card.querySelector('[class*="price"], [class*="Price"]');
      const brandEl = card.querySelector('[class*="brand"], [class*="Brand"]');
      
      const name = nameEl?.textContent?.trim();
      const price = priceEl?.textContent?.trim();
      const brand = brandEl?.textContent?.trim();

      // Check for stock warnings
      const cardText = card.textContent || '';
      const stockMatch = cardText.match(/only (\d+)|(\d+) left|low stock/i);
      const inventoryHint = stockMatch ? stockMatch[0] : null;

      if (name) {
        results.push({ name, brand, price, inventoryHint });
      }
    });

    // If no cards found, try to get any visible content
    if (results.length === 0) {
      const pageText = document.body?.innerText?.substring(0, 2000) || '';
      const pricesFound = pageText.match(/\$\d+(?:\.\d{2})?/g) || [];
      return { 
        noProductCards: true, 
        pricesFound: pricesFound.slice(0, 10),
        sampleText: pageText.substring(0, 500)
      };
    }

    return results;
  });

  console.log('Products:', JSON.stringify(products, null, 2));

  // Take screenshot
  console.log('\n📸 Taking screenshot...');
  await page.screenshot({ path: '/tmp/inventory-test.png', fullPage: false });
  console.log('Screenshot saved to /tmp/inventory-test.png');

  // Clean up
  await browser.close();
  console.log('✅ Done!');
}

test().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
