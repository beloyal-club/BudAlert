# BudAlert Scraper v2 - Cost-Optimized Architecture

**Goal:** Reduce scraping costs from $1,170/mo → ~$50/mo at 400 store scale  
**Created:** 2026-02-24  
**Status:** In Progress

---

## Quick Status (Updated 2026-02-24)

| Ticket | Status | Notes |
|--------|--------|-------|
| TICKET-001 | ✅ Complete | Architecture & retailer inventory documented |
| TICKET-002 | ⚠️ Blocked | GraphQL schema changed - see findings below |
| TICKET-003 | ⚠️ Partial | CF Browser + Proxy - **Proxy NOT supported** |
| TICKET-004 | Not Started | Cart Hack |
| TICKET-005 | Not Started | Orchestrator |
| TICKET-006 | Not Started | Monitoring |  

---

## Executive Summary

Replace expensive Browserbase scraping ($0.10/hr + $10/GB bandwidth) with:
1. **Dutchie GraphQL API** (free) for direct stores
2. **Cloudflare Browser Rendering** ($0.09/hr, no bandwidth cost) for embedded menus
3. **IPRoyal residential proxies** (~$1.75/GB) for NYS geo-targeting
4. **Markdown for Agents** (80% token reduction) for product detail pages
5. **Cart hack** for inventory extraction where API unavailable

---

## Phase Tickets

### TICKET-001: Audit & Baseline Current State
**Priority:** P0  
**Dependencies:** None  
**Estimated Effort:** 2-3 hours  

**Objective:**  
Document current scraper architecture, data flows, and establish baseline metrics.

**Tasks:**
1. Map all scraper entry points (workers, scripts, cron jobs)
2. Inventory all retailers by scraping method (GraphQL vs Browser)
3. Document current data schema in Convex
4. Measure current scrape success rate and data quality
5. List all Browserbase usage points in codebase

**Success Criteria:**
- [ ] Complete architecture diagram in docs/
- [ ] Retailer inventory spreadsheet with scraping method per store
- [ ] Baseline metrics documented (success rate, latency, data freshness)
- [ ] All Browserbase touchpoints identified and listed

**Test:**
- Review document completeness
- Verify retailer count matches Convex records
- Confirm all code paths identified via grep audit

---

### TICKET-002: Harden GraphQL Scraper as Primary Path
**Priority:** P0 → P2 (deprioritized - see findings)  
**Dependencies:** TICKET-001  
**Estimated Effort:** 3-4 hours → Blocked pending schema discovery
**Status:** ⚠️ BLOCKED - GraphQL schema changed

**Objective:**  
Ensure the existing Dutchie GraphQL scraper is production-ready and handles all direct Dutchie stores reliably.

#### 🔴 FINDINGS (2026-02-24):

The Dutchie public GraphQL API schema has **changed significantly**. The scraper is currently broken:

| Issue | Details |
|-------|---------|
| **Schema Change** | `filteredProducts(dispensarySlug, limit)` query format is no longer valid |
| **Invalid Arguments** | `dispensarySlug`, `byCategory`, `offset`, `limit` all rejected |
| **Introspection Blocked** | Apollo Server has introspection disabled |
| **No Direct Retailers** | Zero direct Dutchie stores exist in current BudAlert inventory |

**Error from API:**
```
Unknown argument "dispensarySlug" on field "Query.filteredProducts".
Unknown argument "limit" on field "Query.filteredProducts".
Cannot query field "totalCount" on type "ProductsList".
```

**Current State:**
- ✅ Worker is deployed and healthy
- ✅ Retry logic with exponential backoff works
- ✅ Dead letter queue integration exists
- ❌ GraphQL queries fail due to schema change
- ℹ️ All current retailers use **embedded Dutchie** (browser required)

**Impact:**
- **Immediate:** None - no direct Dutchie stores in inventory
- **Future:** Scraper needs schema update before direct stores can be added

**Next Steps (when prioritized):**
1. Reverse-engineer new schema by capturing browser network traffic
2. Find new query format (likely context-based rather than slug-based)
3. Update scraper with new query structure

**Test Script:** `npx tsx scripts/test-graphql-scraper.ts --schema-probe`

---

