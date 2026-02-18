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

async function createAndConnect() {
  // Create session
  console.log('Creating BrowserBase session...');
  const response = await fetch('https://www.browserbase.com/v1/sessions', {
    method: 'POST',
    headers: {
      'x-bb-api-key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      projectId: PROJECT_ID,
      keepAlive: true  // Keep alive longer
    })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.status} ${await response.text()}`);
  }
  
  const session = await response.json();
  console.log('Session created:', session.id);
  
  // Connect immediately
  console.log('Connecting via CDP...');
  const browser = await chromium.connectOverCDP(session.connectUrl, { timeout: 60000 });
  console.log('Connected to BrowserBase!');
  
  return { browser, sessionId: session.id };
}

async function run() {
  let browser, sessionId;
  
  try {
    const conn = await createAndConnect();
    browser = conn.browser;
    sessionId = conn.sessionId;
    results.observations.push(`Session: ${sessionId}`);
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
    await page.goto(TEST_URL, { waitUntil: 'load', timeout: 45000 });
    console.log('Page loaded');
    
    // Wait for content
    await delay(8000);
    console.log('Waited for dynamic content');
    
    // Screenshot
    await page.screenshot({ path: '/root/clawd/cannasignal/test-results/page-loaded.png', fullPage: true });
    console.log('Screenshot saved');
    
    // Check what's on the page
    const pageTitle = await page.title();
    console.log('Page title:', pageTitle);
    results.observations.push(`Page title: ${pageTitle}`);
    
    // Check frames via Playwright
    const frames = page.frames();
    console.log(`Found ${frames.length} frames`);
    
    let dutchieFrame = null;
    for (const frame of frames) {
      const url = frame.url();
      if (url && url !== 'about:blank') {
        console.log('  Frame:', url);
        if (url.includes('dutchie') || url.includes('embed')) {
          dutchieFrame = frame;
          results.observations.push(`Dutchie frame: ${url}`);
        }
      }
    }
    
    // Get page HTML for debugging
    const html = await page.content();
    fs.writeFileSync('/root/clawd/cannasignal/test-results/page-source.html', html);
    console.log('Saved page source');
    
    // Check for iframe src attributes
    const iframeSrcs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('iframe')).map(f => ({
        src: f.src,
        id: f.id,
        className: f.className
      }));
    });
    console.log('Iframes on page:', JSON.stringify(iframeSrcs, null, 2));
    results.observations.push(`Iframes: ${JSON.stringify(iframeSrcs)}`);
    
    if (dutchieFrame) {
      console.log('\n=== WORKING IN DUTCHIE FRAME ===');
      await exploreDutchieFrame(page, dutchieFrame, results);
    } else if (iframeSrcs.length > 0) {
      // Wait for iframe to be accessible
      console.log('Waiting for iframe content...');
      await delay(5000);
      
      const newFrames = page.frames();
      for (const frame of newFrames) {
        const url = frame.url();
        if (url.includes('dutchie') || url.includes('embed')) {
          console.log('Found Dutchie frame after wait:', url);
          dutchieFrame = frame;
          await exploreDutchieFrame(page, dutchieFrame, results);
          break;
        }
      }
    }
    
    if (!dutchieFrame) {
      console.log('No Dutchie iframe - checking main page content');
      await exploreMainPage(page, results);
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

async function exploreDutchieFrame(page, frame, results) {
  results.methods_tried.push('dutchie_frame_interaction');
  
  // Wait for frame content
  await delay(3000);
  
  // Get frame content
  const frameContent = await frame.evaluate(() => {
    return {
      url: window.location.href,
      bodyLength: document.body.innerHTML.length,
      textSample: document.body.innerText.substring(0, 500),
      hasDutchieApp: !!document.querySelector('#dutchie-root, [data-testid*="dutchie"]')
    };
  }).catch(e => ({ error: e.message }));
  
  console.log('Frame content:', JSON.stringify(frameContent, null, 2));
  
  // Look for products
  const products = await frame.evaluate(() => {
    const selectors = [
      '[data-testid="product-card"]',
      '[class*="product"]',
      '[class*="Product"]',
      'a[href*="/product"]',
      'div[data-algolia]'
    ];
    
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        return {
          selector: sel,
          count: els.length,
          samples: Array.from(els).slice(0, 3).map(e => e.innerText.substring(0, 200))
        };
      }
    }
    return { selector: 'none', count: 0 };
  }).catch(e => ({ error: e.message }));
  
  console.log('Products found:', JSON.stringify(products, null, 2));
  results.observations.push(`Products: ${products.count} via ${products.selector}`);
  
  if (products.count > 0) {
    // Try to click a product
    try {
      console.log('Clicking first product...');
      await frame.click(products.selector, { timeout: 5000 });
      await delay(3000);
      
      await page.screenshot({ path: '/root/clawd/cannasignal/test-results/product-detail.png', fullPage: true });
      
      // Look for inventory indicators
      await checkInventoryIndicators(frame, results);
      
      // Try add to cart flow
      await tryAddToCart(frame, results, page);
      
    } catch (e) {
      console.log('Could not click product:', e.message);
      results.errors.push('Product click: ' + e.message);
    }
  }
}

async function checkInventoryIndicators(frame, results) {
  const indicators = await frame.evaluate(() => {
    const text = document.body.innerText;
    
    // Pattern matching for stock indicators
    const patterns = [
      /only (\d+) (available|left|in stock)/gi,
      /(\d+) in stock/gi,
      /limited.*?(\d+)/gi,
      /max(?:imum)?\s*(?:of\s*)?(\d+)/gi,
      /quantity\s*limit[:\s]*(\d+)/gi
    ];
    
    const matches = [];
    for (const pattern of patterns) {
      const found = text.match(pattern);
      if (found) matches.push(...found);
    }
    
    return {
      matches,
      hasLowStock: /low stock|few left|limited stock|selling fast/i.test(text),
      hasOutOfStock: /out of stock|sold out|unavailable/i.test(text)
    };
  }).catch(e => ({ error: e.message }));
  
  console.log('Inventory indicators:', indicators);
  
  if (indicators.matches && indicators.matches.length > 0) {
    results.inventory_found.push({
      method: 'visible_indicator',
      data: indicators.matches
    });
  }
  
  if (indicators.hasLowStock) {
    results.observations.push('Low stock indicator present');
  }
}

async function tryAddToCart(frame, results, page) {
  results.methods_tried.push('add_to_cart_flow');
  
  // Find quantity input
  const hasQtyInput = await frame.$('input[type="number"], input[name*="qty"], input[name*="quantity"]');
  
  if (hasQtyInput) {
    console.log('Found quantity input - trying high value');
    results.methods_tried.push('quantity_manipulation');
    
    try {
      await hasQtyInput.fill('999');
      await delay(1000);
      
      // Check for validation error
      const validation = await frame.evaluate(() => {
        const text = document.body.innerText;
        const match = text.match(/only (\d+)|max(?:imum)?[\s:]*(\d+)|cannot exceed (\d+)|limit.*?(\d+)/i);
        return match ? match[0] : null;
      });
      
      if (validation) {
        console.log('Found quantity validation:', validation);
        results.inventory_found.push({
          method: 'quantity_validation',
          data: validation
        });
      }
    } catch (e) {
      console.log('Quantity input error:', e.message);
    }
  }
  
  // Try add to cart button
  const addBtnSelectors = [
    'button:has-text("Add to cart")',
    'button:has-text("Add to Cart")',
    'button:has-text("Add")',
    '[data-testid*="add"]',
    'button[class*="add"]'
  ];
  
  for (const sel of addBtnSelectors) {
    try {
      const btn = await frame.$(sel);
      if (btn) {
        console.log('Found add button:', sel);
        
        // Try adding multiple times to hit limit
        for (let i = 0; i < 3; i++) {
          await btn.click();
          await delay(1000);
        }
        
        await page.screenshot({ path: '/root/clawd/cannasignal/test-results/after-add.png', fullPage: true });
        
        // Check for stock limit message
        const limitMsg = await frame.evaluate(() => {
          const text = document.body.innerText;
          const patterns = [
            /only (\d+) (available|left|remaining)/i,
            /max(?:imum)?[:\s]*(\d+)/i,
            /cannot add more/i,
            /cart limit/i,
            /(\d+) available/i
          ];
          
          for (const p of patterns) {
            const m = text.match(p);
            if (m) return m[0];
          }
          return null;
        });
        
        if (limitMsg) {
          console.log('Found limit message:', limitMsg);
          results.inventory_found.push({
            method: 'add_to_cart_limit',
            data: limitMsg
          });
        }
        
        break;
      }
    } catch (e) {
      // Try next selector
    }
  }
}

async function exploreMainPage(page, results) {
  results.methods_tried.push('main_page_exploration');
  
  const pageData = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasProducts: text.includes('flower') || text.includes('THC') || text.includes('cannabis'),
      stockMatches: text.match(/only \d+ (available|left|in stock)/gi) || [],
      productCount: document.querySelectorAll('a[href*="product"]').length,
      textSample: text.substring(0, 1000)
    };
  });
  
  console.log('Main page data:', pageData);
  
  if (pageData.stockMatches.length > 0) {
    results.inventory_found.push({
      method: 'main_page_text',
      data: pageData.stockMatches
    });
  }
}

run().catch(err => {
  console.error('Fatal:', err);
  results.status = 'fatal';
  results.errors.push(err.message);
  fs.writeFileSync('/root/clawd/cannasignal/test-results/browserbase-inventory.json', JSON.stringify(results, null, 2));
  process.exit(1);
});
