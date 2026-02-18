#!/usr/bin/env npx tsx
/**
 * Inventory Scraper - Production-ready scraper for Dutchie-embedded menus
 * Extracts product data + inventory counts and pushes to Convex
 * 
 * Usage:
 *   npx tsx scripts/inventory-scraper.ts --store conbud-les
 *   npx tsx scripts/inventory-scraper.ts --all
 *   npx tsx scripts/inventory-scraper.ts --store conbud-les --max-products 10 --dry-run
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createBrowserSession, navigateWithRetry, handleAgeVerification } from './lib/browserbase-client.js';
import { 
  getProductCards, 
  clickProductCard, 
  extractInventoryFromModal, 
  closeModal,
  scrollToLoadMore,
  hasNextPage,
  goToNextPage,
  type ProductInventory 
} from './lib/dutchie-extractor.js';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// TYPES
// ============================================================

interface ScraperConfig {
  storeSlug: string;
  menuUrl: string;
  retailerName: string;
  retailerId?: string;  // Convex ID if known
  maxProducts?: number;
  delayBetweenProducts?: number;
}

interface ScrapedItem {
  rawProductName: string;
  rawBrandName: string;
  rawCategory?: string;
  subcategory?: string;
  strainType?: string;
  price: number;
  originalPrice?: number;
  inStock: boolean;
  imageUrl?: string;
  thcFormatted?: string;
  cbdFormatted?: string;
  inventoryCount?: number;
  sourceUrl: string;
  sourcePlatform: string;
  scrapedAt: number;
}

interface ScrapeResult {
  storeSlug: string;
  retailerName: string;
  status: 'ok' | 'error';
  items: ScrapedItem[];
  error?: string;
  duration: number;
  timestamp: string;
}

interface StoreLocation {
  name: string;
  menuUrl: string;
  allProductsUrl?: string;
  address?: { city: string; state: string };
  region?: string;
}

interface StoreRegistry {
  retailers: Array<{
    name: string;
    slug: string;
    menuPlatform: string;
    locations: StoreLocation[];
  }>;
}

// ============================================================
// CLI ARGUMENT PARSING
// ============================================================

function parseArgs(): {
  store?: string;
  all: boolean;
  maxProducts?: number;
  dryRun: boolean;
  verbose: boolean;
} {
  const args = process.argv.slice(2);
  const result = {
    store: undefined as string | undefined,
    all: false,
    maxProducts: undefined as number | undefined,
    dryRun: false,
    verbose: false,
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--store' && args[i + 1]) {
      result.store = args[++i];
    } else if (arg === '--all') {
      result.all = true;
    } else if (arg === '--max-products' && args[i + 1]) {
      result.maxProducts = parseInt(args[++i], 10);
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--verbose' || arg === '-v') {
      result.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Inventory Scraper - Extract product inventory from Dutchie-embedded menus

Usage:
  npx tsx scripts/inventory-scraper.ts --store <slug>  Scrape single store
  npx tsx scripts/inventory-scraper.ts --all           Scrape all stores
  
Options:
  --store <slug>        Store slug (e.g., conbud-les, gotham)
  --all                 Scrape all stores in registry
  --max-products <n>    Limit products per store (for testing)
  --dry-run             Scrape but don't push to Convex
  --verbose, -v         Show detailed logging
  --help, -h            Show this help

Examples:
  npx tsx scripts/inventory-scraper.ts --store conbud-les --max-products 5 --dry-run
  npx tsx scripts/inventory-scraper.ts --all --max-products 20
`);
      process.exit(0);
    }
  }
  
  return result;
}

// ============================================================
// STORE REGISTRY
// ============================================================

function loadStoreRegistry(): StoreRegistry {
  const registryPath = path.join(__dirname, '../data/embedded-dutchie-retailers.json');
  const data = fs.readFileSync(registryPath, 'utf-8');
  return JSON.parse(data);
}

function findStore(registry: StoreRegistry, slug: string): { retailer: StoreRegistry['retailers'][0]; location: StoreLocation } | null {
  // Try exact slug match on retailer
  for (const retailer of registry.retailers) {
    if (retailer.slug === slug) {
      return { retailer, location: retailer.locations[0] };
    }
    
    // Try matching location by name/slug
    for (const loc of retailer.locations) {
      const locSlug = loc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (locSlug === slug || locSlug.includes(slug)) {
        return { retailer, location: loc };
      }
    }
  }
  
  return null;
}

function getAllStores(registry: StoreRegistry): Array<{ retailer: StoreRegistry['retailers'][0]; location: StoreLocation }> {
  const stores: Array<{ retailer: StoreRegistry['retailers'][0]; location: StoreLocation }> = [];
  
  for (const retailer of registry.retailers) {
    for (const location of retailer.locations) {
      stores.push({ retailer, location });
    }
  }
  
  return stores;
}

// ============================================================
// SCRAPER CORE
// ============================================================

async function scrapeStore(config: ScraperConfig, verbose = false): Promise<ScrapeResult> {
  const startTime = Date.now();
  const items: ScrapedItem[] = [];
  let error: string | undefined;
  
  const log = verbose ? console.log : () => {};
  
  try {
    log(`\n[Scraper] Starting scrape for ${config.retailerName}`);
    log(`[Scraper] URL: ${config.menuUrl}`);
    
    const session = await createBrowserSession();
    
    try {
      await navigateWithRetry(session.page, config.menuUrl);
      await handleAgeVerification(session.page);
      
      // Scroll to load all products (infinite scroll)
      log('[Scraper] Loading all products...');
      let loadedMore = 0;
      for (let i = 0; i < 5; i++) {
        const newProducts = await scrollToLoadMore(session.page);
        if (newProducts === 0) break;
        loadedMore += newProducts;
        log(`[Scraper] Loaded ${newProducts} more products`);
      }
      
      // Get all product cards
      const cards = await getProductCards(session.page);
      const maxProducts = config.maxProducts || cards.length;
      const productsToScrape = Math.min(maxProducts, cards.length);
      
      log(`[Scraper] Found ${cards.length} products, scraping ${productsToScrape}`);
      
      // Click each product and extract inventory
      for (let i = 0; i < productsToScrape; i++) {
        const card = cards[i];
        log(`[Scraper] Processing ${i + 1}/${productsToScrape}: ${card.name}`);
        
        try {
          // Click to open modal
          const clicked = await clickProductCard(session.page, i);
          
          let inventoryCount = 0;
          let thcPercent: number | undefined;
          let cbdPercent: number | undefined;
          let weight: string | undefined;
          
          if (clicked) {
            // Extract inventory from modal
            const modalData = await extractInventoryFromModal(session.page);
            inventoryCount = modalData.inventoryCount;
            thcPercent = modalData.thcPercent;
            cbdPercent = modalData.cbdPercent;
            weight = modalData.weight;
            
            if (inventoryCount > 0) {
              log(`  → Inventory: ${inventoryCount} left in stock`);
            }
            
            // Close modal
            await closeModal(session.page);
          }
          
          const scrapedItem: ScrapedItem = {
            rawProductName: card.name,
            rawBrandName: card.brand,
            rawCategory: card.category || inferCategory(config.menuUrl),
            price: card.price,
            originalPrice: card.originalPrice,
            inStock: card.inStock && inventoryCount !== 0,
            imageUrl: card.imageUrl,
            thcFormatted: thcPercent ? `${thcPercent}%` : undefined,
            cbdFormatted: cbdPercent ? `${cbdPercent}%` : undefined,
            inventoryCount: inventoryCount > 0 ? inventoryCount : undefined,
            sourceUrl: config.menuUrl,
            sourcePlatform: 'dutchie-embedded',
            scrapedAt: Date.now(),
          };
          
          items.push(scrapedItem);
          
          // Delay between products
          if (config.delayBetweenProducts) {
            await session.page.waitForTimeout(config.delayBetweenProducts);
          }
          
        } catch (err) {
          log(`  → Error: ${(err as Error).message}`);
          // Continue with next product
        }
      }
      
      // Check for pagination
      if (items.length < (config.maxProducts || Infinity) && await hasNextPage(session.page)) {
        log('[Scraper] More pages available (pagination not implemented yet)');
      }
      
    } finally {
      await session.close();
    }
    
  } catch (err) {
    error = (err as Error).message;
    console.error(`[Scraper] Error scraping ${config.retailerName}: ${error}`);
  }
  
  const duration = Date.now() - startTime;
  
  return {
    storeSlug: config.storeSlug,
    retailerName: config.retailerName,
    status: error ? 'error' : 'ok',
    items,
    error,
    duration,
    timestamp: new Date().toISOString(),
  };
}

function inferCategory(url: string): string {
  if (url.includes('/flower')) return 'flower';
  if (url.includes('/pre-roll')) return 'pre_roll';
  if (url.includes('/vape')) return 'vape';
  if (url.includes('/edible')) return 'edible';
  if (url.includes('/concentrate')) return 'concentrate';
  return 'other';
}

// ============================================================
// CONVEX INTEGRATION
// ============================================================

const CONVEX_SITE_URL = 'https://quick-weasel-225.convex.site';
const CONVEX_URL = 'https://quick-weasel-225.convex.cloud';

interface ConvexPayload {
  batchId: string;
  results: Array<{
    retailerId: string;
    items: ScrapedItem[];
    status: string;
    error?: string;
  }>;
}

/**
 * Look up retailer ID by slug via Convex HTTP function
 */
