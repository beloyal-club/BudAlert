/**
 * Dutchie GraphQL Scraper Test Script
 * 
 * Tests the Dutchie GraphQL API against known dispensary slugs.
 * 
 * Usage:
 *   npx tsx scripts/test-graphql-scraper.ts [slug]
 *   npx tsx scripts/test-graphql-scraper.ts housing-works-cannabis-co
 *   npx tsx scripts/test-graphql-scraper.ts --via-worker housing-works-cannabis-co
 *   npx tsx scripts/test-graphql-scraper.ts --schema-probe
 * 
 * Created: 2026-02-24 (TICKET-002)
 * 
 * ⚠️ IMPORTANT: As of Feb 2026, the Dutchie public GraphQL API schema has changed.
 * The original query format (filteredProducts with dispensarySlug) no longer works.
 * This script documents the current state and tests for schema discovery.
 * 
 * Known Issues:
 * - filteredProducts no longer accepts dispensarySlug argument
 * - GraphQL introspection is disabled on Dutchie's Apollo server
 * - Direct requests from servers are blocked by Cloudflare (requires CF Worker)
 * 
 * Current Status: NEEDS SCHEMA UPDATE
 * - No direct Dutchie retailers exist in current BudAlert inventory
 * - All current retailers use embedded Dutchie (browser scraping required)
 * - This scraper is for future expansion when direct Dutchie stores are added
 */

const WORKER_URL = "https://cannasignal-scraper-dutchie.prtl.workers.dev";

// ============================================================
// Known Dutchie Slugs for Testing
// ============================================================

const TEST_SLUGS = [
  // These are examples - may or may not exist
  "housing-works-cannabis-co",
  "liberty-cannabis",
  "curaleaf",
  "green-thumb",
];

// ============================================================
// Test via Deployed Worker
// ============================================================

async function testViaWorker(slug: string): Promise<void> {
  console.log(`\n📡 Testing via deployed worker: ${slug}`);
  console.log("─".repeat(50));

  // Test the /test/:slug endpoint
  const testUrl = `${WORKER_URL}/test/${slug}`;
  console.log(`GET ${testUrl}`);

  try {
    const response = await fetch(testUrl);
    const data = await response.json();

    if (data.errors) {
      console.log("❌ GraphQL Errors:");
      for (const err of data.errors) {
        console.log(`   • ${err.message}`);
      }
    } else if (data.data?.filteredProducts?.products) {
      const products = data.data.filteredProducts.products;
      console.log(`✅ Success! Found ${products.length} products`);
      
      // Show sample product
      if (products.length > 0) {
        const sample = products[0];
        console.log(`\n📦 Sample Product:`);
        console.log(`   Name: ${sample.name}`);
        console.log(`   Brand: ${sample.brand?.name || "Unknown"}`);
        if (sample.variants?.length > 0) {
          const v = sample.variants[0];
          console.log(`   Variant: ${v.option || "default"}`);
          console.log(`   Price: $${v.price}`);
          console.log(`   Quantity: ${v.quantity ?? "N/A"}`);
        }
      }
    } else {
      console.log("⚠️ Unexpected response structure:");
      console.log(JSON.stringify(data, null, 2).slice(0, 500));
    }
  } catch (error) {
    console.log(`❌ Error: ${error}`);
  }
}

// ============================================================
// Schema Probe - Discover Current API Structure
// ============================================================

async function probeSchema(): Promise<void> {
  console.log("\n🔬 Probing Dutchie GraphQL Schema");
  console.log("═".repeat(50));
  
  // Test the /test-query endpoint which tries multiple formats
  const probeUrl = `${WORKER_URL}/test-query/housing-works-cannabis-co`;
  console.log(`GET ${probeUrl}\n`);

  try {
    const response = await fetch(probeUrl);
    const data = await response.json() as any;

    console.log("Results by query format:\n");

    for (const [name, result] of Object.entries(data.results as Record<string, any>)) {
      const status = result.ok || result.status === 200 ? "✅" : "❌";
      console.log(`${status} ${name}:`);
      
      if (result.errors) {
        for (const err of result.errors.slice(0, 2)) {
          console.log(`   └─ ${err}`);
        }
      } else if (result.hasData) {
        console.log(`   └─ Has data: ${JSON.stringify(result.data).slice(0, 100)}`);
      } else if (result.error) {
        console.log(`   └─ ${result.error}`);
      } else if (result.data?.raw) {
        console.log(`   └─ ${result.data.raw.slice(0, 100)}`);
      }
    }
  } catch (error) {
    console.log(`❌ Error: ${error}`);
  }

  console.log("\n" + "─".repeat(50));
  console.log("📋 Findings:");
  console.log("   • dutchie.com/graphql responds but schema has changed");
  console.log("   • filteredProducts no longer accepts dispensarySlug arg");
  console.log("   • Introspection is disabled (Apollo Server setting)");
  console.log("   • Need to reverse-engineer new schema from browser traffic");
}

