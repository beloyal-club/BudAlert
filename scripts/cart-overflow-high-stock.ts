/**
 * Cart Overflow Test - HIGH STOCK Items
 * 
 * Goal: Test items WITHOUT visible "X left in stock" to validate overflow technique
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';

chromium.use(StealthPlugin());

const OUTPUT_DIR = '/root/clawd/cannasignal/data/high-stock-test';

async function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  console.log('='.repeat(70));
  console.log('CART OVERFLOW TEST - HIGH STOCK ITEMS');
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
  
  // First, find the product listing page to find some items
  console.log('\n📋 Getting product listing to find high-stock items...\n');
  
  await page.goto('https://conbud.com/stores/conbud-les/menu', { 
    waitUntil: 'domcontentloaded', 
    timeout: 30000 
  });
  
  // Wait longer for React to hydrate
  await delay(8000);
  
  // Get all product links
  const productLinks = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="/product/"]');
    return Array.from(links).slice(0, 15).map(a => (a as HTMLAnchorElement).href);
  });
  
  console.log(`Found ${productLinks.length} products to test\n`);
  
  const results: any[] = [];
  
  for (const url of productLinks.slice(0, 10)) {
    const productSlug = url.split('/').pop() || 'unknown';
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${productSlug.substring(0, 50)}`);
    console.log('='.repeat(60));
    
    const result: any = {
      product: productSlug,
      url,
      hasVisibleInventory: false,
      visibleInventoryCount: null,
      cartOverflowAttempted: false,
      cartOverflowResult: null,
      finalInventory: null,
      method: null,
    };
    
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('h1', { timeout: 10000 });
      await delay(4000); // React hydration
      
      // Check for visible inventory text
      const pageText = await page.evaluate(() => document.body.innerText);
      const inventoryMatch = pageText.match(/(\d+)\s*left\s*in\s*stock/i);
      
      if (inventoryMatch) {
        result.hasVisibleInventory = true;
        result.visibleInventoryCount = parseInt(inventoryMatch[1], 10);
        result.finalInventory = result.visibleInventoryCount;
        result.method = 'page_display';
        console.log(`  ✅ Inventory shown on page: ${result.visibleInventoryCount} units`);
        console.log('  ⏭️ Skipping cart overflow (not needed)');
      } else {
        console.log('  ⚠️ No inventory displayed - attempting cart overflow...');
        result.cartOverflowAttempted = true;
        
        // Take screenshot before overflow attempt
        await page.screenshot({ 
          path: path.join(OUTPUT_DIR, `before-${productSlug.substring(0, 30)}.png`),
          fullPage: true 
        });
        
        // Find quantity selector
        const select = await page.$('select');
        let quantityOptions: string[] = [];
        
        if (select) {
          quantityOptions = await select.evaluate((s: HTMLSelectElement) => 
            Array.from(s.options).map(o => o.value)
          );
          console.log(`  Quantity options: ${quantityOptions.join(', ')}`);
          
          // If max qty option is < 99, that might be the inventory limit
          const maxDropdown = parseInt(quantityOptions[quantityOptions.length - 1], 10);
          if (maxDropdown && maxDropdown < 99) {
            console.log(`  💡 Dropdown max (${maxDropdown}) may indicate inventory`);
            result.dropdownMax = maxDropdown;
          }
          
          // Select the highest quantity
          const maxOpt = quantityOptions[quantityOptions.length - 1];
          await select.selectOption(maxOpt);
          console.log(`  Selected quantity: ${maxOpt}`);
          await delay(500);
        }
        
        // Look for add to cart button
        const addButton = await page.$('button:has-text("ADD TO CART"), button:has-text("Add to Cart")');
        
        if (addButton) {
          console.log('  Clicking Add to Cart...');
          
          // Listen for network requests that might contain inventory info
          const responses: any[] = [];
          page.on('response', async (response) => {
            if (response.url().includes('cart') || response.url().includes('inventory')) {
              try {
                const json = await response.json();
                responses.push({ url: response.url(), data: json });
              } catch {}
            }
          });
          
          await addButton.click();
          await delay(3000);
          
          // Take screenshot after click
          await page.screenshot({ 
            path: path.join(OUTPUT_DIR, `after-${productSlug.substring(0, 30)}.png`),
            fullPage: true 
          });
          
          // Check for error messages
          const errorCheck = await page.evaluate(() => {
            const body = document.body.innerText;
            
            // Common error patterns
            const patterns = [
              /only\s*(\d+)\s*(available|left|in stock)/i,
              /(\d+)\s*items?\s*(available|remaining)/i,
              /can'?t add more than\s*(\d+)/i,
              /maximum\s*(quantity|of)?\s*(\d+)/i,
              /exceeds\s*(available|inventory)\s*(\d+)?/i,
              /inventory limit/i,
              /out of stock/i,
            ];
            
            for (const p of patterns) {
              const m = body.match(p);
              if (m) return { pattern: p.toString(), match: m[0], number: m[1] || m[2] };
            }
            
            // Check for toast/alert elements
            const alerts = document.querySelectorAll('[role="alert"], [class*="toast"], [class*="error"], [class*="Error"]');
            for (const alert of alerts) {
              const text = alert.textContent?.trim();
              if (text && text.length > 3) {
                const numMatch = text.match(/(\d+)/);
                return { element: 'alert', text, number: numMatch?.[1] };
              }
            }
            
            return null;
          });
          
          if (errorCheck) {
            console.log(`  🎯 Cart response: ${JSON.stringify(errorCheck)}`);
            result.cartOverflowResult = errorCheck;
            if (errorCheck.number) {
              result.finalInventory = parseInt(errorCheck.number, 10);
              result.method = 'cart_overflow';
              console.log(`  ✅ CART OVERFLOW SUCCESS: ${result.finalInventory} units available`);
            }
          } else {
            console.log('  ℹ️ No error message - item may have been added to cart');
            result.cartOverflowResult = 'success_or_high_stock';
            
            // Check if cart now shows something
            const cartCheck = await page.evaluate(() => {
              const cartEl = document.querySelector('[class*="cart"]');
              return cartEl?.textContent;
            });
            
            if (cartCheck) {
              console.log(`  Cart content: ${cartCheck.substring(0, 100)}`);
            }
          }
          
          if (responses.length > 0) {
            console.log(`  📡 Captured ${responses.length} relevant API responses`);
            result.apiResponses = responses;
          }
        } else {
          console.log('  ❌ No Add to Cart button found');
          result.cartOverflowResult = 'no_button';
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
  console.log('SUMMARY');
  console.log('='.repeat(70));
  
  const withPageInventory = results.filter(r => r.hasVisibleInventory);
  const withCartOverflow = results.filter(r => r.cartOverflowAttempted);
  const successfulOverflow = results.filter(r => r.method === 'cart_overflow');
  
  console.log(`\nTotal tested: ${results.length}`);
  console.log(`With visible inventory: ${withPageInventory.length}`);
  console.log(`Cart overflow attempted: ${withCartOverflow.length}`);
  console.log(`Cart overflow successful: ${successfulOverflow.length}`);
  
  console.log('\n--- Results by Product ---');
  for (const r of results) {
    console.log(`\n${r.product.substring(0, 40)}:`);
    console.log(`  Method: ${r.method || 'none'}`);
    console.log(`  Final inventory: ${r.finalInventory !== null ? r.finalInventory : 'unknown'}`);
    if (r.dropdownMax) console.log(`  Dropdown max: ${r.dropdownMax}`);
  }
  
  // Save results
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'high-stock-results.json'),
    JSON.stringify(results, null, 2)
  );
  
  console.log(`\n✓ Results saved to ${OUTPUT_DIR}/high-stock-results.json`);
}

main().catch(console.error);
