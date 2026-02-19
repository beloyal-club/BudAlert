#!/usr/bin/env node
/**
 * Test Phase 1 Scraper - BrowserBase Embedded Dutchie
 * 
 * Usage: node test-phase1-scraper.mjs
 */

import { chromium } from 'playwright';

const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY || 'bb_live_9DOgx7Trvyon7_zMAvtVxrpugDI';
const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID || '5838b775-9417-42f0-b272-c0142eec43b7';

const TEST_URL = "https://conbud.com/stores/conbud-les/products";

async function testScrape() {
  console.log("🚀 Testing BrowserBase scraper...");
  console.log(`📍 URL: ${TEST_URL}`);
  
  try {
    // Connect via CDP
    console.log("\n1️⃣ Connecting to BrowserBase...");
    const browser = await chromium.connectOverCDP(
      `wss://connect.browserbase.com?apiKey=${BROWSERBASE_API_KEY}&projectId=${BROWSERBASE_PROJECT_ID}`
    );
    console.log("   ✓ Connected");
    
    const context = browser.contexts()[0] || await browser.newContext();
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    
    // Navigate
    console.log("\n2️⃣ Navigating to menu page...");
    await page.goto(TEST_URL, { waitUntil: 'load', timeout: 30000 });
    console.log("   ✓ Page loaded");
    
    // Wait for products to render
    console.log("\n3️⃣ Waiting for products to load...");
    await page.waitForTimeout(5000);
    
    // Extract products
    console.log("\n4️⃣ Extracting products...");
    const products = await page.evaluate(() => {
      const items = [];
      
      // Try multiple selector patterns for different Dutchie embed types
      const selectors = [
        '[data-testid="product-card"]',
        '.product-card',
        '[class*="ProductCard"]',
        '[class*="product-card"]',
        'div[class*="styles_productCard"]',
      ];
      
      let productCards = [];
      for (const selector of selectors) {
        const found = document.querySelectorAll(selector);
        if (found.length > 0) {
          productCards = found;
          break;
        }
      }
      
      // If no cards found, try finding product info directly
      if (productCards.length === 0) {
        // Look for price elements as anchor
        const priceEls = document.querySelectorAll('[class*="price"], [class*="Price"]');
        priceEls.forEach(priceEl => {
          const card = priceEl.closest('a') || priceEl.closest('div[class*="product"]') || priceEl.parentElement?.parentElement;
          if (card && !productCards.includes(card)) {
            productCards.push(card);
          }
        });
      }
      
      productCards.forEach((card, idx) => {
        try {
          // Product name
          const nameEl = card.querySelector('h2, h3, [class*="productName"], [class*="ProductName"], [class*="name"]');
          const name = nameEl?.textContent?.trim();
          if (!name || name.length < 3) return;
          
          // Brand
          const brandEl = card.querySelector('[class*="brandName"], [class*="BrandName"], [class*="brand"]');
          const brand = brandEl?.textContent?.trim() || "Unknown";
          
          // Price
          const priceEl = card.querySelector('[class*="price"], .price');
          const priceText = priceEl?.textContent || "";
          const priceMatch = priceText.match(/\$(\d+(?:\.\d{2})?)/);
          const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
          
          // THC
          const thcEl = card.querySelector('[class*="thc"], [class*="THC"]');
          const thc = thcEl?.textContent?.trim();
          
          if (price > 0) {
            items.push({ name, brand, price, thc });
          }
        } catch (e) {
          // Skip malformed
        }
      });
      
      return {
        products: items,
        debug: {
          url: window.location.href,
          divCount: document.querySelectorAll('div').length,
          bodyLen: document.body.innerText.length,
          hasProducts: document.body.innerText.includes('THC'),
        }
      };
    });
    
    console.log(`\n✅ Found ${products.products.length} products!`);
    console.log(`   Debug: ${products.debug.divCount} divs, ${products.debug.bodyLen} chars`);
    
    if (products.products.length > 0) {
      console.log("\nSample products:");
      products.products.slice(0, 10).forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.brand} - ${p.name} ($${p.price}) ${p.thc || ''}`);
      });
    } else {
      // Save screenshot for debugging
      await page.screenshot({ path: '/tmp/phase1-debug.png', fullPage: true });
      console.log("\n⚠️  No products found. Screenshot saved to /tmp/phase1-debug.png");
      
      // Try getting page content for debugging
      const pageText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
      console.log("\nPage content preview:");
      console.log(pageText);
    }
    
    // Cleanup
    await browser.close();
    
    console.log("\n✨ Test complete!");
    return products.products;
    
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    throw error;
  }
}

testScrape().catch(() => process.exit(1));
