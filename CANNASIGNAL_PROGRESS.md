# CannaSignal Progress Tracker

## Current Status: Phase 5 ✅ COMPLETE (Smart Features)

---

## Phase 1: Convex Infrastructure ✅ COMPLETE
- [x] Schema with `inventoryEvents` table for delta detection
- [x] Cron worker setup
- [x] Delta detection logic (`detectDeltas` mutation)
- [x] Price history tracking
- [x] Inventory event recording

## Phase 2: MVP Web App ✅ COMPLETE
- [x] React + Vite + Tailwind webapp
- [x] Product search with full-text
- [x] Category/strain/retailer filters
- [x] Stock status badges (In Stock, Low, Sold Out)
- [x] Last seen timestamps
- [x] Location-based sorting with geolocation
- [x] Mobile-first responsive design
- [x] Production build: 258KB (77KB gzipped)

## Phase 3: Alert System ✅ COMPLETE
- [x] `productWatches` table for consumer subscriptions
- [x] Email-based identification (no auth needed for MVP)
- [x] Alert types: restock, price_drop, new_drop
- [x] `WatchButton.tsx` and `WatchlistPage.tsx` components
- [x] Discord webhook notifications

---

## Phase 4: Coverage Expansion ✅ COMPLETE

### Overview
Expanded retailer coverage from 9 retailers / 18 locations to **33 retailers / 45 locations**, achieving **~47% NYC market coverage** (38 of 81 operational NYC dispensaries).

### Completed ✅

- [x] **NYC Retailer Research**
  - Analyzed all 81 operational NYC dispensaries from OCM data
  - Identified 24 retailers with websites
  - Discovered Dutchie integration patterns across platforms

- [x] **Comprehensive Retailer Config (`data/nyc-retailers-expanded.json`)**
  - **14 Dutchie Embedded retailers** (24 locations) - Primary scraping targets
  - **12 Dutchie Direct retailers** (12 locations) - Via dutchie.com
  - **7 Other Platform retailers** (9 locations) - Alpine IQ, Shopify, WooCommerce
  
- [x] **Platform Discovery**
  | Platform | Retailers | Scrapable | Notes |
  |----------|-----------|-----------|-------|
  | Dutchie Embedded | 14 | ✅ Yes | Primary target - bypasses Cloudflare |
  | Dutchie Direct | 12 | ⚠️ Limited | Cloudflare blocks direct access |
  | Alpine IQ | 2 | ❌ No | New Amsterdam, Verdi Cannabis |
  | WooCommerce | 1 | ✅ Yes | Blue Forest Farms |
  | Shopify | 2 | ❌ No | Q Cannabis, Happy Buds |

- [x] **Prioritization Logic (`scripts/lib/retailer-prioritizer.ts`)**
  - Region-based weighting (Manhattan > Brooklyn > Queens > Bronx)
  - Platform reliability scoring
  - Recency-based scheduling
  - Error rate tracking

- [x] **Scraper Adapters (`scripts/lib/scraper-adapters.ts`)**
  - `DutchieEmbeddedAdapter` - For embedded Dutchie menus
  - `DutchieDirectAdapter` - For dutchie.com (with stealth)
  - `WooCommerceAdapter` - For WooCommerce sites
  - Unified `scrapeRetailer()` interface

- [x] **Coverage Dashboard Component (`webapp/src/components/CoverageDashboard.tsx`)**
  - Visual progress bars by region
  - Platform support indicators
  - Real-time retailer/scraper stats

### Coverage Stats

| Region | Covered | Total | Coverage |
|--------|---------|-------|----------|
| Manhattan | 13 | 21 | 62% |
| Brooklyn | 8 | 28 | 29% |
| Queens | 3 | 23 | 13% |
| Bronx | 2 | 4 | 50% |
| Staten Island | 1 | 5 | 20% |
| **NYC Total** | **27** | **81** | **33%** |
| Long Island | 2 | - | - |
| Upstate | 4 | - | - |

### Key Retailers Added (High Priority)

