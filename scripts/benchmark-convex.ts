/**
 * PERF-001: Convex Query Latency Benchmark
 * 
 * Tests all major queries under various load conditions
 * Measures: p50, p95, p99, mean, max latencies
 * 
 * Usage: npx tsx scripts/benchmark-convex.ts
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const CONVEX_URL = "https://quick-weasel-225.convex.cloud";

interface BenchmarkResult {
  query: string;
  samples: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  min: number;
  errors: number;
}

interface ConcurrencyResult {
  concurrency: number;
  totalRequests: number;
  duration: number;
  rps: number;
  p95: number;
  errors: number;
}

// Calculate percentile from sorted array
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

async function measureLatency(fn: () => Promise<any>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

async function benchmarkQuery(
  client: ConvexHttpClient,
  name: string,
  queryFn: () => Promise<any>,
  iterations: number = 20
): Promise<BenchmarkResult> {
  const latencies: number[] = [];
  let errors = 0;

  console.log(`  Testing ${name}...`);

  for (let i = 0; i < iterations; i++) {
    try {
      const latency = await measureLatency(queryFn);
      latencies.push(latency);
    } catch (e) {
      errors++;
    }
    // Small delay between requests
    await new Promise((r) => setTimeout(r, 50));
  }

  return {
    query: name,
    samples: iterations,
    mean: Math.round(mean(latencies) * 100) / 100,
    p50: Math.round(percentile(latencies, 50) * 100) / 100,
    p95: Math.round(percentile(latencies, 95) * 100) / 100,
    p99: Math.round(percentile(latencies, 99) * 100) / 100,
    max: Math.round(Math.max(...latencies, 0) * 100) / 100,
    min: Math.round(Math.min(...latencies, Infinity) * 100) / 100,
    errors,
  };
}

async function concurrencyTest(
  client: ConvexHttpClient,
  queryFn: () => Promise<any>,
  concurrency: number,
  totalRequests: number
): Promise<ConcurrencyResult> {
  const latencies: number[] = [];
  let errors = 0;
  const startTime = performance.now();

  // Create batches
  const batches: Promise<void>[][] = [];
  for (let i = 0; i < totalRequests; i += concurrency) {
    const batch: Promise<void>[] = [];
    for (let j = 0; j < concurrency && i + j < totalRequests; j++) {
      batch.push(
        (async () => {
          try {
            const latency = await measureLatency(queryFn);
            latencies.push(latency);
          } catch (e) {
            errors++;
          }
        })()
      );
    }
    batches.push(batch);
  }

  // Execute batches
  for (const batch of batches) {
    await Promise.all(batch);
  }

  const duration = performance.now() - startTime;

  return {
    concurrency,
    totalRequests,
    duration: Math.round(duration),
    rps: Math.round((totalRequests / (duration / 1000)) * 100) / 100,
    p95: Math.round(percentile(latencies, 95) * 100) / 100,
    errors,
  };
}

async function main() {
  console.log("🔬 PERF-001: Convex Query Latency Benchmark\n");
  console.log(`Target: ${CONVEX_URL}`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  const client = new ConvexHttpClient(CONVEX_URL);

  // Test connection first
  console.log("Testing connection...");
  try {
    const pingResult = await client.query(api.dashboard.ping, {});
    console.log(`✅ Connected to Convex (server time: ${pingResult.serverTime})\n`);
  } catch (e) {
    console.error("❌ Failed to connect to Convex:", e);
    process.exit(1);
  }

  const results: BenchmarkResult[] = [];

  // ============================================================
  // PHASE 1: Individual Query Benchmarks
  // ============================================================
  console.log("📊 PHASE 1: Individual Query Latency (20 samples each)\n");

  // Dashboard queries
  results.push(
    await benchmarkQuery(client, "dashboard.ping", () =>
      client.query(api.dashboard.ping, {})
    )
  );

  results.push(
    await benchmarkQuery(client, "dashboard.getStats", () =>
      client.query(api.dashboard.getStats, {})
    )
  );

  results.push(
    await benchmarkQuery(client, "dashboard.getActivityFeed", () =>
      client.query(api.dashboard.getActivityFeed, { limit: 20 })
    )
  );

  // Retailer queries
  results.push(
    await benchmarkQuery(client, "retailers.list", () =>
      client.query(api.retailers.list, { limit: 50 })
    )
  );

  results.push(
    await benchmarkQuery(client, "retailers.getActiveForScraping", () =>
      client.query(api.retailers.getActiveForScraping, {})
    )
  );

  // Product queries
  results.push(
    await benchmarkQuery(client, "products.list", () =>
      client.query(api.products.list, { limit: 100 })
    )
  );

  results.push(
    await benchmarkQuery(client, "products.search", () =>
      client.query(api.products.search, { query: "flower" })
    )
  );

  // Inventory queries (these may have no data yet)
  results.push(
    await benchmarkQuery(client, "inventory.getPriceChanges", () =>
      client.query(api.inventory.getPriceChanges, { hoursAgo: 24, limit: 50 })
    )
  );

  results.push(
    await benchmarkQuery(client, "inventory.getOutOfStock", () =>
      client.query(api.inventory.getOutOfStock, { limit: 50 })
    )
  );

  // Brand queries
  results.push(
    await benchmarkQuery(client, "brands.list", () =>
      client.query(api.brands.list, { limit: 100 })
    )
  );

  // Dead letter queue
  results.push(
    await benchmarkQuery(client, "deadLetterQueue.listUnresolved", () =>
      client.query(api.deadLetterQueue.listUnresolved, { limit: 20 })
    )
  );

  // ============================================================
  // PHASE 2: Concurrency Tests
  // ============================================================
  console.log("\n📈 PHASE 2: Concurrency Tests (dashboard.getStats)\n");

  const concurrencyResults: ConcurrencyResult[] = [];

  for (const c of [1, 5, 10, 20]) {
    console.log(`  Testing concurrency=${c}...`);
    const result = await concurrencyTest(
      client,
      () => client.query(api.dashboard.getStats, {}),
      c,
      50
    );
    concurrencyResults.push(result);
  }

  // ============================================================
  // OUTPUT RESULTS
  // ============================================================
  console.log("\n" + "=".repeat(80));
  console.log("📊 RESULTS: Individual Query Latency (ms)\n");

  // Table header
  console.log(
    "Query".padEnd(35) +
      "Mean".padStart(8) +
      "P50".padStart(8) +
      "P95".padStart(8) +
      "P99".padStart(8) +
      "Max".padStart(8) +
      "Errors".padStart(8)
  );
  console.log("-".repeat(83));

  // Sort by p95 descending (slowest first)
  const sorted = [...results].sort((a, b) => b.p95 - a.p95);

  for (const r of sorted) {
    const status = r.p95 < 200 ? "✅" : r.p95 < 500 ? "⚠️" : "❌";
    console.log(
      `${status} ${r.query}`.padEnd(35) +
        r.mean.toString().padStart(8) +
        r.p50.toString().padStart(8) +
        r.p95.toString().padStart(8) +
        r.p99.toString().padStart(8) +
        r.max.toString().padStart(8) +
        r.errors.toString().padStart(8)
    );
  }

  console.log("\n" + "=".repeat(80));
  console.log("📈 RESULTS: Concurrency Tests (dashboard.getStats)\n");

  console.log(
    "Concurrency".padEnd(15) +
      "Requests".padStart(12) +
      "Duration(ms)".padStart(14) +
      "RPS".padStart(10) +
      "P95(ms)".padStart(10) +
      "Errors".padStart(10)
  );
  console.log("-".repeat(71));

  for (const r of concurrencyResults) {
    console.log(
      r.concurrency.toString().padEnd(15) +
        r.totalRequests.toString().padStart(12) +
        r.duration.toString().padStart(14) +
        r.rps.toString().padStart(10) +
        r.p95.toString().padStart(10) +
        r.errors.toString().padStart(10)
    );
  }

  // ============================================================
  // SUMMARY & RECOMMENDATIONS
  // ============================================================
  console.log("\n" + "=".repeat(80));
  console.log("📋 SUMMARY\n");

  const fastQueries = results.filter((r) => r.p95 < 100);
  const okQueries = results.filter((r) => r.p95 >= 100 && r.p95 < 200);
  const slowQueries = results.filter((r) => r.p95 >= 200 && r.p95 < 500);
  const criticalQueries = results.filter((r) => r.p95 >= 500);

  console.log(`Fast (<100ms p95):     ${fastQueries.length} queries`);
  console.log(`OK (100-200ms p95):    ${okQueries.length} queries`);
  console.log(`Slow (200-500ms p95):  ${slowQueries.length} queries`);
  console.log(`Critical (>500ms p95): ${criticalQueries.length} queries`);

  const overallP95 = Math.round(mean(results.map((r) => r.p95)) * 100) / 100;
  console.log(`\nOverall avg p95: ${overallP95}ms`);

  // Performance score
  let perfScore = 100;
  perfScore -= slowQueries.length * 10;
  perfScore -= criticalQueries.length * 20;
  if (overallP95 > 200) perfScore -= 20;
  if (overallP95 > 100) perfScore -= 10;
  perfScore = Math.max(0, perfScore);

  console.log(`Performance Score: ${perfScore}/100`);

  if (criticalQueries.length > 0) {
    console.log("\n⚠️  CRITICAL: These queries need optimization:");
    for (const q of criticalQueries) {
      console.log(`   - ${q.query} (p95: ${q.p95}ms)`);
    }
  }

  if (slowQueries.length > 0) {
    console.log("\n⚡ SLOW: Consider optimizing:");
    for (const q of slowQueries) {
      console.log(`   - ${q.query} (p95: ${q.p95}ms)`);
    }
  }

  // RPS assessment
  const maxRPS = Math.max(...concurrencyResults.map((r) => r.rps));
  console.log(`\nMax RPS achieved: ${maxRPS} (at concurrency=${concurrencyResults.find((r) => r.rps === maxRPS)?.concurrency})`);

  console.log("\n" + "=".repeat(80));
  console.log(`Completed: ${new Date().toISOString()}`);

  // Return exit code based on performance
  process.exit(perfScore < 50 ? 1 : 0);
}

main().catch(console.error);
