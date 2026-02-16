# CannaSignal State Expansion Plan

> Per-state analysis, market opportunities, and expansion timeline

**Last Updated:** 2026-02-16

---

## Executive Summary

This document outlines CannaSignal's state-by-state expansion strategy based on:
- Market size (retail sales)
- Dispensary count (infrastructure cost)
- Competition (LitAlerts presence)
- Regulatory accessibility (data availability)
- Strategic fit (geographic clustering)

**Recommended expansion:** Start with NY/NJ/CT cluster, expand to Mid-Atlantic (MD/MA), then Midwest (MI/IL/OH), reaching 10 states by end of Year 1.

---

## 1. Adult-Use Cannabis Markets Overview

### US Cannabis Industry Snapshot (2024-2025)

| Metric | Value |
|--------|-------|
| Total US Legal Sales (2024) | $30.1 billion |
| Number of Adult-Use States | 24 + DC |
| Number of Medical-Only States | 16 |
| Total Licensed Dispensaries | ~12,500 |
| YoY Industry Growth | 4.5% |

### States with Legal Adult-Use Cannabis

| Region | States |
|--------|--------|
| **Northeast** | Connecticut, Delaware, Maine, Maryland, Massachusetts, New Jersey, New York, Rhode Island, Vermont |
| **Midwest** | Illinois, Michigan, Minnesota, Missouri, Ohio |
| **West** | Alaska, Arizona, California, Colorado, Montana, Nevada, New Mexico, Oregon, Washington |
| **South** | Virginia (limited) |

---

## 2. Per-State Cost Analysis

### Infrastructure Cost Model

| Cost Component | Per Store | Fixed | Notes |
|----------------|-----------|-------|-------|
| Scraping (CF Workers) | $0.0003 | $5.00 | Base $5 + usage |
| Storage (Convex) | $0.017 | $0.00 | Scales with data |
| AI Processing | $0.014 | $0.00 | GPT-4o-mini |
| Alert Delivery | $0.05 | $0.00 | Per subscriber |
| **Total/Store/Month** | **$0.08** | **$5.00** | Plus alerts |

### State Infrastructure Costs

| State | Dispensaries | Fixed Cost | Variable Cost | Total/Month | Cost/Store |
|-------|--------------|------------|---------------|-------------|------------|
| **Small States (<50)** |
| Connecticut | 28 | $5 | $2.24 | $7.24 | $0.26 |
| Delaware | 12 | $5 | $0.96 | $5.96 | $0.50 |
| Rhode Island | 7 | $5 | $0.56 | $5.56 | $0.79 |
| Vermont | 79 | $5 | $6.32 | $11.32 | $0.14 |
| Minnesota | 17 | $5 | $1.36 | $6.36 | $0.37 |
| Virginia | 22 | $5 | $1.76 | $6.76 | $0.31 |
| **Medium States (50-250)** |
| Maryland | 100 | $5 | $8.00 | $13.00 | $0.13 |
| Ohio | 118 | $5 | $9.44 | $14.44 | $0.12 |
| Nevada | 169 | $5 | $13.52 | $18.52 | $0.11 |
| Maine | 198 | $5 | $15.84 | $20.84 | $0.11 |
| Missouri | 215 | $5 | $17.20 | $22.20 | $0.10 |
| Illinois | 232 | $5 | $18.56 | $23.56 | $0.10 |
| **Large States (250-600)** |
| New York | 550 | $5 | $44.00 | $49.00 | $0.09 |
| Arizona | 292 | $5 | $23.36 | $28.36 | $0.10 |
| New Jersey | 296 | $5 | $23.68 | $28.68 | $0.10 |
| Massachusetts | 436 | $5 | $34.88 | $39.88 | $0.09 |
| Montana | 426 | $5 | $34.08 | $39.08 | $0.09 |
| Washington | 471 | $5 | $37.68 | $42.68 | $0.09 |
| **Very Large States (600+)** |
| Florida (Medical) | 622 | $5 | $49.76 | $54.76 | $0.09 |
| New Mexico | 650 | $5 | $52.00 | $57.00 | $0.09 |
| Oregon | 824 | $5 | $65.92 | $70.92 | $0.09 |
| Michigan | 994 | $5 | $79.52 | $84.52 | $0.09 |
| Colorado | 1,023 | $5 | $81.84 | $86.84 | $0.08 |
| California | 1,244 | $5 | $99.52 | $104.52 | $0.08 |
| Oklahoma (Medical) | 2,387 | $5 | $190.96 | $195.96 | $0.08 |

---

## 3. Top 10 Cannabis Markets by Opportunity

### Scoring Methodology

