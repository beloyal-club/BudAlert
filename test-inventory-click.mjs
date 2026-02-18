import { chromium } from 'playwright';

const BROWSERBASE_API_KEY = 'bb_live_9DOgx7Trvyon7_zMAvtVxrpugDI';
const BROWSERBASE_PROJECT_ID = '5838b775-9417-42f0-b272-c0142eec43b7';
const URL = 'https://conbud.com/stores/conbud-les/products/flower';

async function test() {
  console.log('Connecting to BrowserBase...');
  
  const browser = await chromium.connectOverCDP(
    `wss://connect.browserbase.com?apiKey=${BROWSERBASE_API_KEY}&projectId=${BROWSERBASE_PROJECT_ID}`,
    { timeout: 30000 }
  );
  
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();
  
  console.log('Loading page...');
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(5000);
  
  // Find "Add to cart" buttons
  const addButtons = await page.locator('button:has-text("Add")').all();
  console.log(`Found ${addButtons.length} Add buttons`);
  
  if (addButtons.length > 0) {
    // Get the product name for context
    const firstProduct = await page.evaluate(() => {
      const products = document.body.innerText.match(/[\w\s|]+\n\w+\n(?:Sativa|Indica|Hybrid)[\s\S]*?Add/g);
      return products ? products[0] : 'unknown';
    });
    console.log('\nFirst product:', firstProduct.slice(0, 100));
    
    // Click add to cart multiple times to trigger limit
    console.log('\nClicking "Add to cart" 10 times rapidly...');
    for (let i = 0; i < 10; i++) {
      try {
        await addButtons[0].click({ timeout: 2000 });
        await page.waitForTimeout(300);
      } catch (e) {
        console.log(`Click ${i+1} failed:`, e.message.slice(0, 50));
        break;
      }
    }
    
    await page.waitForTimeout(2000);
    
    // Check for any inventory messages
    const afterText = await page.evaluate(() => document.body.innerText);
    
    console.log('\n--- INVENTORY INDICATORS ---');
    
    // Various patterns to look for
    const patterns = [
      /only (\d+) (left|available|remaining|in stock)/gi,
      /(\d+) (left|available|remaining|in stock)/gi,
      /limit(ed)? (of |to )?(\d+)/gi,
      /max(imum)?:?\s*(\d+)/gi,
      /can('t| not) add more/gi,
      /out of stock/gi,
      /sold out/gi,
      /(\d+) in (your )?cart/gi,
      /quantity.*(\d+)/gi
    ];
    
    for (const pattern of patterns) {
      const matches = afterText.match(pattern);
      if (matches) {
        console.log(`Pattern "${pattern.source}":`, matches.slice(0, 3));
      }
    }
    
    // Check cart count
    const cartCount = afterText.match(/(\d+)\s*items? in (your )?(?:shopping )?cart/i);
    console.log('\nCart count:', cartCount ? cartCount[0] : 'not found');
    
    // Look for error/warning toasts
    const toastOrModal = await page.evaluate(() => {
      const toast = document.querySelector('[class*="toast"], [class*="Toast"], [class*="alert"], [class*="Alert"], [class*="error"], [class*="Error"], [role="alert"]');
      return toast ? toast.innerText : null;
    });
    console.log('Toast/Alert:', toastOrModal || 'none');
    
    // Check if there's a cart drawer/modal
    const cartContent = await page.evaluate(() => {
      const cart = document.querySelector('[class*="cart"], [class*="Cart"], [class*="drawer"], [class*="Drawer"]');
      return cart ? cart.innerText.slice(0, 500) : null;
    });
    console.log('\nCart drawer content:', cartContent || 'not found');
  }
  
  await browser.close();
  console.log('\nDone');
}

test().catch(e => console.error('Error:', e.message));
