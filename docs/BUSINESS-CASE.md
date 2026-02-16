# CannaSignal Business Case & Cost Analysis

> Cannabis market intelligence for brands, wholesalers, and MSOs

**Last Updated:** 2026-02-16

---

## Executive Summary

CannaSignal monitors dispensary inventory in real-time, providing alerts when products go out of stock, new products appear, or prices change. Target customers are cannabis brands and wholesalers who need competitive intelligence and sales signals.

**Key Finding:** With premium pricing at $249-$499/month (aligned with enterprise value), CannaSignal reaches profitability with just **3 paying customers** and achieves **$100K+ ARR** with 20-25 subscribers.

**Competitive Positioning:** LitAlerts charges $500/month per market with no tier options. CannaSignal offers comparable value at competitive prices with more flexible tiers and superior real-time alerting.

---

## 1. Per-Store Economics

### Cost Breakdown (Per Dispensary Per Month)

| Cost Category | Unit Cost | Usage/Store/Mo | Cost/Store/Mo |
|--------------|-----------|----------------|---------------|
| **Scraping (Cloudflare Workers)** |
| - Requests | $0.30/1M | 720 requests¹ | $0.00022 |
| - CPU time | $0.02/1M ms | 3,600 ms | $0.00007 |
| **Data Storage (Convex)** |
| - Function calls | $2.20/1M | 2,000 calls² | $0.0044 |
| - Database storage | $0.22/GB/mo | 10 MB | $0.0022 |
| - Database bandwidth | $0.22/GB | 50 MB | $0.011 |
| **AI Normalization (GPT-4o-mini)** |
| - Input tokens | $0.15/1M | 50K tokens³ | $0.0075 |
| - Output tokens | $0.60/1M | 10K tokens | $0.006 |
| **Alert Delivery** |
| - Email (SendGrid) | $0.00035/email | 30 emails | $0.01 |
| - SMS (Twilio) | $0.0079/msg | 10 alerts⁴ | $0.079 |
| - Webhooks | $0.00 | unlimited | $0.00 |
| **TOTAL COGS/STORE** | | | **$0.12** |

¹ 24 scrapes/day × 30 days = 720 requests  
² Includes writes, queries, alert processing  
³ ~70 tokens/product × 24 products/scrape × 30 days  
⁴ Assuming 1 subscriber gets SMS for that store

### Infrastructure Cost Per State

| State Size | Dispensaries | Monthly Infra Cost | Cost/Store |
|------------|--------------|-------------------|------------|
| **Small** (CT, DE, RI) | 10-30 | $5-15 | $0.50 |
| **Medium** (NY, NJ, MD) | 100-500 | $25-75 | $0.15-0.25 |
| **Large** (MI, IL, MA) | 200-500 | $50-100 | $0.20-0.25 |
| **Very Large** (CA, CO) | 1,000+ | $150-250 | $0.15-0.25 |

*Infrastructure costs scale sub-linearly due to fixed base costs (Cloudflare $5/mo, etc.)*

---

## 2. Market Landscape: Adult-Use Cannabis States

### Legal Adult-Use Markets (25 states + DC as of 2026)

| State | Legal Since | Dispensaries | 2024 Sales | Sales/Capita |
|-------|-------------|--------------|------------|--------------|
| California | 2016 | 1,244 | $4.66B | $119 |
| Michigan | 2018 | 994 | $3.03B | $304 |
| Illinois | 2019 | 232 | $1.80B | $142 |
| Massachusetts | 2016 | 436 | $1.67B | $239 |
| Missouri | 2022 | 215 | $1.46B | $238 |
| Colorado | 2012 | 1,023 | $1.40B | $243 |
| Maryland | 2023 | 100 | $1.24B | $201 |
| Washington | 2012 | 471 | $1.26B | $165 |
| New Jersey | 2021 | 296 | $1.08B | $117 |
| Arizona | 2020 | 292 | $1.06B | $146 |
| New York | 2021 | ~550 | $860M* | $44 |
| Oregon | 2014 | 824 | $800M | $190 |
| Nevada | 2016 | 169 | $750M | $239 |
| Maine | 2016 | 198 | $450M | $329 |
| New Mexico | 2021 | 650 | $400M | $190 |
| Montana | 2020 | 426 | $320M | $285 |
| Ohio | 2023 | 118 | $300M | $26 |
| Connecticut | 2021 | 28 | $280M | $78 |
| Vermont | 2018 | 79 | $180M | $280 |
| Alaska | 2014 | 188 | $285M | $387 |
| Minnesota | 2023 | 17 | $50M* | $9 |
| Delaware | 2023 | 12 | $40M* | $40 |
| Rhode Island | 2022 | 7 | $35M | $32 |
| Virginia | 2021 | 22 | $30M* | $4 |

