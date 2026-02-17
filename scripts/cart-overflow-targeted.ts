/**
 * Cart Overflow Test - Targeted at HIGH quantity
 * 
 * This test specifically adds 99+ items to cart to trigger overflow error
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';

chromium.use(StealthPlugin());

const OUTPUT_DIR = '/root/clawd/cannasignal/data/overflow-targeted';

async function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  console.log('='.repeat(70));
  console.log('CART OVERFLOW - TARGETED 99 QTY TEST');
  console.log('='.repeat(70));

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();
  
  // Test a known high-stock product (no "X left" shown)
  const testUrls = [
    'https://conbud.com/stores/conbud-les/product/bouket-4g-flower-jar-paztelito',
    'https://conbud.com/stores/conbud-les/product/soze-2pk-75g-live-resin-infused-ceramic-tip-joints',
    'https://conbud.com/stores/conbud-les/product/pure-beauty-10pk-35g-joints-3-5g-sativa',
  ];
  
  const results: any[] = [];
  
  for (const url of testUrls) {
    const productSlug = url.split('/').pop() || 'unknown';
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${productSlug.substring(0, 50)}`);
    console.log('='.repeat(60));
    
    const result: any = {
      product: productSlug,
      url,
      method: 'cart_overflow',
      quantityAttempted: null,
      errorMessage: null,
      inventoryRevealed: null,
    };
    
    try {
      // Clear cart first by starting fresh context
      await context.clearCookies();
      
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('h1', { timeout: 10000 });
      await delay(4000);
      
      // Take screenshot
      await page.screenshot({ 
        path: path.join(OUTPUT_DIR, `before-${productSlug.substring(0, 30)}.png`),
        fullPage: true 
      });
      
      // Check if there's a quantity input field we can manipulate
      const qtyInput = await page.$('input[type="number"], input[name*="quantity"], input[id*="quantity"]');
      
      if (qtyInput) {
        console.log('  Found quantity input field');
        await qtyInput.fill('99');
        result.quantityAttempted = 99;
      } else {
        // Check for select dropdown
        const select = await page.$('select');
        if (select) {
          const options = await select.evaluate((s: HTMLSelectElement) => 
            Array.from(s.options).map(o => o.value)
          );
          console.log(`  Quantity dropdown options: ${options.join(', ')}`);
          
          // Select max available
          const maxOpt = options[options.length - 1];
          await select.selectOption(maxOpt);
          result.quantityAttempted = parseInt(maxOpt, 10);
          console.log(`  Selected max quantity: ${maxOpt}`);
        } else {
          console.log('  No quantity selector found - will try repeated adds');
        }
      }
      
      await delay(500);
      
      // Find add to cart button
      const addButton = await page.$('button:has-text("ADD TO CART"), button:has-text("Add to Cart"), button:has-text("Add")');
      
      if (!addButton) {
        console.log('  ❌ No Add to Cart button found');
        result.error = 'no_add_button';
        results.push(result);
        continue;
      }
      
      // Method 1: Try direct add with high quantity
      console.log('  Attempting add to cart...');
      await addButton.click();
      await delay(3000);
      
      // Take screenshot after
      await page.screenshot({ 
        path: path.join(OUTPUT_DIR, `after1-${productSlug.substring(0, 30)}.png`),
        fullPage: true 
      });
      
      // Check page for error
      let pageText = await page.evaluate(() => document.body.innerText);
      
      // Look for inventory-revealing errors
      const errorPatterns = [
        /only\s*(\d+)\s*(available|left|in\s*stock|remaining)/i,
        /(\d+)\s*(available|remaining|left)/i,
        /can'?t add more than\s*(\d+)/i,
        /maximum\s*(?:quantity|of)?\s*(\d+)/i,
        /exceeds\s*(?:available\s*)?(?:inventory|quantity|stock)/i,
        /not enough\s*(?:inventory|stock)/i,
        /(\d+)\s*in\s*stock/i,
      ];
      
      for (const pattern of errorPatterns) {
        const match = pageText.match(pattern);
        if (match) {
          console.log(`  🎯 FOUND: "${match[0]}"`);
          result.errorMessage = match[0];
          if (match[1]) {
            result.inventoryRevealed = parseInt(match[1], 10);
            console.log(`  ✅ INVENTORY REVEALED: ${result.inventoryRevealed} units`);
          }
          break;
        }
      }
      
      // If no error, try adding more to trigger overflow
      if (!result.inventoryRevealed) {
        console.log('  No error yet - trying to add more...');
        
        // Click add again multiple times
        for (let i = 0; i < 5; i++) {
          await addButton.click();
          await delay(1500);
          
          pageText = await page.evaluate(() => document.body.innerText);
          
          for (const pattern of errorPatterns) {
            const match = pageText.match(pattern);
            if (match) {
              console.log(`  🎯 FOUND on attempt ${i + 2}: "${match[0]}"`);
              result.errorMessage = match[0];
              if (match[1]) {
                result.inventoryRevealed = parseInt(match[1], 10);
                console.log(`  ✅ INVENTORY REVEALED: ${result.inventoryRevealed} units`);
              }
              break;
            }
          }
          
          if (result.inventoryRevealed) break;
        }
      }
      
      // Take final screenshot
      await page.screenshot({ 
        path: path.join(OUTPUT_DIR, `final-${productSlug.substring(0, 30)}.png`),
        fullPage: true 
      });
      
      if (!result.inventoryRevealed) {
        console.log('  ⚠️ Could not determine inventory (high stock or method failed)');
        
        // Check cart count
        const cartCount = await page.evaluate(() => {
          const cart = document.body.innerText.match(/(\d+)\s*items?\s*in\s*(?:your\s*)?(?:shopping\s*)?cart/i);
          return cart ? parseInt(cart[1], 10) : null;
        });
        
        if (cartCount) {
          console.log(`  Cart now has ${cartCount} items`);
          result.cartCount = cartCount;
        }
      }
      
    } catch (err: any) {
      console.log(`  ❌ Error: ${err.message}`);
      result.error = err.message;
    }
    
    results.push(result);
    await delay(2000);
  }
  
  await browser.close();
  
  // Summary
  console.log('\n\n' + '='.repeat(70));
  console.log('CART OVERFLOW TEST SUMMARY');
  console.log('='.repeat(70));
  
  const successfulOverflows = results.filter(r => r.inventoryRevealed !== null);
  
  console.log(`\nTotal tested: ${results.length}`);
  console.log(`Inventory revealed via overflow: ${successfulOverflows.length}`);
  
  for (const r of results) {
    console.log(`\n${r.product.substring(0, 40)}:`);
    console.log(`  Qty attempted: ${r.quantityAttempted || 'default'}`);
    console.log(`  Error message: ${r.errorMessage || 'none'}`);
    console.log(`  Inventory: ${r.inventoryRevealed !== null ? r.inventoryRevealed + ' units' : 'not revealed'}`);
  }
  
  // Save
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'overflow-results.json'),
    JSON.stringify(results, null, 2)
  );
  
  console.log(`\n✓ Results saved to ${OUTPUT_DIR}/overflow-results.json`);
}

main().catch(console.error);
