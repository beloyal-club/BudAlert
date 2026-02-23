# CannaSignal Improvement Backlog

## Current Scores (Cycle 1 - 2026-02-23)
| Metric | Score | Notes |
|--------|-------|-------|
| Data Quality | 45/100 | Limited scrape logs, OCM data 6 days old |
| Coverage | 8/100 | 9/238 retailers (3.8%) with scrapable menus |
| Performance | 85/100 | Browser worker healthy, Convex needs verification |

## Active Work
None

## Task Queue

### High Priority
- **COV-001**: Expand Dutchie embedded retailer coverage
  - Currently: 9 retailers / 18 locations identified
  - Target: Discover more embedded menu retailers from 238 operational
  - Method: Crawl retailer websites for Dutchie embed patterns

- **DATA-001**: Update OCM retailer sync
  - Last sync: 2026-02-17 (6 days stale)
  - Need fresh operational retailer data

### Medium Priority
- **INFRA-001**: Verify Convex HTTP endpoints
  - `/ingest/scraped-batch` exists but untested recently
  - Need end-to-end ingestion test

### Low Priority
- **DOC-001**: Improve README documentation
  - Current README is minimal placeholder

## Completed Tasks
_(none yet)_

## Infrastructure Status
| Service | Status | Last Check |
|---------|--------|------------|
| Browser Worker | ✅ Healthy (v2.0.0) | 2026-02-23 |
| Convex Backend | ⚠️ Unknown | 2026-02-23 |
| OCM Data | ⏰ Stale (6 days) | 2026-02-17 |

## Cycle Log

### Cycle 1 - 2026-02-23T13:41Z
- **Initial evaluation cycle**
- Created state tracking infrastructure
- Browser worker: healthy (v2.0.0)
- Convex: needs endpoint verification
- OCM data: 580 licenses, 238 operational, last sync 6 days ago
- Identified 9 retailers with embedded Dutchie menus (18 locations total)
- **Next priority**: COV-001 (expand coverage) or DATA-001 (refresh OCM)