| Factor | Weight | High Score | Low Score |
|--------|--------|------------|-----------|
| **Market Size** | 30% | $1B+ sales | <$200M sales |
| **Dispensary Count** | 20% | 200-600 (sweet spot) | <50 or >1,000 |
| **Growth Rate** | 20% | >25% YoY | <5% or declining |
| **Competition** | 15% | No LitAlerts | Saturated |
| **Data Access** | 10% | Public menus, APIs | Private/spotty |
| **Strategic Fit** | 5% | Near existing markets | Isolated |

### Ranked Opportunities

#### #1: New York — Score: 95/100

| Factor | Score | Rationale |
|--------|-------|-----------|
| Market Size | 25/30 | $860M (2024), projected $1.5B+ (2025) |
| Dispensary Count | 20/20 | 550 stores, perfect scale |
| Growth Rate | 20/20 | 100%+ YoY, explosive ramp |
| Competition | 10/15 | LitAlerts present but beatable |
| Data Access | 10/10 | OCM public data, good menu access |
| Strategic Fit | 10/5 | Home market, existing knowledge |

**Why NY First:**
- Already building NY integrations
- Direct relationships with NY brands
- Understand OCM regulatory landscape
- Massive growth: 99 stores (2024) → 550+ (2026)
- First-mover opportunity as market scales

**Infrastructure:** $49/month for 550 stores

---

#### #2: New Jersey — Score: 88/100

| Factor | Score | Rationale |
|--------|-------|-----------|
| Market Size | 28/30 | $1.08B (2024), mature adult-use |
| Dispensary Count | 18/20 | 296 stores, efficient coverage |
| Growth Rate | 15/20 | 15% YoY, steady growth |
| Competition | 10/15 | LitAlerts present |
| Data Access | 9/10 | CRC data, good menu access |
| Strategic Fit | 8/5 | Adjacent to NY, same brands |

**Why NJ Second:**
- Geographic proximity to NY (same sales team)
- Many NY brands also sell in NJ
- $1B+ market = serious buying power
- Cross-sell to existing NY customers trivial
- $3.6K sales/store/day (highest on East Coast)

**Infrastructure:** $29/month for 296 stores

---

#### #3: Michigan — Score: 85/100

| Factor | Score | Rationale |
|--------|-------|-----------|
| Market Size | 30/30 | $3.03B (2024), #2 in US |
| Dispensary Count | 16/20 | 994 stores, large but manageable |
| Growth Rate | 14/20 | 7% YoY, maturing |
| Competition | 10/15 | LitAlerts present |
| Data Access | 8/10 | CRA data, varies by store |
| Strategic Fit | 7/5 | Midwest anchor |

**Why Michigan:**
- Second-largest market in US
- High velocity: $3B through 994 stores
- Strong brand ecosystem
- Many regional MSOs based there
- Gateway to Midwest expansion

**Infrastructure:** $85/month for 994 stores

---

#### #4: Illinois — Score: 82/100

| Factor | Score | Rationale |
|--------|-------|-----------|
| Market Size | 30/30 | $1.80B (2024), still growing |
| Dispensary Count | 20/20 | 232 stores, highly efficient |
| Growth Rate | 12/20 | 10% YoY |
| Competition | 10/15 | LitAlerts present |
| Data Access | 7/10 | IDFPR data, some limitations |
| Strategic Fit | 3/5 | Midwest, connects to MI |

**Why Illinois:**
- Incredible efficiency: $7.8M sales/store
- Limited licenses = high value per store
- Major MSO presence (GTI, Cresco, Verano)
- Chicago metro is massive
- Natural expansion from MI

**Infrastructure:** $24/month for 232 stores

---

#### #5: Maryland — Score: 80/100

| Factor | Score | Rationale |
|--------|-------|-----------|
| Market Size | 28/30 | $1.24B (2024), fast ramp |
| Dispensary Count | 17/20 | 100 stores, very manageable |
| Growth Rate | 18/20 | Rec launched July 2023, 50%+ growth |
| Competition | 10/15 | LitAlerts present |
| Data Access | 8/10 | MCA dashboard, good transparency |
| Strategic Fit | 9/5 | Near NY/NJ, East Coast cluster |

**Why Maryland:**
- Explosive post-rec growth
- Only 100 stores = cheap to cover entirely
- $12.4M sales/store (highest in US)
- DC metro area buying power
- Natural East Coast expansion

**Infrastructure:** $13/month for 100 stores

---

#### #6: Massachusetts — Score: 78/100

