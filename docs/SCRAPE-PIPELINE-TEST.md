# CannaSignal: Scrape Pipeline Test Results

**Test Date:** 2026-02-16  
**Batch IDs:** test-batch-001, test-batch-full-002

## Executive Summary

The scrape → ingest pipeline is **functionally complete**, but Dutchie is actively blocking all scraping attempts from cloud environments.

### ✅ What Works
- Convex ingestion pipeline fully functional
- Brand/product normalization working correctly
- Weight extraction parsing (e.g., "3.5g" → `{amount: 3.5, unit: "g"}`)
- Category mapping (Flower → flower, Pre-Roll → pre_roll, etc.)
- Current inventory tracking with price history
- Menu snapshot creation

### ❌ What's Blocked
- Browser Worker scraping (Cloudflare blocks headless Chrome)
- Direct GraphQL API calls (Cloudflare blocks server IPs)

---

## Test Results

### Retailers Tested

| Retailer | Slug | Convex ID | Scrape Status |
|----------|------|-----------|---------------|
| Housing Works Cannabis Co. | housing-works-cannabis-co | jx74rzzged5ezfcq6hnwky9pqh818nt2 | ❌ Cloudflare blocked |
| The Cannabist - Brooklyn | the-cannabist-brooklyn | jx797eyczm86jc6aqpg3ex4zwx818rfa | ❌ Cloudflare blocked |
| Smacked Village | smacked-village | jx7dmad9mn97367tx33vfwbs61819vxq | ❌ Cloudflare blocked |

### Ingestion Test Results

Successfully ingested **12 products** across 3 retailers using mock data:

```
Batch: test-batch-001 → 2 products processed
Batch: test-batch-full-002 → 10 products processed
Total: 12 products, 0 failures
```

### Data Created in Convex

- **10 Brands** (seeded + auto-created)
- **12 Products** with normalized names
- **12 Current Inventory records**
- **12 Menu Snapshots**
- **Scrape Jobs** logged for tracking

---

## Cloudflare Blocking Details

### Browser Worker Response
```json
{
  "success": true,
  "url": "https://dutchie.com/dispensary/housing-works-cannabis-co",
  "retailer": "Attention Required! | Cloudflare",
  "productCount": 0,
  "products": [],
  "hasNextData": false
}
```

### GraphQL API Response
Direct calls to `https://dutchie.com/graphql` return Cloudflare challenge page:
```
Sorry, you have been blocked
You are unable to access dutchie.com
```

### Root Cause
Dutchie uses Cloudflare Bot Management to detect and block:
1. Headless browser automation (Puppeteer/Playwright)
2. Server-originated API requests
3. Requests without proper browser fingerprints

---

## Solutions to Bypass Cloudflare

### Option 1: Residential Proxy Service
Use rotating residential IPs to appear as regular consumers.
- **Providers:** Bright Data, Oxylabs, SmartProxy
- **Cost:** ~$10-15/GB
- **Effectiveness:** High for API calls

### Option 2: Browser-in-Browser (Stealth)
Use `puppeteer-extra` with stealth plugin for browser scraping.
```javascript
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
puppeteer.use(StealthPlugin());
```

### Option 3: Official Dutchie API
Contact Dutchie for official API access (for business use cases).

### Option 4: Browser Extension Approach
User-installed extension that scrapes data from their own browsing session.

---

## Data Quality Notes

### Dutchie Data Fields Available (when accessible)
- Product name, brand, category, subcategory
- Price, special price, quantity (stock)
- THC/CBD potency (formatted strings)
- Strain type (INDICA/SATIVA/HYBRID)
- Product image URL
- Multiple variants per product (different sizes/prices)

### Normalization Applied
| Raw Input | Normalized Output |
|-----------|-------------------|
| "Blue Dream - 3.5g" | `blue-dream-3-5g` |
| "Tyson 2.0" | `tyson-2-0` |
| "Pre-Roll" | `pre_roll` |
| "Vapes" | `vape` |
| "Concentrates" | `concentrate` |

### Weight Extraction Examples
- "3.5g" → `{amount: 3.5, unit: "g"}`
- "1/8 oz" → `{amount: 3.5, unit: "g"}`
- "1g" → `{amount: 1, unit: "g"}`

---

## Files Created

```
/root/clawd/cannasignal/
├── scripts/
│   ├── test-ingest.ts        # TypeScript ingestion test
│   └── scrape-and-ingest.sh  # Bash end-to-end script
├── data/test-scrapes/
│   ├── housing-works.json         # Cloudflare blocked
│   ├── cannabist-brooklyn.json    # Cloudflare blocked
│   ├── smacked-village.json       # Cloudflare blocked
│   └── housing-works-graphql.json # Cloudflare blocked
└── docs/
    └── SCRAPE-PIPELINE-TEST.md    # This document
```

---

## Recommendations

### Immediate (Phase 1)
1. **Use mock/manual data** for dashboard development
2. **Focus on Convex functions** which are working properly
3. **Document data schema** for future integration

### Short-term (Phase 2)
1. **Integrate residential proxy** for production scraping
2. **Add retry logic** with exponential backoff
3. **Implement rate limiting** (Dutchie appears to allow ~1 req/sec)

### Long-term (Phase 3)
1. **Explore Dutchie partnership** for official API access
2. **Add alternative platforms** (Jane, Weedmaps, iHeartJane)
3. **Build browser extension** for user-assisted scraping

---

## How to Test

### Test ingestion only (mock data)
```bash
cd /root/clawd/cannasignal
./scripts/scrape-and-ingest.sh all
```

### Test specific retailer
```bash
./scripts/scrape-and-ingest.sh housing-works-cannabis-co
```

### Verify data in Convex
```bash
export CONVEX_DEPLOY_KEY="dev:quick-weasel-225|eyJ2MiI6IjBmMDI3MmFiM2MwYjRkNmE5MDY1YzI5MDI5ZDA0YmEyIn0="
curl -s -X POST "https://quick-weasel-225.convex.cloud/api/query" \
  -H "Content-Type: application/json" \
  -H "Authorization: Convex $CONVEX_DEPLOY_KEY" \
  -d '{"path": "inventory:getByRetailer", "args": {"retailerId": "jx74rzzged5ezfcq6hnwky9pqh818nt2"}}' | jq '.'
```
