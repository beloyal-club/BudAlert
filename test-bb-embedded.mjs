import { chromium } from 'playwright';

const BROWSERBASE_API_KEY = 'bb_live_9DOgx7Trvyon7_zMAvtVxrpugDI';
const BROWSERBASE_PROJECT_ID = '5838b775-9417-42f0-b272-c0142eec43b7';

// Embedded menu URL - bypasses CF and age gate
const EMBEDDED_URL = 'https://conbud.com/stores/conbud-les/products/flower';

async function test() {
  console.log('Connecting to BrowserBase...');
  
  const browser = await chromium.connectOverCDP(
    `wss://connect.browserbase.com?apiKey=${BROWSERBASE_API_KEY}&projectId=${BROWSERBASE_PROJECT_ID}`
  );
  console.log('✅ Connected');

  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  
  console.log('Loading embedded menu:', EMBEDDED_URL);
  await page.goto(EMBEDDED_URL, { waitUntil: 'load', timeout: 30000 });
  
  console.log('Waiting for content...');
  await page.waitForTimeout(5000);
  
  // Check content
  const state = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      url: window.location.href,
      hasProducts: text.includes('THC') || text.includes('$') || text.includes('Add'),
      hasCF: text.includes('Checking your browser') || text.includes('challenge'),
      divCount: document.querySelectorAll('div').length,
      bodyLen: text.length,
      sample: text.slice(0, 2000)
    };
  });
  
  console.log('\\nResults:');
  console.log('  URL:', state.url);
  console.log('  Divs:', state.divCount);
  console.log('  Body length:', state.bodyLen);
  console.log('  Has products:', state.hasProducts);
  console.log('  CF challenge:', state.hasCF);
  console.log('\\nPage content:');
  console.log(state.sample);
  
  await page.screenshot({ path: '/tmp/bb-embedded.png', fullPage: true });
  console.log('\\nScreenshot: /tmp/bb-embedded.png');
  
  await browser.close();
}

test().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