**Original Tasks (pending schema fix):**
1. Review `workers/scrapers/dutchie.ts` for edge cases ✅
2. Add comprehensive error handling and retry logic (if not present) ✅ Already exists
3. Implement rate limiting to avoid API bans
4. Add monitoring/logging for success rates
5. Test against all 12 direct Dutchie retailers
6. Ensure inventory data (variant.quantity) is properly extracted
7. Create standalone test script for validation

**Success Criteria:**
- [ ] All 12 direct Dutchie retailers scrape successfully
- [ ] Inventory quantity extracted for all products with variants
- [ ] Retry logic handles transient failures (429, 5xx)
- [ ] Logs output per-retailer success/failure metrics
- [ ] No Browserbase dependencies in GraphQL path

**Test:**
```bash
# Run scraper against all direct Dutchie stores
npx tsx scripts/test-graphql-scraper.ts --all-direct
# Expected: 12/12 success, inventory data for >95% of products
```

---

### TICKET-003: Cloudflare Browser Rendering + Proxy Integration
**Priority:** P0  
**Dependencies:** TICKET-002  
**Estimated Effort:** 4-5 hours  
**Status:** ⚠️ PARTIAL - Proxy integration NOT POSSIBLE

**Objective:**  
Set up Cloudflare Browser Rendering with residential proxy support for embedded Dutchie menus.

#### 🔴 CRITICAL FINDING (2026-02-24):

**Cloudflare Browser Rendering CANNOT route traffic through external proxies.**

