# Dutchie GraphQL Inventory Fix Plan

**Created:** 2026-02-24
**Target Sites:** CONBUD (3), Dagmar, Gotham, Strain Stars, Travel Agency, Smacked
**Goal:** Extract `variants.quantity` from GraphQL responses instead of just `inStock` boolean

---

## Problem Statement

The Dutchie GraphQL API returns quantity data in `variants[].quantity`, but our scraper only stores `inStock: boolean`. We're throwing away exact inventory counts.

---

## Phase 1: DUTCHIE-001 — Audit Current Extraction

**Objective:** Understand exactly what data Dutchie returns and what we're currently capturing.

**Tasks:**
1. Read `workers/scrapers/dutchie.ts` and document the GraphQL query
2. Find the `DUTCHIE_MENU_QUERY` and check if `quantity` is requested
3. Find where `ScrapedItem` is built and see if `quantity` is mapped
4. Test a live GraphQL query to see actual response structure

**Success Criteria:**
- [ ] Document current GraphQL query fields
- [ ] Identify if `quantity` is in query but not mapped
- [ ] Sample actual API response showing quantity field
- [ ] List exact code locations needing changes

---

## Phase 2: DUTCHIE-002 — Update GraphQL Scraper

**Objective:** Modify Dutchie scraper to capture and map quantity field.

**Tasks:**
1. Update `ScrapedItem` interface to include `quantity: number | null`
2. Update `quantityWarning: string | null` and `quantitySource: string`
3. Map `variants[].quantity` to product quantity
4. Add logic: if quantity <= 5, set quantityWarning = "Only X left"
5. Set `quantitySource: 'dutchie_graphql'`

**Success Criteria:**
- [ ] ScrapedItem interface has quantity fields
- [ ] Mapping extracts quantity from variants
- [ ] Low stock warning generated for qty <= 5
- [ ] TypeScript compiles without errors

---

## Phase 3: DUTCHIE-003 — Update Browser Scraper Fallback

**Objective:** Ensure browser-based scraping also captures quantity when GraphQL fails.

**Tasks:**
1. Check `workers/cron/index.ts` extractProducts function
2. Verify it extracts quantity from page text patterns
3. Ensure cart hack results populate quantity field
4. Add quantitySource tracking ('text_pattern', 'cart_hack', etc.)

**Success Criteria:**
- [ ] Browser scraper populates quantity when found
- [ ] Cart hack results stored in quantity field
- [ ] quantitySource correctly identifies extraction method
- [ ] Fallback hierarchy: GraphQL → text pattern → cart hack → null

---

## Phase 4: DUTCHIE-004 — Deploy and Validate

**Objective:** Deploy updated scraper and verify data quality improvement.

**Tasks:**
1. Deploy updated `workers/scrapers/dutchie.ts` if standalone
2. Deploy updated `workers/cron/index.ts`
3. Trigger manual scrape for one Dutchie site (e.g., Dagmar)
4. Query Convex for products with quantitySource = 'dutchie_graphql'
5. Calculate data quality score

**Success Criteria:**
- [ ] Deployment successful
- [ ] Dagmar products have quantity field populated
- [ ] At least 70% of products have exact inventory
- [ ] No regression in other scrapers

---

## Phase 5: DUTCHIE-005 — Documentation and Monitoring ✅ COMPLETE

**Objective:** Document changes and set up ongoing monitoring.

**Tasks:**
1. ✅ Update CANNASIGNAL_PROGRESS.md with changes
2. ⏸️ Add data quality metrics to health endpoint (future)
3. ✅ Create script to check inventory coverage per location
4. ✅ Document Dutchie API structure for future reference

**Completed: 2026-02-24**

**Deliverables:**
- `CANNASIGNAL_PROGRESS.md` - Added [DUTCHIE-005] section with version v3.5.0
- `scripts/validate-dutchie-inventory.ts` - Validation script for data quality
- `workers/scrapers/dutchie.ts` - Added comprehensive API documentation comments

**Success Criteria:**
- [x] Documentation updated
- [ ] Health endpoint shows inventory stats (future work)
- [x] Monitoring script created
- [x] Knowledge captured for future iterations

---

## Files to Modify

- `workers/scrapers/dutchie.ts` — GraphQL extraction
- `workers/cron/index.ts` — Browser fallback
- `docs/CANNASIGNAL_PROGRESS.md` — Documentation
