// Improved inventory extraction test with better selectors
import { chromium } from 'playwright';

async function getConnectUrl() {
  const resp = await fetch('https://api.browserbase.com/v1/sessions/962d10a9-8ebc-4e3a-82ec-108162c55d2e', {
    headers: { 'X-BB-API-Key': 'bb_live_9DOgx7Trvyon7_zMAvtVxrpugDI' }
  });
  const data = await resp.json();
  return data.connectUrl;
}

const TEST_URL = 'https://conbud.com/stores/conbud-les/products/flower';

async function test() {
  console.log('🔌 Connecting to existing session...');
  const connectUrl = await getConnectUrl();
  const browser = await chromium.connectOverCDP(connectUrl);
  console.log('✅ Connected!');

  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();

  console.log(`📄 Navigating to ${TEST_URL}...`);
  await page.goto(TEST_URL, { waitUntil: 'networkidle', timeout: 60000 });
  console.log('✅ Page loaded');

  // Extract products with actual selectors from the screenshot
  console.log('\n📦 Extracting products...');
  const products = await page.evaluate(() => {
    const results = [];
    
    // The products appear to be in a list view with images, names, prices
    // Looking for elements containing product info
    
    // Get all elements that look like product rows/cards
    const allElements = document.querySelectorAll('*');
    const productPatterns = [];
    
    // Find elements containing prices (good indicator of product)
    const priceRegex = /\$\d+\.\d{2}/;
    const thcRegex = /THC:\s*[\d.]+%/i;
    
    for (const el of allElements) {
      // Look for elements containing both price AND some descriptive text
      const text = el.innerText || '';
      if (priceRegex.test(text) && (thcRegex.test(text) || text.includes('Flower') || text.includes('flower'))) {
        // Check it's a reasonably sized container
        if (el.offsetHeight > 50 && el.offsetHeight < 300) {
          // Extract info
          const priceMatch = text.match(/\$(\d+\.\d{2})/);
          const thcMatch = text.match(/THC:\s*([\d.]+)%/i);
          const lines = text.split('\n').filter(l => l.trim());
          
          // First non-empty line is often the name
          let name = '';
          for (const line of lines) {
            if (line.includes('Flower') || line.includes('flower') || line.length > 10) {
              name = line.trim();
              break;
            }
          }
          
          if (name && priceMatch) {
            results.push({
              name: name.substring(0, 100),
              price: priceMatch[0],
              thc: thcMatch ? thcMatch[1] + '%' : null,
              rawText: text.substring(0, 200)
            });
          }
        }
      }
    }
    
    // Dedupe by name
    const seen = new Set();
    return results.filter(p => {
      if (seen.has(p.name)) return false;
      seen.add(p.name);
      return true;
    });
  });

  console.log(`Found ${products.length} products:`);
  products.slice(0, 5).forEach((p, i) => {
    console.log(`${i+1}. ${p.name}`);
    console.log(`   Price: ${p.price}, THC: ${p.thc || 'N/A'}`);
  });

  // Now try clicking on the first product to get detail modal
  console.log('\n🖱️ Clicking first product...');
  try {
    // Click on product name or image
    const firstProduct = await page.$('img[alt*="Flower"], img[alt*="flower"], button:has-text("+")');
    if (firstProduct) {
      // Find the product row container and click the whole thing or the + button
      await page.click('button:has-text("+")', { timeout: 5000 });
      console.log('Clicked + button');
      await page.waitForTimeout(2000);
      
      // Check if modal appeared
      const modal = await page.$('[role="dialog"], [class*="modal"], [class*="Modal"]');
      if (modal) {
        console.log('✅ Modal appeared!');
        
        // Extract modal content
        const modalContent = await page.evaluate(() => {
          const modal = document.querySelector('[role="dialog"], [class*="modal"], [class*="Modal"]');
          if (!modal) return null;
          
          const text = modal.innerText || '';
          
          // Look for quantity controls
          const quantityInput = modal.querySelector('input[type="number"], [data-testid="quantity"]');
          const maxQty = quantityInput?.max || null;
          
          // Look for inventory warnings
          const stockMatch = text.match(/only (\d+)|(\d+) (left|available|remaining)|in stock: (\d+)|max: (\d+)|limit: (\d+)/i);
          
          return {
            hasModal: true,
            maxQuantity: maxQty,
            inventoryMatch: stockMatch ? stockMatch[0] : null,
            fullText: text.substring(0, 1000)
          };
        });
        
        console.log('Modal content:', JSON.stringify(modalContent, null, 2));
        
        // Try to increase quantity and see what happens
        console.log('\n🔢 Testing quantity limits...');
        const quantityInput = await page.$('input[type="number"]');
        if (quantityInput) {
          // Try setting a high quantity
          await quantityInput.fill('99');
          await page.waitForTimeout(500);
          
          // Check for error message
          const errorMsg = await page.evaluate(() => {
            const errorEl = document.querySelector('[class*="error"], [class*="Error"], [class*="warning"], [role="alert"]');
            return errorEl?.textContent || null;
          });
          
          if (errorMsg) {
            console.log('⚠️ Error message:', errorMsg);
          }
          
          // Check the actual value in the input
          const actualValue = await quantityInput.inputValue();
          console.log(`Quantity input value: ${actualValue} (requested 99)`);
        }
      }
    }
  } catch (err) {
    console.log(`Modal interaction failed: ${err.message}`);
  }

  // Take final screenshot
  await page.screenshot({ path: '/tmp/inventory-test-v3.png', fullPage: false });
  console.log('\n📸 Screenshot saved to /tmp/inventory-test-v3.png');

  await browser.close();
  console.log('✅ Done!');
}

test().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