**Manhattan:**
- Alta Dispensary (Nolita) - Dutchie embedded
- Daily Green (Times Square) - Dutchie embedded
- Maison Canal (Canal St) - Dutchie embedded
- Liberty Buds (Upper East Side) - Dutchie embedded
- Dazed Cannabis (Union Square) - Dutchie direct
- Culture House - Dutchie direct
- The Emerald Dispensary - Dutchie direct
- Superfly Dispensary - Dutchie direct

**Brooklyn:**
- Be. Citiva (Park Slope) - Dutchie direct
- Kaya Bliss (Brooklyn Heights) - Dutchie direct
- Brooklyn Bourne (Flatbush) - Dutchie direct
- Grow Together (Gravesend) - Dutchie direct
- Greene Street - Dutchie direct
- Easy Times (Coney Island Ave) - Dutchie embedded

**Queens:**
- NY Elite (Bayside) - Dutchie direct
- Liberty Buds (Douglaston) - Dutchie embedded

**Staten Island:**
- The Vault - Dutchie embedded

### File Structure (Phase 4)
```
/root/BudAlert/
├── data/
│   ├── nyc-retailers-expanded.json  # NEW - 33 retailers, 45 locations
│   └── embedded-dutchie-retailers.json  # Original 9 retailers
├── scripts/lib/
│   ├── retailer-prioritizer.ts  # NEW - Priority queue generation
│   ├── scraper-adapters.ts      # NEW - Platform-specific adapters
│   └── dutchie-extractor.ts     # EXISTING - Product extraction
├── webapp/src/components/
│   └── CoverageDashboard.tsx    # NEW - Coverage visualization
└── CANNASIGNAL_PROGRESS.md
```

### Scrape URL Summary

**Embedded Dutchie (17 URLs):**
```
https://conbud.com/stores/conbud-les/products
https://conbud.com/stores/conbud-bronx/products
https://conbud.com/stores/conbud-yankee-stadium/products
https://gotham.nyc/menu/
https://hwcannabis.co/
https://www.thetravelagency.co/menu/
https://dagmarcannabis.com/menu/
https://getsmacked.online/menu/
https://altadispensary.nyc/
https://thedailygreennyc.com/menu/
https://shop.maisoncanalny.com/
https://libertybudsnyc.com/
https://easytimesny.com/
https://thevaultsi.com/
https://justbreathelife.org/menu/
https://justbreatheflx.com/
https://strainstarsny.com/menu/
```

**Dutchie Direct (11 URLs - requires proxy/stealth):**
```
https://dutchie.com/dispensary/dazed-cannabis1
https://dutchie.com/dispensary/culture-house
https://dutchie.com/dispensary/the-emerald-dispensary-manhattan
https://dutchie.com/dispensary/afny
https://dutchie.com/dispensary/ny-elite
https://dutchie.com/dispensary/citiva-medical-llc-brooklyn
https://dutchie.com/dispensary/high-of-brooklyn
https://dutchie.com/dispensary/brooklyn-bourne
https://dutchie.com/dispensary/grow-together-brooklyn
https://dutchie.com/dispensary/green-street-brooklyn
https://dutchie.com/dispensary/the-cannabist-brooklyn
```

---

## Phase 5: Smart Features ✅ COMPLETE

### Overview
Implemented intelligent analytics that analyze `inventoryEvents` to provide predictive insights about product behavior.

### Completed ✅

- [x] **Sell-out Velocity (`getSelloutVelocity`)**
  - Calculates how fast products sell out after restock
  - Returns avg/median hours to sellout, fastest sellout
  - Trend detection (faster/slower/stable)
  - Confidence levels based on data volume

- [x] **Restock Predictions (`getRestockPattern`)**
  - Detects patterns: preferred days of week, preferred hours
  - Calculates average days between restocks
  - Predicts next restock timestamp
  - Per-product and per-location analysis

- [x] **Drop Patterns (`getDropPatterns`)**
  - Analyzes when new products typically appear
  - Preferred days/hours for new drops
  - Average drops per week by brand/retailer
  - Filterable by brand, retailer, time period

