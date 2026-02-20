# CannaSignal Full Scrape Audit - 18 Locations

**Date:** 2026-02-20
**Status:** Audit Complete, Code Updated

---

## 1. Current Limitations Audit

### ✅ Slice Limit: ALREADY REMOVED
The `.slice(0, 3)` limit was already removed from `workers/cron/index.ts`. 
Current code iterates through all 18 `EMBEDDED_LOCATIONS`.

### Remaining Limitations Found:

| Issue | Location | Impact | Status |
|-------|----------|--------|--------|
| **Broken URLs** | Just Breathe Syracuse, Binghamton | 404 errors, no data | 🔴 Critical |
| **Shared URLs (no selector)** | Gotham (4), Strain Stars (2), Just Breathe (2) | Duplicate data, wrong inventory | 🟡 Medium |
| **CPU time limit** | Cron triggers | 30s CPU limit for 15-min cron | 🟡 Medium |
| **No batching** | All 18 sequential | Risk of timeout on slow days | 🟢 Low risk |
| **No per-location metrics** | Observability | Hard to diagnose failures | 🟡 Medium |

---

## 2. Location Validation Results

### ✅ Valid Locations (11)
| # | Name | URL | Status |
|---|------|-----|--------|
| 1 | CONBUD LES | conbud.com/stores/conbud-les/products | ✅ Unique URL |
| 2 | CONBUD Bronx | conbud.com/stores/conbud-bronx/products | ✅ Unique URL |
| 3 | CONBUD Yankee Stadium | conbud.com/stores/conbud-yankee-stadium/products | ✅ Unique URL |
| 4 | Housing Works Cannabis | hwcannabis.co/ | ✅ Unique URL |
| 5 | Travel Agency Union Square | thetravelagency.co/menu/ | ✅ Unique URL |
| 6 | Dagmar Cannabis SoHo | dagmarcannabis.com/menu/ | ✅ Unique URL |
| 7 | Smacked Village | getsmacked.online/menu/ | ✅ Unique URL |
| 8 | Just Breathe Finger Lakes | justbreatheflx.com/ | ✅ Unique URL |

### 🟡 Shared URL Locations (5) - Need Location Selector
| # | Name | URL | Issue |
|---|------|-----|-------|
| 9-12 | Gotham (CAURD, Hudson, Williamsburg, Chelsea) | gotham.nyc/menu/ | 4 locations, 1 URL - needs location picker |
| 13-14 | Strain Stars (Farmingdale, Riverhead) | strainstarsny.com/menu/ | 2 locations, 1 URL - needs location picker |

### 🔴 Broken URLs (2)
| # | Name | URL | Issue |
|---|------|-----|-------|
| 15 | Just Breathe Syracuse | justbreathelife.org/menu/ | **404 Not Found** |
| 16 | Just Breathe Binghamton | justbreathelife.org/menu/ | **404 Not Found** |

---

## 3. Cloudflare Worker Limits

| Limit | Free | Paid | Our Setup | Risk |
|-------|------|------|-----------|------|
| CPU time (cron <1hr) | 10ms | **30 seconds** | 15-min cron | 🟡 Tight |
| Memory | 128 MB | 128 MB | BrowserBase offloads | ✅ OK |
| Subrequests | 50/req | 10,000/req | ~60 calls/run | ✅ OK |
| Worker size | 3 MB | 10 MB | ~50KB | ✅ OK |

**Critical:** 30 seconds of CPU time is the main constraint. Most time is spent waiting on network (doesn't count), but navigation timeouts could cause issues.

---

## 4. Proposed Fixes

| # | Fix | Effort | Impact | Priority |
|---|-----|--------|--------|----------|
| 1 | **Remove broken Just Breathe URLs** | 5 min | Stops 404 errors polluting logs | P0 |
| 2 | **Add location deduplication** | 15 min | Prevents scraping same URL twice | P1 |
| 3 | **Add per-location metrics** | 30 min | Better observability | P1 |
| 4 | **Extend CPU limit to 5 minutes** | 5 min | Safety buffer for slow days | P2 |
| 5 | **Implement location selector** | 2 hours | Enable Gotham/Strain Stars multi-location | P2 |
| 6 | **Add batching/chunking** | 1 hour | Spread 18 locations across multiple runs | P3 |

---

## 5. Runtime Estimates

Based on current delays:
- Navigation + render: ~8 seconds per location
- Age gate + wait: ~3 seconds per location
- Rate limit delay: 2 seconds per location
- **Total per location: ~13 seconds wall-clock**

For 18 locations:
- **Optimistic:** 18 × 13s = ~4 minutes wall-clock
- **Realistic (with retries):** 5-7 minutes
- **CPU time consumed:** <5 seconds (most is I/O wait)

---

## 6. Incremental Rollout Plan

### Phase 1: Cleanup (Immediate)
- [x] Remove broken Just Breathe URLs (Syracuse, Binghamton)
- [x] Add URL deduplication (scrape each URL once, apply to all locations sharing it)
- [x] Add per-location success/failure tracking

### Phase 2: Observability (Week 1)
- [ ] Add `/metrics` endpoint with per-location status
- [ ] Track scrape duration per location
- [ ] Alert on 3+ consecutive failures for any location

### Phase 3: Coverage Expansion (Week 2)
- [ ] Research Gotham/Strain Stars location selectors
- [ ] Implement location picker interaction
- [ ] Re-enable multi-location retailers

### Testing Steps:
1. Deploy with 6 unique locations → verify all succeed
2. Add Gotham (1 location, ignore picker) → verify products
3. Add Strain Stars (1 location, ignore picker) → verify products
4. Full 18 with dedup → validate metrics

---

## 7. Monitoring Recommendations

### Health Check Improvements
```
GET /health → Current config, location count, last run stats
GET /metrics → Per-location success rate, last scrape time, product counts
GET /locations → All locations with status (active/disabled/broken)
```

### Alert Conditions
1. **Critical:** BrowserBase connection fails 3x in a row (circuit breaker opens)
2. **Warning:** Any location fails 3 consecutive scrapes
3. **Info:** Scrape batch takes >5 minutes

### Discord Summary Improvements
- Show per-location breakdown (success/fail/skipped)
- Track products per location (detect dead locations)
- Add "locations needing attention" section
