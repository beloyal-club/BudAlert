#!/usr/bin/env npx tsx
/**
 * Cache Testing Script (PERF-002)
 * 
 * Test the stats cache HTTP endpoints
 * 
 * Usage:
 *   npx tsx scripts/cache-test.ts
 */

const CONVEX_URL = process.env.CONVEX_URL || 'https://quick-weasel-225.convex.site';

async function main() {
  console.log('🔧 CannaSignal Cache Test\n');

  // 1. Check cache status
  console.log('📊 Checking cache status...');
  const infoRes = await fetch(`${CONVEX_URL}/cache/info`);
  const info = await infoRes.json();
  console.log('  Cache info:', JSON.stringify(info, null, 2));

  // 2. Refresh cache
  console.log('\n🔄 Refreshing cache...');
  const refreshRes = await fetch(`${CONVEX_URL}/cache/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const refreshResult = await refreshRes.json();
  console.log('  Refresh result:', JSON.stringify(refreshResult, null, 2));

  // 3. Check cache status again
  console.log('\n📊 Checking cache status after refresh...');
  const info2Res = await fetch(`${CONVEX_URL}/cache/info`);
  const info2 = await info2Res.json();
  console.log('  Cache info:', JSON.stringify(info2, null, 2));

  // 4. Test dashboard stats (should use cache now)
  console.log('\n📈 Testing dashboard health endpoint...');
  const healthRes = await fetch(`${CONVEX_URL}/health`);
  const health = await healthRes.json();
  console.log('  Health:', JSON.stringify(health, null, 2));

  console.log('\n✅ Cache test complete!');
}

main().catch(console.error);