*Estimated; market still ramping

**Medical-Only Large Markets (potential future):**
- Florida: 622 dispensaries, $2.1B sales
- Pennsylvania: 177 dispensaries, $1.6B sales

---

## 3. State-by-State Opportunity Ranking

### Ranking Methodology

| Factor | Weight | Description |
|--------|--------|-------------|
| Market Size | 30% | Annual retail sales |
| Dispensary Count | 25% | Total stores to monitor |
| Growth Rate | 20% | YoY sales growth |
| Competition | 15% | LitAlerts presence, alternatives |
| Regulatory Ease | 10% | Stable licensing, public menus |

### Top 10 States by Opportunity Score

| Rank | State | Score | Dispensaries | 2024 Sales | LitAlerts? | Notes |
|------|-------|-------|--------------|------------|------------|-------|
| 1 | **New York** | 95 | 550 | $860M | ✅ Yes | Home market, rapid growth, familiar terrain |
| 2 | **New Jersey** | 88 | 296 | $1.08B | ✅ Yes | Adjacent to NY, high sales/store ratio |
| 3 | **Michigan** | 85 | 994 | $3.03B | ✅ Yes | Massive market, high velocity |
| 4 | **Illinois** | 82 | 232 | $1.80B | ✅ Yes | High sales, limited dispensaries = high value |
| 5 | **Maryland** | 80 | 100 | $1.24B | ✅ Yes | Fast-growing, manageable size |
| 6 | **Massachusetts** | 78 | 436 | $1.67B | ✅ Yes | Mature market, proven demand |
| 7 | **Missouri** | 75 | 215 | $1.46B | ✅ Yes | Explosive growth, underserved |
| 8 | **Ohio** | 73 | 118 | $300M | ❌ No | Rec just launched, huge population |
| 9 | **Connecticut** | 70 | 28 | $280M | ❌ No | Small but affluent, underserved |
| 10 | **Arizona** | 68 | 292 | $1.06B | ✅ Yes | Stable market, good data access |

### LitAlerts Market Coverage

LitAlerts is currently in **15 markets** at **$500/month per market**:
- MA, NY, NJ, MD, IL, MI, MO, AZ, CO, NV, CA, WA, OR, FL, PA

**Underserved opportunities:** Ohio, Connecticut, Minnesota, Delaware, Rhode Island, Vermont, New Mexico

---

## 4. Priority States for Launch (First 3 Months)

### Phase 1 Launch Markets

| Priority | State | Why | Dispensaries | Monthly Infra |
|----------|-------|-----|--------------|---------------|
| **#1** | New York | Home market, relationships exist, 550 stores | 550 | $65 |
| **#2** | New Jersey | Adjacent geography, shared brands, $1B+ market | 296 | $40 |
| **#3** | Connecticut | Small but affluent, no LitAlerts, easy to dominate | 28 | $10 |

**Total Phase 1 Infrastructure:** ~$115/month for 874 stores

### Why These Three?

**New York:**
- Already have NY dispensary integrations built
- Explosive growth: 99 stores (Jan 2024) → 550 stores (2026)
- $860M in sales growing 100%+ YoY
- Know the regulatory landscape and OCM data sources
- Direct relationships with NY brands and wholesalers

**New Jersey:**
- Geographic proximity (many NY brands operate in NJ)
- $1.08B market with only 296 stores = high $/store
- Cross-sell to NY customers is trivial
- Same East Coast brand ecosystem
- Growing faster than NY per-store

**Connecticut:**
- Only 28 dispensaries = can cover 100% of market cheaply
- No LitAlerts presence = first-mover advantage
- Affluent consumer base, premium pricing works
- Border states (NY, MA) create cross-shopping data value
- Can be "the" data provider in CT market

