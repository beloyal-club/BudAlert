# LeafBridge (Alta Dispensary) Scraper Plan

**Created:** 2026-02-24
**Target Site:** Alta Dispensary (altadispensary.nyc)
**Goal:** Extract inventory from AJAX-loaded WordPress menu

---

## Problem Statement

LeafBridge uses WordPress + AJAX loading. Initial HTML has skeleton placeholders, products load dynamically. Inventory may be available via:
1. Quantity input `max` attribute after AJAX loads
2. Low stock warnings in product modals
3. Hidden OOS products (absence = out of stock)

---

## Phase 1: LEAFBRIDGE-001 — Analyze AJAX Loading

**Objective:** Understand LeafBridge's dynamic loading mechanism.

**Tasks:**
1. Fetch Alta homepage and analyze initial HTML
2. Find AJAX endpoint (`/wp-admin/admin-ajax.php`)
3. Identify nonce pattern for authentication
4. Document product card selectors after AJAX completes
5. Check if products can be fetched directly via AJAX

**Success Criteria:**
- [ ] AJAX endpoint identified
- [ ] Nonce extraction method documented
- [ ] Product selectors after load confirmed
- [ ] Direct AJAX approach feasibility assessed

---

## Phase 2: LEAFBRIDGE-002 — Create Platform Detection

**Objective:** Add LeafBridge to platform detection system.

**Tasks:**
1. Create `workers/lib/platforms/leafbridge.ts`
2. Implement `isLeafBridgeSite(url, html?)` detection
3. URL patterns: altadispensary.nyc
4. HTML signatures: leafbridge_product_card, /plugins/leafbridge/
5. Export from platforms/index.ts

**Success Criteria:**
- [ ] Detection function works for Alta
- [ ] Returns false for non-LeafBridge sites
- [ ] Exported from index.ts

---

## Phase 3: LEAFBRIDGE-003 — Implement Browser Scraper

**Objective:** Create scraper that waits for AJAX and extracts products.

**Tasks:**
1. Create `scrapeLeafBridgeProducts(page, sourceUrl)` function
2. Wait for `.leafbridge_product_card` to appear (AJAX complete)
3. Extract product data from loaded DOM
4. Check quantity input `max` attribute for inventory
5. Check for `.add_to_cart_soldout` class for OOS

**Success Criteria:**
- [ ] Waits for dynamic content
- [ ] Extracts product name, price, brand
- [ ] Captures quantity from input max attribute
- [ ] Detects sold out products

---

## Phase 4: LEAFBRIDGE-004 — Integrate with Cron

**Objective:** Wire LeafBridge scraper into main cron loop.

**Tasks:**
1. Add LeafBridge detection to cron/index.ts (after Tymber check)
2. For LeafBridge: use BrowserBase but with custom extraction
3. Call scrapeLeafBridgeProducts instead of generic extractProducts
4. Ensure results flow to Convex ingestion

**Success Criteria:**
- [ ] Alta detected as LeafBridge
- [ ] Custom scraper called for Alta
- [ ] Products have quantity where available
- [ ] Other locations unaffected

---

## Phase 5: LEAFBRIDGE-005 — Validate and Document

**Objective:** Verify extraction and document for future.

**Tasks:**
1. Deploy updated cron worker
2. Trigger manual scrape for Alta
3. Check Convex for Alta products with inventory
4. Calculate data quality score
5. Document LeafBridge patterns in code comments

**Success Criteria:**
- [ ] Alta products in Convex
- [ ] Quantity populated where available (target 60%+)
- [ ] Documentation complete
- [ ] No regression in other scrapers

---

## Key Selectors (from audit)

```typescript
const LEAFBRIDGE_SELECTORS = {
  productCard: '.leafbridge_product_card',
  productName: '.leafbridge_product_name',
  brandName: '.leafbridge_brand_name',
  price: '.leafbridge_product_price',
  soldOut: '.add_to_cart_soldout',
  lowStock: '.add_to_cart_warning',
  quantityInput: 'input[type="number"]',
};
```
