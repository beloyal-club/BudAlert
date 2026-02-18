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

async function createSession() {
  const response = await fetch('https://www.browserbase.com/v1/sessions', {
    method: 'POST',
    headers: {
      'x-bb-api-key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ projectId: PROJECT_ID })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.status} ${await response.text()}`);
  }
  
  return response.json();
}

async function run() {
  console.log('Creating BrowserBase session...');
  
  let session;
  try {
    session = await createSession();
    console.log('Session created:', session.id);
    console.log('Connect URL:', session.connectUrl);
  } catch (err) {
    console.error('Session creation failed:', err.message);
    results.status = 'session_failed';
    results.errors.push(err.message);
    fs.writeFileSync('/root/clawd/cannasignal/test-results/browserbase-inventory.json', JSON.stringify(results, null, 2));
    return;
  }
  
  let browser;
  try {
    console.log('Connecting via CDP...');
    browser = await chromium.connectOverCDP(session.connectUrl, { timeout: 30000 });
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
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    console.log('Page loaded (DOM ready)');
    
    // Wait for content
    await delay(10000);
    console.log('Waited 10s for dynamic content');
    
    // Screenshot
    await page.screenshot({ path: '/root/clawd/cannasignal/test-results/page-loaded.png', fullPage: true });
    console.log('Screenshot saved');
    
    // Check what's on the page
    const pageTitle = await page.title();
    console.log('Page title:', pageTitle);
    results.observations.push(`Page title: ${pageTitle}`);
    
    // Get page HTML structure
    const structure = await page.evaluate(() => {
      const iframes = document.querySelectorAll('iframe');
      return {
        url: window.location.href,
        iframeCount: iframes.length,
        iframeSrcs: Array.from(iframes).map(f => f.src),
        bodyLength: document.body.innerHTML.length
      };
    });
    console.log('Page structure:', JSON.stringify(structure, null, 2));
    results.observations.push(`Iframes found: ${structure.iframeCount}`);
    
    // Check frames via Playwright
    const frames = page.frames();
    console.log(`Playwright frames: ${frames.length}`);
    
    let dutchieFrame = null;
    for (const frame of frames) {
      const url = frame.url();
      console.log('  Frame URL:', url);
      if (url.includes('dutchie') || url.includes('menu')) {
        dutchieFrame = frame;
        results.observations.push(`Dutchie frame: ${url}`);
      }
    }
    
    if (dutchieFrame) {
      console.log('\n=== DUTCHIE FRAME FOUND ===');
      results.methods_tried.push('dutchie_frame_interaction');
      
      // Wait a bit more for iframe content
      await delay(5000);
      
      // Try to find product cards
      const productData = await dutchieFrame.evaluate(() => {
        // Try different selectors
        const selectors = [
          '[data-testid="product-card"]',
          '.product-card',
          '[class*="ProductCard"]',
          '[class*="product-card"]',
          '.menu-product',
          '[class*="MenuProduct"]',
          '[data-algolia-objectid]',
          'div[id^="product-"]'
        ];
        
        for (const sel of selectors) {
          const cards = document.querySelectorAll(sel);
          if (cards.length > 0) {
            return {
              selector: sel,
              count: cards.length,
              samples: Array.from(cards).slice(0, 3).map(c => ({
                text: c.innerText.substring(0, 300),
                html: c.outerHTML.substring(0, 500)
              }))
            };
          }
        }
        
        // Fallback: get body text
        return {
          selector: 'none',
          count: 0,
          bodyText: document.body.innerText.substring(0, 1000)
        };
      });
      
      console.log('Product data from Dutchie:', JSON.stringify(productData, null, 2));
      results.observations.push(`Products via ${productData.selector}: ${productData.count}`);
      
      // Try clicking a product
      if (productData.count > 0) {
        try {
          console.log('Clicking first product...');
          const firstProduct = await dutchieFrame.$(productData.selector);
          if (firstProduct) {
            await firstProduct.click();
            await delay(3000);
            
            await page.screenshot({ path: '/root/clawd/cannasignal/test-results/after-product-click.png', fullPage: true });
            
            // Look for quantity selector and add to cart
            const productDetails = await dutchieFrame.evaluate(() => {
              // Get all visible text
              const text = document.body.innerText;
              
              // Look for quantity inputs
              const qtyInputs = document.querySelectorAll('input[type="number"], input[name*="qty"], input[name*="quantity"], [data-testid*="quantity"]');
              
              // Look for add buttons
              const addBtns = document.querySelectorAll('button');
              const addBtnTexts = Array.from(addBtns).filter(b => 
                b.textContent.toLowerCase().includes('add') || 
                b.textContent.toLowerCase().includes('cart')
              ).map(b => b.textContent.trim());
              
              // Look for stock indicators
              const stockMatch = text.match(/only (\d+) (available|left|in stock)/i);
              const lowStock = text.match(/low stock|limited|few left/i);
              
              return {
                qtyInputCount: qtyInputs.length,
                addButtons: addBtnTexts,
                stockIndicator: stockMatch ? stockMatch[0] : null,
                hasLowStock: !!lowStock,
                textSample: text.substring(0, 500)
              };
            });
            
            console.log('Product details:', JSON.stringify(productDetails, null, 2));
            
            if (productDetails.stockIndicator) {
              results.inventory_found.push({
                method: 'visible_stock_indicator',
                data: productDetails.stockIndicator
              });
            }
            
            // Try quantity manipulation
            if (productDetails.qtyInputCount > 0) {
              results.methods_tried.push('quantity_manipulation');
              console.log('Found quantity input - trying 999');
              
              const qtyInput = await dutchieFrame.$('input[type="number"], input[name*="qty"], input[name*="quantity"]');
              if (qtyInput) {
                await qtyInput.fill('999');
                await delay(1000);
                
                // Look for error
                const error = await dutchieFrame.evaluate(() => {
                  const errors = document.querySelectorAll('[class*="error"], [class*="Error"], [role="alert"], .validation-message');
                  const text = document.body.innerText;
                  const stockError = text.match(/only (\d+) (available|left|in stock)|maximum.*?(\d+)|limit.*?(\d+)/i);
                  return {
                    errorElements: Array.from(errors).map(e => e.textContent),
                    stockError: stockError ? stockError[0] : null
                  };
                });
                
                console.log('After quantity manipulation:', error);
                if (error.stockError) {
                  results.inventory_found.push({
                    method: 'quantity_error',
                    data: error.stockError
                  });
                }
              }
            }
            
            // Try add to cart
            if (productDetails.addButtons.length > 0) {
              results.methods_tried.push('add_to_cart');
              console.log('Clicking add to cart...');
              
              const addBtn = await dutchieFrame.$('button:has-text("Add"), button:has-text("add"), [data-testid*="add-to-cart"]');
              if (addBtn) {
                await addBtn.click();
                await delay(2000);
                
                await page.screenshot({ path: '/root/clawd/cannasignal/test-results/after-add-cart.png', fullPage: true });
                
                // Check for cart error/update
                const cartCheck = await dutchieFrame.evaluate(() => {
                  const text = document.body.innerText;
                  return {
                    hasCart: text.toLowerCase().includes('cart'),
                    stockLimit: text.match(/only (\d+)|max(?:imum)? (\d+)|limit (\d+)/i),
                    fullText: text.substring(0, 500)
                  };
                });
                
                console.log('Cart check:', cartCheck);
                if (cartCheck.stockLimit) {
                  results.inventory_found.push({
                    method: 'cart_stock_limit',
                    data: cartCheck.stockLimit[0]
                  });
                }
              }
            }
          }
        } catch (e) {
          console.log('Error interacting with product:', e.message);
          results.errors.push('Product interaction: ' + e.message);
        }
      }
      
    } else {
      console.log('No Dutchie iframe found - trying main page');
      results.observations.push('No Dutchie iframe detected');
      
      // Check if products are on main page
      const mainPageProducts = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          hasProducts: text.includes('flower') || text.includes('cannabis') || text.includes('THC'),
          stockMatches: text.match(/only \d+ (available|left)/gi) || [],
          textSample: text.substring(0, 1000)
        };
      });
      
      console.log('Main page check:', mainPageProducts);
    }
    
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
