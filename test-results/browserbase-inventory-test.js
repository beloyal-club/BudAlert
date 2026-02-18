import { chromium } from 'playwright';

const API_KEY = 'bb_live_9DOgx7Trvyon7_zMAvtVxrpugDI';
const PROJECT_ID = '5838b775-9417-42f0-b272-c0142eec43b7';
const TEST_URL = 'https://conbud.com/stores/conbud-les/products/flower';

const results = {
  timestamp: new Date().toISOString(),
  url: TEST_URL,
  status: 'unknown',
  methods_tried: [],
  inventory_found: [],
  errors: [],
  observations: []
};

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testInventoryExtraction() {
  console.log('Connecting to BrowserBase...');
  
  const browser = await chromium.connectOverCDP(
    `wss://connect.browserbase.com?apiKey=${API_KEY}&projectId=${PROJECT_ID}`
  );
  
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();
  
  try {
    console.log('Navigating to:', TEST_URL);
    await page.goto(TEST_URL, { waitUntil: 'networkidle', timeout: 60000 });
    
    // Wait for potential iframe/embedded menu to load
    await delay(5000);
    
    // Take screenshot of initial state
    await page.screenshot({ path: '/root/clawd/cannasignal/test-results/initial-page.png', fullPage: true });
    console.log('Saved initial screenshot');
    
    // METHOD 1: Check for Dutchie iframe
    results.methods_tried.push('dutchie_iframe_detection');
    const iframes = await page.frames();
    console.log(`Found ${iframes.length} frames`);
    results.observations.push(`Found ${iframes.length} frames on page`);
    
    for (const frame of iframes) {
      const url = frame.url();
      console.log('Frame URL:', url);
      if (url.includes('dutchie') || url.includes('iframe')) {
        results.observations.push(`Dutchie iframe found: ${url}`);
      }
    }
    
    // METHOD 2: Look for product cards with stock indicators
    results.methods_tried.push('stock_indicator_text_search');
    const stockTexts = await page.evaluate(() => {
      const patterns = [
        /only \d+ left/i,
        /\d+ in stock/i,
        /limited stock/i,
        /low stock/i,
        /out of stock/i,
        /available: \d+/i
      ];
      
      const allText = document.body.innerText;
      const matches = [];
      for (const pattern of patterns) {
        const match = allText.match(new RegExp(pattern.source, 'gi'));
        if (match) matches.push(...match);
      }
      return matches;
    });
    
    if (stockTexts.length > 0) {
      console.log('Found stock indicators:', stockTexts);
      results.inventory_found.push({ method: 'text_search', data: stockTexts });
    } else {
      results.observations.push('No visible stock indicators on product cards');
    }
    
    // METHOD 3: Find and click first product to see details
    results.methods_tried.push('product_detail_page');
    
    // Look for product cards/links
    const productSelectors = [
      '[data-testid="product-card"]',
      '.product-card',
      '.product-tile',
      'a[href*="product"]',
      '.menu-product',
      '[class*="ProductCard"]'
    ];
    
    let productClicked = false;
    for (const selector of productSelectors) {
      const products = await page.$$(selector);
      if (products.length > 0) {
        console.log(`Found ${products.length} products with selector: ${selector}`);
        results.observations.push(`Found ${products.length} products via ${selector}`);
        
        // Click first product
        try {
          await products[0].click();
          await delay(3000);
          productClicked = true;
          await page.screenshot({ path: '/root/clawd/cannasignal/test-results/product-detail.png', fullPage: true });
          break;
        } catch (e) {
          console.log('Could not click product:', e.message);
        }
      }
    }
    
    // METHOD 4: Look for quantity input and add-to-cart
    results.methods_tried.push('quantity_input_manipulation');
    
    const quantityInput = await page.$('input[type="number"], input[name*="quantity"], input[name*="qty"], [data-testid="quantity-input"]');
    if (quantityInput) {
      results.observations.push('Found quantity input field');
      
      // Try setting high quantity
      await quantityInput.fill('999');
      await delay(1000);
      
      // Look for validation message
      const validationMsg = await page.evaluate(() => {
        const msgs = document.querySelectorAll('.error, .validation, [class*="error"], [class*="Error"]');
        return Array.from(msgs).map(m => m.textContent).filter(t => t.trim());
      });
      
      if (validationMsg.length > 0) {
        console.log('Validation messages:', validationMsg);
        results.inventory_found.push({ method: 'quantity_validation', data: validationMsg });
      }
    }
    
    // METHOD 5: Click add-to-cart button
    results.methods_tried.push('add_to_cart_button');
    
    const addToCartSelectors = [
      'button:has-text("Add to cart")',
      'button:has-text("Add to Cart")',
      'button:has-text("ADD")',
      '[data-testid="add-to-cart"]',
      '.add-to-cart',
      'button[class*="addToCart"]'
    ];
    
    for (const selector of addToCartSelectors) {
      try {
        const btn = await page.$(selector);
        if (btn) {
          console.log('Found add-to-cart button');
          results.observations.push(`Found add-to-cart button: ${selector}`);
          
          await btn.click();
          await delay(2000);
          
          // Check for error messages or cart updates
          const pageText = await page.evaluate(() => document.body.innerText);
          const stockMatch = pageText.match(/only (\d+) (available|in stock|left)/i);
          if (stockMatch) {
            console.log('Found stock limit:', stockMatch[0]);
            results.inventory_found.push({ 
              method: 'add_to_cart_error', 
              data: stockMatch[0],
              quantity: parseInt(stockMatch[1])
            });
          }
          
          await page.screenshot({ path: '/root/clawd/cannasignal/test-results/after-add-cart.png', fullPage: true });
          break;
        }
      } catch (e) {
        // Selector not found or error
      }
    }
    
    // METHOD 6: Check network requests for inventory data
    results.methods_tried.push('network_inspection');
    
    // Navigate again while capturing network
    const inventoryRequests = [];
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('inventory') || url.includes('stock') || url.includes('product')) {
        try {
          const body = await response.text();
          if (body.includes('quantity') || body.includes('inventory') || body.includes('stock')) {
            inventoryRequests.push({ url, preview: body.substring(0, 500) });
          }
        } catch (e) {}
      }
    });
    
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await delay(3000);
    
    if (inventoryRequests.length > 0) {
      results.inventory_found.push({ method: 'network_requests', data: inventoryRequests });
    }
    
    // METHOD 7: Extract all visible product data
    results.methods_tried.push('full_page_extraction');
    
    const pageData = await page.evaluate(() => {
      // Get all text content that might be product-related
      const products = [];
      
      // Try common product container patterns
      const containers = document.querySelectorAll('[class*="product"], [class*="Product"], [class*="menu-item"], [class*="MenuItem"]');
      
      containers.forEach(container => {
        const text = container.innerText;
        if (text.length > 10 && text.length < 500) {
          products.push(text.replace(/\s+/g, ' ').trim());
        }
      });
      
      return products.slice(0, 10); // First 10
    });
    
    results.observations.push(`Extracted ${pageData.length} potential product texts`);
    
    // Final screenshot
    await page.screenshot({ path: '/root/clawd/cannasignal/test-results/final-state.png', fullPage: true });
    
    // Determine success
    if (results.inventory_found.length > 0) {
      results.status = 'partial_success';
    } else {
      results.status = 'no_inventory_found';
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    results.errors.push(error.message);
    results.status = 'error';
    
    try {
      await page.screenshot({ path: '/root/clawd/cannasignal/test-results/error-state.png', fullPage: true });
    } catch (e) {}
    
  } finally {
    await browser.close();
  }
  
  return results;
}

import fs from 'fs';

// Run test
console.log('Starting BrowserBase inventory extraction test...\n');

testInventoryExtraction()
  .then(results => {
    console.log('\n=== RESULTS ===');
    console.log(JSON.stringify(results, null, 2));
    
    // Write results to file
    fs.writeFileSync(
      '/root/clawd/cannasignal/test-results/browserbase-inventory.json',
      JSON.stringify(results, null, 2)
    );
    console.log('\nResults written to browserbase-inventory.json');
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