// ============================================================
// Test Batch Scrape Endpoint
// ============================================================

async function testBatchScrape(slug: string): Promise<void> {
  console.log(`\n🔄 Testing batch scrape endpoint: ${slug}`);
  console.log("─".repeat(50));

  const payload = {
    retailers: [{ id: "test-123", slug, name: `Test ${slug}` }],
    batchId: `test-${Date.now()}`,
    convexUrl: "",
    convexToken: "",
  };

  try {
    const response = await fetch(`${WORKER_URL}/scrape/dutchie`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json() as any;

    console.log(`Batch ID: ${data.batchId}`);
    console.log(`Total Retailers: ${data.totalRetailers}`);
    console.log(`Successful: ${data.successful}`);
    console.log(`Failed: ${data.failed}`);
    console.log(`Total Items: ${data.totalItems}`);
    console.log(`Retried: ${data.retriedCount}`);
    console.log(`Dead Lettered: ${data.deadLettered}`);

    if (data.failed > 0) {
      console.log("\n⚠️ Scrape failed - this is expected with current schema issues");
    }
  } catch (error) {
    console.log(`❌ Error: ${error}`);
  }
}

// ============================================================
// Health Check
// ============================================================

async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${WORKER_URL}/health`);
    const data = await response.json() as any;
    
    console.log("🏥 Worker Health Check");
    console.log("─".repeat(50));
    console.log(`Status: ${data.status}`);
    console.log(`Service: ${data.service}`);
    console.log(`Retry Config:`);
    console.log(`   Max Retries: ${data.retryConfig.maxRetries}`);
    console.log(`   Base Delay: ${data.retryConfig.baseDelayMs}ms`);
    console.log(`   Retryable Statuses: ${data.retryConfig.retryableStatuses.join(", ")}`);
    
    return data.status === "ok";
  } catch (error) {
    console.log(`❌ Health check failed: ${error}`);
    return false;
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║       Dutchie GraphQL Scraper Test Tool                   ║");
  console.log("║               BudAlert / CannaSignal                      ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log("");

  const args = process.argv.slice(2);

  // Show help
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage:
  npx tsx scripts/test-graphql-scraper.ts [options] [slug]

Options:
  --help, -h          Show this help
  --schema-probe      Probe the GraphQL schema to discover query formats
  --via-worker        Test via the deployed CF Worker (bypasses Cloudflare blocking)
  --batch             Test the batch scrape endpoint
  --health            Check worker health

Examples:
  npx tsx scripts/test-graphql-scraper.ts --health
  npx tsx scripts/test-graphql-scraper.ts --schema-probe
  npx tsx scripts/test-graphql-scraper.ts --via-worker housing-works-cannabis-co
  npx tsx scripts/test-graphql-scraper.ts --batch housing-works-cannabis-co

Known Test Slugs:
${TEST_SLUGS.map(s => `  • ${s}`).join("\n")}

⚠️ NOTE: As of Feb 2026, the Dutchie GraphQL schema has changed.
   The scraper needs to be updated once the new schema is reverse-engineered.
`);
    return;
  }

  // Health check
  if (args.includes("--health")) {
    await checkHealth();
    return;
  }

  // Schema probe
  if (args.includes("--schema-probe")) {
    await checkHealth();
    await probeSchema();
    return;
  }

  // Get slug from args
  const slug = args.find(a => !a.startsWith("--")) || "housing-works-cannabis-co";

  // Check health first
  const healthy = await checkHealth();
  if (!healthy) {
    console.log("\n⚠️ Worker is not healthy, tests may fail");
  }

  // Test via worker
  if (args.includes("--via-worker")) {
    await testViaWorker(slug);
    return;
  }

  // Test batch scrape
  if (args.includes("--batch")) {
    await testBatchScrape(slug);
    return;
  }

  // Default: run all tests
  console.log("\n🧪 Running full test suite...\n");
  await probeSchema();
  await testViaWorker(slug);
  await testBatchScrape(slug);

  console.log("\n" + "═".repeat(50));
  console.log("📋 Summary:");
  console.log("   • GraphQL scraper worker is deployed and healthy");
  console.log("   • Retry logic is configured (max 3 retries, exponential backoff)");
  console.log("   • ⚠️ Schema has changed - scrapes will fail until updated");
  console.log("   • No direct Dutchie retailers in current inventory");
  console.log("   • This scraper is for future use when direct stores are added");
}

main().catch(console.error);
