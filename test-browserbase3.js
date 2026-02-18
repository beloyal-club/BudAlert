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
      
      console.log('  ⏳ Navigating...');
      await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      
      // Check for Cloudflare
      let pageContent = await page.content();
      let hasCloudflare = pageContent.includes('cf-browser-verification') || 
                          pageContent.includes('challenge-platform') ||
                          pageContent.includes('Just a moment');
      
      if (hasCloudflare) {
        console.log('  ⚠️ Cloudflare challenge detected, waiting...');
        await page.waitForTimeout(15000);
        pageContent = await page.content();
        hasCloudflare = pageContent.includes('cf-browser-verification') || 
                        pageContent.includes('Just a moment');
        if (hasCloudflare) {
          result.error = 'Cloudflare challenge not bypassed';
          console.log('  ❌ Still blocked by Cloudflare');
          results.push(result);
          await page.close();
          continue;
        }
      }
      
      console.log('  ✅ No Cloudflare! Checking for age gate...');
      
      // Wait a moment for JS to load
      await page.waitForTimeout(2000);
      
      // Check for age gate and click YES
      const bodyText = await page.evaluate(() => document.body.innerText);
      if (bodyText.includes('21 years old') || bodyText.includes('YES') || bodyText.includes('valid medical patient')) {
        console.log('  🚪 Age gate detected! Clicking YES...');
        
        // Try multiple ways to click the YES button
        try {
          // Try exact text match
          const yesButton = await page.$('button:has-text("YES"), a:has-text("YES"), [role="button"]:has-text("YES")');
          if (yesButton) {
            await yesButton.click();
            console.log('  ✅ Clicked YES button!');
          } else {
            // Try by text content
            await page.click('text=YES', { timeout: 5000 });
            console.log('  ✅ Clicked YES via text!');
          }
        } catch (clickErr) {
          console.log('  ⚠️ Could not click YES:', clickErr.message);
          // Try evaluating a click directly
          await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
            const yesBtn = buttons.find(b => b.textContent.trim() === 'YES');
            if (yesBtn) yesBtn.click();
          });
          console.log('  ✅ Clicked via JS evaluation');
        }
        
        // Wait for menu to load after age gate
        console.log('  ⏳ Waiting for menu to load...');
        await page.waitForTimeout(8000);
      }
      
      // Now extract products
      const productData = await page.evaluate(() => {
        const products = [];
        const bodyText = document.body.innerText || '';
        
        // Try various Dutchie selectors
        const selectors = [
          '[data-testid="product-card"]',
          '[class*="ProductCard"]',
          '[class*="product-card"]',
          '[class*="MenuProduct"]',
          '[class*="menu-product"]',
          'article',
          '[class*="Card"]'
        ];
        
        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            elements.forEach((el, i) => {
              if (i < 15 && el.textContent.length > 10) {
                const text = el.textContent.trim();
                // Look for price pattern
                const priceMatch = text.match(/\$(\d+(?:\.\d{2})?)/);
                if (priceMatch || text.length < 200) {
                  const name = el.querySelector('h2, h3, h4, [class*="name"], [class*="Name"], [class*="title"]')?.textContent?.trim() || 
                              text.split('\n')[0].substring(0, 60);
                  if (name && name.length > 3 && !name.includes('21 years')) {
                    products.push({ 
                      name: name.substring(0, 80), 
                      price: priceMatch ? `$${priceMatch[1]}` : 'N/A',
                      selector 
                    });
                  }
                }
              }
            });
            if (products.length >= 5) break;
          }
        }
        
        // Extract all prices from page
        const priceMatches = bodyText.match(/\$\d+(?:\.\d{2})?/g) || [];
        
        // Check for menu keywords
        const hasMenuWords = ['flower', 'edible', 'pre-roll', 'vape', 'concentrate', 'indica', 'sativa', 'hybrid', 'thc', 'cbd']
          .some(word => bodyText.toLowerCase().includes(word));
        
        return {
          products,
          pricesFound: priceMatches.slice(0, 20),
          bodyText: bodyText.substring(0, 4000),
          hasMenuWords,
          title: document.title
        };
      });
      
      result.success = true;
      result.products = productData.products;
      result.pricesFound = productData.pricesFound;
      result.hasMenuContent = productData.hasMenuWords;
      result.bodySample = productData.bodyText.substring(0, 1500);
      result.title = productData.title;
      
      console.log(`  📌 Page title: ${productData.title}`);
      console.log(`  📦 Found ${productData.products.length} products`);
      console.log(`  💵 Found ${productData.pricesFound.length} prices: ${productData.pricesFound.slice(0,8).join(', ')}`);
      console.log(`  📝 Has menu keywords: ${productData.hasMenuWords}`);
      
      if (productData.products.length > 0) {
        console.log('  🎉 Sample products:');
        productData.products.slice(0, 5).forEach(p => {
          console.log(`     - ${p.name}: ${p.price}`);
        });
      }
      
      // Take a screenshot for debugging
      // await page.screenshot({ path: `/tmp/dutchie-${Date.now()}.png` });
      
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