From [CF Browser Rendering FAQ](https://developers.cloudflare.com/browser-rendering/faq/):
> "Browser Rendering requests originate from Cloudflare's global network and you cannot configure per-request IP rotation."

| Capability | Supported? | Notes |
|------------|------------|-------|
| Connect through residential proxy | ❌ No | Fundamental platform limitation |
| IPRoyal integration | ❌ No | Not possible |
| Per-request IP rotation | ❌ No | All requests from CF IPs |
| `BrowserContext.proxyServer` | ❌ No | Confirmed broken in Workers |

**Full details:** See `docs/CF_BROWSER_PROXY_FINDINGS.md`

#### ✅ What WAS Implemented

1. **Bandwidth Optimization (OPT-001)**
   - Blocks images, CSS, fonts, media
   - Expected 60-80% bandwidth reduction
   
2. **Tracking/Analytics Blocking (OPT-002)**
   - Blocks GA, Segment, Mixpanel, ad networks, social widgets
   
3. **Markdown Header Support (OPT-003)**
   - `Accept: text/markdown` for compatible sites
   
4. **Worker v2.0.0 Deployed**
   - Updated `workers/browser-rendering/index.ts`
   - New `/scrape` POST endpoint with options
   - Backward-compatible `/menu` and `/screenshot` endpoints

#### Revised Strategy

Since CF Browser cannot use proxies, the approach is now:

1. **Primary:** Use CF Browser Rendering for all sites initially
2. **Track:** Monitor which sites block CF IPs
3. **Fallback:** Use BrowserBase (with proxy) only for blocked sites
4. **Hybrid Cost:** ~$160-270/mo instead of $1,170/mo

**Success Criteria (Revised):**
- [x] CF Browser worker has bandwidth optimization
- [x] Images/CSS/fonts blocked via request interception
- [x] Accept: text/markdown header support added
- [ ] Test to identify which sites block CF IPs
- [ ] Document blocked sites for fallback routing
- ❌ ~~Proxy integration~~ (NOT POSSIBLE)

**Test:**
```bash
# Test CF Browser with bandwidth optimization
curl -X POST https://cannasignal-browser.prtl.workers.dev/scrape \
  -H "X-CDP-Secret: $CDP_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://housing-works.com/menu", "blockImages": true}'

# Run test script
npx tsx scripts/test-cf-browser-v2.ts
```

**IPRoyal Config (for BrowserBase fallback only):**
```
us.proxy.iproyal.com:12323:username:password_country-us_state-newyork_streaming-1
```

---

### TICKET-004: Cart Hack Inventory Extraction
**Priority:** P1  
**Dependencies:** TICKET-003  
**Estimated Effort:** 4-5 hours  

**Objective:**  
Implement "add to cart" hack to extract inventory levels for stores where API doesn't expose quantity.

**Tasks:**
1. Research Dutchie cart API/behavior for inventory limits
2. Implement cart hack logic:
   - Add high quantity (999) to cart
   - Capture error message with actual limit
   - Parse inventory count from response
3. Implement binary search fallback for stores without error messages
4. Add rate limiting to avoid triggering bot detection
5. Test on 3-5 embedded stores
6. Document which stores need cart hack vs which expose inventory

**Success Criteria:**
- [ ] Cart hack extracts inventory for >80% of tested products
- [ ] Binary search fallback works when error message unavailable
- [ ] No cart/session corruption (clean state after extraction)
- [ ] Documented mapping: store → inventory extraction method

**Test:**
```bash
# Test cart hack on specific product
npx tsx scripts/test-cart-hack.ts --store housing-works --product-id abc123
# Expected: Inventory count returned (e.g., "42 available")
```

---

### TICKET-005: Orchestrator Rewrite & Production Deploy
**Priority:** P0  
**Dependencies:** TICKET-002, TICKET-003, TICKET-004  
**Estimated Effort:** 5-6 hours  

**Objective:**  
Rewrite the cron orchestrator to use the new tiered scraping strategy and deploy to production.

**Tasks:**
1. Create new orchestrator that routes retailers by type:
   - Tier 1: Direct Dutchie → GraphQL scraper
   - Tier 2: Embedded Dutchie → CF Browser + proxy
   - Tier 3: Other platforms → Future (skip for now)
2. Implement batching and parallelization
3. Add inventory extraction (API or cart hack based on store)
4. Integrate with existing Convex ingestion
5. Add comprehensive monitoring and alerting
6. Deploy and re-enable cron schedule
7. Monitor first 24 hours for issues

**Success Criteria:**
- [ ] Orchestrator handles all 26 scrapable retailers
- [ ] Tier routing works correctly (GraphQL vs Browser)
- [ ] Inventory data populated for >90% of products
- [ ] No Browserbase API calls in production path
- [ ] Cron runs successfully for 24 hours without intervention
- [ ] Cost tracking shows <$2/day burn rate

**Test:**
```bash
# Dry run full scrape
npx tsx scripts/orchestrator-v2.ts --dry-run
# Expected: All retailers routed correctly, no errors

# Production run (manual trigger)
curl -X POST https://cannasignal-cron.prtl.workers.dev/trigger
# Expected: Full scrape completes, data in Convex, Discord notification
```

---

### TICKET-006: Monitoring, Alerting & Cost Dashboard
**Priority:** P2  
**Dependencies:** TICKET-005  
**Estimated Effort:** 3-4 hours  

**Objective:**  
Build visibility into scraper health, data quality, and cost tracking.

**Tasks:**
1. Create cost tracking (CF Browser hours, proxy bandwidth)
2. Build data quality metrics (freshness, completeness, inventory coverage)
3. Set up Discord alerts for:
   - Scraper failures
   - Cost anomalies (>$5/day)
   - Data quality drops
4. Add Convex dashboard queries for monitoring
5. Document runbook for common issues

**Success Criteria:**
- [ ] Daily cost report posted to Discord
- [ ] Data quality metrics visible in dashboard
- [ ] Alerts fire within 15 min of issues
- [ ] Runbook covers top 5 failure scenarios

**Test:**
- Simulate scraper failure, verify alert fires
- Check cost report accuracy against CF dashboard

---

## Execution Order

```
TICKET-001 (Audit)
     ↓
TICKET-002 (GraphQL Hardening)
     ↓
TICKET-003 (CF Browser + Proxy)
     ↓
TICKET-004 (Cart Hack)
     ↓
TICKET-005 (Orchestrator Rewrite)
     ↓
TICKET-006 (Monitoring)
```

Each ticket must pass success criteria before next phase begins.

---

## Cost Projection

| Phase | Monthly Cost |
|-------|--------------|
| Current (Browserbase) | ~$1,170 |
| After TICKET-002 (GraphQL only) | ~$200 (60% browser reduction) |
| After TICKET-003 (CF Browser) | ~$80 (no bandwidth cost) |
| After TICKET-005 (Full rollout) | ~$50 |

---

## Rollback Plan

If new architecture fails:
1. Re-enable Browserbase cron: `wrangler triggers deploy` with old config
2. Revert orchestrator to v1
3. Investigate and fix before re-attempting

Old cron config preserved in git history.
