#!/usr/bin/env npx ts-node
/**
 * CannaSignal Test Ingestion Script
 * 
 * Tests the full scrape → ingest pipeline:
 * 1. Fetches products from browser worker (or uses mock data if blocked)
 * 2. Transforms to Convex ingestion format
 * 3. POSTs to Convex via ingestScrapedBatch mutation
 * 
 * Usage: npx ts-node scripts/test-ingest.ts
 */

const CONVEX_URL = "https://quick-weasel-225.convex.cloud";
const CONVEX_DEPLOY_KEY = process.env.CONVEX_DEPLOY_KEY || 
  "dev:quick-weasel-225|eyJ2MiI6IjBmMDI3MmFiM2MwYjRkNmE5MDY1YzI5MDI5ZDA0YmEyIn0=";
const BROWSER_WORKER_URL = "https://cannasignal-browser.prtl.workers.dev";
const CDP_SECRET = process.env.CDP_SECRET;

// Retailer IDs from Convex
const RETAILERS = {
  "housing-works-cannabis-co": "jx74rzzged5ezfcq6hnwky9pqh818nt2",
  "the-cannabist-brooklyn": "jx797eyczm86jc6aqpg3ex4zwx818rfa",
  "smacked-village": "jx7dmad9mn97367tx33vfwbs61819vxq",
} as const;

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
  sourceUrl: string;
  sourcePlatform: string;
  scrapedAt: number;
}

interface ScrapeResult {
  retailerId: string;
  items: ScrapedItem[];
  status: "ok" | "error";
  error?: string;
}

// Mock data for testing when Dutchie is blocked
function generateMockProducts(retailerSlug: string): ScrapedItem[] {
  const scrapedAt = Date.now();
  const sourceUrl = `https://dutchie.com/dispensary/${retailerSlug}`;
  
  return [
    {
      rawProductName: "Blue Dream - 3.5g",
      rawBrandName: "Tyson 2.0",
      rawCategory: "Flower",
      subcategory: "Hybrid",
      strainType: "HYBRID",
      price: 45.00,
      inStock: true,
      thcFormatted: "22.5%",
      sourceUrl,
      sourcePlatform: "dutchie",
      scrapedAt,
    },
    {
      rawProductName: "OG Kush Pre-Roll - 1g",
      rawBrandName: "Cookies",
      rawCategory: "Pre-Roll",
      strainType: "INDICA",
      price: 15.00,
      originalPrice: 18.00,
      inStock: true,
      thcFormatted: "28%",
      sourceUrl,
      sourcePlatform: "dutchie",
      scrapedAt,
    },
    {
      rawProductName: "Live Resin Cart - Gelato - 0.5g",
      rawBrandName: "Select",
      rawCategory: "Vapes",
      subcategory: "Cartridges",
      strainType: "HYBRID",
      price: 40.00,
      inStock: true,
      thcFormatted: "85%",
      sourceUrl,
      sourcePlatform: "dutchie",
      scrapedAt,
    },
    {
      rawProductName: "THC Gummies - Watermelon - 10pk",
      rawBrandName: "Wana",
      rawCategory: "Edibles",
      subcategory: "Gummies",
      price: 25.00,
      inStock: false,
      thcFormatted: "10mg/piece",
      sourceUrl,
      sourcePlatform: "dutchie",
      scrapedAt,
    },
    {
      rawProductName: "RSO - Full Spectrum - 1g",
      rawBrandName: "Vireo",
      rawCategory: "Concentrates",
      price: 65.00,
      inStock: true,
      thcFormatted: "70%",
      cbdFormatted: "5%",
      sourceUrl,
      sourcePlatform: "dutchie",
      scrapedAt,
    },
  ];
}

