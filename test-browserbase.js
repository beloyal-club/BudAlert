import { chromium } from 'playwright';

const BROWSERBASE_API_KEY = 'bb_live_9DOgx7Trvyon7_zMAvtVxrpugDI';
const BROWSERBASE_PROJECT_ID = '5838b775-9417-42f0-b272-c0142eec43b7';

const TEST_URLS = [
  'https://dutchie.com/dispensary/housing-works-cannabis-co/menu',
  'https://dutchie.com/dispensary/the-cannabis-place/menu'
];

async function testBrowserBase() {
  console.log('🔌 Connecting to BrowserBase...');
  
  let browser;
  try {
    browser = await chromium.connectOverCDP(
      `wss://connect.browserbase.com?apiKey=${BROWSERBASE_API_KEY}&projectId=${BROWSERBASE_PROJECT_ID}`
    );
    console.log('✅ Connected to BrowserBase!');
  } catch (err) {
    console.error('❌ Failed to connect to BrowserBase:', err.message);
    return { success: false, error: 'Connection failed: ' + err.message };
  }

  const results = [];

  for (const url of TEST_URLS) {
    console.log(`\n📄 Testing: ${url}`);
    const result = { url, success: false, products: [], error: null };
    
    try {
      const context = browser.contexts()[0] || await browser.newContext();
      const page = await context.newPage();
      
      // Navigate with longer timeout for CF bypass
      console.log('  ⏳ Navigating (waiting up to 60s for CF bypass)...');
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      
      // Check page title and content
      const title = await page.title();
      console.log(`  📌 Page title: ${title}`);
      
      // Check for Cloudflare challenge indicators
      const pageContent = await page.content();
      const hasCloudflare = pageContent.includes('cf-browser-verification') || 
                            pageContent.includes('challenge-platform') ||
                            pageContent.includes('Just a moment...');
      
      if (hasCloudflare) {
        console.log('  ⚠️ Cloudflare challenge detected, waiting 10s...');
        await page.waitForTimeout(10000);
        const newContent = await page.content();
        const stillBlocked = newContent.includes('cf-browser-verification') || 
                             newContent.includes('challenge-platform') ||
                             newContent.includes('Just a moment...');
        if (stillBlocked) {
          result.error = 'Cloudflare challenge not bypassed';
          console.log('  ❌ Still blocked by Cloudflare');
          results.push(result);
          await page.close();
          continue;
        }
      }
      
      console.log('  ✅ Page loaded! Looking for products...');
      
      // Wait for menu content to load
      await page.waitForTimeout(3000);
      
      // Try to find product elements - Dutchie uses various selectors
      const productData = await page.evaluate(() => {
        const products = [];
        
        // Try common Dutchie product selectors
        const selectors = [
          '[data-testid="product-card"]',
          '[class*="ProductCard"]',
          '[class*="product-card"]',
          '[class*="menu-product"]',
          'article[class*="product"]',
          '.product-name',
          '[data-algolia-product-id]'
        ];
        
        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            elements.forEach((el, i) => {
              if (i < 10) { // Limit to first 10
                const name = el.querySelector('[class*="name"], h3, h4, [class*="title"]')?.textContent?.trim();
                const price = el.querySelector('[class*="price"], [class*="Price"]')?.textContent?.trim();
                if (name) {
                  products.push({ name, price: price || 'N/A', selector });
                }
              }
            });
            break;
          }
        }
        
        // If no products found with specific selectors, try getting any visible product-like text
        if (products.length === 0) {
          // Look for price patterns
          const allText = document.body.innerText;
          const priceMatches = allText.match(/\$\d+(?:\.\d{2})?/g);
          if (priceMatches && priceMatches.length > 0) {
            products.push({ 
              name: 'Price patterns found on page', 
              price: priceMatches.slice(0, 5).join(', '),
              selector: 'text-scan'
            });
          }
        }
        
        return {
          products,
          bodyText: document.body.innerText.substring(0, 2000),
          hasMenu: document.body.innerText.toLowerCase().includes('menu') || 
                   document.body.innerText.toLowerCase().includes('flower') ||
                   document.body.innerText.toLowerCase().includes('edible')
        };
      });
      
      result.success = true;
      result.products = productData.products;
      result.hasMenuContent = productData.hasMenu;
      result.bodySample = productData.bodyText.substring(0, 500);
      
      console.log(`  📦 Found ${productData.products.length} products`);
      if (productData.products.length > 0) {
        productData.products.slice(0, 3).forEach(p => {
          console.log(`     - ${p.name}: ${p.price}`);
        });
      }
      console.log(`  📝 Has menu content: ${productData.hasMenu}`);
      
      await page.close();
    } catch (err) {
      result.error = err.message;
      console.log(`  ❌ Error: ${err.message}`);
    }
    
    results.push(result);
  }

  await browser.close();
  console.log('\n🔌 Browser closed');
  
  return { success: true, results };
}

testBrowserBase()
  .then(data => {
    console.log('\n========== FINAL RESULTS ==========');
    console.log(JSON.stringify(data, null, 2));
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