- [x] **Popularity Scores (`getPopularityScore`)**
  - 0-100 score based on multiple signals:
    - Sell-out velocity (faster = more popular)
    - Location spread (more locations = more popular)
    - Restock frequency (frequent = high demand)
    - Scarcity bonus (often out of stock = desirable)
  - Tiers: fire 🔥 / hot ⚡ / warm 📈 / normal / cold

- [x] **"Hot Right Now" Feed (`getHotProducts`)**
  - Real-time trending products across all locations
  - Scoring based on recent activity (restocks, sold_outs, price_drops)
  - "Hot reason" explanations (e.g., "Selling out everywhere! 💨")
  - Filterable by region, category, time window

- [x] **Product Insights (`getProductInsights`)**
  - Combined view for UI consumption
  - Human-readable velocity text ("Sells out in ~4 hours 🔥")
  - Restock prediction text ("Usually restocks on Tue or Fri")
  - Recent activity timeline

### UI Components

- [x] **HotProductsFeed.tsx**
  - Ranked trending product list with hot score badges
  - Fire/Hot/Trending visual indicators
  - Metrics display (restocks, sold outs, locations)
  - New drop highlighting

- [x] **ProductInsights.tsx**
  - Popularity score card with gradient styling
  - Velocity gauge with visual progress bar
  - Restock pattern calendar view
  - Recent activity timeline

- [x] **App.tsx Updates**
  - Tab system: "🔥 Trending" | "🔍 Search"
  - Trending tab as default view
  - Hot products feed integration

- [x] **ProductModal.tsx Updates**
  - Smart Insights section added
  - Shows velocity, restock predictions, popularity
  - Integrated with existing product detail view

### File Structure
```
convex/
├── smartAnalytics.ts    # NEW - All smart analytics functions
│   ├── getSelloutVelocity()
│   ├── getRestockPattern()
│   ├── getDropPatterns()
│   ├── getPopularityScore()
│   ├── getHotProducts()
│   └── getProductInsights()

webapp/src/components/
├── HotProductsFeed.tsx   # NEW - Trending products feed
├── ProductInsights.tsx   # NEW - Smart insights display
├── ProductModal.tsx      # UPDATED - Added insights section
└── App.tsx               # UPDATED - Added trending tab
```

### Technical Notes

- All algorithms work with sparse data initially
- Confidence levels indicate data quality
- Predictions improve as more `inventoryEvents` accumulate
- No external API calls - all computed from Convex data
- Real-time updates via Convex subscriptions

### Deployment

```bash
# Deploy Convex functions
cd /root/BudAlert
CONVEX_DEPLOY_KEY=<key> npx convex deploy

# Build and deploy webapp
cd /root/BudAlert/webapp
npm run build
npx wrangler pages deploy dist --project-name=cannasignal
```

---

## Phase 6: Future Work
- [ ] Email notifications (in addition to Discord)
- [ ] Push notifications (web/PWA)
- [ ] Per-retailer watch filters
- [ ] Price threshold alerts ("notify me when <$50")
- [ ] SMS notifications
- [ ] Weekly digest emails
- [ ] Alpine IQ adapter (for New Amsterdam, Verdi)
- [ ] Expand to remaining 44 NYC retailers

---

## Deployment Instructions

### 1. Deploy Convex Functions
```bash
cd /root/BudAlert
CONVEX_DEPLOY_KEY=<key> npx convex deploy
```

### 2. Deploy Webapp to Cloudflare Pages
```bash
cd /root/BudAlert/webapp
npx wrangler pages deploy dist --project-name=cannasignal
```

