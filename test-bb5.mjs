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
  
  // Set a realistic viewport
  await page.setViewportSize({ width: 1280, height: 800 });
  
  console.log('Loading Dutchie Housing Works...');
  await page.goto('https://dutchie.com/dispensary/housing-works-cannabis-co/menu', { 
    waitUntil: 'load',
    timeout: 30000 
  });
  
  // Wait for React to hydrate
  console.log('Waiting for React hydration...');
  await page.waitForTimeout(5000);
  
  // Check HTML structure
  const htmlLen = await page.evaluate(() => document.documentElement.outerHTML.length);
  console.log('HTML length:', htmlLen);
  
  // Click YES via JavaScript
  console.log('Clicking YES...');
  await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => {
      if (btn.textContent.trim() === 'YES') {
        console.log('Found YES button, clicking...');
        btn.click();
      }
    });
  });
  
  // Wait for menu to load after age gate
  console.log('Waiting 8 seconds for menu...');
  await page.waitForTimeout(8000);
  
  // Try to wait for specific elements
  try {
    await page.waitForSelector('[data-testid="product-card"]', { timeout: 5000 });
    console.log('✅ Found product cards!');
  } catch (e) {
    console.log('❌ No product cards found with data-testid');
  }
  
  // Check final state
  const state = await page.evaluate(() => {
    return {
      url: window.location.href,
      title: document.title,
      htmlLen: document.documentElement.outerHTML.length,
      bodyText: document.body.innerText.slice(0, 3000),
      hasProducts: document.body.innerText.includes('THC') || document.body.innerText.includes('$'),
      divCount: document.querySelectorAll('div').length,
      imgCount: document.querySelectorAll('img').length
    };
  });
  
  console.log('\\nFinal state:');
  console.log('  URL:', state.url);
  console.log('  Title:', state.title);
  console.log('  HTML length:', state.htmlLen);
  console.log('  Div count:', state.divCount);
  console.log('  Img count:', state.imgCount);
  console.log('  Has products:', state.hasProducts);
  console.log('\\nBody text:');
  console.log(state.bodyText);
  
  await page.screenshot({ path: '/tmp/bb-final.png', fullPage: true });
  console.log('\\nScreenshot: /tmp/bb-final.png');
  
  await browser.close();
}

test().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
