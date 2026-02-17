#!/usr/bin/env npx tsx
/**
 * Alert System Test Script (REL-002)
 * 
 * Tests the scraper alerting system:
 * - Check alert conditions
 * - Test Discord webhook
 * - Trigger manual alert check
 * 
 * Usage:
 *   npx tsx scripts/alert-test.ts check              # Check current conditions
 *   npx tsx scripts/alert-test.ts digest             # Get alert digest
 *   npx tsx scripts/alert-test.ts test-webhook URL   # Test Discord webhook
 *   npx tsx scripts/alert-test.ts trigger [URL]      # Trigger alert check
 */

const CONVEX_URL = process.env.CONVEX_URL || "https://quick-weasel-225.convex.site";

async function checkConditions() {
  console.log("🔍 Checking alert conditions...\n");
  
  const response = await fetch(`${CONVEX_URL}/alerts/conditions`);
  if (!response.ok) {
    console.error("❌ Failed to check conditions:", await response.text());
    process.exit(1);
  }
  
  const data = await response.json();
  
  console.log("📊 Summary:");
  console.log(`   Total unresolved: ${data.summary.totalUnresolved}`);
  console.log(`   Recent failures: ${data.summary.recentFailures}`);
  console.log(`   Failure rate: ${data.summary.failureRate}%`);
  console.log(`   Stale retailers: ${data.summary.staleRetailers}`);
  console.log(`   Rate limit errors: ${data.summary.rateLimitErrors}`);
  console.log(`   Jobs last hour: ${data.summary.totalJobsLastHour} (${data.summary.successfulJobsLastHour} successful)`);
  console.log();
  
  console.log("🎯 Conditions:");
  for (const condition of data.conditions) {
    const icon = condition.triggered ? "⚠️" : "✅";
    const status = condition.triggered ? `TRIGGERED (${condition.severity})` : "OK";
    console.log(`   ${icon} ${condition.type}: ${status}`);
    console.log(`      ${condition.details}`);
    console.log(`      Value: ${condition.value} / Threshold: ${condition.threshold}`);
    console.log();
  }
  
  if (data.triggeredAlerts.length === 0) {
    console.log("✅ No alerts triggered - system healthy!");
  } else {
    console.log(`⚠️ ${data.triggeredAlerts.length} alert(s) triggered`);
  }
  
  console.log(`\nChecked at: ${data.checkedAt}`);
}

async function getDigest() {
  console.log("📋 Fetching alert digest...\n");
  
  const response = await fetch(`${CONVEX_URL}/alerts/digest`);
  if (!response.ok) {
    console.error("❌ Failed to get digest:", await response.text());
    process.exit(1);
  }
  
  const data = await response.json();
  
  console.log("📊 Alert Digest:");
  console.log(`   System healthy: ${data.isHealthy ? "✅ Yes" : "❌ No"}`);
  console.log(`   Unacknowledged: ${data.unacknowledgedCount}`);
  console.log(`   Alerts (24h): ${data.alertsLast24h}`);
  console.log();
  
  if (Object.keys(data.bySeverity).length > 0) {
    console.log("   By severity:");
    for (const [severity, count] of Object.entries(data.bySeverity)) {
      console.log(`     ${severity}: ${count}`);
    }
    console.log();
  }
  
  if (data.latestAlert) {
    console.log("🕐 Latest alert:");
    console.log(`   Type: ${data.latestAlert.type}`);
    console.log(`   Severity: ${data.latestAlert.severity}`);
    console.log(`   Title: ${data.latestAlert.title}`);
    console.log(`   Message: ${data.latestAlert.message}`);
    console.log(`   Acknowledged: ${data.latestAlert.acknowledged ? "Yes" : "No"}`);
    console.log(`   Created: ${new Date(data.latestAlert.createdAt).toISOString()}`);
  }
  
  if (data.currentConditions.length > 0) {
    console.log("\n⚠️ Current active conditions:");
    for (const condition of data.currentConditions) {
      console.log(`   ${condition.type}: ${condition.details}`);
    }
  }
  
  console.log(`\nChecked at: ${data.checkedAt}`);
}

async function testWebhook(webhookUrl: string) {
  console.log("🧪 Testing Discord webhook...\n");
  console.log(`   URL: ${webhookUrl.slice(0, 50)}...`);
  
  const response = await fetch(`${CONVEX_URL}/alerts/webhook-test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ webhookUrl }),
  });
  
  const data = await response.json();
  
  if (data.success) {
    console.log("\n✅ Webhook test successful!");
    console.log("   Check your Discord channel for the test message.");
  } else {
    console.log("\n❌ Webhook test failed!");
    console.log(`   Error: ${data.error}`);
  }
}

async function triggerAlertCheck(webhookUrl?: string) {
  console.log("🚨 Triggering alert check...\n");
  
  const body: Record<string, any> = {};
  if (webhookUrl) {
    body.webhookUrl = webhookUrl;
    console.log(`   Webhook: ${webhookUrl.slice(0, 50)}...`);
  }
  
  const response = await fetch(`${CONVEX_URL}/alerts/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  
  const data = await response.json();
  
  console.log("\n📊 Result:");
  console.log(`   Alerts sent: ${data.alertsSent}`);
  console.log(`   Message: ${data.message || "N/A"}`);
  
  if (data.primaryType) {
    console.log(`   Primary type: ${data.primaryType}`);
    console.log(`   Severity: ${data.severity}`);
    console.log(`   Delivered to: ${data.deliveredTo?.join(", ") || "none"}`);
  }
  
  console.log("\n📊 Current conditions:");
  console.log(`   Unresolved errors: ${data.conditions.totalUnresolved}`);
  console.log(`   Failure rate: ${data.conditions.failureRate}%`);
  console.log(`   Jobs last hour: ${data.conditions.totalJobsLastHour}`);
}

async function main() {
  const command = process.argv[2];
  
  switch (command) {
    case "check":
      await checkConditions();
      break;
      
    case "digest":
      await getDigest();
      break;
      
    case "test-webhook":
      const testUrl = process.argv[3];
      if (!testUrl) {
        console.error("❌ Missing webhook URL");
        console.log("Usage: npx tsx scripts/alert-test.ts test-webhook <WEBHOOK_URL>");
        process.exit(1);
      }
      await testWebhook(testUrl);
      break;
      
    case "trigger":
      const triggerUrl = process.argv[3];
      await triggerAlertCheck(triggerUrl);
      break;
      
    default:
      console.log("CannaSignal Alert System Test (REL-002)");
      console.log();
      console.log("Usage:");
      console.log("  npx tsx scripts/alert-test.ts check              # Check current conditions");
      console.log("  npx tsx scripts/alert-test.ts digest             # Get alert digest");
      console.log("  npx tsx scripts/alert-test.ts test-webhook URL   # Test Discord webhook");
      console.log("  npx tsx scripts/alert-test.ts trigger [URL]      # Trigger alert check");
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
