import { chromium } from 'playwright';

const BROWSERBASE_API_KEY = 'bb_live_9DOgx7Trvyon7_zMAvtVxrpugDI';
const BROWSERBASE_PROJECT_ID = '5838b775-9417-42f0-b272-c0142eec43b7';

async function test() {
  console.log('Connecting to BrowserBase...');
  
  const browser = await chromium.connectOverCDP(
    `wss://connect.browserbase.com?apiKey=${BROWSERBASE_API_KEY}&projectId=${BROWSERBASE_PROJECT_ID}`
  );
  console.log('✅ Connected');

  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();
  
  console.log('Loading Dutchie Housing Works...');
  await page.goto('https://dutchie.com/dispensary/housing-works-cannabis-co/menu', { 
    waitUntil: 'domcontentloaded',
    timeout: 30000 
  });
  
  // Click age verification YES button
  console.log('Looking for age gate...');
  const yesButton = page.getByRole('button', { name: /yes/i });
  if (await yesButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('Clicking YES on age gate...');
    await yesButton.click();
    await page.waitForTimeout(3000);
  }
  
  console.log('URL after age gate:', page.url());
  
  // Wait for products to load
  console.log('Waiting for products...');
  await page.waitForTimeout(5000);
  
  // Try to find products
  const products = await page.evaluate(() => {
    // Look for product elements
    const items = [];
    
    // Try various selectors
    const cards = document.querySelectorAll('[data-testid*="product"], [class*="product"], [class*="Product"], [class*="menu-item"]');
    cards.forEach(card => {
      const name = card.querySelector('[class*="name"], [class*="Name"], h3, h4')?.textContent?.trim();
      const price = card.querySelector('[class*="price"], [class*="Price"]')?.textContent?.trim();
      if (name) items.push({ name, price });
    });
    
    return items.slice(0, 10);
  });
  
  console.log('Products found:', products.length);
  products.forEach((p, i) => console.log(`  ${i+1}. ${p.name} - ${p.price || 'no price'}`));
  
  // Get page text for debugging
  const text = await page.evaluate(() => document.body.innerText.slice(0, 1000));
  console.log('\nPage content preview:\n', text);
  
  await page.screenshot({ path: '/tmp/bb-test2.png' });
  console.log('\nScreenshot: /tmp/bb-test2.png');
  
  await browser.close();
}

test().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