async function getRetailerBySlug(slug: string): Promise<string | null> {
  try {
    // Use Convex's function API to call retailers:getBySlug
    const response = await fetch(`${CONVEX_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: 'retailers:getBySlug',
        args: { slug },
      }),
    });
    
    if (!response.ok) {
      console.log(`[Convex] Retailer lookup failed: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    if (data.value && data.value._id) {
      return data.value._id;
    }
    return null;
  } catch (err) {
    console.log(`[Convex] Retailer lookup error: ${(err as Error).message}`);
    return null;
  }
}

async function pushToConvex(results: ScrapeResult[], dryRun = false): Promise<{ success: boolean; message: string }> {
  if (dryRun) {
    console.log('\n[Convex] DRY RUN - Would push to Convex:');
    for (const result of results) {
      console.log(`  ${result.retailerName}: ${result.items.length} items`);
    }
    return { success: true, message: 'Dry run - no data pushed' };
  }
  
  // Generate batch ID
  const batchId = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  console.log('\n[Convex] Preparing payload...');
  console.log(`[Convex] Batch ID: ${batchId}`);
  
  const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);
  console.log(`[Convex] Total items: ${totalItems}`);
  
  // Look up retailer IDs
  const convexResults: ConvexPayload['results'] = [];
  let skippedStores = 0;
  
  for (const result of results) {
    const retailerId = await getRetailerBySlug(result.storeSlug);
    
    if (!retailerId) {
      console.log(`[Convex] Warning: No retailer found for slug "${result.storeSlug}", skipping`);
      skippedStores++;
      continue;
    }
    
    console.log(`[Convex] Found retailer: ${result.storeSlug} → ${retailerId}`);
    
    convexResults.push({
      retailerId,
      items: result.items,
      status: result.status,
      error: result.error,
    });
  }
  
  if (convexResults.length === 0) {
    return { 
      success: false, 
      message: `No retailers found in Convex. Skipped ${skippedStores} stores.` 
    };
  }
  
  // Push to Convex
  try {
    const payload: ConvexPayload = { batchId, results: convexResults };
    
    const response = await fetch(`${CONVEX_SITE_URL}/ingest/scraped-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[Convex] Push failed: ${response.status} - ${errorText}`);
      return { success: false, message: `Push failed: ${response.status}` };
    }
    
    const data = await response.json();
    console.log(`[Convex] Push successful:`, data);
    
    return { 
      success: true, 
      message: `Pushed ${totalItems} items to Convex (${skippedStores} stores skipped)` 
    };
    
  } catch (err) {
    console.log(`[Convex] Push error: ${(err as Error).message}`);
    return { success: false, message: (err as Error).message };
  }
}

