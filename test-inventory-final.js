// Final inventory extraction test - creates new BrowserBase session
import { chromium } from 'playwright';

const BROWSERBASE_API_KEY = 'bb_live_9DOgx7Trvyon7_zMAvtVxrpugDI';
const BROWSERBASE_PROJECT_ID = '5838b775-9417-42f0-b272-c0142eec43b7';

const TEST_URL = 'https://conbud.com/stores/conbud-les/products/flower';

async function test() {
  console.log('🚀 Inventory Extraction Test');
  console.log(`📍 Target: ${TEST_URL}\n`);

  console.log('🔌 Creating new BrowserBase session...');
  const browser = await chromium.connectOverCDP(
    `wss://connect.browserbase.com?apiKey=${BROWSERBASE_API_KEY}&projectId=${BROWSERBASE_PROJECT_ID}`
  );
  console.log('✅ Connected!');

  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();

  console.log('📄 Navigating...');
  await page.goto(TEST_URL, { waitUntil: 'networkidle', timeout: 60000 });
  
  // Wait for React
  console.log('⏳ Waiting for products to render...');
  await page.waitForTimeout(3000);

  // Extract products using the actual DOM structure from screenshot
  console.log('\n📦 STEP 1: Extracting product listing...');
  const products = await page.evaluate(() => {
    const results = [];
    
    // From the screenshot, products have:
    // - Image
    // - Name like "Grocery | 28g Flower - Sativa | Black Diesel"
    // - Brand like "Grocery" or "Splash"
    // - Type badge (Sativa, Hybrid)
    // - THC content
    // - Weight and Price on the right
    // - + button to add
    
    // Get all text containing prices - these are product rows
    const priceRegex = /\$\d+\.\d{2}/;
    const thcRegex = /THC:\s*([\d.]+)%/i;
    
    // Get all elements and find product containers
    const all = Array.from(document.querySelectorAll('*'));
    
    for (const el of all) {
      const text = el.innerText?.trim() || '';
      const rect = el.getBoundingClientRect();
      
      // Look for elements that contain product info
      if (text.includes('Flower') && priceRegex.test(text) && rect.height > 60 && rect.height < 250) {
        const priceMatch = text.match(/\$(\d+\.\d{2})/);
        const thcMatch = text.match(/THC:\s*([\d.]+)%/i);
        const weightMatch = text.match(/([\d.]+\s*(?:g|oz|1\/\d+\s*oz))/i);
        
        // Get product name - usually the longest line or one with "|"
        const lines = text.split('\n').filter(l => l.trim().length > 3);
        let name = '';
        for (const line of lines) {
          if (line.includes('|') && line.includes('Flower')) {
            name = line.trim();
            break;
          }
        }
        
        // Get brand - typically a short word after the name
        let brand = '';
        for (const line of lines) {
          if (line.length < 30 && !line.includes('$') && !line.includes('%') && !line.includes('|')) {
            brand = line.trim();
            break;
          }
        }
        
        // Look for stock warnings
        const stockMatch = text.match(/only (\d+)|(\d+) left|low stock|limited/i);
        
        if (name && priceMatch) {
          results.push({
            name,
            brand: brand || null,
            price: priceMatch[0],
            weight: weightMatch ? weightMatch[1] : null,
            thc: thcMatch ? thcMatch[1] + '%' : null,
            stockWarning: stockMatch ? stockMatch[0] : null
          });
        }
      }
    }
    
    // Dedupe
    const seen = new Set();
    return results.filter(p => {
      if (seen.has(p.name)) return false;
      seen.add(p.name);
      return true;
    });
  });

  console.log(`Found ${products.length} products:`);
  products.slice(0, 8).forEach((p, i) => {
    console.log(`  ${i+1}. ${p.name}`);
    console.log(`     Brand: ${p.brand || '-'} | Price: ${p.price} | THC: ${p.thc || '-'} | Stock: ${p.stockWarning || 'normal'}`);
  });

  // STEP 2: Try to get inventory via add-to-cart trick
  console.log('\n🛒 STEP 2: Testing add-to-cart for inventory limits...');
  
  try {
    // Click the first + button
    const addButton = await page.$('button:has-text("+")');
    if (addButton) {
      await addButton.click();
      console.log('Clicked + button');
      await page.waitForTimeout(2000);
      
      // Take screenshot of modal
      await page.screenshot({ path: '/tmp/modal-screenshot.png' });
      console.log('📸 Modal screenshot saved');
      
      // Check for modal/drawer
      const modalText = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"], [class*="modal"], [class*="Modal"], [class*="drawer"], [class*="Drawer"], [class*="sidebar"], [class*="Sidebar"]');
        if (modal) {
          return {
            found: true,
            text: modal.innerText?.substring(0, 2000) || '',
            hasQuantityInput: !!modal.querySelector('input[type="number"], [class*="quantity"], [class*="Quantity"]')
          };
        }
        
        // Maybe it added directly to cart - check for cart update
        const cart = document.querySelector('[class*="cart"], [class*="Cart"]');
        const cartText = cart?.innerText || '';
        const cartMatch = cartText.match(/(\d+)\s*items?/i);
        
        return {
          found: false,
          cartItems: cartMatch ? parseInt(cartMatch[1]) : null,
          cartText: cartText.substring(0, 500)
        };
      });
      
      console.log('Modal/cart state:', JSON.stringify(modalText, null, 2));
      
      if (modalText.found && modalText.hasQuantityInput) {
        console.log('\n🔢 STEP 3: Testing quantity limits...');
        
        // Find and manipulate quantity input
        const qtyInput = await page.$('[role="dialog"] input[type="number"], [class*="modal"] input[type="number"], input[type="number"]');
        if (qtyInput) {
          // Clear and type high number
          await qtyInput.fill('99');
          await page.waitForTimeout(500);
          
          // Look for error message or auto-correction
          const qtyResult = await page.evaluate(() => {
            const input = document.querySelector('[role="dialog"] input[type="number"], [class*="modal"] input[type="number"], input[type="number"]');
            const currentValue = input?.value;
            const max = input?.max;
            
            // Check for error messages
            const errorEl = document.querySelector('[class*="error"], [class*="Error"], [role="alert"], [class*="warning"]');
            const errorText = errorEl?.innerText || null;
            
            // Check for any "only X available" type messages
            const pageText = document.body?.innerText || '';
            const stockMatch = pageText.match(/only (\d+) (available|left|remaining)|max(?:imum)? (\d+)|limit(?:ed)? (?:to )?(\d+)/i);
            
            return {
              requestedQty: 99,
              actualQty: currentValue ? parseInt(currentValue) : null,
              maxAttribute: max ? parseInt(max) : null,
              errorMessage: errorText,
              stockLimitMatch: stockMatch ? { text: stockMatch[0], number: parseInt(stockMatch[1] || stockMatch[3] || stockMatch[4]) } : null
            };
          });
          
          console.log('Quantity test result:', JSON.stringify(qtyResult, null, 2));
          
          if (qtyResult.actualQty && qtyResult.actualQty < 99) {
            console.log(`\n🎯 INVENTORY DISCOVERED: Max quantity is ${qtyResult.actualQty}`);
          }
          if (qtyResult.maxAttribute) {
            console.log(`🎯 MAX ATTRIBUTE: ${qtyResult.maxAttribute}`);
          }
          if (qtyResult.stockLimitMatch) {
            console.log(`🎯 STOCK LIMIT: ${qtyResult.stockLimitMatch.text}`);
          }
        }
        
        // Try to actually add to cart and see if it adjusts
        const addToCartBtn = await page.$('button:has-text("Add"), button:has-text("add to cart"), button[class*="add-to-cart"]');
        if (addToCartBtn) {
          await addToCartBtn.click();
          await page.waitForTimeout(1500);
          
          // Check for any "adjusted" message
          const adjustMsg = await page.evaluate(() => {
            const text = document.body.innerText || '';
            const adjustMatch = text.match(/adjusted to (\d+)|changed to (\d+)|max(?:imum)? (\d+)/i);
            return adjustMatch ? adjustMatch[0] : null;
          });
          
          if (adjustMsg) {
            console.log(`🎯 CART ADJUSTMENT: ${adjustMsg}`);
          }
        }
      }
    }
  } catch (err) {
    console.log(`Add-to-cart test failed: ${err.message}`);
  }

  // Final screenshot
  await page.screenshot({ path: '/tmp/inventory-test-final.png', fullPage: false });
  console.log('\n📸 Final screenshot saved to /tmp/inventory-test-final.png');

  await browser.close();
  console.log('✅ Browser closed');

  // Summary
  console.log('\n========== SUMMARY ==========');
  console.log(`Products extracted: ${products.length}`);
  const withStockWarning = products.filter(p => p.stockWarning);
  console.log(`Products with stock warnings: ${withStockWarning.length}`);
  if (withStockWarning.length > 0) {
    withStockWarning.forEach(p => console.log(`  - ${p.name}: ${p.stockWarning}`));
  }
}

test().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
