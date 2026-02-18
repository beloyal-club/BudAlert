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
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);
  
  // Find add to cart buttons and try to extract inventory
  console.log('Looking for add-to-cart buttons...');
  
  const cartButtons = await page.locator('button:has-text("Add")').all();
  console.log(`Found ${cartButtons.length} add buttons`);
  
  if (cartButtons.length > 0) {
    // Click first add to cart
    console.log('Clicking first add button...');
    await cartButtons[0].click();
    await page.waitForTimeout(2000);
    
    // Look for quantity input or error
    const pageText = await page.evaluate(() => document.body.innerText);
    
    // Check for inventory indicators
    const hasOnlyXLeft = pageText.match(/only (\d+) (left|available|in stock)/i);
    const hasLimitError = pageText.match(/limit(ed)? to (\d+)/i);
    const hasMaxQty = pageText.match(/max(imum)?\s*:?\s*(\d+)/i);
    
    console.log('\n--- INVENTORY INDICATORS ---');
    console.log('Only X left:', hasOnlyXLeft ? hasOnlyXLeft[0] : 'not found');
    console.log('Limit error:', hasLimitError ? hasLimitError[0] : 'not found');
    console.log('Max qty:', hasMaxQty ? hasMaxQty[0] : 'not found');
    
    // Try to find quantity input and set high value
    const qtyInput = page.locator('input[type="number"], input[name*="qty"], input[name*="quantity"]').first();
    if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('\nFound quantity input, setting to 999...');
      await qtyInput.fill('999');
      await page.waitForTimeout(1000);
      
      const newText = await page.evaluate(() => document.body.innerText);
      const errorMatch = newText.match(/(\d+)\s*(available|in stock|remaining|left)/i);
      console.log('After 999 qty - error:', errorMatch ? errorMatch[0] : 'no error found');
    }
    
    // Check cart for adjustments
    console.log('\nChecking for cart...');
    const cartText = await page.evaluate(() => {
      const cart = document.querySelector('[class*="cart"], [class*="Cart"], [data-testid*="cart"]');
      return cart ? cart.innerText : 'no cart element found';
    });
    console.log('Cart content:', cartText.slice(0, 200));
  }
  
  await browser.close();
  console.log('\nDone');
}

test().catch(e => console.error('Error:', e.message));
