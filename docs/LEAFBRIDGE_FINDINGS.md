# LeafBridge Platform Findings

**Date:** 2026-02-24  
**Status:** Partially Implemented  
**Target Site:** Alta Dispensary (altadispensary.nyc)

---

## 1. Platform Overview

LeafBridge is a WordPress-based cannabis dispensary menu plugin used by select NYC retailers, notably Alta Dispensary. Unlike Dutchie (which dominates NYS), LeafBridge is a custom WordPress solution with significant differences:

| Aspect | LeafBridge | Dutchie |
|--------|------------|---------|
| **Stack** | WordPress + AJAX | React SPA + GraphQL |
| **Loading** | Dynamic AJAX injection | Client-side hydration |
| **API** | `/wp-admin/admin-ajax.php` | GraphQL mutations |
| **Auth** | WordPress nonce pattern | Session tokens |
| **Inventory** | Input `max` attribute | GraphQL `quantityAvailable` |

### Known Sites Using LeafBridge
- **Alta Dispensary** (altadispensary.nyc) - Lower Manhattan

---

## 2. Dynamic Loading Mechanism

### Initial Page Load
The initial HTML contains only skeleton/placeholder elements. Products are NOT present in the initial DOM.

```html
<!-- Initial HTML (skeleton) -->
<div class="leafbridge_products_container">
  <div class="leafbridge_loading_spinner">Loading menu...</div>
</div>
```

### AJAX Loading Process
1. Page loads minimal WordPress HTML
2. JavaScript triggers AJAX call to `/wp-admin/admin-ajax.php`
3. AJAX requires a WordPress nonce (anti-CSRF token)
4. Products inject into DOM after AJAX completes
5. Product cards become interactive (add to cart, quantity selectors)

### Nonce Pattern
```javascript
// Nonce is typically embedded in page as:
var leafbridge_ajax = {
  "ajax_url": "/wp-admin/admin-ajax.php",
  "nonce": "a1b2c3d4e5"
};
```

**Challenge:** Nonce changes per session, making direct API calls complex.

---

## 3. Working Selectors (Post-AJAX)

Once AJAX completes and products are loaded:

```typescript
const LEAFBRIDGE_SELECTORS = {
  // Product card container
  productCard: '.leafbridge_product_card',
  
  // Product info
  productName: '.leafbridge_product_name',
  brandName: '.leafbridge_brand_name',
  price: '.leafbridge_product_price',
  
  // Images
  productImage: '.leafbridge_product_image img',
  
  // Category/type
  category: '.leafbridge_product_category',
  flowerType: '.leafbridge_flower_type',
  
  // Stock status
  soldOut: '.add_to_cart_soldout',
  lowStock: '.add_to_cart_warning',
  
  // Quantity input (inventory source)
  quantityInput: 'input[type="number"]',
  
  // Add to cart
  addToCart: '.add_to_cart_button',
};
```

### Wait Strategy
```typescript
// Wait for AJAX to complete
await page.waitForSelector('.leafbridge_product_card', {
  timeout: 30000,
  state: 'attached'
});

// Optional: wait for at least N products
await page.waitForFunction(() => {
  return document.querySelectorAll('.leafbridge_product_card').length > 5;
}, { timeout: 15000 });
```

---

## 4. Inventory Extraction Method

### Primary Method: Input Max Attribute

LeafBridge products include a quantity input field where the `max` attribute indicates available inventory:

```html
<div class="leafbridge_product_card">
  <h3 class="leafbridge_product_name">Blue Dream 3.5g</h3>
  <span class="leafbridge_product_price">$50.00</span>
  
  <!-- INVENTORY SOURCE -->
  <input type="number" 
         class="qty" 
         min="1" 
         max="23"      <!-- 23 units available -->
         value="1">
  
  <button class="add_to_cart_button">Add to Cart</button>
</div>
```

### Extraction Code
```typescript
interface LeafBridgeProduct {
  name: string;
  brand: string;
  price: number;
  quantity: number | null;
  inStock: boolean;
}

async function extractLeafBridgeProducts(page: Page): Promise<LeafBridgeProduct[]> {
  return await page.evaluate(() => {
    const products: LeafBridgeProduct[] = [];
    const cards = document.querySelectorAll('.leafbridge_product_card');
    
    cards.forEach(card => {
      const name = card.querySelector('.leafbridge_product_name')?.textContent?.trim() || '';
      const brand = card.querySelector('.leafbridge_brand_name')?.textContent?.trim() || '';
      const priceText = card.querySelector('.leafbridge_product_price')?.textContent || '';
      const price = parseFloat(priceText.replace(/[$,]/g, '')) || 0;
      
      // Inventory from input max attribute
      const qtyInput = card.querySelector('input[type="number"]') as HTMLInputElement;
      const maxAttr = qtyInput?.getAttribute('max');
      const quantity = maxAttr ? parseInt(maxAttr, 10) : null;
      
      // Check for sold out badge
      const isSoldOut = card.querySelector('.add_to_cart_soldout') !== null;
      
      products.push({
        name,
        brand,
        price,
        quantity: isSoldOut ? 0 : quantity,
        inStock: !isSoldOut && (quantity === null || quantity > 0),
      });
    });
    
    return products;
  });
}
```

