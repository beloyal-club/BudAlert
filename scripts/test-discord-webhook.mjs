#!/usr/bin/env node
/**
 * Test Discord Webhook
 * 
 * Tests webhook delivery for CannaSignal alerts.
 * 
 * Usage:
 *   node scripts/test-discord-webhook.mjs [webhook_url]
 * 
 * If no webhook URL is provided, reads from DISCORD_WEBHOOK_PRODUCT_ALERTS env var.
 */

const webhookUrl = process.argv[2] || process.env.DISCORD_WEBHOOK_PRODUCT_ALERTS;

if (!webhookUrl) {
  console.error('❌ No webhook URL provided');
  console.error('');
  console.error('Usage:');
  console.error('  node scripts/test-discord-webhook.mjs <webhook_url>');
  console.error('');
  console.error('Or set DISCORD_WEBHOOK_PRODUCT_ALERTS environment variable');
  process.exit(1);
}

// Validate URL format
const webhookPattern = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/;
if (!webhookPattern.test(webhookUrl)) {
  console.error('❌ Invalid webhook URL format');
  console.error('Expected: https://discord.com/api/webhooks/{id}/{token}');
  process.exit(1);
}

console.log('🔗 Testing webhook:', webhookUrl.replace(/\/[\w-]{20,}$/, '/[REDACTED]'));

// Test payloads
const testPayloads = [
  {
    name: 'Basic test',
    payload: {
      content: '🧪 **CannaSignal Webhook Test**',
      embeds: [{
        title: '✅ Webhook Test Successful',
        description: 'This is a test alert from CannaSignal.',
        color: 0x00ff00,
        timestamp: new Date().toISOString(),
      }],
    },
  },
  {
    name: 'Product alert (restock)',
    payload: {
      embeds: [{
        title: '🔔 Product Alert',
        description: '**TestBrand - Test Product 1g** is back in stock!\n💵 Price: $45.00\n📍 @ Test Dispensary (Brooklyn, NY)',
        color: 0x00ff00,
        footer: { text: 'Watching: test@example.com' },
        timestamp: new Date().toISOString(),
      }],
    },
  },
  {
    name: 'Product alert (price drop)',
    payload: {
      embeds: [{
        title: '📉 Product Alert',
        description: '**TestBrand - Test Product 3.5g** price dropped!\n💵 $60.00 → $45.00 (25% off)\n📍 @ Test Dispensary (Manhattan, NY)',
        color: 0x00ff00,
        footer: { text: 'Watching: test@example.com' },
        timestamp: new Date().toISOString(),
      }],
    },
  },
  {
    name: 'Scraper alert',
    payload: {
      content: '🚨 **CannaSignal Scraper Alert** 🚨',
      embeds: [{
        title: '❌ New Scraper Failures Detected',
        description: '❌ 3 new failure(s) in the last hour\n⏰ 2 retailer(s) stale',
        color: 0xff6b00,
        fields: [{
          name: '📊 Summary',
          value: 'Unresolved errors: **3**\nJobs last hour: **12** (9 successful)\nFailure rate: **25%**',
          inline: false,
        }],
        footer: { text: 'CannaSignal Monitoring' },
        timestamp: new Date().toISOString(),
      }],
    },
  },
];

async function runTests() {
  console.log('');
  console.log('Running', testPayloads.length, 'test(s)...');
  console.log('');
  
  let passed = 0;
  let failed = 0;

  for (const test of testPayloads) {
    process.stdout.write(`  ${test.name}... `);
    
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(test.payload),
      });

      if (response.ok) {
        console.log('✅ PASS');
        passed++;
      } else {
        const errorText = await response.text();
        console.log(`❌ FAIL (HTTP ${response.status})`);
        console.log(`     ${errorText.substring(0, 100)}`);
        failed++;
      }
      
      // Respect Discord rate limits (30 req/min)
      await new Promise(r => setTimeout(r, 2500));
    } catch (error) {
      console.log('❌ FAIL (Network error)');
      console.log(`     ${error.message}`);
      failed++;
    }
  }

  console.log('');
  console.log('━'.repeat(40));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('');
  
  if (failed > 0) {
    process.exit(1);
  }
  
  console.log('🎉 All tests passed! Check your Discord channel for the messages.');
}

runTests().catch(console.error);