---

## 5. Premium Pricing Strategy

### Competitive Context

| Competitor | Pricing Model | Price Point |
|------------|--------------|-------------|
| **LitAlerts** | Per market, all features | $500/mo per market |
| **Headset** | Enterprise annual | $2,000-5,000/mo |
| **BDSA** | Reports + subscriptions | $1,000-3,000/mo |
| **LeafLink** | Freemium marketplace | Free-$299/mo |

### CannaSignal Pricing Tiers

| Tier | Price | Target Customer | Included |
|------|-------|-----------------|----------|
| **Pro** | $249/mo | Brands, wholesalers | 50 stores, real-time alerts, Slack, 90-day data |
| **Enterprise** | $499/mo | MSOs, distributors | Unlimited stores, API access, white-label, 1-year data |

### Tier Details

#### 🌿 Pro — $249/month
*For brands and regional wholesalers*

- Track up to **50 dispensaries** (across any covered state)
- Real-time email + SMS alerts
- Slack integration
- Out-of-stock notifications
- Price change tracking
- New product detection
- 90-day historical data
- 5 user seats
- Weekly summary reports

**Target:** Mid-size brands, regional wholesalers, brokers  
**Value prop:** At $5/store monitored, cheaper than hiring a rep to check menus

#### 🌳 Enterprise — $499/month
*For MSOs, major distributors, and data teams*

- **Unlimited dispensaries** across all covered markets
- All Pro features plus:
  - Full API access for integrations
  - White-label reports for clients
  - 1-year historical data retention
  - Raw data exports (CSV, JSON)
  - Custom webhook integrations
  - CRM sync (HubSpot, Salesforce)
  - Priority support + dedicated Slack channel
  - Unlimited user seats

**Target:** Multi-state operators, large distributors, analytics firms  
**Value prop:** $499/mo is 1/10th the cost of Headset, same real-time data

### Why $249-$499 Works

1. **LitAlerts comparison:** At $500/mo per market, a brand tracking NY + NJ pays $1,000/mo. CannaSignal Enterprise: $499/mo for both.

2. **ROI math:** One saved out-of-stock situation = $1,000-5,000 in potential lost sales. $249/mo pays for itself in one alert.

3. **Enterprise budget alignment:** $500/mo is a rounding error for MSOs spending $50K+/mo on operations.

4. **No cheap tier:** Eliminates tire-kickers, attracts serious buyers who value their time.

---

## 6. Revised Unit Economics

### Cost Structure at Scale

| Scale | Stores | Monthly Infra | SMS (25 users) | Total COGS |
|-------|--------|---------------|----------------|------------|
| Phase 1 (NY/NJ/CT) | 874 | $115 | $50 | **$165** |
| Phase 2 (+MD/MA) | 1,410 | $175 | $100 | **$275** |
| National (Top 10) | 3,500 | $400 | $200 | **$600** |

### Break-Even Analysis

| Scenario | Customers | Mix | MRR | COGS | Gross Profit |
|----------|-----------|-----|-----|------|--------------|
| **Break-even** | 1 Enterprise | 100% Ent | $499 | $165 | $334 (67%) |
| **Minimum viable** | 2 Pro + 1 Ent | Mixed | $997 | $165 | $832 (83%) |
| **Comfortable** | 5 Pro + 2 Ent | Mixed | $2,243 | $200 | $2,043 (91%) |

**Break-even: 1 Enterprise or 2 Pro customers**

### Gross Margin by Tier

| Tier | Price | COGS/Customer | Gross Margin |
|------|-------|---------------|--------------|
| Pro ($249) | $249 | $25-35 | 86-90% |
| Enterprise ($499) | $499 | $40-60 | 88-92% |

*COGS includes proportional infrastructure + direct alert costs*

---

## 7. Path to $100K+ ARR

### Revenue Model

| Milestone | Pro Customers | Ent Customers | MRR | ARR |
|-----------|---------------|---------------|-----|-----|
| Month 3 | 3 | 1 | $1,246 | $15K |
| Month 6 | 8 | 3 | $3,489 | $42K |
| Month 9 | 12 | 5 | $5,483 | $66K |
| Month 12 | 18 | 8 | $8,474 | **$102K** |