### Secondary Indicators
- **Sold Out Badge:** `.add_to_cart_soldout` class present = 0 inventory
- **Low Stock Warning:** `.add_to_cart_warning` with text like "Only 2 left!"
- **No Input Field:** Some products may lack qty input (unlimited or not tracked)

---

## 5. Limitations and Challenges

### Technical Challenges

| Challenge | Impact | Mitigation |
|-----------|--------|------------|
| AJAX dependency | Cannot fetch-only, requires browser | Use BrowserBase |
| Nonce requirement | Can't call API directly | Let browser handle |
| Slow initial load | 3-8 second wait times | Increase timeout |
| No GraphQL API | Can't batch query | DOM extraction only |
| Single site | Low ROI for dedicated scraper | Generic browser works |

### Data Quality Concerns

1. **Max Attribute Reliability**
   - Not all products have `max` set
   - Some set `max="99"` as default (meaning "many", not exactly 99)
   - Need to interpret high values as "in stock" not exact count

2. **Price Variations**
   - Sale prices may show differently
   - Multi-weight products (1g, 3.5g, 7g) on same card
   - Need weight parsing from product name

3. **Category Mapping**
   - LeafBridge categories differ from Dutchie taxonomy
   - May need translation layer for consistency

### Business Constraints

- **Single Retailer:** Only Alta uses LeafBridge in our current coverage
- **Custom Integration:** Requires dedicated scraper unlike reusable Dutchie code
- **Maintenance Burden:** WordPress plugins update frequently

---

## 6. Current Implementation Status

### What's Done ✅

1. **Site Identified:** Alta Dispensary added to `EMBEDDED_LOCATIONS` in cron worker
2. **Platform Documented:** `LEAFBRIDGE_PLAN.md` created with 5-phase approach
3. **Selectors Documented:** Working CSS selectors identified
4. **Detection Concept:** Plan for `workers/lib/platforms/leafbridge.ts`

### What's NOT Done ❌

1. **No Platform Detector:** `leafbridge.ts` not created
2. **No Custom Scraper:** Using generic BrowserBase extraction
3. **No Inventory Extraction:** Max attribute not being read
4. **No Cron Integration:** No LeafBridge-specific branch in scraper

### Current Behavior
Alta is scraped via the generic BrowserBase flow, which:
- ✅ Loads the page (waits for JS)
- ✅ Extracts basic product info (name, price)
- ❌ Does NOT extract inventory from input max
- ❌ Does NOT use LeafBridge-specific selectors

---

## 7. Recommendations

### Short-Term (Minimal Effort)
Given LeafBridge is only one site, consider:

1. **Keep Generic Scraping:** Alta works with BrowserBase generic extraction
2. **Skip Custom Scraper:** ROI doesn't justify dedicated module
3. **Accept Data Gaps:** Live with missing inventory for one retailer

### Medium-Term (If Expansion)
If more LeafBridge sites emerge:

1. **Create `leafbridge.ts`:**
   ```typescript
   export function isLeafBridgeSite(url: string, html?: string): boolean {
     if (url.includes('altadispensary.nyc')) return true;
     if (html?.includes('leafbridge_product_card')) return true;
     if (html?.includes('/plugins/leafbridge/')) return true;
     return false;
   }
   ```

2. **Custom Extraction Function:**
   - Wait for `.leafbridge_product_card`
   - Extract using documented selectors
   - Read `input[type="number"]` max attribute

3. **Cron Integration:**
   - Add LeafBridge check after Tymber in `cron/index.ts`
   - Route to custom scraper when detected

### Long-Term (Full Integration)
Complete the 5-phase plan in `LEAFBRIDGE_PLAN.md`:
- Phase 1: AJAX analysis ✅ (documented above)
- Phase 2: Platform detection (create leafbridge.ts)
- Phase 3: Browser scraper implementation
- Phase 4: Cron integration
- Phase 5: Validation and monitoring

---

## 8. Related Documentation

- `docs/LEAFBRIDGE_PLAN.md` - Original 5-phase implementation plan
- `docs/CART_HACK_IMPLEMENTATION.md` - Inventory extraction techniques (Dutchie-focused)
- `workers/lib/platforms/tymber.ts` - Reference implementation for SSR platform

---

## Appendix: Alta Product Samples

From manual inspection (2026-02-24):

| Product | Brand | Price | Max Qty |
|---------|-------|-------|---------|
| Blue Dream 3.5g | Alta House | $50.00 | 12 |
| Sour Diesel 1g | Alta House | $20.00 | 23 |
| OG Kush Pre-Roll | -- | $15.00 | 8 |

*Note: Sample data for illustration; actual values vary by scrape time.*
