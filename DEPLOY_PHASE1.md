# Phase 1 Deployment Instructions

## What's Been Built

### 1. Convex Schema Enhancement
- Added `inventoryEvents` table in `convex/schema.ts`
- Tracks: `new_product`, `restock`, `sold_out`, `price_drop`, `price_increase`, `removed`
- Indexed by: time, retailer, product, event type, notification status

### 2. Delta Detection System (`convex/inventoryEvents.ts`)
- `getRecentEvents` - Query recent inventory changes
- `getEventsByRetailer` - Events for a specific retailer
- `getEventsByProduct` - Events for a specific product
- `detectDeltas` - Compare current scrape vs last snapshot
- `sendDiscordNotifications` - Send webhook notifications

### 3. Enhanced Ingestion (`convex/ingestion.ts`)
- `updateCurrentInventory` now records inventory events automatically
- Detects: new products, restocks, sold-outs, price drops, price increases
- Returns `totalEventsDetected` in batch ingestion results

### 4. HTTP Endpoints (`convex/http.ts`)
- `GET /events/recent` - Get recent inventory events
- `POST /events/notify` - Send Discord notifications for unnotified events

### 5. Cron Worker (`workers/cron/`)
- 15-minute scheduled trigger
- Scrapes all 18 embedded Dutchie locations via BrowserBase
- Posts results to Convex ingestion
- Sends Discord summary notifications

## Deployment Steps

### 1. Deploy Convex Schema

```bash
cd /root/BudAlert

# Set the deploy key (get from Convex dashboard)
export CONVEX_DEPLOY_KEY="prod:quick-weasel-225:xxxxxxx"

# Push schema and functions
npx convex deploy --cmd 'echo skip'
```

### 2. Set Convex Environment Variables

Go to https://dashboard.convex.dev/t/steven-esp574/quick-weasel-225/settings/environment-variables

Add:
- `DISCORD_WEBHOOK_URL` - Your Discord webhook for notifications

### 3. Deploy Cron Worker

```bash
cd /root/BudAlert/workers/cron

# Install dependencies
npm install

# Set secrets
wrangler secret put BROWSERBASE_API_KEY
wrangler secret put BROWSERBASE_PROJECT_ID
wrangler secret put CONVEX_DEPLOY_KEY
wrangler secret put DISCORD_WEBHOOK_URL

# Deploy
wrangler deploy
```

### 4. Verify Deployment

```bash
# Test health endpoint
curl https://cannasignal-cron.prtl.workers.dev/health

# Manual trigger (for testing)
curl -X POST https://cannasignal-cron.prtl.workers.dev/trigger

# Check Convex health
curl https://quick-weasel-225.convex.site/health

# Check recent events
curl https://quick-weasel-225.convex.site/events/recent
```

## Environment Variables Needed

| Variable | Service | Description |
|----------|---------|-------------|
| `BROWSERBASE_API_KEY` | Worker | BrowserBase API key |
| `BROWSERBASE_PROJECT_ID` | Worker | BrowserBase project ID |
| `CONVEX_DEPLOY_KEY` | Worker | Convex deploy key for API calls |
| `DISCORD_WEBHOOK_URL` | Both | Discord webhook for notifications |

## File Changes Summary

```
convex/schema.ts          - Added inventoryEvents table
convex/inventoryEvents.ts - NEW: Delta detection & notifications
convex/ingestion.ts       - Enhanced with event recording
convex/http.ts            - Added /events/* endpoints
workers/cron/index.ts     - NEW: 15-min scraper orchestrator
workers/cron/wrangler.toml
workers/cron/package.json
```

## Success Metrics

- [ ] Schema deployed to Convex
- [ ] Cron worker deployed and running
- [ ] 15-min scrapes executing successfully
- [ ] Events being detected and recorded
- [ ] Discord notifications working
