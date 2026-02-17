#!/usr/bin/env npx tsx
/**
 * DATA-006: Price History Test Script
 * 
 * Test price history queries and HTTP endpoints
 * 
 * Usage:
 *   npx tsx scripts/price-history-test.ts summary
 *   npx tsx scripts/price-history-test.ts drops
 *   npx tsx scripts/price-history-test.ts changes
 */

const CONVEX_URL = process.env.VITE_CONVEX_URL || "https://quick-weasel-225.convex.site";

async function fetchEndpoint(path: string, params: Record<string, string> = {}) {
  const url = new URL(path, CONVEX_URL);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  
  console.log(`\n🔍 Fetching: ${url.toString()}\n`);
  
  const response = await fetch(url.toString());
  const data = await response.json();
  
  return data;
}

async function testSummary() {
  console.log("📊 Price Summary");
  console.log("================");
  
  const data = await fetchEndpoint("/price/summary");
  
  if (data.error) {
    console.log(`❌ Error: ${data.error}`);
    return;
  }
  
  const s = data.summary;
  console.log(`\n📈 Summary Stats:`);
  console.log(`   Total Tracked:    ${s.totalTracked}`);
  console.log(`   With History:     ${s.totalWithHistory}`);
  console.log(`   Price Drops 24h:  ${s.priceDrops24h}`);
  console.log(`   Increases 24h:    ${s.priceIncreases24h}`);
  console.log(`   Snapshots 24h:    ${s.snapshots24h}`);
  console.log(`   Snapshots Week:   ${s.snapshotsWeek}`);
  
  if (data.categoryAverages && data.categoryAverages.length > 0) {
    console.log(`\n💰 Category Averages:`);
    for (const cat of data.categoryAverages) {
      console.log(`   ${cat.category.padEnd(15)} $${cat.avgPrice.toFixed(2)} (${cat.count} items)`);
    }
  }
}

async function testDrops() {
  console.log("🔥 Price Drops");
  console.log("==============");
  
  const data = await fetchEndpoint("/price/drops", {
    minDropPercent: "5",
    limit: "20",
  });
  
  if (data.error) {
    console.log(`❌ Error: ${data.error}`);
    return;
  }
  
  if (!data.drops || data.drops.length === 0) {
    console.log("\n📭 No price drops found in the last 24 hours");
    return;
  }
  
  console.log(`\n📉 Found ${data.drops.length} price drops:\n`);
  
  for (const drop of data.drops) {
    const product = drop.product?.name || "Unknown";
    const brand = drop.brand?.name || "Unknown";
    const retailer = drop.retailer?.name || "Unknown";
    
    console.log(`   ↓ ${drop.dropPercent.toFixed(1)}% | ${product}`);
    console.log(`     ${brand} @ ${retailer}`);
    console.log(`     $${drop.previousPrice.toFixed(2)} → $${drop.currentPrice.toFixed(2)} (saves $${drop.dropAmount.toFixed(2)})`);
    console.log("");
  }
}

async function testChanges() {
  console.log("📊 Recent Price Changes");
  console.log("=======================");
  
  const data = await fetchEndpoint("/price/changes", {
    type: "all",
    minChangePercent: "5",
    limit: "20",
  });
  
  if (data.error) {
    console.log(`❌ Error: ${data.error}`);
    return;
  }
  
  if (!data.changes || data.changes.length === 0) {
    console.log("\n📭 No recent price changes found");
    return;
  }
  
  console.log(`\n📈 Found ${data.changes.length} price changes:\n`);
  
  for (const change of data.changes) {
    const product = change.product?.name || "Unknown";
    const brand = change.brand?.name || "Unknown";
    const retailer = change.retailer?.name || "Unknown";
    const isDrop = change.changeAmount < 0;
    const icon = isDrop ? "↓" : "↑";
    const color = isDrop ? "green" : "red";
    
    console.log(`   ${icon} ${Math.abs(change.changePercent).toFixed(1)}% | ${product}`);
    console.log(`     ${brand} @ ${retailer}`);
    console.log(`     $${change.previousPrice.toFixed(2)} → $${change.currentPrice.toFixed(2)}`);
    console.log("");
  }
}

async function main() {
  const command = process.argv[2] || "summary";
  
  console.log("\n🌿 CannaSignal Price History Test");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log(`Endpoint: ${CONVEX_URL}`);
  
  switch (command) {
    case "summary":
      await testSummary();
      break;
    case "drops":
      await testDrops();
      break;
    case "changes":
      await testChanges();
      break;
    default:
      console.log(`Unknown command: ${command}`);
      console.log("\nUsage:");
      console.log("  npx tsx scripts/price-history-test.ts summary");
      console.log("  npx tsx scripts/price-history-test.ts drops");
      console.log("  npx tsx scripts/price-history-test.ts changes");
      process.exit(1);
  }
  
  console.log("\n✅ Done\n");
}

main().catch(console.error);
