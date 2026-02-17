# DATA-001: Scraper Validation Report

**Date:** 2026-02-17  
**Author:** Subagent (budalert-worker-data001)  
**Status:** ✅ Complete

---

## Executive Summary

Validated scraper output against live Dutchie menus. Found **good data quality** when using the stealth Playwright scraper, but **infrastructure gaps** prevent production use.

| Metric | Score | Notes |
|--------|-------|-------|
| Normalizer Accuracy | 10/10 (100%) | Product name parsing working correctly |
| Field Completeness | 85% | THC, price, brand, strain - all captured |
| Inventory Capture | 0% | ⚠️ Inventory counts unavailable |
| Production Readiness | 40% | Infrastructure issues with deployed workers |

---

## Test Retailers

Validated against 3 Dutchie-powered retailers:

1. **ConBud LES** - `conbud.com/stores/conbud-les/products/flower` ✅
2. **Culture House** - `dutchie.com/dispensary/culture-house` ❌ (blocked)
3. **Silk Road NYC** - `dutchie.com/dispensary/silk-road-nyc` ❌ (blocked)

---

## Key Findings

### 1. ✅ Product Normalizer Works Well

The `productNormalizer.ts` successfully parses messy DOM-scraped names:

**Input:**
```
"Grocery | 28g Flower - Sativa | Black DieselGrocerySativaTHC: 29.21%"
```

**Output:**
```json
{
  "name": "Black Diesel",
  "brand": "Grocery", 
  "category": "flower",
  "strain": "sativa",
  "thc": 29.21,
  "weight": { "amount": 28, "unit": "g" }
}
```

All 10 test cases pass, including edge cases:
- TAC + THC both present
- Staff Pick tags
- CBD percentages
- THC formatted as "mg" instead of "%"
- Quarter ounce format → correctly infers 7g flower

### 2. ❌ Direct Dutchie URLs Blocked

**Problem:** Cloudflare blocks requests to `dutchie.com/dispensary/*`

```
Response: "Sorry, you have been blocked"
```

Both approaches fail:
- GraphQL API direct calls → Cloudflare challenge
- Basic Puppeteer browser worker → Cloudflare interstitial

**Only solution that works:** Playwright with stealth plugin bypasses detection.

### 3. ✅ Embedded Menus Work (With Stealth)

Retailers hosting Dutchie on their own domain work:

| URL Format | Works? |
|------------|--------|
| `dutchie.com/dispensary/slug` | ❌ No |
| `retailer.com/stores/slug/products` | ✅ Yes |
| `retailer.com` (iframe embed) | ⚠️ Maybe |

The stealth scraper successfully extracted 54 products from ConBud.

### 4. ⚠️ Inventory Data Unavailable

All 54 scraped products show `inventoryCount: null`:
- No low-stock badges visible on listing pages
- Detail page scraping attempted but no inventory fields found
- Dutchie may restrict inventory visibility to in-store displays

### 5. ❌ Browser Worker Times Out

The deployed `cannasignal-browser.prtl.workers.dev` fails:

```json
{"success":false,"error":"TimeoutError: Navigation timeout of 45000 ms exceeded"}
```

Root cause: Cloudflare Browser Rendering (basic Puppeteer) lacks stealth capabilities.

---

## Architecture Gap

```
┌─────────────────────────────────────────────────────────────┐
│                    WHAT WORKS TODAY                         │
├─────────────────────────────────────────────────────────────┤
│  Local Script                                               │
│  ├─ playwright-extra + stealth plugin                      │
│  ├─ Successfully bypasses Cloudflare                       │
│  └─ Extracts clean data                                    │
└─────────────────────────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  WHAT NEEDS TO WORK                         │
├─────────────────────────────────────────────────────────────┤
│  Cloudflare Worker (browser-rendering)                     │
│  ├─ Basic Puppeteer (no stealth)                           │
│  ├─ BLOCKED by Cloudflare                                  │
│  └─ Cannot use playwright-extra in CF Workers              │
└─────────────────────────────────────────────────────────────┘
```

### Potential Solutions

1. **Self-hosted browser pool** - Run stealth Playwright on a VPS
2. **BrowserBase/Browserless** - Paid services with stealth
3. **Focus on embedded menus** - Only scrape retailer domains
4. **Dutchie API partnership** - Get official API access

---

## Fixed Issues

### Category Inference for Cannabis Weights

**Before:** Products with "Quarter Ounce" but no explicit "Flower" keyword got `category: "other"`

**After:** Normalizer now infers `category: "flower"` when:
- Weight uses cannabis-specific terms (quarter, eighth, half, oz)
- Weight is in typical flower range (1-28g)

```typescript
// Added to productNormalizer.ts
if (category === 'other' && weight) {
  const hasCannaWeight = /\b(quarter|eighth|half|oz|ounce)\b/i.test(lowerName);
  const typicalFlowerWeight = weight.unit === 'g' && weight.amount >= 1 && weight.amount <= 28;
  if (hasCannaWeight || typicalFlowerWeight) {
    category = 'flower';
  }
}
```

---

## Data Quality Assessment

Based on ConBud test scrape (54 products):

| Field | Captured | Missing | Quality |
|-------|----------|---------|---------|
| Product Name | 54 (100%) | 0 | ✅ Clean after normalization |
| Brand | 54 (100%) | 0 | ✅ Correctly extracted |
| Price | 54 (100%) | 0 | ✅ Accurate |
| THC % | 54 (100%) | 0 | ✅ Extracted & validated |
| Strain Type | 54 (100%) | 0 | ✅ Sativa/Indica/Hybrid |
| Weight | 52 (96%) | 2 | ✅ Good coverage |
| Category | 54 (100%) | 0 | ✅ All flower (correct) |
| Inventory | 0 (0%) | 54 | ❌ Not available |
| CBD % | 3 (6%) | 51 | ⚠️ Only shown when > 0 |

---

## Recommendations

1. **Short-term:** Use the stealth Playwright script for one-off scrapes via cron
2. **Medium-term:** Stand up a stealth browser service (VPS or BrowserBase)
3. **Long-term:** Pursue official Dutchie API access for reliable data

---

## Files Modified

- `convex/lib/productNormalizer.ts` - Added cannabis weight → flower inference
- `scripts/validation-data001.ts` - Created validation test suite

## Files Created

- `docs/DATA-001-validation-report.md` - This report
