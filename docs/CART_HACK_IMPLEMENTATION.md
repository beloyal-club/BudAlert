# Cart Hack Implementation for Exact Inventory Detection

**Date:** 2026-02-20
**Status:** Complete
**Files Created:**
- `workers/lib/cartHack.ts` - Core cart hack module
- `workers/lib/inventoryFallback.ts` - Fallback hierarchy implementation
- `test-cart-hack.ts` - Test suite

## Research Findings

### Dutchie Cart Behavior

Based on analysis of embedded Dutchie menus (e.g., conbud.com):

1. **Direct Inventory Display**: When stock is low, Dutchie shows:
   - "🔥 X left in stock – order soon!"
   - This appears directly on product pages and sometimes in listings

2. **Quantity Dropdown**: Products have quantity selectors that may be capped at available inventory:
   - If dropdown shows 1-5, max inventory is likely 5
   - If dropdown shows 1-99, product has high stock

3. **Cart Overflow Errors**: When adding more than available:
   - Error messages like "Only X available" appear
   - Cart auto-adjusts quantity to max available
   - Toast/alert notifications reveal actual count

4. **API Patterns**: 
   - Dutchie uses GraphQL for product data
   - Inventory counts may be available via API interception
   - However, browser-based extraction is more reliable

## Prioritized Approaches

| # | Approach | Accuracy | Speed | Complexity | When to Use |
|---|----------|----------|-------|------------|-------------|
| 1 | Page Text Patterns | Exact | Fast | Low | Always try first |
| 2 | Out-of-Stock Badges | Exact | Fast | Low | Always check |
| 3 | Quantity Dropdown | Estimated | Fast | Low | Batch processing |
| 4 | Cart Overflow | Exact | Slow | Medium | When others fail |
| 5 | Cart Auto-Adjust | Estimated | Slow | Medium | Fallback |
| 6 | GraphQL Intercept | Exact | Medium | High | Future enhancement |

### Pros/Cons Detail

**DOM Manipulation (Click Buttons)**
- ✅ Works with any Dutchie embed
- ✅ No API knowledge needed
- ❌ Slow (requires clicks, waits)
- ❌ May trigger rate limits

**Direct API Calls**
- ✅ Fast, no DOM manipulation
- ✅ Reliable if API is stable
- ❌ API may change without notice
- ❌ May require auth tokens

**GraphQL Mutations**
- ✅ Direct access to Dutchie data model
- ✅ Can get all product inventory at once
- ❌ Requires reverse-engineering schema
- ❌ May be blocked/changed

**Quantity Input Field**
- ✅ Simple to implement
- ✅ Non-destructive
- ❌ May not exist on all embeds
- ❌ Max attribute not always set

**Cart Error Parsing**
- ✅ Reveals exact inventory
- ✅ Works even when other methods fail
- ❌ Requires adding to cart
- ❌ Need to clean up cart state

## Fallback Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│  1. Page Text Patterns                                   │
│     "5 left in stock", "Only 3 left"                    │
│     → confidence: 'exact'                                │
├─────────────────────────────────────────────────────────┤
│  2. Out-of-Stock Badges                                  │
│     [class*="soldOut"], [class*="outOfStock"]           │
│     → confidence: 'exact', quantity: 0                   │
├─────────────────────────────────────────────────────────┤
│  3. Quantity Dropdown Max                                │
│     select options, input[type="number"].max             │
│     → confidence: 'estimated' (if < 50)                  │
├─────────────────────────────────────────────────────────┤
│  4. Cart Overflow Technique                              │
│     Set qty=99 → parse error message                     │
│     → confidence: 'exact'                                │
├─────────────────────────────────────────────────────────┤
│  5. Cart Auto-Adjust Detection                           │
│     Check if cart quantity was reduced                   │
│     → confidence: 'estimated'                            │
├─────────────────────────────────────────────────────────┤
│  6. Boolean In-Stock Fallback                            │
│     No quantity, just true/false                         │
│     → confidence: 'boolean'                              │
└─────────────────────────────────────────────────────────┘
```

## Module API

### cartHack.ts

```typescript
// Get exact inventory for a single product
async function getExactInventory(
  page: Page,
  productSelector?: string,
  options?: CartHackOptions
): Promise<InventoryResult>

// Extract inventory for all products on listing page
async function extractInventoryFromListing(
  page: Page
): Promise<Map<string, InventoryResult>>

// Enhance scraped products with inventory data
function enhanceProductsWithInventory<T>(
  products: T[],
  inventoryMap: Map<string, InventoryResult>
): T[]
```

### inventoryFallback.ts

```typescript
// Run full fallback hierarchy for single product
async function getInventoryWithFallback(
  page: Page,
  productSelector?: string,
  options?: FallbackOptions
): Promise<FallbackResult>

// Fast batch extraction for listings
async function getBatchInventory(
  page: Page
): Promise<Map<string, FallbackResult>>

// Compare two results, return more confident one
function pickBestResult(
  a: InventoryResult, 
  b: InventoryResult
): InventoryResult
```

## Integration with cron/index.ts

The integration is minimal and non-disruptive:

```typescript
import { 
  extractInventoryFromListing, 
  enhanceProductsWithInventory 
} from '../lib/cartHack';

// In scrapeLocation(), after extracting products:
try {
  const inventoryMap = await extractInventoryFromListing(page);
  if (inventoryMap.size > 0) {
    const enhanced = enhanceProductsWithInventory(products, inventoryMap);
    return { products: enhanced };
  }
} catch (invError) {
  console.log(`Inventory enhancement failed: ${invError}`);
}
```

This enhancement:
- Runs after existing extraction
- Is non-blocking (errors don't break scraping)
- Enhances products that didn't get inventory from DOM scraping
- Adds no significant latency (uses same page, no extra navigation)

## Testing

Run the test suite:

```bash
cd /root/BudAlert
npx tsx test-cart-hack.ts
```

Tests:
1. Batch extraction from listing page
2. Single product fallback hierarchy
3. Cart overflow technique directly

## Edge Cases Handled

1. **No Cart**: If product can't be added, falls back to boolean
2. **Infinite Stock**: High dropdown values (99+) indicate unlimited
3. **Out of Stock**: Detected via badges, zero quantity
4. **Rate Limiting**: Uses delays between operations
5. **Modal/Drawer**: Handles both inline and modal cart UIs
6. **Cleanup**: Removes items from cart after testing

## Future Improvements

1. **GraphQL API Interception**: Listen for Dutchie API responses during page load
2. **LocalStorage Cache**: Check if Dutchie caches inventory client-side
3. **Session Reuse**: Keep cart state across products for faster extraction
4. **Batch Cart Operations**: Add multiple products, check all at once
5. **Confidence Scoring**: Weight results by source reliability

## Files Changed

- `workers/lib/cartHack.ts` (new) - 22KB
- `workers/lib/inventoryFallback.ts` (new) - 10KB
- `workers/cron/index.ts` - Added import and integration (~15 lines)
- `test-cart-hack.ts` (new) - Test suite
