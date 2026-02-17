/**
 * Cart Overflow Technique Test for CONBUD
 * 
 * The technique:
 * 1. Go to a product page
 * 2. Try to add a high quantity (99) to cart
 * 3. Capture the error message that reveals actual inventory
 * 
 * Testing both approaches:
 * - Single high number (99)
 * - Repeated add 10x multiple times
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Page, Browser, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

chromium.use(StealthPlugin());

interface CartOverflowResult {
  productUrl: string;
  productName: string | null;
  technique: 'single_high' | 'repeated_add';
  quantityAttempted: number;
  errorMessage: string | null;
  inventoryRevealed: number | null;
  success: boolean;
  screenshotPath: string | null;
  timestamp: string;
  notes: string[];
}

const OUTPUT_DIR = '/root/clawd/cannasignal/data/cart-overflow-test';

async function randomDelay(min: number = 500, max: number = 1500): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min) + min);
  await new Promise(resolve => setTimeout(resolve, delay));
}

async function handleAgeVerification(page: Page): Promise<boolean> {
  console.log('  Checking for age verification...');
  
  const selectors = [
    'button:has-text("YES")',
    'button:has-text("Yes")',
    'button:has-text("I am 21+")',
    'button:has-text("I\'m 21")',
    'button:has-text("Enter")',
    '[data-testid="age-gate-submit"]',
  ];

  for (const selector of selectors) {
    try {
      const button = await page.$(selector);
      if (button && await button.isVisible()) {
        console.log(`  Found age verification: ${selector}`);
        await button.click();
        await randomDelay(1500, 2500);
        return true;
      }
    } catch (e) {}
  }
  return false;
}

async function getProductLinks(page: Page): Promise<string[]> {
  // Get product links from the menu page
  const links = await page.evaluate(() => {
    const productLinks: string[] = [];
    
    // Find all product links - Dutchie pattern
    const allLinks = document.querySelectorAll('a[href*="/product/"], a[href*="/products/"]');
    allLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href && !productLinks.includes(href)) {
        productLinks.push(href);
      }
    });
    
    return productLinks.slice(0, 10); // Get first 10
  });
  
  return links;
}

async function testCartOverflow(
  page: Page,
  productUrl: string,
  technique: 'single_high' | 'repeated_add'
): Promise<CartOverflowResult> {
  const result: CartOverflowResult = {
    productUrl,
    productName: null,
    technique,
    quantityAttempted: 0,
    errorMessage: null,
    inventoryRevealed: null,
    success: false,
    screenshotPath: null,
    timestamp: new Date().toISOString(),
    notes: [],
  };

  try {
    console.log(`\n  Testing product: ${productUrl}`);
    console.log(`  Technique: ${technique}`);
    
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(2000, 3000);
    
    // Handle age verification if needed
    await handleAgeVerification(page);
    await randomDelay(1000, 1500);

    // Get product name
    const productName = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      if (h1) return h1.textContent?.trim() || null;
      const title = document.querySelector('[class*="product-name"], [class*="ProductName"], [data-testid="product-title"]');
      return title?.textContent?.trim() || null;
    });
    result.productName = productName;
    console.log(`  Product: ${productName}`);

    // Take initial screenshot
    const initialScreenshot = path.join(OUTPUT_DIR, `initial-${Date.now()}.png`);
    await page.screenshot({ path: initialScreenshot });
    result.notes.push(`Initial screenshot: ${initialScreenshot}`);

    // STRATEGY 1: Look for quantity input
    console.log('  Looking for quantity input...');
    const quantityInputSelectors = [
      'input[type="number"][name*="quantity"]',
      'input[type="number"][aria-label*="quantity"]',
      'input[type="number"][id*="quantity"]',
      'input[data-testid="quantity-input"]',
      '[class*="quantity"] input[type="number"]',
      '[class*="Quantity"] input[type="number"]',
      'input.quantity',
      'input[name="quantity"]',
      // Dutchie specific
      '[data-testid="product-quantity-input"]',
      '[class*="QuantityInput"] input',
    ];

    let quantityInput = null;
    for (const selector of quantityInputSelectors) {
      quantityInput = await page.$(selector);
      if (quantityInput && await quantityInput.isVisible()) {
        console.log(`  Found quantity input: ${selector}`);
        result.notes.push(`Quantity input found: ${selector}`);
        break;
      }
      quantityInput = null;
    }

    // STRATEGY 2: Look for add to cart button with quantity controls
    const addToCartSelectors = [
      'button:has-text("Add to Cart")',
      'button:has-text("Add to Bag")',
      'button:has-text("Add")',
      '[data-testid="add-to-cart"]',
      '[data-testid="add-to-cart-button"]',
      '[class*="add-to-cart"]',
      '[class*="AddToCart"]',
      'button[class*="cart"]',
    ];

    let addToCartButton = null;
    for (const selector of addToCartSelectors) {
      addToCartButton = await page.$(selector);
      if (addToCartButton && await addToCartButton.isVisible()) {
        console.log(`  Found add-to-cart button: ${selector}`);
        result.notes.push(`Add to cart button found: ${selector}`);
        break;
      }
      addToCartButton = null;
    }

    // Also look for increment/decrement buttons
    const incrementSelectors = [
      'button[aria-label*="increase"]',
      'button[aria-label*="increment"]',
      'button[aria-label*="add"]',
      'button:has-text("+")',
      '[data-testid="increment-quantity"]',
      '[class*="increment"]',
      '[class*="Increment"]',
      '[class*="plus"]',
      '[class*="Plus"]',
    ];

    let incrementButton = null;
    for (const selector of incrementSelectors) {
      incrementButton = await page.$(selector);
      if (incrementButton && await incrementButton.isVisible()) {
        console.log(`  Found increment button: ${selector}`);
        result.notes.push(`Increment button found: ${selector}`);
        break;
      }
      incrementButton = null;
    }

    // Log page state for debugging
    const pageState = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input')).map(i => ({
        type: i.type,
        name: i.name,
        id: i.id,
        class: i.className.substring(0, 50),
      }));
      const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.textContent?.trim().substring(0, 30),
        class: b.className.substring(0, 50),
      }));
      return { inputs, buttons: buttons.slice(0, 15) };
    });
    result.notes.push('Page state: ' + JSON.stringify(pageState, null, 2));

    // === EXECUTE THE CART OVERFLOW TECHNIQUE ===
    
    if (technique === 'single_high') {
      // Try setting a high quantity directly
      if (quantityInput) {
        console.log('  Attempting single high quantity (99)...');
        await quantityInput.fill('');  // Clear first
        await randomDelay(200, 400);
        await quantityInput.fill('99');
        result.quantityAttempted = 99;
        await randomDelay(500, 1000);
        
        // Try to add to cart
        if (addToCartButton) {
          await addToCartButton.click();
          console.log('  Clicked add to cart...');
          await randomDelay(2000, 3000);
        }
      } else if (incrementButton) {
        // No quantity input, try rapid increment
        console.log('  No quantity input, trying rapid increment to 20...');
        for (let i = 0; i < 19; i++) {
          await incrementButton.click();
          await randomDelay(100, 200);
        }
        result.quantityAttempted = 20;
        
        if (addToCartButton) {
          await addToCartButton.click();
          console.log('  Clicked add to cart...');
          await randomDelay(2000, 3000);
        }
      } else if (addToCartButton) {
        // Just click add to cart and see what happens
        console.log('  No quantity controls, just clicking add to cart...');
        await addToCartButton.click();
        result.quantityAttempted = 1;
        await randomDelay(2000, 3000);
      }
      
    } else if (technique === 'repeated_add') {
      // Steven's approach: "add 10 multiple times"
      // First need to set quantity to 10, then add repeatedly
      
      const addAttempts = 10;
      console.log(`  Attempting repeated add (${addAttempts}x)...`);
      
      for (let attempt = 0; attempt < addAttempts; attempt++) {
        console.log(`    Attempt ${attempt + 1}/${addAttempts}...`);
        
        // Set quantity if we can
        if (quantityInput) {
          await quantityInput.fill('');
          await quantityInput.fill('10');
        }
        
        // Click add to cart
        if (addToCartButton) {
          await addToCartButton.click();
          result.quantityAttempted += 10;
          await randomDelay(1500, 2500);
          
          // Check for error after each attempt
          const errorNow = await captureErrorMessage(page);
          if (errorNow) {
            console.log(`    Error detected on attempt ${attempt + 1}: ${errorNow}`);
            result.errorMessage = errorNow;
            break;
          }
        } else {
          result.notes.push('No add to cart button found for repeated add');
          break;
        }
      }
    }

    // === CAPTURE ERROR MESSAGE ===
    const errorMessage = await captureErrorMessage(page);
    if (errorMessage) {
      result.errorMessage = errorMessage;
      console.log(`  ERROR CAPTURED: ${errorMessage}`);
      
      // Try to extract inventory number
      const inventoryMatch = errorMessage.match(/only\s*(\d+)|(\d+)\s*(available|in stock|remaining|left)/i);
      if (inventoryMatch) {
        result.inventoryRevealed = parseInt(inventoryMatch[1] || inventoryMatch[2], 10);
        result.success = true;
        console.log(`  ✅ INVENTORY REVEALED: ${result.inventoryRevealed}`);
      }
    }

    // Take final screenshot
    const finalScreenshot = path.join(OUTPUT_DIR, `final-${technique}-${Date.now()}.png`);
    await page.screenshot({ path: finalScreenshot, fullPage: true });
    result.screenshotPath = finalScreenshot;
    
    // Also save HTML for debugging
    const html = await page.content();
    const htmlPath = path.join(OUTPUT_DIR, `page-${technique}-${Date.now()}.html`);
    fs.writeFileSync(htmlPath, html);
    result.notes.push(`HTML saved: ${htmlPath}`);

  } catch (error: any) {
    console.error(`  Error: ${error.message}`);
    result.notes.push(`Error: ${error.message}`);
  }

  return result;
}

async function captureErrorMessage(page: Page): Promise<string | null> {
  // Look for error messages that might reveal inventory
  const errorSelectors = [
    '[class*="error"]',
    '[class*="Error"]',
    '[class*="alert"]',
    '[class*="Alert"]',
    '[class*="warning"]',
    '[class*="Warning"]',
    '[class*="toast"]',
    '[class*="Toast"]',
    '[class*="notification"]',
    '[class*="Notification"]',
    '[class*="message"]',
    '[role="alert"]',
    '[aria-live="polite"]',
    '[aria-live="assertive"]',
    // Dutchie specific
    '[data-testid="cart-error"]',
    '[data-testid="quantity-error"]',
    '[class*="inventory-error"]',
    '[class*="InventoryError"]',
    '[class*="stock-error"]',
    '[class*="StockError"]',
    // Modal/popup that might contain error
    '[class*="modal"] [class*="error"]',
    '[class*="Modal"] [class*="Error"]',
  ];

  for (const selector of errorSelectors) {
    try {
      const elements = await page.$$(selector);
      for (const el of elements) {
        const text = await el.textContent();
        if (text) {
          const cleanText = text.trim();
          // Look for inventory-related error messages
          if (
            cleanText.toLowerCase().includes('only') ||
            cleanText.toLowerCase().includes('available') ||
            cleanText.toLowerCase().includes('stock') ||
            cleanText.toLowerCase().includes('inventory') ||
            cleanText.toLowerCase().includes('remaining') ||
            cleanText.toLowerCase().includes('left') ||
            cleanText.toLowerCase().includes('exceed') ||
            cleanText.toLowerCase().includes('limit') ||
            cleanText.toLowerCase().includes('maximum')
          ) {
            return cleanText;
          }
        }
      }
    } catch {}
  }

  // Also check for any visible text containing inventory patterns
  const inventoryPatterns = await page.evaluate(() => {
    const body = document.body.textContent || '';
    const patterns = [
      /only\s*\d+\s*(available|left|in stock|remaining)/gi,
      /\d+\s*(available|left|in stock|remaining)/gi,
      /cannot add.*exceed/gi,
      /maximum.*\d+/gi,
      /limit.*\d+/gi,
    ];
    
    const matches: string[] = [];
    for (const pattern of patterns) {
      const found = body.match(pattern);
      if (found) {
        matches.push(...found);
      }
    }
    return matches;
  });

  if (inventoryPatterns.length > 0) {
    return inventoryPatterns[0];
  }

  return null;
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('='.repeat(70));
  console.log('CART OVERFLOW TECHNIQUE TEST - CONBUD');
  console.log('='.repeat(70));
  console.log(`Target: https://conbud.com/menu`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log('='.repeat(70));

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });

  const page = await context.newPage();
  const allResults: CartOverflowResult[] = [];

  try {
    // First, get product links from the menu
    console.log('\n📋 Loading menu page to find products...');
    await page.goto('https://conbud.com/menu', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(3000, 4000);
    
    await handleAgeVerification(page);
    await randomDelay(2000, 3000);

    // Screenshot the menu
    const menuScreenshot = path.join(OUTPUT_DIR, `menu-${Date.now()}.png`);
    await page.screenshot({ path: menuScreenshot, fullPage: true });
    console.log(`Menu screenshot: ${menuScreenshot}`);

    // Get product links
    let productLinks = await getProductLinks(page);
    console.log(`Found ${productLinks.length} product links`);
    
    // If no product links found, try navigating to a category
    if (productLinks.length === 0) {
      console.log('No product links on menu page, trying flower category...');
      
      // Look for category links
      const flowerLink = await page.$('a[href*="flower"], a:has-text("Flower")');
      if (flowerLink) {
        await flowerLink.click();
        await randomDelay(3000, 4000);
        productLinks = await getProductLinks(page);
        console.log(`Found ${productLinks.length} product links in flower category`);
      }
    }

    // If still no links, try direct URL patterns
    if (productLinks.length === 0) {
      console.log('Trying direct product URL...');
      // Try a known Dutchie URL pattern
      const testUrls = [
        'https://conbud.com/stores/conbud-les/products/flower',
        'https://conbud.com/products/flower',
      ];
      
      for (const testUrl of testUrls) {
        console.log(`Trying: ${testUrl}`);
        await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await randomDelay(2000, 3000);
        await handleAgeVerification(page);
        productLinks = await getProductLinks(page);
        if (productLinks.length > 0) {
          console.log(`Found ${productLinks.length} products at ${testUrl}`);
          break;
        }
      }
    }

    // Log the current page state
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);
    
    // Get the first product to test
    if (productLinks.length > 0) {
      // Convert relative URLs to absolute
      const baseUrl = new URL(currentUrl);
      const absoluteLinks = productLinks.map(link => {
        if (link.startsWith('http')) return link;
        return `${baseUrl.origin}${link}`;
      });
      
      console.log('\n📦 Testing products:');
      absoluteLinks.slice(0, 3).forEach(link => console.log(`  - ${link}`));

      // Test both techniques on the first product
      const testProduct = absoluteLinks[0];
      
      console.log('\n\n🧪 TEST 1: Single High Quantity (99)');
      console.log('='.repeat(50));
      const result1 = await testCartOverflow(page, testProduct, 'single_high');
      allResults.push(result1);

      // Clear cart or use a different product for second test
      if (absoluteLinks.length > 1) {
        console.log('\n\n🧪 TEST 2: Repeated Add (10 x multiple)');
        console.log('='.repeat(50));
        const result2 = await testCartOverflow(page, absoluteLinks[1], 'repeated_add');
        allResults.push(result2);
      }
    } else {
      // No product links - try clicking on a product card directly
      console.log('\n⚠️ No product links found. Attempting to click product cards...');
      
      const productCards = await page.$$('[data-testid*="product"], [class*="product-card"], [class*="ProductCard"]');
      console.log(`Found ${productCards.length} product cards`);
      
      if (productCards.length > 0) {
        await productCards[0].click();
        await randomDelay(3000, 4000);
        
        const productUrl = page.url();
        console.log(`Navigated to: ${productUrl}`);
        
        const result = await testCartOverflow(page, productUrl, 'single_high');
        allResults.push(result);
      }
    }

  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    
    // Save error screenshot
    try {
      const errorScreenshot = path.join(OUTPUT_DIR, `error-${Date.now()}.png`);
      await page.screenshot({ path: errorScreenshot, fullPage: true });
      console.log(`Error screenshot: ${errorScreenshot}`);
    } catch {}
  } finally {
    await browser.close();
  }

  // === SAVE RESULTS ===
  console.log('\n\n' + '='.repeat(70));
  console.log('RESULTS SUMMARY');
  console.log('='.repeat(70));

  const resultsPath = path.join(OUTPUT_DIR, `results-${Date.now()}.json`);
  fs.writeFileSync(resultsPath, JSON.stringify(allResults, null, 2));
  console.log(`\nResults saved to: ${resultsPath}`);

  // Create markdown summary
  let markdown = `# Cart Overflow Technique Test Results\n\n`;
  markdown += `**Date:** ${new Date().toISOString()}\n`;
  markdown += `**Target:** https://conbud.com/menu\n\n`;
  markdown += `## Summary\n\n`;
  markdown += `| Product | Technique | Quantity | Error Message | Inventory Revealed | Success |\n`;
  markdown += `|---------|-----------|----------|---------------|-------------------|--------|\n`;
  
  for (const r of allResults) {
    markdown += `| ${r.productName?.substring(0, 30) || 'Unknown'} | ${r.technique} | ${r.quantityAttempted} | ${r.errorMessage?.substring(0, 40) || 'None'} | ${r.inventoryRevealed ?? '-'} | ${r.success ? '✅' : '❌'} |\n`;
  }

  markdown += `\n## Detailed Results\n\n`;
  
  for (const r of allResults) {
    markdown += `### ${r.productName || 'Unknown Product'}\n\n`;
    markdown += `- **URL:** ${r.productUrl}\n`;
    markdown += `- **Technique:** ${r.technique}\n`;
    markdown += `- **Quantity Attempted:** ${r.quantityAttempted}\n`;
    markdown += `- **Error Message:** ${r.errorMessage || 'None captured'}\n`;
    markdown += `- **Inventory Revealed:** ${r.inventoryRevealed ?? 'Not revealed'}\n`;
    markdown += `- **Success:** ${r.success ? 'Yes ✅' : 'No ❌'}\n`;
    markdown += `- **Screenshot:** ${r.screenshotPath}\n\n`;
    markdown += `**Notes:**\n\`\`\`\n${r.notes.join('\n')}\n\`\`\`\n\n`;
  }

  markdown += `## Findings\n\n`;
  
  const successCount = allResults.filter(r => r.success).length;
  if (successCount > 0) {
    markdown += `✅ **Cart overflow technique WORKS** - Successfully revealed inventory on ${successCount}/${allResults.length} tests\n\n`;
    markdown += `### Recommended Approach:\n`;
    const successfulTechnique = allResults.find(r => r.success)?.technique;
    markdown += `- **Best technique:** ${successfulTechnique === 'single_high' ? 'Single high quantity (99)' : 'Repeated add (10x)'}\n`;
  } else {
    markdown += `❌ **Cart overflow technique did NOT reveal inventory**\n\n`;
    markdown += `### Possible reasons:\n`;
    markdown += `- Dutchie may not show error messages for over-quantity\n`;
    markdown += `- Site may cap quantity at available stock without error\n`;
    markdown += `- Need to test more products or different categories\n`;
  }

  const markdownPath = path.join(OUTPUT_DIR, 'results.md');
  fs.writeFileSync(markdownPath, markdown);
  console.log(`\nMarkdown report saved to: ${markdownPath}`);

  // Print summary to console
  console.log('\n📊 RESULTS:');
  for (const r of allResults) {
    console.log(`\n  ${r.productName || 'Unknown'}:`);
    console.log(`    Technique: ${r.technique}`);
    console.log(`    Error: ${r.errorMessage || 'None'}`);
    console.log(`    Inventory: ${r.inventoryRevealed ?? 'Not revealed'}`);
    console.log(`    Success: ${r.success ? '✅' : '❌'}`);
  }
}

main().catch(console.error);
