# CannaSignal Browser Rendering Worker

**Deployed URL:** https://cannasignal-browser.prtl.workers.dev

## Overview

This Cloudflare Worker provides headless Chrome access for scraping JavaScript-heavy dispensary menus (Dutchie Plus, etc.).

## Endpoints

### Health Check
```
GET /health
```
No auth required. Returns:
```json
{"status":"ok","service":"cannasignal-browser","timestamp":1234567890}
```

### Screenshot
```
GET /screenshot?url=<target>&secret=<CDP_SECRET>
```
Returns PNG image of the page.

### Menu Scrape
```
GET /menu?url=<dispensary-url>&secret=<CDP_SECRET>
```
Scrapes product data from a dispensary menu page. Returns:
```json
{
  "success": true,
  "url": "https://conbud.com/stores/conbud-les/products/flower",
  "products": [
    {
      "name": "Gary Payton 3.5g",
      "brand": "Cookies",
      "price": "$55.00",
      "stock": 6
    }
  ],
  "count": 67
}
```

## Authentication

All endpoints except `/health` require the `secret` query parameter matching `CDP_SECRET`.

## Usage from OpenClaw

```bash
# Test screenshot
curl "https://cannasignal-browser.prtl.workers.dev/screenshot?url=https://example.com&secret=$CDP_SECRET" > test.png

# Scrape menu
curl "https://cannasignal-browser.prtl.workers.dev/menu?url=https://conbud.com/stores/conbud-les/products/flower&secret=$CDP_SECRET"
```

## Deployment

```bash
cd workers/browser-rendering
npm install
npx wrangler deploy
echo "$CDP_SECRET" | npx wrangler secret put CDP_SECRET
```

## Limitations

- 30 second timeout per request
- Max 10 pages per batch request
- Cloudflare Browser Rendering costs apply at scale