### Customer Acquisition Targets

**Year 1 Goal:** 26 customers (18 Pro + 8 Enterprise)

| Segment | Target Companies | Conversion | Customers | Revenue/Mo |
|---------|------------------|------------|-----------|------------|
| NY Brands | 150 | 8% | 12 Pro | $2,988 |
| NY/NJ Wholesalers | 50 | 12% | 6 Pro | $1,494 |
| Regional MSOs | 20 | 25% | 5 Ent | $2,495 |
| Consultants/Analysts | 15 | 20% | 3 Ent | $1,497 |
| **Total** | **235** | **11%** | **26** | **$8,474** |

### $100K ARR Scenarios

| Path | Customers | Avg Price | Time to $100K |
|------|-----------|-----------|---------------|
| **All Enterprise** | 17 | $499 | 10-12 months |
| **All Pro** | 34 | $249 | 14-16 months |
| **Mixed (realistic)** | 26 | $326 | **12 months** |

---

## 8. Market Sizing (Updated)

### Total Addressable Market (TAM)

| Segment | US Companies | Avg Price | TAM |
|---------|--------------|-----------|-----|
| Cannabis Brands | 2,000 | $249/mo | $5.98M/yr |
| Wholesalers/Distributors | 500 | $350/mo | $2.10M/yr |
| MSOs | 150 | $499/mo | $0.90M/yr |
| Consultants/Analytics | 200 | $499/mo | $1.20M/yr |
| **Total TAM** | **2,850** | | **$10.2M/yr** |

### Serviceable Addressable Market (SAM) — Phase 1 States

| Segment | NY/NJ/CT Companies | Penetration | SAM |
|---------|-------------------|-------------|-----|
| Brands | 200 | 25% | $149K/yr |
| Wholesalers | 75 | 35% | $78K/yr |
| MSOs | 25 | 40% | $60K/yr |
| **Total SAM** | **300** | | **$287K/yr** |

### Serviceable Obtainable Market (SOM) — Year 1

| Metric | Target |
|--------|--------|
| Customers | 26 |
| ARR | $102K |
| Market Share (SAM) | 35% |

---

## 9. Competitive Analysis (Updated)

### Feature Comparison

| Feature | LitAlerts | CannaSignal | Advantage |
|---------|-----------|-------------|-----------|
| **Pricing** | $500/mo/market | $249-499/mo all markets | CannaSignal |
| Real-time alerts | Hourly | Every 30 min | CannaSignal |
| Out-of-stock alerts | ✅ | ✅ | Tie |
| Price tracking | ✅ | ✅ | Tie |
| New product detection | ❌ | ✅ | CannaSignal |
| API access | Included | Enterprise only | LitAlerts |
| Multi-market pricing | Additive | Flat | CannaSignal |
| Estimated sales | ✅ | ✅ | Tie |
| White-label | ❌ | Enterprise | CannaSignal |
| Slack integration | ❌ | ✅ | CannaSignal |

### Pricing Comparison (Multi-State Brand)

*Brand monitoring NY + NJ + CT:*

| Provider | Calculation | Monthly Cost |
|----------|-------------|--------------|
| LitAlerts | $500 × 3 markets | $1,500/mo |
| CannaSignal Pro | Flat rate, 50 stores | $249/mo |
| CannaSignal Enterprise | Unlimited stores | $499/mo |

**CannaSignal saves 67-83% vs LitAlerts for multi-state monitoring**

### Why Brands Switch from LitAlerts

1. **Cost:** $500/market adds up fast for regional brands
2. **Speed:** 30-min alerts vs hourly = catch stockouts same-day
3. **Integrations:** Slack, webhooks, API for automation
4. **New products:** LitAlerts doesn't detect new SKUs
5. **Simplicity:** One price, all markets covered

---

## 10. Financial Projections

### Year 1 (Premium Pricing Model)