| Factor | Score | Rationale |
|--------|-------|-----------|
| Market Size | 28/30 | $1.67B (2024), record year |
| Dispensary Count | 17/20 | 436 stores, moderate scale |
| Growth Rate | 10/20 | 5% YoY, maturing |
| Competition | 8/15 | LitAlerts home market |
| Data Access | 8/10 | CCC open data |
| Strategic Fit | 7/5 | Northeast, borders CT |

**Why Massachusetts:**
- LitAlerts' home market = prove we can compete
- Strong brand ecosystem
- Mature market with sophisticated buyers
- Worcester County alone did $1.4B since 2018
- Completes Northeast coverage

**Infrastructure:** $40/month for 436 stores

---

#### #7: Missouri — Score: 75/100

| Factor | Score | Rationale |
|--------|-------|-----------|
| Market Size | 27/30 | $1.46B (2024), impressive for Y2 |
| Dispensary Count | 18/20 | 215 stores, efficient |
| Growth Rate | 16/20 | 40%+ YoY, still ramping |
| Competition | 10/15 | LitAlerts present |
| Data Access | 6/10 | DHSS data, varies |
| Strategic Fit | 3/5 | Central US |

**Why Missouri:**
- Fastest-growing $1B+ market
- Adult-use only launched Feb 2023
- High growth attracts new brands
- Underserved relative to potential

**Infrastructure:** $22/month for 215 stores

---

#### #8: Ohio — Score: 73/100

| Factor | Score | Rationale |
|--------|-------|-----------|
| Market Size | 18/30 | $300M (2024), ramping |
| Dispensary Count | 17/20 | 118 stores, efficient |
| Growth Rate | 20/20 | Rec launched Aug 2024, infinite growth |
| Competition | 15/15 | **No LitAlerts** |
| Data Access | 7/10 | DCM data, evolving |
| Strategic Fit | 5/5 | Borders MI, Midwest cluster |

**Why Ohio:**
- **No LitAlerts coverage** = first-mover advantage
- 11.8M population, huge potential
- Rec just launched, brands need intel badly
- Adjacent to Michigan (cross-sell)
- Limited dispensaries = low cost to dominate

**Infrastructure:** $14/month for 118 stores

---

#### #9: Connecticut — Score: 70/100

| Factor | Score | Rationale |
|--------|-------|-----------|
| Market Size | 15/30 | $280M (2024) |
| Dispensary Count | 10/20 | Only 28 stores |
| Growth Rate | 16/20 | 30%+ YoY, growing |
| Competition | 15/15 | **No LitAlerts** |
| Data Access | 8/10 | DCP data available |
| Strategic Fit | 6/5 | Borders NY/MA |

**Why Connecticut:**
- **No LitAlerts coverage** = own the market
- Only 28 stores = $7/month to cover 100%
- Affluent consumer base (highest median income)
- Borders NY (cross-sell) and MA (LitAlerts HQ)
- Prove we can dominate a state completely

**Infrastructure:** $7/month for 28 stores

---

#### #10: Arizona — Score: 68/100

| Factor | Score | Rationale |
|--------|-------|-----------|
| Market Size | 25/30 | $1.06B (2024) |
| Dispensary Count | 18/20 | 292 stores |
| Growth Rate | 6/20 | Declining from peak |
| Competition | 8/15 | LitAlerts present |
| Data Access | 8/10 | DOR data |
| Strategic Fit | 3/5 | Southwest anchor |

**Why Arizona:**
- Still $1B+ market
- Gateway to Southwest expansion
- Mature market with established brands
- Good data transparency

**Infrastructure:** $28/month for 292 stores

---

## 4. Expansion Timeline

### Phase 1: Home Market (Months 1-3)

| Month | State | Dispensaries | Cumulative Stores | Infra Cost |
|-------|-------|--------------|-------------------|------------|
| 1 | New York | 550 | 550 | $49/mo |
| 2 | New Jersey | 296 | 846 | $78/mo |
| 3 | Connecticut | 28 | 874 | $85/mo |

**Phase 1 Metrics:**
- States: 3
- Stores: 874
- Infrastructure: $85/month
- Target customers: 4-6

**Why This Sequence:**
- NY first (home market, existing work)
- NJ second (adjacent, same brands)
- CT third (cheap, no competition, quick win)

---

### Phase 2: East Coast Expansion (Months 4-6)

| Month | State | Dispensaries | Cumulative Stores | Infra Cost |
|-------|-------|--------------|-------------------|------------|
| 4 | Maryland | 100 | 974 | $98/mo |
| 5 | Massachusetts | 436 | 1,410 | $138/mo |
| 6 | (Consolidation) | — | 1,410 | $138/mo |

