/**
 * Test: Cloudflare Browser Rendering for Inventory Extraction
 * 
 * Tests two approaches:
 * 1. Worker /menu endpoint (existing)
 * 2. Direct CDP connection (if supported)
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';

const CDP_SECRET = process.env.CDP_SECRET;
const WORKER_URL = 'https://cannasignal-browser.prtl.workers.dev';
const TEST_URL = 'https://conbud.com/stores/conbud-les/products/flower';

const results = {
  timestamp: new Date().toISOString(),
  testUrl: TEST_URL,
  workerUrl: WORKER_URL,
  approaches: {}
};

// ============================================================
// Approach 1: Worker /menu endpoint
// ============================================================
async function testWorkerEndpoint() {
  console.log('\n📦 APPROACH 1: Worker /menu Endpoint');
  console.log('=' .repeat(50));
  
  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    
    const response = await fetch(
      `${WORKER_URL}/menu?url=${encodeURIComponent(TEST_URL)}&secret=${CDP_SECRET}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    
    const data = await response.json();
    const duration = Date.now() - startTime;
    
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`📊 Status: ${response.status}`);
    console.log(`📦 Response:`, JSON.stringify(data, null, 2));
    
    results.approaches.workerEndpoint = {
      status: data.success ? 'success' : 'failed',
      durationMs: duration,
      productsFound: data.count || 0,
      products: data.products?.slice(0, 5) || [],
      error: data.error || null,
      rawResponse: data
    };
    
    // Check for inventory data
    const productsWithInventory = (data.products || []).filter(p => p.stock !== null);
    console.log(`\n📊 Products with inventory data: ${productsWithInventory.length}/${data.count || 0}`);
    
    if (productsWithInventory.length > 0) {
      console.log('Sample products with inventory:');
      productsWithInventory.slice(0, 5).forEach(p => {
        console.log(`  - ${p.name}: ${p.stock} left`);
      });
    }
    
    return data.success;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Error: ${error.message}`);
    
    results.approaches.workerEndpoint = {
      status: 'error',
      durationMs: duration,
      error: error.message
    };
    
    return false;
  }
}

// ============================================================
// Approach 2: Direct CDP Connection
// ============================================================
async function testDirectCDP() {
  console.log('\n🔌 APPROACH 2: Direct CDP Connection');
  console.log('=' .repeat(50));
  
  const cdpUrl = `wss://${WORKER_URL.replace('https://', '')}/cdp?secret=${CDP_SECRET}`;
  console.log(`🔗 Connecting to: ${cdpUrl.replace(CDP_SECRET, '***')}`);
  
  const startTime = Date.now();
  
  try {
    const browser = await chromium.connectOverCDP(cdpUrl, { timeout: 30000 });
    console.log('✅ Connected!');
    
    const context = browser.contexts()[0] || await browser.newContext();
    const page = await context.newPage();
    
    console.log('📄 Navigating to test URL...');
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for content
    await page.waitForTimeout(3000);
    
    // Check for iframes (Dutchie menus)
    const frames = page.frames();
    console.log(`📐 Found ${frames.length} frames`);
    
    let dutchieFrame = null;
    for (const frame of frames) {
      if (frame.url().includes('dutchie')) {
        dutchieFrame = frame;
        console.log('✅ Found Dutchie iframe');
        break;
      }
    }
    
    const targetFrame = dutchieFrame || page;
    
    // Extract products
    const products = await targetFrame.evaluate(() => {
      const items = [];
      const cards = document.querySelectorAll('[data-testid*="product"], [class*="product-card"], [class*="ProductCard"]');
      
      cards.forEach((card, i) => {
        if (i >= 10) return;
        
        const name = card.querySelector('h2, h3, [class*="name"]')?.textContent?.trim();
        const price = card.querySelector('[class*="price"]')?.textContent?.trim();
        
        // Check for stock warnings
        const cardText = card.textContent || '';
        const stockMatch = cardText.match(/only (\d+) left|(\d+) remaining/i);
        const stock = stockMatch ? parseInt(stockMatch[1] || stockMatch[2]) : null;
        
        if (name) items.push({ name, price, stock });
      });
      
      return items;
    });
    
    const duration = Date.now() - startTime;
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`📦 Found ${products.length} products`);
    
    products.slice(0, 5).forEach(p => {
      console.log(`  - ${p.name}: ${p.price || 'no price'}${p.stock ? ` (${p.stock} left)` : ''}`);
    });
    
    await browser.close();
    
    results.approaches.directCDP = {
      status: 'success',
      durationMs: duration,
      productsFound: products.length,
      products: products.slice(0, 5),
      framesFound: frames.length,
      hasDutchieIframe: !!dutchieFrame
    };
    
    return true;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ CDP Error: ${error.message}`);
    
    // Check specific error types
    let limitation = 'Unknown error';
    if (error.message.includes('WebSocket')) {
      limitation = 'CF Browser Rendering does not expose CDP WebSocket endpoint externally';
    } else if (error.message.includes('timeout')) {
      limitation = 'Connection timed out - CDP may not be supported';
    } else if (error.message.includes('401') || error.message.includes('403')) {
      limitation = 'Authentication failed or endpoint not available';
    }
    
    results.approaches.directCDP = {
      status: 'failed',
      durationMs: duration,
      error: error.message,
      limitation
    };
    
    return false;
  }
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('🧪 CF Browser Rendering Inventory Extraction Test');
  console.log('=' .repeat(60));
  console.log(`📍 Test URL: ${TEST_URL}`);
  console.log(`🔧 Worker: ${WORKER_URL}`);
  console.log(`🔑 CDP Secret: ${CDP_SECRET?.substring(0, 10)}...`);
  
  // Test both approaches
  await testWorkerEndpoint();
  await testDirectCDP();
  
  // Summary
  console.log('\n' + '=' .repeat(60));
  console.log('📋 SUMMARY');
  console.log('=' .repeat(60));
  
  const summary = {
    workerEndpoint: results.approaches.workerEndpoint?.status || 'not tested',
    directCDP: results.approaches.directCDP?.status || 'not tested',
    inventoryExtraction: 'See details below',
    limitations: []
  };
  
  // Analyze results
  if (results.approaches.workerEndpoint?.status === 'success') {
    const products = results.approaches.workerEndpoint.products || [];
    const withInventory = products.filter(p => p.stock !== null);
    summary.inventoryExtraction = `Worker found ${results.approaches.workerEndpoint.productsFound} products, ${withInventory.length} with inventory`;
  }
  
  if (results.approaches.directCDP?.status === 'failed') {
    summary.limitations.push(results.approaches.directCDP.limitation);
  }
  
  // Check if worker can get inventory
  if (results.approaches.workerEndpoint?.status === 'success') {
    const products = results.approaches.workerEndpoint.products || [];
    if (products.every(p => p.stock === null)) {
      summary.limitations.push('Worker scrapes products but inventory data not visible (no "X left" warnings on product cards)');
      summary.limitations.push('Need add-to-cart approach which requires interactive session');
    }
  }
  
  results.summary = summary;
  
  console.log(JSON.stringify(summary, null, 2));
  
  // Write results
  await fs.writeFile(
    '/root/clawd/cannasignal/test-results/cf-browser-inventory.json',
    JSON.stringify(results, null, 2)
  );
  console.log('\n✅ Results written to test-results/cf-browser-inventory.json');
}

main().catch(console.error);
