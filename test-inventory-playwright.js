// Direct Playwright test for inventory extraction without Stagehand
import { chromium } from 'playwright';

const BROWSERBASE_API_KEY = 'bb_live_9DOgx7Trvyon7_zMAvtVxrpugDI';
const BROWSERBASE_PROJECT_ID = '5838b775-9417-42f0-b272-c0142eec43b7';

// Use embedded menu URL - more reliable
const TEST_URL = 'https://conbud.com/stores/conbud-les/products/flower';

async function testInventory() {
  console.log('🚀 Playwright inventory extraction test');
  console.log(`📍 Target: ${TEST_URL}\n`);

  // Try to connect to existing session or create new one
  let browser;
  try {
    browser = await chromium.connectOverCDP(
      `wss://connect.browserbase.com?apiKey=${BROWSERBASE_API_KEY}&projectId=${BROWSERBASE_PROJECT_ID}`
    );
    console.log('✅ Connected to BrowserBase');
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    console.log('This might be due to a zombie session. Wait for it to expire (~10 mins) or check your BrowserBase dashboard.');
    return;
  }

  try {
    const context = browser.contexts()[0] || await browser.newContext();
    const page = await context.newPage();

    console.log('📄 Navigating...');
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Wait for React hydration
    console.log('⏳ Waiting for content...');
    await page.waitForTimeout(5000);

    // Check for iframe (Dutchie menus are usually in iframes)
    const frames = page.frames();
    console.log(`📐 Found ${frames.length} frames`);
    for (const frame of frames) {
      console.log(`  - ${frame.name() || 'main'}: ${frame.url()}`);
    }

    // Find the Dutchie iframe
    let dutchieFrame = null;
    for (const frame of frames) {
      if (frame.url().includes('dutchie.com')) {
        dutchieFrame = frame;
        console.log('✅ Found Dutchie iframe!');
        break;
      }
    }

    const targetFrame = dutchieFrame || page;

    // Extract product data
    console.log('\n📦 Extracting products from frame...');
    const products = await targetFrame.evaluate(() => {
      const results = [];
      
      // Common Dutchie product selectors
      const productCards = document.querySelectorAll(
        '[data-testid="product-card"], [class*="ProductCard"], [class*="product-card"], [class*="menu-product-card"]'
      );

      console.log('Found product cards:', productCards.length);

      productCards.forEach((card, i) => {
        if (i >= 10) return; // Limit to 10
        
        // Get product name
        const nameEl = card.querySelector('[class*="name"], [class*="Name"], h2, h3, h4');
        const name = nameEl?.textContent?.trim();
        
        // Get price
        const priceEl = card.querySelector('[class*="price"], [class*="Price"]');
        const price = priceEl?.textContent?.trim();
        
        // Get brand
        const brandEl = card.querySelector('[class*="brand"], [class*="Brand"]');
        const brand = brandEl?.textContent?.trim();

        // Check for low inventory warning
        const cardText = card.textContent || '';
        let inventoryWarning = null;
        const stockMatch = cardText.match(/only (\d+) left|(\d+) remaining|low stock/i);
        if (stockMatch) {
          inventoryWarning = stockMatch[0];
        }

        if (name) {
          results.push({ name, brand, price, inventoryWarning });
        }
      });

      return results;
    });

    console.log(`Found ${products.length} products:`);
    products.slice(0, 5).forEach(p => {
      console.log(`  - ${p.name} (${p.brand || 'no brand'}): ${p.price || 'no price'}${p.inventoryWarning ? ' ⚠️' + p.inventoryWarning : ''}`);
    });

    // Try clicking on first product to test detail view
    if (products.length > 0) {
      console.log('\n🖱️ Clicking first product...');
      try {
        await targetFrame.click('[data-testid="product-card"]:first-child, [class*="ProductCard"]:first-child');
        await page.waitForTimeout(2000);

        // Look for quantity controls in modal
        const quantityExists = await targetFrame.evaluate(() => {
          const quantityEl = document.querySelector('input[type="number"], [class*="quantity"], [data-testid="quantity"]');
          return !!quantityEl;
        });
        console.log(`Quantity selector visible: ${quantityExists}`);

        // Look for add to cart button
        const addToCartExists = await targetFrame.evaluate(() => {
          const btn = document.querySelector('button[class*="add-to-cart"], button[class*="AddToCart"], [data-testid="add-to-cart"]');
          return !!btn;
        });
        console.log(`Add to cart button visible: ${addToCartExists}`);

        // Try to extract inventory info from modal
        const modalInfo = await targetFrame.evaluate(() => {
          const modal = document.querySelector('[class*="modal"], [class*="Modal"], [role="dialog"]');
          if (!modal) return null;

          const text = modal.textContent || '';
          
          // Look for inventory indicators
          const stockMatch = text.match(/only (\d+) (left|available|remaining)|(\d+) in stock|stock: (\d+)|qty: (\d+)/i);
          
          return {
            hasModal: true,
            modalText: text.substring(0, 500),
            inventoryMatch: stockMatch ? stockMatch[0] : null
          };
        });

        if (modalInfo) {
          console.log('Modal info:', JSON.stringify(modalInfo, null, 2));
        }
      } catch (err) {
        console.log(`Click failed: ${err.message}`);
      }
    }

    await browser.close();
    console.log('\n✅ Browser closed');

  } catch (err) {
    console.error('❌ Error:', err.message);
    await browser.close();
  }
}

testInventory();
