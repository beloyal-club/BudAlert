# Cart Hack Expansion Plan

**Created:** 2026-02-24
**Target:** All locations with hidden inventory
**Goal:** Increase cart hack coverage from 7.5% to 25%+ with smart targeting

---

## Problem Statement

Current cart hack is limited to 3 attempts per location (~7.5% of 40 products). The targeting is dumb — first 3 products that fail text extraction get cart hacked, regardless of value or priority.

---

## Phase 1: CARTHACK-001 — Analyze Current Implementation

**Objective:** Understand current cart hack flow and timing.

**Tasks:**
1. Read `workers/cron/index.ts` cart hack logic (search MAX_CART_HACK_ATTEMPTS)
2. Read `workers/lib/cartHack.ts` for full implementation
3. Document time cost per cart hack attempt
4. Identify where priority scoring could be added
5. Calculate current vs proposed time budgets

**Success Criteria:**
- [ ] Current flow documented
- [ ] Time per attempt measured (~2.5s)
- [ ] Priority insertion point identified
- [ ] Time budget for 10 attempts calculated

---

## Phase 2: CARTHACK-002 — Implement Priority Scoring

**Objective:** Create smart targeting algorithm for cart hack candidates.

**Tasks:**
1. Create `calculateCartHackPriority(product)` function
2. Priority factors:
   - Has warning text but no quantity (+100)
   - High price > $50 (+50)
   - On sale / has discount (+30)
   - Popular category (flower, concentrate) (+20)
3. Return score and reason for logging
4. Add to workers/lib/cartHack.ts or new file

**Success Criteria:**
- [ ] Priority function implemented
- [ ] Scoring factors tunable
- [ ] Returns score + reason
- [ ] Unit tests pass

---

## Phase 3: CARTHACK-003 — Implement Two-Pass Extraction

**Objective:** Restructure flow to extract text first, then cart hack top candidates.

**Tasks:**
1. Modify processProductsInParallel in cron/index.ts
2. First pass: visit all products, extract text patterns only
3. After first pass: filter products needing cart hack
4. Sort by priority score, take top N
5. Second pass: cart hack top priority products

**Success Criteria:**
- [ ] Two-pass flow implemented
- [ ] Products sorted by priority
- [ ] Top N selected for cart hack
- [ ] Parallel execution maintained

---

## Phase 4: CARTHACK-004 — Increase Limits and Deploy

**Objective:** Increase MAX_CART_HACK_ATTEMPTS and deploy.

**Tasks:**
1. Change MAX_CART_HACK_ATTEMPTS from 3 to 10
2. Add config for priority threshold (skip if score < 20)
3. Add logging for cart hack decisions
4. Deploy updated cron worker
5. Monitor scrape time impact

**Success Criteria:**
- [ ] Limit increased to 10
- [ ] Priority threshold configurable
- [ ] Deployment successful
- [ ] Scrape time < 2 min per location

---

## Phase 5: CARTHACK-005 — Measure and Iterate

**Objective:** Measure improvement and document learnings.

**Tasks:**
1. Run full scrape cycle
2. Compare inventory coverage before/after
3. Analyze which priority factors most effective
4. Tune scoring weights based on results
5. Document findings for iteration worker

**Success Criteria:**
- [ ] Coverage increased from ~10% to 25%+
- [ ] Priority factors effectiveness documented
- [ ] Scoring weights tuned
- [ ] Iteration recommendations captured

---

## Priority Scoring Reference

```typescript
function calculateCartHackPriority(product: ScrapedProduct): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  // Has warning but no quantity — highest priority
  if (product.quantityWarning && product.quantity === null) {
    score += 100;
    reasons.push('warning_no_qty');
  }

  // High value product
  if (product.price > 50) {
    score += 50;
    reasons.push('high_value');
  }

  // On sale
  if (product.originalPrice && product.originalPrice > product.price) {
    score += 30;
    reasons.push('on_sale');
  }

  // Popular category
  const cat = (product.rawCategory || '').toLowerCase();
  if (cat.includes('flower') || cat.includes('concentrate')) {
    score += 20;
    reasons.push('popular_cat');
  }

  // Skip if already have quantity
  if (product.quantity !== null) {
    return { score: 0, reason: 'already_has_qty' };
  }

  return { score, reason: reasons.join(',') };
}
```

---

## Time Budget

| Attempts | Added Time | Total Detail Phase |
|----------|------------|-------------------|
| 3 (current) | 7.5s | ~25-30s |
| 10 (proposed) | 25s | ~45s |
| 15 (aggressive) | 37.5s | ~55s |

With 10 locations: +3 min total scrape time (acceptable).
