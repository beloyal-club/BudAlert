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
  
  // Wait for page to render
  await page.waitForTimeout(3000);
  console.log('Page loaded. URL:', page.url());
  
  // Screenshot before click
  await page.screenshot({ path: '/tmp/bb-before.png' });
  console.log('Screenshot: /tmp/bb-before.png');
  
  // Find and click YES - use evaluate to click directly
  console.log('Looking for YES button...');
  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, [role="button"], a'));
    for (const btn of buttons) {
      if (btn.textContent.trim().toUpperCase() === 'YES') {
        btn.click();
        return true;
      }
    }
    return false;
  });
  console.log('Clicked YES:', clicked);
  
  // Wait for navigation/content
  await page.waitForTimeout(5000);
  console.log('After click URL:', page.url());
  
  // Screenshot after click
  await page.screenshot({ path: '/tmp/bb-after.png' });
  console.log('Screenshot: /tmp/bb-after.png');
  
  // Check for menu content
  const content = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasFlower: text.includes('Flower'),
      hasEdibles: text.includes('Edibles'),
      hasVape: text.includes('Vape'),
      hasCart: text.includes('cart'),
      sample: text.slice(0, 2000)
    };
  });
  
  console.log('Menu categories found:');
  console.log('  Flower:', content.hasFlower);
  console.log('  Edibles:', content.hasEdibles);
  console.log('  Vape:', content.hasVape);
  console.log('  Cart:', content.hasCart);
  console.log('\nPage content:\n', content.sample);
  
  await browser.close();
  console.log('\n✅ Test complete');
}

test().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
