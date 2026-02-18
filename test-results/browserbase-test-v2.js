import { chromium } from 'playwright';
import fs from 'fs';

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

async function run() {
  console.log('Connecting to BrowserBase...');
  
  let browser;
  try {
    browser = await chromium.connectOverCDP(
      `wss://connect.browserbase.com?apiKey=${API_KEY}&projectId=${PROJECT_ID}`,
      { timeout: 30000 }
    );
    console.log('Connected!');
  } catch (err) {
    console.error('Connection failed:', err.message);
    results.status = 'connection_failed';
    results.errors.push(err.message);
    fs.writeFileSync('/root/clawd/cannasignal/test-results/browserbase-inventory.json', JSON.stringify(results, null, 2));
    return;
  }
  
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();
  
  try {
    console.log('Navigating to:', TEST_URL);
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('Page loaded (DOM ready)');
    
    // Wait for content
    await delay(8000);
    console.log('Waited 8s for dynamic content');
    
    // Screenshot
    await page.screenshot({ path: '/root/clawd/cannasignal/test-results/page-loaded.png', fullPage: true });
    console.log('Screenshot saved');
    
    // Check what's on the page
    const pageTitle = await page.title();
    console.log('Page title:', pageTitle);
    results.observations.push(`Page title: ${pageTitle}`);
    
    // Check frames
    const frames = page.frames();
    console.log(`Found ${frames.length} frames`);
    results.observations.push(`Found ${frames.length} frames`);
    
    for (const frame of frames) {
      const url = frame.url();
      if (url && url !== 'about:blank') {
        console.log('  Frame:', url);
        results.observations.push(`Frame: ${url}`);
      }
    }
    
    // Look for Dutchie iframe specifically
    const dutchieFrame = frames.find(f => f.url().includes('dutchie'));
    
    if (dutchieFrame) {
      console.log('Found Dutchie frame!');
      results.methods_tried.push('dutchie_frame_interaction');
      
      // Wait for products in the iframe
      try {
        await dutchieFrame.waitForSelector('[data-testid="product-card"], .product-card, [class*="ProductCard"]', { timeout: 10000 });
        console.log('Products found in Dutchie frame');
        
        // Get product data from iframe
        const products = await dutchieFrame.evaluate(() => {
          const cards = document.querySelectorAll('[data-testid="product-card"], .product-card, [class*="ProductCard"]');
          return Array.from(cards).slice(0, 5).map(card => ({
            text: card.innerText.replace(/\s+/g, ' ').trim().substring(0, 200),
            hasStock: card.innerText.toLowerCase().includes('stock') || card.innerText.match(/only \d+/i)
          }));
        });
        
        console.log('Sample products:', JSON.stringify(products, null, 2));
        results.observations.push(`Found ${products.length} product cards in Dutchie`);
        
        // Try clicking on a product
        const firstProduct = await dutchieFrame.$('[data-testid="product-card"], .product-card, [class*="ProductCard"]');
        if (firstProduct) {
          await firstProduct.click();
          await delay(3000);
          await page.screenshot({ path: '/root/clawd/cannasignal/test-results/product-clicked.png', fullPage: true });
          
          // Look for add to cart
          const addBtn = await dutchieFrame.$('button:has-text("Add"), [data-testid*="add"], [class*="addToCart"]');
          if (addBtn) {
            console.log('Found add to cart button');
            results.methods_tried.push('add_to_cart_click');
            
            // Look for quantity input
            const qtyInput = await dutchieFrame.$('input[type="number"], input[name*="qty"], input[name*="quantity"]');
            if (qtyInput) {
              console.log('Found quantity input - trying high value');
              results.methods_tried.push('quantity_manipulation');
              
              await qtyInput.fill('999');
              await delay(500);
              
              // Check for validation
              const validation = await dutchieFrame.evaluate(() => {
                const errors = document.querySelectorAll('[class*="error"], [class*="Error"], [role="alert"]');
                return Array.from(errors).map(e => e.textContent).filter(t => t.trim());
              });
              
              if (validation.length > 0) {
                console.log('Validation messages:', validation);
                results.inventory_found.push({ method: 'quantity_validation', data: validation });
              }
            }
            
            // Click add button
            await addBtn.click();
            await delay(2000);
            await page.screenshot({ path: '/root/clawd/cannasignal/test-results/after-add.png', fullPage: true });
            
            // Check for stock error
            const errorText = await dutchieFrame.evaluate(() => {
              const body = document.body.innerText;
              const match = body.match(/only (\d+) (available|in stock|left)/i);
              return match ? match[0] : null;
            });
            
            if (errorText) {
              console.log('Found stock limit:', errorText);
              results.inventory_found.push({ method: 'add_to_cart_error', data: errorText });
            }
          }
        }
        
      } catch (e) {
        console.log('Could not find products in Dutchie frame:', e.message);
        results.errors.push('Dutchie frame products: ' + e.message);
      }
      
    } else {
      // No Dutchie frame - check main page
      console.log('No Dutchie iframe found, checking main page');
      results.methods_tried.push('main_page_extraction');
      
      // Get all text with potential stock info
      const pageText = await page.evaluate(() => document.body.innerText);
      
      // Look for stock patterns
      const stockMatches = pageText.match(/only \d+ (available|left|in stock)/gi) || [];
      const limitedMatches = pageText.match(/limited (stock|quantity)/gi) || [];
      const outOfStock = pageText.match(/out of stock/gi) || [];
      
      if (stockMatches.length > 0) {
        console.log('Stock matches:', stockMatches);
        results.inventory_found.push({ method: 'text_pattern', data: stockMatches });
      }
      
      results.observations.push(`Stock patterns found: ${stockMatches.length + limitedMatches.length + outOfStock.length}`);
      
      // Try to find and click a product
      const productLinks = await page.$$('a[href*="product"]');
      console.log(`Found ${productLinks.length} product links`);
      
      if (productLinks.length > 0) {
        await productLinks[0].click();
        await delay(3000);
        await page.screenshot({ path: '/root/clawd/cannasignal/test-results/product-page.png', fullPage: true });
      }
    }
    
    // Check for any API/XHR data
    results.methods_tried.push('dom_data_extraction');
    const domData = await page.evaluate(() => {
      // Check for embedded JSON data
      const scripts = document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"]');
      const jsonData = [];
      scripts.forEach(s => {
        try {
          const data = JSON.parse(s.textContent);
          if (JSON.stringify(data).includes('inventory') || JSON.stringify(data).includes('stock')) {
            jsonData.push(data);
          }
        } catch (e) {}
      });
      
      // Check window object for state
      const stateKeys = Object.keys(window).filter(k => 
        k.includes('__') || k.includes('STATE') || k.includes('DATA')
      );
      
      return { jsonData, stateKeys };
    });
    
    if (domData.jsonData.length > 0) {
      results.inventory_found.push({ method: 'embedded_json', data: domData.jsonData });
    }
    results.observations.push(`State keys found: ${domData.stateKeys.join(', ')}`);
    
    // Final status
    if (results.inventory_found.length > 0) {
      results.status = 'success';
    } else {
      results.status = 'no_inventory_found';
    }
    
  } catch (err) {
    console.error('Error:', err.message);
    results.errors.push(err.message);
    results.status = 'error';
    
    try {
      await page.screenshot({ path: '/root/clawd/cannasignal/test-results/error.png', fullPage: true });
    } catch (e) {}
  } finally {
    await browser.close();
  }
  
  console.log('\n=== RESULTS ===');
  console.log(JSON.stringify(results, null, 2));
  
  fs.writeFileSync('/root/clawd/cannasignal/test-results/browserbase-inventory.json', JSON.stringify(results, null, 2));
  console.log('\nResults written to browserbase-inventory.json');
}

run().catch(err => {
  console.error('Fatal:', err);
  results.status = 'fatal';
  results.errors.push(err.message);
  fs.writeFileSync('/root/clawd/cannasignal/test-results/browserbase-inventory.json', JSON.stringify(results, null, 2));
  process.exit(1);
});