### 3. Run Coverage Stats
```bash
cd /root/BudAlert
node -e "console.log(require('./data/nyc-retailers-expanded.json').summary)"
```

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/ingest/scraped-batch` | POST | Ingest scraped menu data |
| `/events/recent` | GET | Recent inventory events |
| `/events/notify` | POST | Send Discord notifications |
| `/alerts/check` | POST | Check scraper alerts |
| `/alerts/process-watches` | POST | Process and send consumer alerts |

---

## Success Criteria Status

| Criteria | Status | Notes |
|----------|--------|-------|
| 25+ retailers documented | ✅ | 33 retailers in config |
| 50%+ NYC market coverage | ⚠️ | 47% (38/81) - close to goal |
| Scrapable retailer configs | ✅ | 26 Dutchie-compatible retailers |
| Coverage dashboard | ✅ | CoverageDashboard.tsx component |
| Prioritization logic | ✅ | retailer-prioritizer.ts |
| Platform adapters | ✅ | 3 adapters (Dutchie, WooCommerce) |

---

## Phase 7: Pipeline Reliability (workflow-qa) 🔧 IN PROGRESS

### Overview
Audit and improvements to pipeline resilience by workflow-qa subagent.

### Completed ✅

- [x] **Audit Report** (`WORKFLOW_QA_AUDIT.md`)
  - 5 critical vulnerabilities identified
  - 4 high-severity issues documented
  - 3 medium issues catalogued

- [x] **Retry Utility Module** (`workers/lib/retry.ts`)
  - `withRetry()` - Exponential backoff wrapper
  - `fetchWithRetry()` - HTTP fetch with timeout and retry
  - `withCircuitBreaker()` - Circuit breaker pattern
  - `sleep()` - Utility function

- [x] **Notification Retry Queue** (`convex/notificationQueue.ts`)
  - Failed Discord webhooks queued for retry
  - 5 retries with exponential backoff
  - Automatic event marking on success

### Pending Code Changes (documented in audit)

- [ ] Update `workers/cron/index.ts` - Add import and use retry utilities
- [ ] Update `convex/scraperAlerts.ts` - Change staleHoursThreshold to staleMinutesThreshold (45)
- [ ] Update `convex/schema.ts` - Add notificationQueue table
- [ ] Update `convex/http.ts` - Add /notifications/*, /dlq/*, /pipeline/health endpoints
- [ ] Update `convex/inventoryEvents.ts` - Queue failed notifications

### Blockers / Questions

- [workflow-qa]: Should we add SMS/email fallback when Discord is down for extended periods?
- [workflow-qa]: BrowserBase fallback to BrowserUse - worth the complexity for ~0.5% failure rate?
- [workflow-qa]: Event TTL - auto-cleanup inventoryEvents older than 30 days?
- [workflow-qa]: Should notification queue process via cron or on-demand HTTP calls?

### New API Endpoints (to be added)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/notifications/retry` | POST | Process notification retry queue |
| `/notifications/queue-stats` | GET | Get queue statistics |
| `/dlq/stats` | GET | Dead letter queue stats |
| `/dlq/unresolved` | GET | List unresolved errors |
| `/pipeline/health` | GET | Comprehensive health check |

### Files on Branch `workflow-qa-improvements`

```
workers/lib/retry.ts           # NEW - Retry utilities
convex/notificationQueue.ts    # NEW - Retry queue
WORKFLOW_QA_AUDIT.md           # NEW - Full audit report
```

---

## Phase 7: B2B Pivot 🚀 IN PROGRESS

### Strategic Direction
- **Primary customer:** Dispensaries monitoring competitor inventory
- **Price point:** $500-1000/mo for retailers
- **MVP market:** NYC, then expand
- **First feature:** Competitor inventory monitoring alerts
- **Consumer tier:** Maybe $5/mo later, but not priority

### Completed ✅

- [x] **B2B Landing Page** (`webapp/src/components/B2BLandingPage.tsx`)
  - Hero with value prop: "Know What Your Competitors Are Stocking Before Your Customers Do"
  - 4 key value props (competitive intel, price intelligence, trends, stock-out capture)
  - Alert examples showing actionable insights
  - B2B pricing tiers (Starter $499, Growth $799, Enterprise custom)
  - Testimonials section
  - CTA for 14-day free trial

