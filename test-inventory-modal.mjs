import { chromium } from 'playwright';

const BROWSERBASE_API_KEY = 'bb_live_9DOgx7Trvyon7_zMAvtVxrpugDI';
const BROWSERBASE_PROJECT_ID = '5838b775-9417-42f0-b272-c0142eec43b7';
const URL = 'https://conbud.com/stores/conbud-les/products/flower';

async function test() {
  console.log('Connecting...');
  
  const browser = await chromium.connectOverCDP(
    `wss://connect.browserbase.com?apiKey=${BROWSERBASE_API_KEY}&projectId=${BROWSERBASE_PROJECT_ID}`,
    { timeout: 30000 }
  );
  
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();
  
  console.log('Loading page...');
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(5000);
  
  // Click on first product card (not the Add button, the product itself)
  console.log('Looking for product cards...');
  
  // Try clicking on a product name/image to open detail
  const productLink = page.locator('a[href*="/product/"], [class*="product-card"], [class*="ProductCard"]').first();
  
  if (await productLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('Clicking product card...');
    await productLink.click();
    await page.waitForTimeout(3000);
  } else {
    // Try clicking on product name text
    console.log('No card found, trying to click product text...');
    await page.click('text=Grocery | 28g Flower', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(3000);
  }
  
  // Check for modal or detail page
  const modalContent = await page.evaluate(() => {
    // Look for modal
    const modal = document.querySelector('[class*="modal"], [class*="Modal"], [role="dialog"], [class*="detail"], [class*="Detail"]');
    if (modal) return { type: 'modal', text: modal.innerText.slice(0, 2000) };
    
    // Check if URL changed (detail page)
    if (window.location.href.includes('/product/')) {
      return { type: 'detail_page', text: document.body.innerText.slice(0, 2000) };
    }
    
    return { type: 'none', text: document.body.innerText.slice(0, 1000) };
  });
  
  console.log('\nModal/Detail type:', modalContent.type);
  console.log('Content:', modalContent.text);
  
  // Look for quantity selector or inventory info
  const inventoryInfo = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasQtyInput: !!document.querySelector('input[type="number"], [class*="quantity"], [class*="Quantity"]'),
      hasInStock: text.includes('in stock'),
      hasAvailable: text.includes('available'),
      hasLeft: text.includes(' left'),
      quantityMatches: text.match(/(\d+)\s*(in stock|available|left|remaining)/gi),
      lowStockWarning: text.match(/low stock|only \d+|limited|few left/gi)
    };
  });
  
  console.log('\n--- INVENTORY INFO ---');
  console.log(JSON.stringify(inventoryInfo, null, 2));
  
  // If there's a qty input, try to set high value
  const qtyInput = page.locator('input[type="number"]').first();
  if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('\nFound qty input, trying to set 999...');
    await qtyInput.fill('999');
    await page.waitForTimeout(1500);
    
    const errorText = await page.evaluate(() => {
      const error = document.querySelector('[class*="error"], [class*="Error"], [class*="warning"], [class*="Warning"]');
      return error ? error.innerText : document.body.innerText.match(/(\d+)\s*(max|available|limit)/gi);
    });
    console.log('Error/warning after 999:', errorText);
  }
  
  await browser.close();
  console.log('\nDone');
}

test().catch(e => console.error('Error:', e.message));
