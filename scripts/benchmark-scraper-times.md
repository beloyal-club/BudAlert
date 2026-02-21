# Scraper Speed Benchmark: v3.2.0 vs v3.3.0

## Methodology
Comparing wait times per product detail page visit.

## v3.2.0 (Before)
Per-product timing:
- Page navigation: ~500ms (network)
- Wait after load: 4000ms (DETAIL_PAGE_TIMEOUT_MS / 2)
- Delay between products: 500ms
- **Total per product: ~5000ms**

Per-location timing (40 products):
- Initial page load: 5000ms
- Age gate wait: 3000ms
- Product extraction: ~1000ms
- Detail page visits: 40 × 5000ms = 200,000ms
- **Total per location: ~209 seconds (~3.5 min)**

10 locations × 3.5 min = **~35 minutes total**

## v3.3.0 (After)
Per-product timing:
- Page navigation: ~500ms (network)
- Wait after load: 1500ms (PAGE_RENDER_WAIT_MS)
- No delay between products in batch
- **Total per product: ~2000ms**

Per-location timing (40 products):
- Initial page load: 3000ms (reduced from 5000)
- Age gate wait: 2000ms (reduced from 3000)
- Product extraction: ~1000ms
- Detail page visits: 40 × 2000ms = 80,000ms
- Batch delays: 10 × 500ms = 5000ms
- **Total per location: ~91 seconds (~1.5 min)**

10 locations × 1.5 min = **~15 minutes total**

## Improvement Summary

| Metric | v3.2.0 | v3.3.0 | Improvement |
|--------|--------|--------|-------------|
| Per-product time | 5000ms | 2000ms | **60% faster** |
| Per-location time | 209s | 91s | **56% faster** |
| Total scrape time | ~35 min | ~15 min | **57% faster** |
| Initial page waits | 8000ms | 5000ms | 37% faster |

## Configuration Changes

| Setting | v3.2.0 | v3.3.0 |
|---------|--------|--------|
| DETAIL_PAGE_TIMEOUT_MS | 8000 | 4000 |
| PAGE_RENDER_WAIT_MS | (4000) | 1500 |
| Initial page wait | 5000 | 3000 |
| Age gate wait | 3000 | 2000 |
| Cart hack wait | 1000 | 500 |
| MAX_CART_HACK_ATTEMPTS | 5 | 3 |

## Risk Assessment
- **Low risk**: Wait times are still generous for most pages
- Dutchie embeds typically load content within 500-1000ms
- Additional 1500ms render wait provides buffer
- If reliability issues occur, can bump PAGE_RENDER_WAIT_MS to 2000ms

## Next Improvements (P1)
1. True parallelization with multiple BrowserBase sessions
2. Skip products that never have inventory text
3. GraphQL interception to avoid page visits entirely
