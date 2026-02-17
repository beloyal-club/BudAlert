# 🔄 CannaSignal Continuous Improvement System

**Commander:** Portal (Reviewer & Project Lead)
**Started:** 2026-02-17

---

## 🎯 Improvement Domains

| Domain | Focus | Metrics |
|--------|-------|---------|
| **Data Quality** | Scraper accuracy, normalization, dedup | Error rate, field completeness |
| **Data Coverage** | More retailers, products, brands | % of NYS market captured |
| **Performance** | API latency, dashboard speed | p95 response time |
| **Reliability** | Error handling, retries, monitoring | Uptime, failed scrapes |
| **UX** | Dashboard usability, data presentation | User friction points |

---

## 📋 Improvement Backlog

### High Priority
- [ ] **DATA-001**: Validate scraper output against Dutchie live data ⭐ *PRIORITY*
- [ ] **DATA-002**: Expand coverage to iHeartJane-powered retailers ⭐ *PRIORITY*
- [ ] **DATA-003**: Add Weedmaps menu discovery
- [ ] **PERF-001**: Benchmark Convex query latency under load
- [ ] **REL-001**: Add retry logic + dead letter queue to scraper ⭐ *PRIORITY*
- [ ] **UX-001**: Dashboard real-time updates via Convex subscriptions

### Medium Priority → ELEVATED
- [ ] **DATA-005**: Product normalization (THC%, strain matching) ⭐ *CRITICAL* - Names have concatenated metadata
- [ ] **DATA-004**: Cross-reference OCM API for license validation
- [ ] **PERF-002**: Cache frequently-accessed brand/retailer data
- [ ] **UX-002**: Add filtering/search to dashboard tables

### Low Priority (Polish)
- [ ] **UX-003**: Mobile-responsive dashboard
- [ ] **REL-002**: Alerting on scraper failures
- [ ] **DATA-006**: Historical price tracking setup

---

## 🔄 Active Improvements

| ID | Description | Agent | Status | Started |
|----|-------------|-------|--------|---------|
| — | — | — | — | — |

---

## ✅ Completed Improvements

| ID | Description | Impact | Completed |
|----|-------------|--------|-----------|
| — | — | — | — |

---

## 📊 Evaluation Criteria

### Data Quality Score (0-100)
- Field completeness: % of products with THC%, price, category
- Normalization accuracy: Brand name matching rate
- Freshness: % of data < 24h old

### Coverage Score (0-100)
- Retailer coverage: Active retailers / Total NYS licensed (593)
- Product coverage: Unique products tracked
- Geographic spread: Regions with >= 3 retailers

### Performance Score (0-100)
- API p95 latency < 200ms = 100 pts
- Dashboard load < 2s = 100 pts
- Convex query p95 < 100ms = 100 pts

---

## 🤖 Sub-Agent Roles

1. **Evaluator** - Runs tests, measures metrics, identifies gaps
2. **Data Worker** - Scraper improvements, normalization fixes
3. **Perf Worker** - Load testing, optimization
4. **UX Worker** - Dashboard improvements, UI polish

---

## 📊 Baseline Scores (2026-02-17)

| Metric | Score | Details |
|--------|-------|---------|
| **Data Quality** | 45/100 | Schema excellent, but no data in production Convex yet. Test scrapes show product names have concatenated metadata, inventory counts unavailable |
| **Coverage** | 15/100 | 593 NYS dispensaries identified, but only 1 successfully scraped. Dutchie covers ~4% (25/593), most use custom menus |
| **Performance** | 40/100 | Convex & browser worker healthy, dashboard built but in demo mode. No load testing |

### Key Findings

**✅ What's Working:**
- Convex backend deployed & healthy (`quick-weasel-225.convex.site/health`)
- Browser worker deployed & healthy (`cannasignal-browser.prtl.workers.dev/health`)
- Well-designed schema with normalization, snapshots, analytics tables
- Dashboard scaffolding with React/Vite/Tailwind/Convex
- Stealth scraper bypasses Cloudflare on embedded Dutchie menus
- 54 products extracted from ConBud LES test scrape

**⚠️ Issues Found:**
- Direct Dutchie.com URLs blocked (Housing Works = 0 products)
- Product names contain concatenated metadata (THC%, strain type mixed in)
- Inventory counts not captured (all 54 products show `inventoryCount: null`)
- Dashboard runs in DEMO mode (no `VITE_CONVEX_URL` configured)
- No data actually ingested to Convex tables yet
- Only 13 Dutchie + 79 custom menu retailers mapped

**🔴 Blockers:**
1. Most NYS retailers use custom menus, not scrapable Dutchie
2. Scraper data not flowing to Convex (pipeline incomplete)
3. Product name parsing needs work before useful analytics

---

## 📝 Improvement Log

### 2026-02-17 — Baseline Evaluation Complete
**Evaluator:** Subagent (cannasignal-evaluator-baseline)

- Ran health checks on all services ✅
- Reviewed codebase structure and schema
- Analyzed test scrape data quality
- Identified 593 NYS retailers, coverage gaps
- Scored baseline: Data 45/100, Coverage 15/100, Performance 40/100
- Top priorities: DATA-005 (product name parsing), DATA-002 (iHeartJane expansion), REL-001 (retry/pipeline)

### 2026-02-17 — System Created
- Initialized continuous improvement framework
- Identified 12 improvement tasks across 5 domains
- Set up evaluation criteria and agent roles