**Phase 2 Metrics:**
- States: 5
- Stores: 1,410
- Infrastructure: $138/month
- Target customers: 10-15

**Why Maryland & Massachusetts:**
- MD: Fast-growing, low cost, near existing markets
- MA: LitAlerts home turf, prove competitive strength
- Month 6: Focus on customer acquisition, not expansion

---

### Phase 3: Midwest Entry (Months 7-9)

| Month | State | Dispensaries | Cumulative Stores | Infra Cost |
|-------|-------|--------------|-------------------|------------|
| 7 | Michigan | 994 | 2,404 | $223/mo |
| 8 | Ohio | 118 | 2,522 | $237/mo |
| 9 | Illinois | 232 | 2,754 | $261/mo |

**Phase 3 Metrics:**
- States: 8
- Stores: 2,754
- Infrastructure: $261/month
- Target customers: 18-22

**Why Midwest:**
- MI: Second-largest market, must-have
- OH: No competition, first-mover
- IL: High-value stores, MSO headquarters

---

### Phase 4: Fill-In & West (Months 10-12)

| Month | State | Dispensaries | Cumulative Stores | Infra Cost |
|-------|-------|--------------|-------------------|------------|
| 10 | Missouri | 215 | 2,969 | $283/mo |
| 11 | Arizona | 292 | 3,261 | $311/mo |
| 12 | (Consolidation) | — | 3,261 | $311/mo |

**Phase 4 Metrics:**
- States: 10
- Stores: 3,261
- Infrastructure: $311/month
- Target customers: 26-30

---

### Year 1 Summary

| Phase | Months | States | Stores | Infra Cost | Revenue Target |
|-------|--------|--------|--------|------------|----------------|
| 1 | 1-3 | 3 | 874 | $85/mo | $1,500 MRR |
| 2 | 4-6 | 5 | 1,410 | $138/mo | $3,000 MRR |
| 3 | 7-9 | 8 | 2,754 | $261/mo | $5,500 MRR |
| 4 | 10-12 | 10 | 3,261 | $311/mo | $8,500 MRR |

**Year 1 Totals:**
- 10 states covered
- 3,261 dispensaries monitored
- $311/month infrastructure
- $102K+ ARR target

---

## 5. Year 2 Expansion Roadmap

### Priority Markets for Year 2

| State | Dispensaries | 2024 Sales | Priority | Notes |
|-------|--------------|------------|----------|-------|
| Nevada | 169 | $750M | High | Vegas market, tourism |
| Colorado | 1,023 | $1.40B | High | Large but declining |
| Washington | 471 | $1.26B | Medium | Mature market |
| Oregon | 824 | $800M | Medium | Oversaturated |
| Maine | 198 | $450M | Medium | Small but high per-capita |
| New Mexico | 650 | $400M | Medium | Growing fast |
| Montana | 426 | $320M | Low | Small market |
| Vermont | 79 | $180M | Low | Very small |
| Minnesota | 17 | $50M | Low | Just launched |

### Year 2 Quarterly Expansion

| Quarter | States Added | Cumulative States | Stores |
|---------|--------------|-------------------|--------|
| Q1 | Nevada | 11 | 3,430 |
| Q2 | Colorado, Washington | 13 | 4,924 |
| Q3 | Oregon, Maine | 15 | 5,946 |
| Q4 | New Mexico | 16 | 6,596 |

---

## 6. Market Entry Checklist

### Per-State Launch Requirements

| Task | Timeline | Owner |
|------|----------|-------|
| **Data Collection** |
| Identify all dispensaries | Week 1 | Engineering |
| Map menu sources (Dutchie, Jane, iHeartJane) | Week 1 | Engineering |
| Test scraping reliability | Week 1-2 | Engineering |
| Validate data quality | Week 2 | Product |
| **Go-to-Market** |
| Research local brands | Week 1 | Sales |
| Identify MSO presence | Week 1 | Sales |
| Create state-specific messaging | Week 2 | Marketing |
| Reach out to 10 prospects | Week 2-3 | Sales |
| **Operations** |
| Set up monitoring alerts | Week 2 | Engineering |
| Create state dashboard | Week 2 | Product |
| QA alert delivery | Week 2-3 | QA |
| **Launch** |
| Announce coverage | Week 3 | Marketing |
| Onboard first customer | Week 3-4 | Sales |

---

## 7. State-Specific Considerations

### Regulatory Complexity Rating

