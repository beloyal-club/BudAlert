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
    waitUntil: 'networkidle',
    timeout: 45000 
  });
  
  console.log('Page loaded. Taking screenshot 1...');
  await page.screenshot({ path: '/tmp/bb-1.png' });
  
  // Try clicking YES with multiple strategies
  console.log('Trying to click YES button...');
  
  // Strategy 1: text selector
  try {
    await page.click('text=YES', { timeout: 3000 });
    console.log('✅ Clicked via text=YES');
  } catch (e) {
    console.log('❌ text=YES failed');
  }
  
  await page.waitForTimeout(2000);
  
  // Strategy 2: button with exact text
  try {
    await page.click('button:has-text("YES")', { timeout: 3000 });
    console.log('✅ Clicked via button:has-text');
  } catch (e) {
    console.log('❌ button:has-text failed');
  }
  
  await page.waitForTimeout(2000);
  console.log('Taking screenshot 2...');
  await page.screenshot({ path: '/tmp/bb-2.png' });
  
  // Check what's on page now
  const url = page.url();
  console.log('Current URL:', url);
  
  // Look for menu content
  const hasMenu = await page.evaluate(() => {
    const text = document.body.innerText;
    return text.includes('Flower') || text.includes('Edibles') || text.includes('Vape') || text.includes('Add to cart');
  });
  console.log('Has menu content:', hasMenu);
  
  // Get page text
  const text = await page.evaluate(() => document.body.innerText.slice(0, 1500));
  console.log('\nPage text:\n', text);
  
  await browser.close();
}

test().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
