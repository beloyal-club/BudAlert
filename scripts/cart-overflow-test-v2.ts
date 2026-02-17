/**
 * Cart Overflow Technique Test v2 - More Robust
 * 
 * Improvements:
 * - Better handling of Dutchie's React SPA
 * - Wait for product cards to fully load
 * - Click on actual products (not filter links)
 * - Handle the popup/modal add-to-cart flow
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Page, Browser } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

chromium.use(StealthPlugin());

const OUTPUT_DIR = '/root/clawd/cannasignal/data/cart-overflow-test';

interface TestResult {
  productName: string;
  productUrl: string;
  technique: string;
  quantityAttempted: number;
  errorMessage: string | null;
  inventoryRevealed: number | null;
  success: boolean;
  selectors: Record<string, string>;
  flow: string[];
  screenshotPath: string | null;
}

async function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function takeScreenshot(page: Page, name: string): Promise<string> {
  const p = path.join(OUTPUT_DIR, `${name}-${Date.now()}.png`);
  await page.screenshot({ path: p, fullPage: true });
  console.log(`  📸 ${name}`);
  return p;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  console.log('='.repeat(70));
  console.log('CART OVERFLOW TEST v2 - CONBUD');
  console.log('='.repeat(70));

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });

  const page = await context.newPage();
  const results: TestResult[] = [];
  
  // Enable request interception for debugging
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('/api/') && url.includes('inventory')) {
      console.log(`  🔍 API Response: ${url} → ${response.status()}`);
      try {
        const json = await response.json();
        console.log(`     Data: ${JSON.stringify(json).substring(0, 200)}`);
      } catch {}
    }
  });

  try {
    // Step 1: Go directly to flower category
    console.log('\n📍 Step 1: Navigate to flower category');
    await page.goto('https://conbud.com/stores/conbud-les/products/flower', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await delay(3000);
    await takeScreenshot(page, '01-initial');

    // Step 2: Handle age verification if present
    console.log('\n📍 Step 2: Handle age verification');
    const ageButton = await page.$('button:has-text("YES"), button:has-text("Yes"), button:has-text("CHOOSE A LOCATION")');
    if (ageButton) {
      await ageButton.click();
      console.log('  ✓ Clicked age verification');
      await delay(2000);
    }

    // Step 3: Wait for products to load (look for actual product content)
    console.log('\n📍 Step 3: Wait for products to load');
    try {
      // Wait for product cards with actual content
      await page.waitForFunction(() => {
        const cards = document.querySelectorAll('[class*="ProductCard"], [class*="product-card"], [data-testid*="product"]');
        return cards.length > 0 && Array.from(cards).some(c => {
          const img = c.querySelector('img');
          return img && img.src && !img.src.includes('placeholder');
        });
      }, { timeout: 20000 });
      console.log('  ✓ Products loaded');
    } catch {
      console.log('  ⚠ Timeout waiting for products, trying anyway');
    }
    await delay(2000);
    await takeScreenshot(page, '02-products-loaded');

    // Step 4: Find and click on the first product
    console.log('\n📍 Step 4: Click on first product');
    
    // Multiple strategies to find product cards
    const productCardSelectors = [
      '[data-testid*="product-card"]',
      '[class*="ProductCard__Container"]',
      '[class*="product-card"]',
      'article[class*="product"]',
      // Dutchie specific - the product card links
      'a[href*="/product/"]',
    ];

    let productClicked = false;
    for (const selector of productCardSelectors) {
      try {
        const card = await page.$(selector);
        if (card) {
          // Get the product name if possible
          const productName = await card.evaluate(el => el.textContent?.substring(0, 50) || 'Unknown');
          console.log(`  Found product: "${productName.trim().substring(0, 40)}..." (${selector})`);
          
          await card.click();
          productClicked = true;
          console.log('  ✓ Clicked product card');
          break;
        }
      } catch (e) {
        console.log(`  ✗ Selector failed: ${selector}`);
      }
    }

    if (!productClicked) {
      // Fallback: try clicking any element with a product image
      console.log('  Trying fallback: click on product image...');
      const img = await page.$('img[src*="dutchie"], img[alt*="product"], img[class*="product"]');
      if (img) {
        await img.click();
        productClicked = true;
      }
    }

    await delay(3000);
    await takeScreenshot(page, '03-product-clicked');

    // Step 5: Check if a modal/drawer appeared OR we navigated to product page
    console.log('\n📍 Step 5: Analyze product UI');
    
    const currentUrl = page.url();
    console.log(`  Current URL: ${currentUrl}`);

    // Check for modal/drawer with product details
    const productModal = await page.$('[class*="modal"], [class*="Modal"], [class*="drawer"], [class*="Drawer"], [role="dialog"]');
    if (productModal) {
      console.log('  ✓ Product opened in modal/drawer');
    }

    // Step 6: Find quantity controls
    console.log('\n📍 Step 6: Find quantity controls');
    
    // Look for quantity input or +/- buttons
    const quantityInfo = await page.evaluate(() => {
      const info: Record<string, any> = {};
      
      // Find quantity input
      const inputs = document.querySelectorAll('input[type="number"], input[aria-label*="quantity"], input[name*="quantity"]');
      if (inputs.length > 0) {
        const inp = inputs[0] as HTMLInputElement;
        info.quantityInput = {
          found: true,
          selector: inp.className || inp.id || 'input[type="number"]',
          value: inp.value,
          max: inp.max || 'none',
        };
      }

      // Find increment button
      const incButtons = document.querySelectorAll('button[aria-label*="increase"], button[aria-label*="add"], button:has-text("+")');
      if (incButtons.length > 0) {
        info.incrementButton = { found: true, count: incButtons.length };
      }

      // Find decrement button
      const decButtons = document.querySelectorAll('button[aria-label*="decrease"], button[aria-label*="subtract"], button:has-text("-")');
      if (decButtons.length > 0) {
        info.decrementButton = { found: true, count: decButtons.length };
      }

      // Find add to cart button
      const cartButtons = document.querySelectorAll('button[class*="add"], button[aria-label*="add to cart"], button:has-text("Add")');
      cartButtons.forEach((b, i) => {
        const text = (b as HTMLButtonElement).textContent?.trim() || '';
        if (text.toLowerCase().includes('add') || text.toLowerCase().includes('cart')) {
          info.addToCartButton = { found: true, text: text.substring(0, 50) };
        }
      });

      // Check for any weight/variant selectors (Dutchie shows multiple options)
      const variantButtons = document.querySelectorAll('[class*="variant"], [class*="Variant"], [class*="weight"], [class*="Weight"]');
      if (variantButtons.length > 0) {
        info.variants = { found: true, count: variantButtons.length };
      }

      // Get all buttons for debugging
      info.allButtons = Array.from(document.querySelectorAll('button')).slice(0, 20).map(b => ({
        text: b.textContent?.trim().substring(0, 40),
        class: b.className.substring(0, 50),
        ariaLabel: b.getAttribute('aria-label'),
      }));

      return info;
    });

    console.log('  Quantity controls found:');
    console.log(JSON.stringify(quantityInfo, null, 2).split('\n').map(l => '    ' + l).join('\n'));

    // Step 7: Try to set high quantity and add to cart
    console.log('\n📍 Step 7: Attempt cart overflow');
    
    const result: TestResult = {
      productName: 'Unknown',
      productUrl: currentUrl,
      technique: 'quantity_overflow',
      quantityAttempted: 0,
      errorMessage: null,
      inventoryRevealed: null,
      success: false,
      selectors: {},
      flow: [],
      screenshotPath: null,
    };

    // Strategy A: If there's a quantity input, set it to 99
    if (quantityInfo.quantityInput?.found) {
      console.log('  Strategy A: Setting quantity input to 99');
      const quantityInput = await page.$('input[type="number"]');
      if (quantityInput) {
        await quantityInput.click({ clickCount: 3 });
        await quantityInput.fill('99');
        result.quantityAttempted = 99;
        result.flow.push('Set quantity to 99');
        await delay(500);
      }
    }
    // Strategy B: Click increment button many times
    else if (quantityInfo.incrementButton?.found) {
      console.log('  Strategy B: Clicking increment button 50 times');
      const incBtn = await page.$('button[aria-label*="increase"], button[aria-label*="add"]:not([aria-label*="cart"])');
      if (incBtn) {
        for (let i = 0; i < 50; i++) {
          try {
            await incBtn.click();
            await delay(100);
          } catch {
            console.log(`    Stopped at click ${i}`);
            break;
          }
        }
        result.quantityAttempted = 50;
        result.flow.push('Clicked increment 50 times');
      }
    }

    await delay(1000);
    await takeScreenshot(page, '04-quantity-set');

    // Step 8: Click Add to Cart
    console.log('\n📍 Step 8: Click Add to Cart');
    
    const addToCartSelectors = [
      'button:has-text("Add to Cart")',
      'button:has-text("Add to Bag")',
      'button:has-text("Add")',
      'button[aria-label*="add to cart"]',
      '[data-testid*="add-to-cart"]',
      'button[class*="add"][class*="cart"]',
      'button[class*="AddToCart"]',
    ];

    for (const selector of addToCartSelectors) {
      try {
        const btn = await page.$(selector);
        if (btn) {
          const btnText = await btn.textContent();
          console.log(`  Found button: "${btnText?.trim()}" (${selector})`);
          await btn.click();
          result.flow.push(`Clicked: ${btnText?.trim()}`);
          break;
        }
      } catch {}
    }

    await delay(3000);
    await takeScreenshot(page, '05-after-add-to-cart');

    // Step 9: Capture any error messages
    console.log('\n📍 Step 9: Check for error messages');
    
    const errorInfo = await page.evaluate(() => {
      const errors: string[] = [];
      
      // Look for error elements
      const errorSelectors = [
        '[class*="error"]',
        '[class*="Error"]',
        '[class*="warning"]',
        '[class*="Warning"]',
        '[class*="toast"]',
        '[class*="Toast"]',
        '[class*="alert"]',
        '[class*="Alert"]',
        '[role="alert"]',
        '[aria-live="polite"]',
        '[aria-live="assertive"]',
      ];

      for (const sel of errorSelectors) {
        document.querySelectorAll(sel).forEach(el => {
          const text = el.textContent?.trim();
          if (text && text.length > 5 && text.length < 500) {
            errors.push(text);
          }
        });
      }

      // Also look for inventory patterns in any visible text
      const pageText = document.body.innerText;
      const inventoryMatches = pageText.match(/only\s*\d+|(\d+)\s*(left|available|in stock|remaining)/gi);
      if (inventoryMatches) {
        errors.push(...inventoryMatches);
      }

      return errors;
    });

    console.log('  Messages found:', errorInfo);

    for (const msg of errorInfo) {
      const inventoryMatch = msg.match(/only\s*(\d+)|(\d+)\s*(left|available|in stock|remaining)/i);
      if (inventoryMatch) {
        result.errorMessage = msg;
        result.inventoryRevealed = parseInt(inventoryMatch[1] || inventoryMatch[2], 10);
        result.success = true;
        console.log(`  ✅ INVENTORY REVEALED: ${result.inventoryRevealed}`);
        break;
      }
    }

    // Step 10: Check cart for inventory error
    console.log('\n📍 Step 10: Check cart drawer/modal');
    
    // Look for cart icon/link and click it
    const cartIcon = await page.$('[aria-label*="cart"], [data-testid*="cart"], button:has-text("Cart"), [class*="cart-icon"]');
    if (cartIcon) {
      await cartIcon.click();
      await delay(2000);
      await takeScreenshot(page, '06-cart-open');
      
      // Check cart for inventory messages
      const cartErrors = await page.evaluate(() => {
        return document.body.innerText.match(/only\s*\d+|(\d+)\s*(left|available|in stock|remaining)/gi) || [];
      });
      
      if (cartErrors.length > 0 && !result.success) {
        console.log('  Cart messages:', cartErrors);
        const match = cartErrors[0].match(/(\d+)/);
        if (match) {
          result.inventoryRevealed = parseInt(match[1], 10);
          result.errorMessage = cartErrors[0];
          result.success = true;
          console.log(`  ✅ INVENTORY REVEALED FROM CART: ${result.inventoryRevealed}`);
        }
      }
    }

    result.screenshotPath = await takeScreenshot(page, '07-final');
    results.push(result);

    // Save HTML for debugging
    const html = await page.content();
    fs.writeFileSync(path.join(OUTPUT_DIR, 'final-page.html'), html);

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    await takeScreenshot(page, 'error');
  } finally {
    await browser.close();
  }

  // Generate results markdown
  console.log('\n' + '='.repeat(70));
  console.log('GENERATING REPORT');
  console.log('='.repeat(70));

  let markdown = `# Cart Overflow Technique Test Results - CONBUD

**Date:** ${new Date().toISOString()}
**Target:** https://conbud.com

## Summary

`;

  const successCount = results.filter(r => r.success).length;
  
  if (successCount > 0) {
    markdown += `✅ **SUCCESS** - Cart overflow technique revealed inventory data!\n\n`;
    markdown += `### How it works:\n`;
    for (const r of results.filter(r => r.success)) {
      markdown += `1. Navigate to product page\n`;
      markdown += `2. ${r.flow.join(' → ')}\n`;
      markdown += `3. Error message reveals: "${r.errorMessage}"\n`;
      markdown += `4. **Inventory count extracted: ${r.inventoryRevealed}**\n\n`;
    }
  } else {
    markdown += `❌ **INCONCLUSIVE** - Cart overflow technique did not reveal inventory in this test.\n\n`;
    markdown += `### Possible reasons:\n`;
    markdown += `- Dutchie may cap quantity at available stock without showing error\n`;
    markdown += `- Error messages may appear differently (toast, modal, inline)\n`;
    markdown += `- Need to test with products that have low stock\n`;
    markdown += `- Site may rate-limit or block automation\n\n`;
  }

  markdown += `## Test Details\n\n`;
  
  for (const r of results) {
    markdown += `### ${r.productName}\n\n`;
    markdown += `- **URL:** ${r.productUrl}\n`;
    markdown += `- **Technique:** ${r.technique}\n`;
    markdown += `- **Quantity Attempted:** ${r.quantityAttempted}\n`;
    markdown += `- **Error Message:** ${r.errorMessage || 'None'}\n`;
    markdown += `- **Inventory Revealed:** ${r.inventoryRevealed ?? 'None'}\n`;
    markdown += `- **Success:** ${r.success ? '✅' : '❌'}\n`;
    markdown += `- **Flow:** ${r.flow.join(' → ')}\n\n`;
  }

  markdown += `## Selectors Found\n\n`;
  markdown += `\`\`\`json\n${JSON.stringify(results[0]?.selectors || {}, null, 2)}\n\`\`\`\n\n`;

  markdown += `## Next Steps\n\n`;
  if (successCount > 0) {
    markdown += `1. Integrate this flow into the main scraper\n`;
    markdown += `2. Add retry logic for rate limiting\n`;
    markdown += `3. Test across multiple products to validate consistency\n`;
  } else {
    markdown += `1. Try testing with known low-stock items\n`;
    markdown += `2. Investigate if Dutchie uses different error patterns\n`;
    markdown += `3. Check if Steven's "add 10 multiple times" approach is needed\n`;
    markdown += `4. Try intercepting API calls to get inventory data directly\n`;
  }

  markdown += `\n## Screenshots\n\n`;
  markdown += `See the \`/root/clawd/cannasignal/data/cart-overflow-test/\` directory for screenshots.\n`;

  fs.writeFileSync(path.join(OUTPUT_DIR, 'results.md'), markdown);
  fs.writeFileSync(path.join(OUTPUT_DIR, `results-${Date.now()}.json`), JSON.stringify(results, null, 2));
  
  console.log(`\n✓ Results saved to ${OUTPUT_DIR}/results.md`);
  console.log('\n📊 FINAL RESULT:', successCount > 0 ? '✅ SUCCESS' : '❌ NEEDS MORE TESTING');
}

main().catch(console.error);