// ============================================================
// LOGGING
// ============================================================

function saveToLog(results: ScrapeResult[]): string {
  const logDir = path.join(__dirname, '../data/scrape-logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `inventory-scrape-${timestamp}.json`;
  const filepath = path.join(logDir, filename);
  
  const logData = {
    timestamp: new Date().toISOString(),
    totalStores: results.length,
    totalProducts: results.reduce((sum, r) => sum + r.items.length, 0),
    withInventory: results.reduce((sum, r) => sum + r.items.filter(i => i.inventoryCount && i.inventoryCount > 0).length, 0),
    results,
  };
  
  fs.writeFileSync(filepath, JSON.stringify(logData, null, 2));
  console.log(`\n[Log] Saved to ${filepath}`);
  
  return filepath;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const args = parseArgs();
  
  if (!args.store && !args.all) {
    console.error('Error: Must specify --store <slug> or --all');
    console.error('Run with --help for usage');
    process.exit(1);
  }
  
  const registry = loadStoreRegistry();
  const results: ScrapeResult[] = [];
  
  if (args.store) {
    // Single store mode
    const storeInfo = findStore(registry, args.store);
    if (!storeInfo) {
      console.error(`Error: Store "${args.store}" not found in registry`);
      console.error('Available stores:');
      for (const r of registry.retailers) {
        console.error(`  - ${r.slug}`);
        for (const loc of r.locations) {
          const locSlug = loc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          console.error(`    - ${locSlug}`);
        }
      }
      process.exit(1);
    }
    
    const config: ScraperConfig = {
      storeSlug: args.store,
      menuUrl: storeInfo.location.allProductsUrl || storeInfo.location.menuUrl,
      retailerName: storeInfo.location.name,
      maxProducts: args.maxProducts,
      delayBetweenProducts: 500,
    };
    
    const result = await scrapeStore(config, args.verbose);
    results.push(result);
    
  } else if (args.all) {
    // All stores mode
    const stores = getAllStores(registry);
    console.log(`\n[Scraper] Scraping ${stores.length} stores...`);
    
    for (let i = 0; i < stores.length; i++) {
      const { retailer, location } = stores[i];
      console.log(`\n[${i + 1}/${stores.length}] ${location.name}`);
      
      const config: ScraperConfig = {
        storeSlug: retailer.slug,
        menuUrl: location.allProductsUrl || location.menuUrl,
        retailerName: location.name,
        maxProducts: args.maxProducts,
        delayBetweenProducts: 500,
      };
      
      const result = await scrapeStore(config, args.verbose);
      results.push(result);
      
      // Delay between stores to avoid rate limiting
      if (i < stores.length - 1) {
        console.log('[Scraper] Waiting 5s before next store...');
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }
  
  // Save to local log
  const logPath = saveToLog(results);
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SCRAPE SUMMARY');
  console.log('='.repeat(60));
  console.log(`Stores scraped: ${results.length}`);
  console.log(`Total products: ${results.reduce((s, r) => s + r.items.length, 0)}`);
  console.log(`With inventory data: ${results.reduce((s, r) => s + r.items.filter(i => i.inventoryCount && i.inventoryCount > 0).length, 0)}`);
  console.log(`Successful: ${results.filter(r => r.status === 'ok').length}`);
  console.log(`Failed: ${results.filter(r => r.status === 'error').length}`);
  
  for (const result of results) {
    const invCount = result.items.filter(i => i.inventoryCount && i.inventoryCount > 0).length;
    const statusIcon = result.status === 'ok' ? '✓' : '✗';
    console.log(`\n${statusIcon} ${result.retailerName}`);
    console.log(`  Products: ${result.items.length}`);
    console.log(`  With inventory: ${invCount}`);
    console.log(`  Duration: ${(result.duration / 1000).toFixed(1)}s`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
  }
  
  // Push to Convex
  const convexResult = await pushToConvex(results, args.dryRun);
  console.log(`\n[Convex] ${convexResult.message}`);
  
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
