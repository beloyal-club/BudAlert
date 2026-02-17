/**
 * iHeartJane Menu Scraper - DATA-002
 * 
 * Fetches product data from iHeartJane-powered dispensary menus.
 * 
 * STATUS: READY FOR USE (when NYS retailers adopt Jane)
 * 
 * NOTE: As of 2026-02-17, NYS adult-use dispensaries predominantly use Dutchie.
 * Jane is primarily used by medical/MSO dispensaries. This scraper is ready
 * for future use if adult-use retailers adopt Jane.
 * 
 * Jane API Endpoints (require browser context due to Cloudflare):
 * - Products: https://api.iheartjane.com/v1/stores/{storeId}/products
 * - Store embed: https://api.iheartjane.com/v1/stores/{storeId}/embed.js
 * 
 * Finding Store IDs:
 * 1. Visit the dispensary's Jane-powered menu page
 * 2. Open DevTools (F12) -> Network tab
 * 3. Search for "iheartjane.com/v1/stores/"
 * 4. The number after /stores/ is the store ID
 */

import { writeFileSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Dynamic import for playwright (only needed for scraping)
let chromium: any = null;
async function getChromium() {
  if (!chromium) {
    try {
      const playwright = await import('playwright');
      chromium = playwright.chromium;
    } catch (e) {
      throw new Error('Playwright is not installed. Install with: npm install playwright');
    }
  }
  return chromium;
}

// Import normalizer (compile-time import is fine)
import { normalizeProductName, type NormalizedProduct } from '../convex/lib/productNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Jane API configuration
const JANE_API_BASE = 'https://api.iheartjane.com/v1';

interface JaneProduct {
  id: number;
  name: string;
  brand_name: string;
  category: string;
  subcategory?: string;
  strain_type?: string; // "Indica" | "Sativa" | "Hybrid"
  thc_percentage?: number;
  cbd_percentage?: number;
  price_each?: number;
  price_half_gram?: number;
  price_gram?: number;
  price_two_gram?: number;
  price_eighth?: number;
  price_quarter?: number;
  price_half_ounce?: number;
  price_ounce?: number;
  available_weights?: string[];
  image_url?: string;
  description?: string;
  effects?: string[];
  terpenes?: string[];
  product_percent_thc?: number;
  product_percent_cbd?: number;
}

interface JaneStoreInfo {
  id: number;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

interface ScrapedProduct {
  raw: JaneProduct;
  normalized: NormalizedProduct;
  prices: {
    unit: string;
    price: number;
  }[];
  storeId: string;
  scrapedAt: number;
}

/**
 * Fetch products from Jane API via browser (to bypass Cloudflare)
 * NOTE: Direct API calls are blocked by Cloudflare
 */
export async function fetchJaneProductsViaBrowser(
  storeId: string
): Promise<JaneProduct[]> {
  const chromiumModule = await getChromium();
  const browser = await chromiumModule.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  
  try {
    const page = await context.newPage();
    
    // Navigate to the store's Jane page to establish session
    const storeUrl = `https://www.iheartjane.com/stores/${storeId}`;
    await page.goto(storeUrl, { waitUntil: 'networkidle' });
    
    // Wait for Cloudflare challenge if any
    await page.waitForTimeout(3000);
    
    // Try to intercept API calls or fetch via page context
    const products = await page.evaluate(async (storeId) => {
      try {
        const response = await fetch(
          `https://api.iheartjane.com/v1/stores/${storeId}/products`,
          {
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
          }
        );
        
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }
        
        return await response.json();
      } catch (e) {
        return { error: (e as Error).message };
      }
    }, storeId);
    
    if (products.error) {
      console.error(`Error fetching from Jane API: ${products.error}`);
      return [];
    }
    
    return products.data || products.products || products || [];
  } finally {
    await browser.close();
  }
}

/**
 * Extract prices from Jane product into standardized format
 */
function extractPrices(product: JaneProduct): { unit: string; price: number }[] {
  const prices: { unit: string; price: number }[] = [];
  
  if (product.price_each) {
    prices.push({ unit: 'each', price: product.price_each });
  }
  if (product.price_half_gram) {
    prices.push({ unit: '0.5g', price: product.price_half_gram });
  }
  if (product.price_gram) {
    prices.push({ unit: '1g', price: product.price_gram });
  }
  if (product.price_two_gram) {
    prices.push({ unit: '2g', price: product.price_two_gram });
  }
  if (product.price_eighth) {
    prices.push({ unit: '3.5g', price: product.price_eighth });
  }
  if (product.price_quarter) {
    prices.push({ unit: '7g', price: product.price_quarter });
  }
  if (product.price_half_ounce) {
    prices.push({ unit: '14g', price: product.price_half_ounce });
  }
  if (product.price_ounce) {
    prices.push({ unit: '28g', price: product.price_ounce });
  }
  
  return prices;
}

/**
 * Normalize Jane category to our schema categories
 */
function normalizeJaneCategory(category: string): string {
  const categoryMap: Record<string, string> = {
    'flower': 'flower',
    'pre-roll': 'pre_roll',
    'pre-rolls': 'pre_roll',
    'preroll': 'pre_roll',
    'vape': 'vape',
    'vaporizers': 'vape',
    'cartridge': 'vape',
    'edible': 'edible',
    'edibles': 'edible',
    'gummy': 'edible',
    'gummies': 'edible',
    'concentrate': 'concentrate',
    'concentrates': 'concentrate',
    'extract': 'concentrate',
    'extracts': 'concentrate',
    'tincture': 'tincture',
    'tinctures': 'tincture',
    'topical': 'topical',
    'topicals': 'topical',
    'gear': 'other',
    'accessories': 'other',
  };
  
  return categoryMap[category.toLowerCase()] || 'other';
}

/**
 * Process Jane products into our normalized format
 */
export function processJaneProducts(
  products: JaneProduct[],
  storeId: string
): ScrapedProduct[] {
  const scrapedAt = Date.now();
  
  return products.map((product) => {
    // Build raw name string for normalizer
    const rawName = [
      product.brand_name,
      product.name,
      product.strain_type,
      product.thc_percentage ? `THC: ${product.thc_percentage}%` : '',
      product.cbd_percentage ? `CBD: ${product.cbd_percentage}%` : '',
    ].filter(Boolean).join(' | ');
    
    const normalized = normalizeProductName(
      rawName,
      product.brand_name,
      product.category,
      product.thc_percentage?.toString(),
      product.cbd_percentage?.toString()
    );
    
    // Override category with Jane's if provided
    if (product.category) {
      normalized.category = normalizeJaneCategory(product.category);
    }
    
    // Override strain with Jane's if provided
    if (product.strain_type) {
      normalized.strain = product.strain_type.toLowerCase() as 'sativa' | 'indica' | 'hybrid';
    }
    
    return {
      raw: product,
      normalized,
      prices: extractPrices(product),
      storeId,
      scrapedAt,
    };
  });
}

/**
 * Scrape a Jane store and return normalized products
 */
export async function scrapeJaneStore(
  storeId: string,
  options: { verbose?: boolean } = {}
): Promise<ScrapedProduct[]> {
  const { verbose = false } = options;
  
  if (verbose) {
    console.log(`\n🌿 Scraping Jane store ${storeId}...`);
  }
  
  const products = await fetchJaneProductsViaBrowser(storeId);
  
  if (verbose) {
    console.log(`   Found ${products.length} raw products`);
  }
  
  const processed = processJaneProducts(products, storeId);
  
  if (verbose) {
    console.log(`   Processed ${processed.length} products`);
    
    // Show sample
    if (processed.length > 0) {
      const sample = processed[0];
      console.log(`\n   Sample product:`);
      console.log(`     Name: ${sample.normalized.name}`);
      console.log(`     Brand: ${sample.normalized.brand}`);
      console.log(`     Category: ${sample.normalized.category}`);
      console.log(`     THC: ${sample.normalized.thc}%`);
      console.log(`     Prices: ${sample.prices.map(p => `${p.unit}=$${p.price}`).join(', ')}`);
    }
  }
  
  return processed;
}

/**
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
iHeartJane Menu Scraper - DATA-002

Usage:
  npx tsx scripts/iheartjane-scraper.ts <store_id> [--output <file>]
  npx tsx scripts/iheartjane-scraper.ts --test
  npx tsx scripts/iheartjane-scraper.ts --info

Examples:
  npx tsx scripts/iheartjane-scraper.ts 1238
  npx tsx scripts/iheartjane-scraper.ts 1238 --output ./data/jane-products.json

Finding Store IDs:
  1. Visit the dispensary's Jane-powered menu
  2. Open DevTools (F12) -> Network tab
  3. Search for "iheartjane.com/v1/stores/"
  4. The number after /stores/ is the store ID

NOTE: NYS adult-use dispensaries primarily use Dutchie, not Jane.
      Jane is used by medical/MSO dispensaries (Columbia Care, Vireo).
`);
    return;
  }
  
  if (args[0] === '--info') {
    // Load and display current Jane retailers info
    try {
      const data = JSON.parse(
        readFileSync(resolve(__dirname, '../data/iheartjane-retailers.json'), 'utf-8')
      );
      console.log('\n📊 iHeartJane Coverage Status');
      console.log('═'.repeat(40));
      console.log(`Generated: ${data.metadata.generated}`);
      console.log(`Retailers scanned: ${data.metadata.totalRetailersScanned}`);
      console.log(`Jane retailers found: ${data.metadata.janeRetailersFound}`);
      console.log(`\nFindings:`);
      console.log(`  ${data.findings.summary}`);
      console.log(`  Dominant platform: ${data.findings.dominantPlatform}`);
      console.log(`\nMedical Jane stores (not adult-use):`);
      data.medicalJaneStores.stores.forEach((store: any) => {
        console.log(`  - ${store.name} (ID: ${store.janeStoreId})`);
      });
      console.log(`\nRecommendation: ${data.recommendations.action}`);
    } catch (e) {
      console.error('Could not load iheartjane-retailers.json');
    }
    return;
  }
  
  if (args[0] === '--test') {
    console.log('\n🧪 Testing Jane API with known medical stores...\n');
    console.log('NOTE: These are MEDICAL dispensaries, not NYS adult-use.');
    console.log('      Testing to verify scraper functionality.\n');
    
    // Test with Columbia Care Manhattan (medical)
    const testStores = ['1238', '2316'];
    
    for (const storeId of testStores) {
      console.log(`\nTesting store ${storeId}...`);
      try {
        const products = await scrapeJaneStore(storeId, { verbose: true });
        console.log(`✅ Successfully scraped ${products.length} products`);
      } catch (e) {
        console.log(`❌ Failed: ${(e as Error).message}`);
      }
    }
    return;
  }
  
  const storeId = args[0];
  const outputIndex = args.indexOf('--output');
  const outputFile = outputIndex !== -1 ? args[outputIndex + 1] : null;
  
  console.log(`\n🌿 Scraping Jane store ${storeId}...`);
  
  const products = await scrapeJaneStore(storeId, { verbose: true });
  
  if (outputFile) {
    writeFileSync(outputFile, JSON.stringify(products, null, 2));
    console.log(`\n✅ Saved ${products.length} products to ${outputFile}`);
  } else {
    console.log(`\n📦 Scraped ${products.length} products`);
    console.log('\nUse --output <file> to save results');
  }
}

// Run if executed directly
main().catch(console.error);