| State | Rating | Notes |
|-------|--------|-------|
| New York | ⚠️ Medium | OCM evolving, illicit market competition |
| New Jersey | ✅ Low | Stable CRC, clear rules |
| Connecticut | ✅ Low | Small market, simple licensing |
| Maryland | ✅ Low | MCA transparent, rec transition smooth |
| Massachusetts | ✅ Low | Mature CCC, well-documented |
| Michigan | ⚠️ Medium | CRA active, some data gaps |
| Ohio | ⚠️ Medium | Rec new, rules evolving |
| Illinois | ⚠️ Medium | Limited licenses, political factors |
| Missouri | ✅ Low | DHSS straightforward |
| Arizona | ✅ Low | Mature DOR, stable |

### Data Accessibility Rating

| State | Menu Access | State Data | API Available |
|-------|-------------|------------|---------------|
| New York | Good | OCM public | No |
| New Jersey | Good | CRC reports | No |
| Connecticut | Good | DCP data | No |
| Maryland | Excellent | MCA dashboard | Yes |
| Massachusetts | Good | CCC open data | Partial |
| Michigan | Medium | CRA reports | No |
| Ohio | Medium | Evolving | No |
| Illinois | Medium | IDFPR | No |
| Missouri | Medium | DHSS | No |
| Arizona | Good | DOR | No |

---

## 8. Competitive Landscape by State

### LitAlerts Coverage Map

| State | LitAlerts Present | Our Opportunity |
|-------|-------------------|-----------------|
| New York | ✅ Yes | Beat on price + speed |
| New Jersey | ✅ Yes | Bundle with NY |
| Connecticut | ❌ No | **First mover** |
| Maryland | ✅ Yes | Beat on price |
| Massachusetts | ✅ Yes (HQ) | Prove we can compete |
| Michigan | ✅ Yes | Beat on price |
| Ohio | ❌ No | **First mover** |
| Illinois | ✅ Yes | Beat on price |
| Missouri | ✅ Yes | Beat on features |
| Arizona | ✅ Yes | Beat on price |

### First-Mover Opportunities

**States with NO LitAlerts coverage:**
- Ohio (118 stores, huge population)
- Connecticut (28 stores, affluent)
- Minnesota (17 stores, growing)
- Delaware (12 stores, small)
- Rhode Island (7 stores, tiny)
- Vermont (79 stores, niche)

**Recommendation:** Prioritize Ohio and Connecticut in Year 1 to establish dominance before LitAlerts enters.

---

## 9. Investment by Phase

### Total Infrastructure Investment

| Phase | Months | States | Infra/Month | Phase Total |
|-------|--------|--------|-------------|-------------|
| 1 | 1-3 | 3 | $85 | $255 |
| 2 | 4-6 | 5 | $138 | $414 |
| 3 | 7-9 | 8 | $261 | $783 |
| 4 | 10-12 | 10 | $311 | $933 |
| **Year 1** | 1-12 | 10 | Avg: $199 | **$2,385** |

### ROI Analysis

| Metric | Phase 1 | Year 1 End |
|--------|---------|------------|
| Infrastructure Cost | $255 | $2,385 |
| Target Revenue | $4,500 | $55,000 |
| Gross Margin | 94% | 95% |
| ROI | 1,665% | 2,206% |

---

## 10. Key Decisions for Expansion

### Strategic Questions

1. **Speed vs. Depth:** Cover more states shallowly, or fewer states deeply?
   - **Recommendation:** Depth first. Better to be #1 in 5 states than #3 in 15.

2. **East vs. West:** Expand westward or stay East Coast?
   - **Recommendation:** East first. Closer support, overlapping brands, easier travel.

3. **Large vs. Small markets:** Prioritize CA/CO or focus on underserved?
   - **Recommendation:** Mid-size first. IL/MI/MD have best ROI (high sales, manageable stores).

4. **LitAlerts markets vs. empty markets?**
   - **Recommendation:** Mix. Compete in major markets (NY, MI) but grab empty ones (OH, CT) too.

---

## Appendix: State Data Sources

| State | Regulatory Body | Data Dashboard |
|-------|-----------------|----------------|
| New York | OCM | cannabis.ny.gov |
| New Jersey | CRC | nj.gov/cannabis |
| Connecticut | DCP | portal.ct.gov/dcp/cannabis |
| Maryland | MCA | cannabis.maryland.gov |
| Massachusetts | CCC | masscannabiscontrol.com |
| Michigan | CRA | michigan.gov/cra |
| Ohio | DCM | cannabis.ohio.gov |
| Illinois | IDFPR | idfpr.illinois.gov |
| Missouri | DHSS | health.mo.gov |
| Arizona | DOR | azdor.gov |

---

*Document prepared for CannaSignal expansion planning. Market data from state regulators, AIQ, Leafly, Whitney Economics (2024-2025).*
