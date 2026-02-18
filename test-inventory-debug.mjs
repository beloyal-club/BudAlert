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
  console.log('Connected');
  
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();
  
  console.log('Loading page...');
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  
  // Wait longer for React
  console.log('Waiting 8s for React hydration...');
  await page.waitForTimeout(8000);
  
  // Debug: what's on the page
  const debug = await page.evaluate(() => {
    return {
      url: window.location.href,
      title: document.title,
      bodyLength: document.body.innerText.length,
      buttonCount: document.querySelectorAll('button').length,
      allButtonText: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).slice(0, 20),
      hasAddToCart: document.body.innerText.includes('Add'),
      hasPrices: document.body.innerText.includes('$'),
      sample: document.body.innerText.slice(0, 1500)
    };
  });
  
  console.log('\n--- DEBUG INFO ---');
  console.log('URL:', debug.url);
  console.log('Title:', debug.title);
  console.log('Body length:', debug.bodyLength);
  console.log('Button count:', debug.buttonCount);
  console.log('Button texts:', debug.allButtonText);
  console.log('Has "Add":', debug.hasAddToCart);
  console.log('Has "$":', debug.hasPrices);
  console.log('\nPage sample:\n', debug.sample);
  
  await browser.close();
}

test().catch(e => console.error('Error:', e.message));
