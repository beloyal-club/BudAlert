# GraphQL Interception Analysis for Dutchie

**Date:** 2026-02-21  
**Version:** v3.4.0  
**Status:** Exploratory - Not Yet Implemented

## Overview

Dutchie's embedded menus use GraphQL under the hood to fetch product data. By intercepting these network requests, we could potentially extract inventory data without visiting individual product detail pages.

## Current Approach (v3.4.0)

1. Navigate to menu listing page
2. Extract product cards (name, price, in-stock status)
3. Visit each product detail page to extract "X left" inventory counts
4. Process up to 40 products per location in parallel batches of 4

**Time:** ~30-60 seconds per location depending on product count

## GraphQL Interception Strategy

### How It Would Work

1. Enable CDP Network domain before navigation:
   ```typescript
   await client.send({ method: 'Network.enable', sessionId });
   ```

2. Subscribe to network responses:
   ```typescript
   client.on('Network.responseReceived', (params) => {
     if (params.response.url.includes('graphql') || 
         params.response.mimeType === 'application/json') {
       // Capture GraphQL response
     }
   });
   ```

3. Get response body:
   ```typescript
   const { body } = await client.send({
     method: 'Network.getResponseBody',
     params: { requestId: params.requestId },
     sessionId
   });
   ```

4. Parse GraphQL response for inventory data

### Expected GraphQL Patterns

Based on Dutchie's public documentation and common patterns:

```graphql
query GetMenuProducts($retailerId: ID!, $category: String) {
  menu(retailerId: $retailerId, category: $category) {
    products {
      id
      name
      brand
      price
      image
      thc
      cbd
      category
      # Inventory fields we're looking for:
      inStock
      quantity        # Sometimes exposed
      quantityLeft    # "X left" display value
      lowStockWarning # Boolean or threshold
    }
  }
}
```

### Potential Benefits

| Metric | Current (Page Visits) | With GraphQL |
|--------|----------------------|--------------|
| Requests per location | 1 + N products | 1-3 |
| Time per location | 30-60s | 5-10s |
| Total scrape time | ~15 min | ~2-3 min |
| BrowserBase minutes | High | Low |

### Implementation Requirements

1. **CDP Extension:** Add `Network.enable` and event handling to our CDP client
2. **Response Parsing:** Create GraphQL response schema definitions
3. **Fallback:** Keep page visits for sites where GraphQL doesn't expose inventory

### Code Skeleton

```typescript
// Add to cdp.ts
async enableNetworkCapture(): Promise<void> {
  await this.client.send({ method: 'Network.enable', sessionId: this.sessionId });
}

onResponse(callback: (url: string, body: string) => void): void {
  this.client.on('Network.responseReceived', async (params: any) => {
    if (params.response.mimeType?.includes('json')) {
      try {
        const { body } = await this.client.send({
          method: 'Network.getResponseBody',
          params: { requestId: params.requestId },
          sessionId: this.sessionId
        });
        callback(params.response.url, body);
      } catch (e) {
        // Response body may not be available for all requests
      }
    }
  });
}
```

## Observed GraphQL Endpoints

From manual testing (Feb 2026):

| Retailer | GraphQL Endpoint | Inventory in Response |
|----------|------------------|----------------------|
| CONBUD | `api.dutchie.com/graphql` | ❓ Needs verification |
| Gotham | `api.dutchie.com/graphql` | ❓ Needs verification |
| Housing Works | `api.dutchie.com/graphql` | ❓ Needs verification |
| Travel Agency | `api.dutchie.com/graphql` | ❓ Needs verification |

**Note:** Dutchie embeds load via an iframe that communicates with their main API. The GraphQL queries are made from within the iframe context.

## Challenges

1. **Iframe Context:** GraphQL requests happen inside the Dutchie iframe, not the main page. May need to attach to iframe target or intercept at network level.

2. **Authentication:** Some GraphQL endpoints may require session cookies or tokens that are set during the initial page load.

3. **Rate Limiting:** GraphQL API may have stricter rate limits than page visits.

4. **Schema Variability:** Different Dutchie versions may expose different fields.

5. **Inventory Field Availability:** The "X left" value shown on product pages may be calculated client-side from a different field, or may not be exposed in the API at all.

## Recommendation

**Phase 1 (Current - v3.4.0):** Implement parallel page visits
- ✅ Immediate 3-4x speedup with minimal risk
- ✅ Works with existing infrastructure

**Phase 2 (Future):** GraphQL interception pilot
- Pick one retailer (e.g., CONBUD) for testing
- Capture and analyze GraphQL responses
- Determine if inventory data is accessible
- If successful, roll out to other retailers

**Phase 3 (If GraphQL works):** Full migration
- Replace page visits with GraphQL extraction
- Keep page visits as fallback
- Expected improvement: ~5-10x faster

## Testing Commands

To manually test GraphQL capture:

```bash
# Use Chrome DevTools Network tab on any Dutchie menu
# Filter by "graphql" or "json"
# Look for responses containing "quantity" or "left" fields
```

## References

- [Chrome DevTools Protocol - Network Domain](https://chromedevtools.github.io/devtools-protocol/tot/Network/)
- [Dutchie API Docs](https://docs.dutchie.com/) (limited public docs)
- [BrowserBase CDP Documentation](https://docs.browserbase.com/)
