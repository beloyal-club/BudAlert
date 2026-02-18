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
      
      // Navigate with 'load' instead of 'networkidle' - more reliable
      console.log('  ⏳ Navigating (using load strategy)...');
      await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      
      // Get initial state
      const title = await page.title();
      console.log(`  📌 Page title: ${title}`);
      
      // Check for Cloudflare challenge
      let pageContent = await page.content();
      let hasCloudflare = pageContent.includes('cf-browser-verification') || 
                          pageContent.includes('challenge-platform') ||
                          pageContent.includes('Just a moment...') ||
                          title.includes('Just a moment');
      
      if (hasCloudflare) {
        console.log('  ⚠️ Cloudflare challenge detected, waiting up to 30s for bypass...');
        
        // Wait for Cloudflare to resolve
        for (let i = 0; i < 6; i++) {
          await page.waitForTimeout(5000);
          pageContent = await page.content();
          const newTitle = await page.title();
          hasCloudflare = pageContent.includes('cf-browser-verification') || 
                          pageContent.includes('challenge-platform') ||
                          pageContent.includes('Just a moment...') ||
                          newTitle.includes('Just a moment');
          
          if (!hasCloudflare) {
            console.log(`  ✅ Cloudflare bypassed after ${(i+1)*5}s!`);
            break;
          }
          console.log(`  ⏳ Still waiting... (${(i+1)*5}s)`);
        }
        
        if (hasCloudflare) {
          result.error = 'Cloudflare challenge not bypassed after 30s';
          console.log('  ❌ Still blocked by Cloudflare');
          results.push(result);
          await page.close();
          continue;
        }
      }
      
      console.log('  ✅ No Cloudflare block! Waiting for menu content...');
      
      // Wait for dynamic content to load
      await page.waitForTimeout(5000);
      
      // Try to find product elements
      const productData = await page.evaluate(() => {
        const products = [];
        
        // Get page info
        const bodyText = document.body.innerText || '';
        
        // Try common Dutchie product selectors
        const selectors = [
          '[data-testid="product-card"]',
          '[class*="ProductCard"]',
          '[class*="product-card"]',
          '[class*="menu-product"]',
          'article[class*="product"]',
          '[data-algolia-product-id]',
          '[class*="Menu"] [class*="Card"]'
        ];
        
        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            elements.forEach((el, i) => {
              if (i < 10) {
                const name = el.querySelector('[class*="name"], h3, h4, h2, [class*="title"], [class*="Name"], [class*="Title"]')?.textContent?.trim();
                const price = el.querySelector('[class*="price"], [class*="Price"]')?.textContent?.trim();
                if (name && name.length > 2) {
                  products.push({ name: name.substring(0, 80), price: price || 'N/A', selector });
                }
              }
            });
            if (products.length > 0) break;
          }
        }
        
        // Also look for any price patterns
        const priceMatches = bodyText.match(/\$\d+(?:\.\d{2})?/g) || [];
        
        return {
          products,
          pricesFound: priceMatches.slice(0, 10),
          bodyText: bodyText.substring(0, 3000),
          hasMenuWords: bodyText.toLowerCase().includes('flower') || 
                        bodyText.toLowerCase().includes('edible') ||
                        bodyText.toLowerCase().includes('pre-roll') ||
                        bodyText.toLowerCase().includes('vape'),
          html: document.documentElement.outerHTML.substring(0, 2000)
        };
      });
      
      result.success = true;
      result.products = productData.products;
      result.pricesFound = productData.pricesFound;
      result.hasMenuContent = productData.hasMenuWords;
      result.bodySample = productData.bodyText.substring(0, 1000);
      
      console.log(`  📦 Found ${productData.products.length} products`);
      console.log(`  💵 Found ${productData.pricesFound.length} prices: ${productData.pricesFound.slice(0,5).join(', ')}`);
      console.log(`  📝 Has menu words (flower/edible/etc): ${productData.hasMenuWords}`);
      
      if (productData.products.length > 0) {
        console.log('  🎉 Sample products:');
        productData.products.slice(0, 5).forEach(p => {
          console.log(`     - ${p.name}: ${p.price}`);
        });
      }
      
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
