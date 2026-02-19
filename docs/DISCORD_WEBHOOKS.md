# Discord Webhook Setup for CannaSignal

This guide explains how to set up Discord webhooks for CannaSignal alerts.

## Overview

CannaSignal uses Discord webhooks for two types of alerts:

1. **Product Alerts** - Consumer-facing alerts for price drops, restocks, and new products
2. **Scraper Alerts** - Operational alerts for scraper health, failures, and rate limits

## Webhook URL Format

Discord webhook URLs follow this format:
```
https://discord.com/api/webhooks/{webhook_id}/{webhook_token}
```

Example:
```
https://discord.com/api/webhooks/1234567890123456789/abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOP
```

## Creating a Discord Webhook (Manual Steps)

### Step 1: Access Server Settings
1. Open Discord and navigate to your server
2. Click the server name dropdown → **Server Settings**
3. Go to **Integrations** → **Webhooks**

### Step 2: Create Webhook
1. Click **New Webhook**
2. Set the webhook name (e.g., "CannaSignal Alerts" or "CannaSignal Scraper")
3. Select the target channel (e.g., `#🔔-alerts` for product alerts)
4. Optionally upload an avatar image
5. Click **Copy Webhook URL**
6. Click **Save Changes**

### Step 3: Configure in Convex

Set the webhook URL as an environment variable in your Convex deployment:

```bash
# Via Convex dashboard:
# 1. Go to https://dashboard.convex.dev/d/quick-weasel-225
# 2. Settings → Environment Variables
# 3. Add the following:

DISCORD_WEBHOOK_PRODUCT_ALERTS=https://discord.com/api/webhooks/...
DISCORD_WEBHOOK_SCRAPER_ALERTS=https://discord.com/api/webhooks/...
```

Or via CLI:
```bash
npx convex env set DISCORD_WEBHOOK_PRODUCT_ALERTS "https://discord.com/api/webhooks/..."
npx convex env set DISCORD_WEBHOOK_SCRAPER_ALERTS "https://discord.com/api/webhooks/..."
```

## Recommended Channel Structure

For the CannaSignal Discord server (under 🌳BudAlert category):

| Channel | Purpose | Webhook Name |
|---------|---------|--------------|
| `🔔-alerts` | Product alerts (price drops, restocks) | CannaSignal Product Alerts |
| `🏎️-steering` | Scraper health alerts | CannaSignal Scraper Alerts |
| `🌀-workflow` | Manual operations and logs | (optional webhook) |

## Testing Webhooks

### Test via Convex Dashboard
1. Go to Convex Dashboard → Functions
2. Run `scraperAlerts.testWebhook` with your webhook URL
3. Check the Discord channel for the test message

### Test via Script
```bash
cd /root/BudAlert
node scripts/test-discord-webhook.mjs
```

### Test via cURL
```bash
curl -H "Content-Type: application/json" \
  -d '{"content":"🧪 Test alert from CannaSignal","embeds":[{"title":"Webhook Test","description":"If you see this, the webhook is working!","color":65280}]}' \
  "YOUR_WEBHOOK_URL_HERE"
```

## Environment Variables Reference

| Variable | Description | Used By |
|----------|-------------|---------|
| `DISCORD_WEBHOOK_PRODUCT_ALERTS` | Default webhook for product alerts | `alerts.processWatchedAlerts` |
| `DISCORD_WEBHOOK_SCRAPER_ALERTS` | Webhook for scraper health alerts | `scraperAlerts.checkAndAlert` |

## Message Format

### Product Alerts
```json
{
  "embeds": [{
    "title": "🔔 Product Alert",
    "description": "**Brand - Product** is back in stock!\n💵 Price: $XX.XX\n📍 @ Retailer (City, State)",
    "color": 65280,
    "footer": { "text": "Watching: user@email.com" },
    "timestamp": "2026-02-19T15:30:00.000Z"
  }]
}
```

### Scraper Alerts
```json
{
  "content": "🚨 **CannaSignal Scraper Alert** 🚨",
  "embeds": [{
    "title": "❌ New Scraper Failures Detected",
    "description": "❌ 5 new failure(s) in the last hour",
    "color": 16711680,
    "fields": [{
      "name": "📊 Summary",
      "value": "Unresolved errors: **5**\nJobs last hour: **20** (15 successful)\nFailure rate: **25%**"
    }],
    "timestamp": "2026-02-19T15:30:00.000Z"
  }]
}
```

## Security Notes

1. **Keep webhook URLs secret** - Anyone with the URL can send messages
2. **Use environment variables** - Never commit webhook URLs to git
3. **Rotate if compromised** - Delete and recreate webhooks if URL leaks
4. **Rate limits** - Discord limits webhooks to 30 requests per minute per channel

## Troubleshooting

### Webhook not sending
- Verify URL is correct (test with cURL)
- Check Convex function logs for errors
- Ensure channel permissions allow webhooks

### Rate limited
- Check `notificationQueue` for pending retries
- Reduce alert frequency
- Use batch notifications when possible

### Messages not appearing
- Check Discord channel permissions
- Verify webhook wasn't deleted
- Look for error messages in Convex logs