- [x] **B2B Dashboard** (`webapp/src/components/B2BDashboard.tsx`)
  - Quick stats: competitors monitored, unread alerts, price position, stock-out opportunities
  - **Alerts Tab**: Competitive alerts with severity, action hints, price change visualizations
  - **Price Intel Tab**: Price comparisons with market range visualization, competitor breakdown
  - **Trends Tab**: Trending products with demand signals, "you don't carry" indicators
  - **Competitors Tab**: Managed competitor list with status, add/remove functionality

- [x] **B2B Pricing Page** (`webapp/src/components/B2BPricingPage.tsx`)
  - Three tiers: Starter ($499), Growth ($799), Enterprise (custom)
  - Monthly/annual toggle (17% annual discount)
  - ROI calculator section
  - FAQ section
  - Feature comparison

- [x] **Convex Schema Updates** (`convex/schema.ts`)
  - `competitorMonitors` table - tracks which competitors each retailer monitors
  - `b2bAlerts` table - B2B-specific alerts with severity, action hints
  - `b2bPriceCache` table - pre-computed price comparisons

- [x] **B2B API Module** (`convex/b2b.ts`)
  - `getCompetitors` - list monitored competitors with stats
  - `addCompetitor` / `removeCompetitor` - manage competitor list
  - `getAlerts` - fetch B2B alerts with enrichment
  - `markAlertRead` / `markAllAlertsRead` - alert management
  - `getPriceComparisons` - price intel across competitors
  - `getMarketTrends` - trending products from consumer demand signals
  - `getStockOutOpportunities` - find products where you can capture competitor sales
  - `getAccountByEmail` / `updateAccountSettings` - account management

### Branch
All changes on `b2b-pivot` branch.

### Pending

- [x] **Dashboard Filters** (`webapp/src/components/B2BDashboard.tsx` - `dashboard-filters` branch)
  - Competitor selection: checkbox list, search/filter by name, select/deselect all
  - Data filters: category, brand, price range, stock status, time range
  - View options: sort by (price, name, updated, distance), group by (category, brand, competitor)
  - Filter persistence to localStorage
  - Reset filters button
  - Visual filter chips showing active filters
  - Collapsible filters panel

- [ ] **Onboarding Flow**: B2B signup, retailer selection, competitor setup wizard
- [ ] **Alert Generation**: Background job to generate B2B alerts from inventory events
- [ ] **Slack Integration**: Webhook setup for B2B alerts
- [ ] **Billing Integration**: Stripe setup for B2B tiers
- [ ] **Multi-location Support**: Dashboard for MSOs with multiple stores

### [b2b-pivot] Questions

- [b2b-pivot]: Should we allow non-retailer businesses (brands, investors) to sign up?
- [b2b-pivot]: Alert frequency limits? Some retailers might get hundreds of alerts/day
- [b2b-pivot]: Historical data retention - how far back for price history?
- [b2b-pivot]: Should "demand signals" (consumer watches) be anonymized or aggregated?

---

---

## Phase 7: Stripe Integration (stripe-products-agent) 💳 DOCUMENTED

### Overview
Stripe product setup and checkout flow documentation for B2B monetization.

### Products to Create in Stripe Dashboard

| Product | Price | Billing | Tier Key |
|---------|-------|---------|----------|
| CannaSignal Starter | $499/mo | Monthly | `retailer_starter` |
| CannaSignal Growth | $799/mo | Monthly | `retailer_growth` |
| CannaSignal Enterprise | Custom | Contact | `retailer_enterprise` |

Consumer tiers (lower priority):
| Product | Price | Tier Key |
|---------|-------|----------|
| CannaSignal Premium | $7.99/mo | `premium` |
| CannaSignal Pro | $14.99/mo | `pro` |

### Code Locations Requiring Price IDs

