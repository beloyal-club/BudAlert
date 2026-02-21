/**
 * Test: Product Detail Page Inventory Extraction
 * 
 * Tests the new inventory extraction logic on a real Dutchie product page.
 */

import Browserbase from '@browserbasehq/sdk';

const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY || 'bb_live_9DOgx7Trvyon7_zMAvtVxrpugDI';
const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID || '5838b775-9417-42f0-b272-c0142eec43b7';

// Test URLs
const LISTING_URL = 'https://conbud.com/stores/conbud-les/products/flower';

async function test() {
  console.log('🚀 Product Detail Page Inventory Extraction Test\n');
  
  // Create BrowserBase session
  const bb = new Browserbase({ apiKey: BROWSERBASE_API_KEY });
  
  console.log('📡 Creating BrowserBase session...');
  const session = await bb.sessions.create({ projectId: BROWSERBASE_PROJECT_ID });
  console.log(`✅ Session created: ${session.id}`);
  
  // Connect via Playwright (for this test - production uses CDP)
  const { chromium } = await import('playwright');
  
  const browser = await chromium.connectOverCDP(session.connectUrl);
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();
  
  console.log(`\n📄 Loading listing page: ${LISTING_URL}`);
  await page.goto(LISTING_URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(5000);
  
  // Handle age gate if present
  try {
    const ageButton = page.locator('button:has-text("Yes"), button:has-text("Enter"), button:has-text("I am 21")').first();
    if (await ageButton.isVisible({ timeout: 2000 })) {
      await ageButton.click();
      await page.waitForTimeout(2000);
      console.log('✅ Dismissed age gate');
    }
  } catch (e) {
    // No age gate
  }
  
  // Extract actual product detail URLs (pattern: /stores/xxx/product/yyy)
  console.log('\n📦 Extracting product detail URLs...');
  const productUrls = await page.evaluate(() => {
    const links = [];
    const seen = new Set();
    
    // Find links matching product detail pattern
    document.querySelectorAll('a[href*="/product/"]').forEach(link => {
      const href = link.href;
      // Only include if it's a product detail page (not "products" category)
      if (href && !seen.has(href) && href.includes('/product/') && !href.includes('/products/')) {
        seen.add(href);
        // Get text near the link for product name
        const text = link.textContent?.trim() || 
                    link.closest('div')?.querySelector('h2, h3, [class*="name"]')?.textContent?.trim() || '';
        if (text.length > 2 || href.length > 50) {
          links.push({ name: text || 'Unknown', url: href });
        }
      }
    });
    return links;
  });
  
  console.log(`Found ${productUrls.length} product detail URLs`);
  
  if (productUrls.length === 0) {
    console.log('❌ No product URLs found');
    await browser.close();
    return;
  }
  
  // Test first 5 products
  const results = [];
  const testProducts = productUrls.slice(0, 5);
  
  console.log(`\n🔍 Testing inventory extraction on ${testProducts.length} products...\n`);
  
  for (const product of testProducts) {
    console.log(`➡️  ${product.name.slice(0, 50) || 'Loading...'}`);
    console.log(`    URL: ${product.url}`);
    
    try {
      await page.goto(product.url, { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(5000);
      
      // Extract inventory using the proven pattern
      const inventoryData = await page.evaluate(() => {
        const bodyText = document.body.innerText || '';
        
        // Primary pattern: "X left"
        const stockPatterns = [
          /(\d+)\s*left/i,
          /only\s*(\d+)\s*left/i,
          /(\d+)\s*left\s*in\s*stock/i,
          /(\d+)\s*remaining/i,
          /(\d+)\s*available/i,
          /(\d+)\s*in\s*stock/i,
        ];
        
        let quantity = null;
        let quantityWarning = null;
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
        
        // Check out of stock
        let inStock = true;
        if (/out\s*of\s*stock|sold\s*out/i.test(bodyText)) {
          inStock = false;
          quantity = 0;
          quantityWarning = 'Out of stock';
          quantitySource = 'text_pattern';
        }
        
        // Get product name from page
        const nameEl = document.querySelector('h1, [class*="ProductName"], [class*="product-name"]');
        const productName = nameEl?.textContent?.trim() || null;
        
        // Get price
        const priceMatch = bodyText.match(/\$(\d+(?:\.\d{1,2})?)/);
        const price = priceMatch ? parseFloat(priceMatch[1]) : null;
        
        // Debug: find text around "left" or "stock"
        const leftMatch = bodyText.match(/.{0,30}(left|stock|remaining|available).{0,30}/gi);
        
        return { 
          quantity, 
          quantityWarning, 
          quantitySource, 
          productName, 
          price,
          inStock,
          debugMatches: leftMatch?.slice(0, 3) || [],
        };
      });
      
      results.push({
        name: product.name || inventoryData.productName,
        url: product.url,
        ...inventoryData,
      });
      
      if (inventoryData.quantity !== null && inventoryData.quantity > 0) {
        console.log(`    ✅ Found: ${inventoryData.quantity} (${inventoryData.quantityWarning})`);
      } else if (!inventoryData.inStock || inventoryData.quantity === 0) {
        console.log(`    ⚠️  Out of stock`);
      } else {
        console.log(`    ❓ No inventory count found`);
        if (inventoryData.debugMatches.length > 0) {
          console.log(`    Debug matches:`, inventoryData.debugMatches);
        }
      }
      
      console.log(`    Product: ${inventoryData.productName || 'N/A'}`);
      console.log(`    Price: ${inventoryData.price ? '$' + inventoryData.price : 'N/A'}`);
      
    } catch (e) {
      console.log(`    ❌ Error: ${e.message}`);
      results.push({
        name: product.name,
        url: product.url,
        error: e.message,
      });
    }
    
    console.log('');
  }
  
  // Save screenshot of last product page
  await page.screenshot({ path: '/tmp/product-detail-test.png' });
  console.log('📸 Screenshot saved to /tmp/product-detail-test.png');
  
  await browser.close();
  
  // Summary
  console.log('\n========== SUMMARY ==========');
  console.log(`Products tested: ${results.length}`);
  const withQuantity = results.filter(r => r.quantity !== null && r.quantity > 0);
  const outOfStock = results.filter(r => r.quantity === 0 || r.inStock === false);
  const noData = results.filter(r => r.quantity === null && r.inStock !== false && !r.error);
  const errors = results.filter(r => r.error);
  
  console.log(`With exact quantity: ${withQuantity.length}`);
  console.log(`Out of stock: ${outOfStock.length}`);
  console.log(`No inventory data: ${noData.length}`);
  console.log(`Errors: ${errors.length}`);
  
  if (withQuantity.length > 0) {
    console.log('\n📊 Products with inventory:');
    withQuantity.forEach(p => {
      console.log(`  - ${(p.name || p.productName || 'Unknown').slice(0, 40)}: ${p.quantity} (${p.quantityWarning})`);
    });
  }
  
  console.log('\n✅ Test complete!');
}

test().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
