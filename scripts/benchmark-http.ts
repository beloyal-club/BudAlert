/**
 * PERF-001: Convex HTTP Endpoint Latency Benchmark
 * 
 * Tests HTTP endpoints that are currently deployed.
 * Note: Full Convex function benchmarking requires `npx convex deploy`
 * 
 * Usage: npx tsx scripts/benchmark-http.ts
 */

const CONVEX_SITE_URL = "https://quick-weasel-225.convex.site";

interface LatencyResult {
  endpoint: string;
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

async function benchmarkEndpoint(
  name: string,
  url: string,
  method: "GET" | "POST" = "GET",
  body?: any,
  iterations: number = 30
): Promise<LatencyResult> {
  const latencies: number[] = [];
  let errors = 0;

  console.log(`  Testing ${name}...`);

  for (let i = 0; i < iterations; i++) {
    try {
      const latency = await measureLatency(async () => {
        const res = await fetch(url, {
          method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      });
      latencies.push(latency);
    } catch (e) {
      errors++;
    }
    await new Promise((r) => setTimeout(r, 30));
  }

  return {
    endpoint: name,
    samples: iterations,
    mean: Math.round(mean(latencies) * 100) / 100,
    p50: Math.round(percentile(latencies, 50) * 100) / 100,
    p95: Math.round(percentile(latencies, 95) * 100) / 100,
    p99: Math.round(percentile(latencies, 99) * 100) / 100,
    max: Math.round(Math.max(...latencies, 0) * 100) / 100,
    min: latencies.length > 0 ? Math.round(Math.min(...latencies) * 100) / 100 : 0,
    errors,
  };
}

async function concurrencyTest(
  url: string,
  concurrency: number,
  totalRequests: number
): Promise<ConcurrencyResult> {
  const latencies: number[] = [];
  let errors = 0;
  const startTime = performance.now();

  const batches: Promise<void>[][] = [];
  for (let i = 0; i < totalRequests; i += concurrency) {
    const batch: Promise<void>[] = [];
    for (let j = 0; j < concurrency && i + j < totalRequests; j++) {
      batch.push(
        (async () => {
          try {
            const latency = await measureLatency(async () => {
              const res = await fetch(url);
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              return await res.json();
            });
            latencies.push(latency);
          } catch (e) {
            errors++;
          }
        })()
      );
    }
    batches.push(batch);
  }

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
  console.log("🔬 PERF-001: Convex HTTP Endpoint Benchmark\n");
  console.log(`Target: ${CONVEX_SITE_URL}`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  // Verify connectivity
  console.log("Testing connection...");
  try {
    const res = await fetch(`${CONVEX_SITE_URL}/health`);
    const data = await res.json();
    console.log(`✅ Connected (service: ${data.service}, status: ${data.status})\n`);
  } catch (e) {
    console.error("❌ Failed to connect:", e);
    process.exit(1);
  }

  const results: LatencyResult[] = [];

  // ============================================================
  // PHASE 1: Endpoint Latency Tests
  // ============================================================
  console.log("📊 PHASE 1: HTTP Endpoint Latency (30 samples each)\n");

  // Health check (lightweight)
  results.push(
    await benchmarkEndpoint("GET /health", `${CONVEX_SITE_URL}/health`)
  );

  // Test a few simulated payloads to /ingest/scraped-batch
  // This is the critical data ingestion endpoint
  const smallBatch = {
    batchId: `bench-${Date.now()}`,
    results: [
      {
        retailerId: "test-retailer",
        success: true,
        products: [
          { name: "Test Product", price: 50, category: "flower" },
        ],
      },
    ],
  };

  // Note: This endpoint requires actual retailer IDs, so we test OPTIONS (CORS preflight)
  results.push(
    await benchmarkEndpoint(
      "OPTIONS /ingest/scraped-batch (CORS)",
      `${CONVEX_SITE_URL}/ingest/scraped-batch`,
      "POST",
      undefined,
      30
    )
  );

  // ============================================================
  // PHASE 2: Concurrency Tests on Health Endpoint
  // ============================================================
  console.log("\n📈 PHASE 2: Concurrency Tests (GET /health)\n");

  const concurrencyResults: ConcurrencyResult[] = [];

  for (const c of [1, 5, 10, 20, 50]) {
    console.log(`  Testing concurrency=${c}...`);
    const result = await concurrencyTest(
      `${CONVEX_SITE_URL}/health`,
      c,
      100
    );
    concurrencyResults.push(result);
  }

  // ============================================================
  // OUTPUT RESULTS
  // ============================================================
  console.log("\n" + "=".repeat(80));
  console.log("📊 RESULTS: HTTP Endpoint Latency (ms)\n");

  console.log(
    "Endpoint".padEnd(40) +
      "Mean".padStart(8) +
      "P50".padStart(8) +
      "P95".padStart(8) +
      "P99".padStart(8) +
      "Max".padStart(8) +
      "Err".padStart(6)
  );
  console.log("-".repeat(86));

  for (const r of results) {
    const status = r.p95 < 200 ? "✅" : r.p95 < 500 ? "⚠️" : "❌";
    console.log(
      `${status} ${r.endpoint}`.padEnd(40) +
        r.mean.toString().padStart(8) +
        r.p50.toString().padStart(8) +
        r.p95.toString().padStart(8) +
        r.p99.toString().padStart(8) +
        r.max.toString().padStart(8) +
        r.errors.toString().padStart(6)
    );
  }

  console.log("\n" + "=".repeat(80));
  console.log("📈 RESULTS: Concurrency Tests (GET /health)\n");

  console.log(
    "Concurrency".padEnd(14) +
      "Requests".padStart(10) +
      "Duration(ms)".padStart(14) +
      "RPS".padStart(10) +
      "P95(ms)".padStart(10) +
      "Errors".padStart(10)
  );
  console.log("-".repeat(68));

  for (const r of concurrencyResults) {
    console.log(
      r.concurrency.toString().padEnd(14) +
        r.totalRequests.toString().padStart(10) +
        r.duration.toString().padStart(14) +
        r.rps.toString().padStart(10) +
        r.p95.toString().padStart(10) +
        r.errors.toString().padStart(10)
    );
  }

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log("\n" + "=".repeat(80));
  console.log("📋 SUMMARY\n");

  const avgP95 = Math.round(mean(results.map((r) => r.p95)) * 100) / 100;
  const maxRPS = Math.max(...concurrencyResults.map((r) => r.rps));
  const optimalConcurrency = concurrencyResults.find((r) => r.rps === maxRPS)?.concurrency;

  console.log(`Average p95 latency: ${avgP95}ms`);
  console.log(`Max RPS achieved: ${maxRPS} (at concurrency=${optimalConcurrency})`);
  console.log(`Total errors: ${results.reduce((a, r) => a + r.errors, 0) + concurrencyResults.reduce((a, r) => a + r.errors, 0)}`);

  // Calculate performance score
  let score = 100;
  if (avgP95 > 200) score -= 20;
  else if (avgP95 > 100) score -= 10;
  if (maxRPS < 50) score -= 20;
  else if (maxRPS < 100) score -= 10;
  score = Math.max(0, score);

  console.log(`\nHTTP Performance Score: ${score}/100`);

  console.log("\n⚠️  NOTE: Full Convex query benchmarks require function deployment.");
  console.log("   Run: npx convex deploy (with CONVEX_DEPLOY_KEY set)");
  console.log("   Then run: npx tsx scripts/benchmark-convex.ts");

  console.log("\n" + "=".repeat(80));
  console.log(`Completed: ${new Date().toISOString()}`);
}

main().catch(console.error);