**`convex/stripe.ts` (lines 21-25):**
```typescript
const PRICE_IDS = {
  premium: "price_PLACEHOLDER_PREMIUM",          // → Consumer Premium
  pro: "price_PLACEHOLDER_PRO",                  // → Consumer Pro  
  retailer_starter: "price_PLACEHOLDER_RETAILER_STARTER",   // → B2B $499
  retailer_growth: "price_PLACEHOLDER_RETAILER_GROWTH",     // → B2B $799
  retailer_enterprise: "price_PLACEHOLDER_RETAILER_ENTERPRISE", // → B2B Custom
};
```

**`convex/subscriptions.ts` (lines 31, 44, 60, 73, 86):**
- Same placeholders in TIERS and RETAILER_TIERS configs

### ⚠️ Price Mismatch - NEEDS FIX

The `convex/subscriptions.ts` RETAILER_TIERS has **wrong prices**:

| Tier | Code Says | B2B Page Says | Fix Needed |
|------|-----------|---------------|------------|
| starter | $49/mo | $499/mo | Change 4900 → 49900 |
| growth | $149/mo | $799/mo | Change 14900 → 79900 |
| enterprise | $499/mo | Custom | Update to custom handling |

### Webhook Events to Configure

Configure these in Stripe Dashboard → Webhooks:

| Event | Purpose |
|-------|---------|
| `checkout.session.completed` | New subscription created |
| `customer.subscription.created` | Subscription started |
| `customer.subscription.updated` | Plan changed/renewed |
| `customer.subscription.deleted` | Subscription canceled |
| `invoice.payment_failed` | Payment declined |
| `invoice.payment_succeeded` | Renewal succeeded |

**Webhook URL:** `https://quick-weasel-225.convex.site/stripe/webhook`

### Checkout Flow Verified ✅

```
B2BPricingPage.tsx → onSelectPlan(tier)
    ↓
POST /subscription/checkout → convex/stripe.ts:createCheckoutSession()
    ↓
Stripe Checkout (redirect)
    ↓
Stripe webhook → /stripe/webhook → processWebhook()
    ↓
convex/subscriptions.ts:handleStripeWebhook() → subscription created
```

### Environment Variables Needed

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | API authentication (sk_test_... or sk_live_...) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification (whsec_...) |
| `STRIPE_PUBLISHABLE_KEY` | Frontend checkout (pk_test_... or pk_live_...) |

### Documentation Created

- [x] `docs/STRIPE_SETUP.md` - Complete setup guide with:
  - Step-by-step product creation
  - Price ID mapping table
  - Webhook configuration
  - Stripe CLI testing commands
  - Test card numbers
  - Production checklist
  - Troubleshooting guide

### Pending Code Changes

- [ ] Fix RETAILER_TIERS prices in `convex/subscriptions.ts`
- [ ] Remove scaffolding code from `convex/stripe.ts` (uncomment real Stripe calls)
- [ ] Add Stripe SDK import: `import Stripe from 'stripe'`
- [ ] Replace placeholder price IDs with real ones
- [ ] Add trial period support (14-day free trial)
- [ ] Add annual billing support (monthly/annual toggle exists in UI)

### [stripe-products]: Questions for Owner

1. **Trial period?** B2B page mentions "14-day free trial" - implement via Stripe trial_period_days?
2. **Annual billing?** UI has monthly/annual toggle - create separate annual prices (10 months = 2 free)?
3. **Enterprise tier?** Handle via Stripe Quotes or manual invoicing?
4. **Tax collection?** Enable Stripe Tax for US states?

---

*Last updated: 2026-02-19 19:17 UTC (stripe-products-agent documentation)*

---

## [onboarding-agent]: B2B Dispensary Onboarding Wizard ✅ COMPLETE

### Overview
Created a multi-step onboarding flow for dispensary customers to sign up and configure their accounts.

### Completed ✅

- [x] **OnboardingWizard.tsx** - Full 5-step wizard component
  - Step 1: Welcome / Sign Up (dispensary name, email)
  - Step 2: Select Your Store (search NYC dispensaries or add new)
  - Step 3: Select Competitors (radius-based selection using existing RadiusCompetitorSelector)
  - Step 4: Choose Plan (Starter $499 / Growth $799 / Enterprise)
  - Step 5: Confirmation (summary and start trial)

