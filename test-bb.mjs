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
  
  console.log('Loading dutchie.com/dispensary/housing-works-cannabis-co/menu...');
  const response = await page.goto('https://dutchie.com/dispensary/housing-works-cannabis-co/menu', { 
    waitUntil: 'domcontentloaded',
    timeout: 30000 
  });
  
  console.log('Status:', response.status());
  console.log('URL:', page.url());
  console.log('Title:', await page.title());
  
  // Wait for content
  await page.waitForTimeout(5000);
  
  // Check for Cloudflare challenge
  const html = await page.content();
  const hasChallenge = html.includes('challenge') || html.includes('cf-') || html.includes('Checking your browser');
  console.log('Cloudflare challenge detected:', hasChallenge);
  
  // Look for product cards
  const productCount = await page.locator('[data-testid="product-card"], .product-card, [class*="ProductCard"]').count();
  console.log('Product cards found:', productCount);
  
  // Get some text content
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log('Body preview:', bodyText);
  
  // Screenshot
  await page.screenshot({ path: '/tmp/bb-test.png' });
  console.log('Screenshot saved to /tmp/bb-test.png');
  
  await browser.close();
}

test().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