async function scrapeRetailer(slug: string): Promise<ScrapedItem[] | null> {
  if (!CDP_SECRET) {
    console.log(`  ⚠️ No CDP_SECRET, using mock data`);
    return null;
  }
  
  const url = `${BROWSER_WORKER_URL}/menu?url=https://dutchie.com/dispensary/${slug}&secret=${CDP_SECRET}`;
  console.log(`  Fetching from browser worker...`);
  
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    const data = await response.json() as any;
    
    if (data.success && data.productCount > 0) {
      // Transform browser worker format to ingestion format
      return data.products.map((p: any) => ({
        rawProductName: p.name,
        rawBrandName: p.brand || "Unknown",
        rawCategory: p.category,
        price: parsePrice(p.price) || 0,
        inStock: p.stock !== 0,
        sourceUrl: `https://dutchie.com/dispensary/${slug}`,
        sourcePlatform: "dutchie",
        scrapedAt: Date.now(),
      }));
    }
    
    // Check if Cloudflare blocked
    if (data.retailer?.includes("Cloudflare") || data.productCount === 0) {
      console.log(`  ⚠️ Cloudflare blocked, using mock data`);
      return null;
    }
    
    return data.products;
  } catch (error) {
    console.log(`  ⚠️ Scrape failed: ${error}, using mock data`);
    return null;
  }
}

function parsePrice(priceStr: string | undefined): number | null {
  if (!priceStr) return null;
  const match = priceStr.match(/\$?([\d.]+)/);
  return match ? parseFloat(match[1]) : null;
}

async function ingestToConvex(batchId: string, results: ScrapeResult[]) {
  console.log(`\n📤 Ingesting to Convex (batch: ${batchId})...`);
  
  const response = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Convex ${CONVEX_DEPLOY_KEY}`,
    },
    body: JSON.stringify({
      path: "ingestion:ingestScrapedBatch",
      args: { batchId, results },
    }),
  });
  
  const data = await response.json();
  return data;
}

async function verifyIngestion() {
  console.log(`\n🔍 Verifying ingestion...`);
  
  // Check products table
  const productsRes = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Convex ${CONVEX_DEPLOY_KEY}`,
    },
    body: JSON.stringify({
      path: "products:listRecent",
      args: { limit: 10 },
    }),
  });
  
  const productsData = await productsRes.json() as any;
  
  // Check brands table
  const brandsRes = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Convex ${CONVEX_DEPLOY_KEY}`,
    },
    body: JSON.stringify({
      path: "brands:list",
      args: {},
    }),
  });
  
  const brandsData = await brandsRes.json() as any;
  
  return {
    products: productsData.value || [],
    brands: brandsData.value || [],
  };
}

async function main() {
  console.log("🌿 CannaSignal Test Ingestion Script\n");
  console.log("═".repeat(50));
  
  const batchId = `test-${Date.now()}`;
  const results: ScrapeResult[] = [];
  
  // Test each retailer
  for (const [slug, retailerId] of Object.entries(RETAILERS)) {
    console.log(`\n📍 ${slug}`);
    
    // Try to scrape, fall back to mock data
    let items = await scrapeRetailer(slug);
    const usedMock = items === null;
    
    if (usedMock) {
      items = generateMockProducts(slug);
    }
    
    console.log(`  ✓ ${items.length} products ${usedMock ? "(mock data)" : "(live scrape)"}`);
    
    results.push({
      retailerId,
      items,
      status: "ok",
    });
  }
  
  // Ingest to Convex
  const ingestResult = await ingestToConvex(batchId, results);
  console.log(`\n📊 Ingestion result:`, JSON.stringify(ingestResult, null, 2));
  
  // Verify
  const verification = await verifyIngestion();
  console.log(`\n✅ Verification:`);
  console.log(`  - Brands in DB: ${verification.brands.length}`);
  console.log(`  - Products in DB: ${verification.products.length}`);
  
  if (verification.products.length > 0) {
    console.log(`\n📦 Sample products:`);
    verification.products.slice(0, 3).forEach((p: any) => {
      console.log(`  - ${p.name} (${p.category})`);
    });
  }
  
  console.log("\n" + "═".repeat(50));
  console.log("✅ Test complete!");
}

main().catch(console.error);