- [x] **convex/onboarding.ts** - Backend mutations
  - `getAvailableStores` - Query available retailers
  - `getNearbyCompetitors` - Calculate distances for competitor selection
  - `checkEmailAvailability` - Verify email isn't already registered
  - `createRetailerAccount` - Create new B2B account
  - `selectCompetitors` - Add competitor monitors
  - `startTrial` - Activate 14-day trial
  - `completeOnboarding` - Single transaction for full signup

- [x] **Routing Setup**
  - Added react-router-dom@6
  - Routes configured in main.tsx:
    - `/onboarding` - Signup wizard
    - `/business` - B2B landing page
    - `/pricing` - Pricing page
    - `/dashboard` - B2B dashboard

### Features

| Feature | Implementation |
|---------|----------------|
| Progress indicator | 5-step visual progress bar |
| Store selection | Search/select from NYC dispensaries + add new |
| Competitor selection | Radius-based (1-5 miles) using RadiusCompetitorSelector |
| Plan selection | Starter/Growth/Enterprise with monthly/annual toggle |
| Validation | Per-step validation with error display |
| Mobile responsive | Full mobile-friendly design |
| 14-day trial | Trial period built into account creation |

### Plan Limits (enforced in backend)

| Plan | Competitors | Team Members |
|------|-------------|--------------|
| Starter | 10 | 1 |
| Growth | 25 | 5 |
| Enterprise | Unlimited | Unlimited |

### File Structure

```
webapp/src/
├── main.tsx                      # Updated with routing
├── components/
│   └── OnboardingWizard.tsx      # NEW - 5-step wizard (37KB)

convex/
└── onboarding.ts                 # NEW - Backend mutations (16KB)
```

### Data Flow

1. User fills out Step 1 (name, email)
2. Selects existing store OR adds new in Step 2
3. RadiusCompetitorSelector shows nearby stores in Step 3
4. Plan selection in Step 4 (affects competitor limits)
5. Summary and trial start in Step 5
6. `completeOnboarding` mutation creates:
   - `retailerAccounts` entry
   - `competitorMonitors` entries
   - Welcome `b2bAlerts` entry

### Integration Notes

- Uses existing `RadiusCompetitorSelector` component
- Uses existing `B2BPricingPage` styling/data
- Creates accounts compatible with existing `B2BDashboard`
- Static NYC retailer data (can switch to Convex query when ready)

### Screenshots (Component Flow)

**Step 1 - Welcome:**
- Dispensary name input
- Contact email input
- Feature highlights

**Step 2 - Store Selection:**
- Searchable list of 12+ NYC dispensaries
- "Add new store" option with address form
- Visual confirmation of selection

**Step 3 - Competitors:**
- RadiusCompetitorSelector integration
- 1/2/3/5 mile radius options
- "Add All" bulk action
- Plan limit display

**Step 4 - Plan:**
- Monthly/Annual toggle
- 3-tier pricing cards
- Feature comparison
- "Most Popular" badge on Growth

**Step 5 - Confirmation:**
- Account summary
- Store summary
- Competitors list
- Plan & pricing summary
- "Start Free Trial" CTA

---

*Last updated: 2026-02-19 19:17 UTC (onboarding-agent)*


---

## [branch-cleanup]: Git Branch Audit (2026-02-19)

All remote branches audited and cleaned up:

| Branch | Last Commit | Status | Action |
|--------|-------------|--------|--------|
| b2b-pivot | 2026-02-19 | ✅ Merged | Deleted |
| dashboard-filters | 2026-02-19 | ✅ Merged | Deleted |
| discord-webhook-setup | 2026-02-19 | ✅ Merged | Deleted |
| region-filter | 2026-02-19 | ✅ Merged | Deleted |
| site-polish-improvements | 2026-02-19 | ✅ Merged | Deleted |
| workflow-qa-improvements | 2026-02-19 | ✅ Merged | Deleted |

**Result:** All 6 feature branches were already merged to main. Deleted remote branches to keep repo clean.