| Month | Stores | Subscribers | MRR | COGS | Gross Profit |
|-------|--------|-------------|-----|------|--------------|
| 1-3 | 550 (NY) | 4 | $1,246 | $80 | $1,166 |
| 4-6 | 874 (+ NJ/CT) | 10 | $2,990 | $150 | $2,840 |
| 7-9 | 1,410 (+ MD/MA) | 18 | $5,233 | $250 | $4,983 |
| 10-12 | 1,650 | 26 | $8,474 | $350 | $8,124 |

**Year 1 Total:** ~$55K revenue, ~$50K gross profit, **95% gross margin at scale**

### Year 2 (Growth)

| Quarter | States | Subscribers | MRR | ARR Run Rate |
|---------|--------|-------------|-----|--------------|
| Q1 | 5 | 35 | $11,500 | $138K |
| Q2 | 7 | 50 | $16,500 | $198K |
| Q3 | 10 | 70 | $23,000 | $276K |
| Q4 | 12 | 90 | $29,500 | $354K |

**Year 2 ARR: ~$250K**

### Path to $1M ARR

| Year | Customers | Avg Price | MRR | ARR |
|------|-----------|-----------|-----|-----|
| Y1 | 26 | $326 | $8,474 | $102K |
| Y2 | 90 | $330 | $29,700 | $356K |
| Y3 | 200 | $350 | $70,000 | $840K |
| Y4 | 275 | $365 | $100,375 | **$1.2M** |

---

## 11. Investment Requirements

### MVP to Revenue (Months 1-3)

| Item | Cost |
|------|------|
| Infrastructure (NY) | $65/mo × 3 | $195 |
| Domain + SSL | $15 |
| Development | Sweat equity |
| Marketing/content | $200 |
| **Total:** | **~$410** |

### Growth Phase (Months 4-12)

| Item | Monthly | Annual |
|------|---------|--------|
| Infrastructure | $200 | $2,400 |
| SMS credits | $100 | $1,200 |
| Marketing | $300 | $3,600 |
| Tools (email, analytics) | $50 | $600 |
| **Total:** | **$650** | **$7,800** |

### Capital Efficiency

| Metric | Value |
|--------|-------|
| Total investment needed | ~$8,000 |
| Break-even customers | 2 |
| Months to break-even | 2-3 |
| ARR at profitability | $6K+ |
| Year 1 ROI | 650%+ |

---

## 12. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| LitAlerts drops prices | Medium | High | Differentiate on speed + integrations, lock in annual deals |
| Dispensaries block scraping | Medium | High | Rotate IPs, use APIs where available, respectful rate limits |
| Low enterprise conversion | Medium | Medium | Start with Pro, upsell based on usage |
| NY market slowdown | Low | Medium | Already expanding to NJ/CT/MD |
| Churn > 5%/mo | Low | High | Quarterly discounts, sticky integrations, excellent support |

---

## 13. Key Metrics to Track

### North Star Metrics
- **ARR** (target: $100K+ Year 1)
- **Net Revenue Retention** (target: 110%+)
- **Gross Margin** (target: 85%+)

### Product Metrics
- Alert delivery latency (target: <5 min)
- Scrape success rate (target: >99%)
- Data freshness (target: <30 min)
- Feature adoption (API, Slack, webhooks)

### Business Metrics
- MRR growth (target: 15%/mo)
- CAC (target: <$300)
- LTV (target: >$3,000)
- Payback period (target: <3 months)
- Churn rate (target: <3%/mo)

---

## Appendix: Pricing Source Data

### Cloudflare Workers (Paid Plan)
- Base: $5/month
- Requests: $0.30/million (after 10M included)
- CPU time: $0.02/million ms (after 30M ms included)

### Cloudflare R2
- Storage: $0.015/GB-month (10GB free)
- Egress: Free

### Convex (Starter)
- Function calls: $2.20/million (1M free)
- Storage: $0.22/GB-month (0.5GB free)
- Bandwidth: $0.22/GB (1GB free)

### OpenAI GPT-4o-mini
- Input: $0.15/million tokens
- Output: $0.60/million tokens

### Twilio SMS
- Outbound SMS: $0.0079/message
- Phone number: $1.15/month

### SendGrid
- Free: 100 emails/day
- Essentials: $19.95/mo for 50K emails

---

*Document prepared for CannaSignal business planning. Numbers based on public pricing and market data as of February 2026.*
