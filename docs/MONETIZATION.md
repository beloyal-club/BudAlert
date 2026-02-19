# CannaSignal Monetization Strategy

## Phase 6 Documentation

*Last updated: 2026-02-19*

---

## Overview

CannaSignal generates revenue through two complementary channels:

1. **Consumer Subscriptions (B2C)** - Deal hunters who want better alerts
2. **Retailer Dashboards (B2B)** - Dispensaries who want competitive intelligence

---

## Consumer Tiers

### Free Tier ($0/month)
The entry point for casual users.

| Feature | Limit |
|---------|-------|
| Product Watches | 3 max |
| Alert Channels | Discord only |
| Alert Speed | Standard (batched) |
| Restock Predictions | ❌ |
| SMS Alerts | ❌ |
| Data Export | ❌ |
| API Access | ❌ |

**Conversion Strategy:**
- Show upgrade prompts when limit reached
- Display "Premium" badges on locked features
- Social proof ("100+ users upgraded this week")

### Premium Tier ($7.99/month)
For serious deal hunters who don't want to miss drops.

| Feature | Access |
|---------|--------|
| Product Watches | Unlimited |
| Alert Channels | Discord + Email |
| Alert Speed | Priority (real-time) |
| Restock Predictions | ✅ Full access |
| SMS Alerts | ✅ Included |
| Data Export | ✅ CSV/JSON |
| API Access | ❌ |

**Value Proposition:**
- "Never miss a restock again"
- "Know when products will restock BEFORE they do"
- "Get alerts 30 min before free users"

**Pricing Rationale:**
- $7.99 is below the psychological $10 barrier
- Comparable to streaming services (low perceived cost)
- Cannabis consumers are high-intent purchasers

### Pro Tier ($14.99/month)
For power users and developers building on CannaSignal.

| Feature | Access |
|---------|--------|
| Everything in Premium | ✅ |
| API Access | ✅ Full |
| Webhook Integrations | ✅ |
| Historical Data | ✅ 90 days |
| Custom Alert Rules | ✅ |
| Priority Support | ✅ |

**Target Users:**
- Discord bot developers
- Cannabis deal aggregators
- Data enthusiasts

---

## Retailer Tiers (B2B)

### Starter ($49/month)
For single-location dispensaries wanting basic competitive intel.

| Feature | Access |
|---------|--------|
| Competitor Pricing | ✅ 5 competitors |
| Stock-Out Alerts | ✅ Own inventory |
| Demand Signals | ❌ |
| Analytics Depth | Basic |
| API Access | ❌ |
| White Label | ❌ |

### Growth ($149/month)
For multi-location retailers wanting deeper insights.

| Feature | Access |
|---------|--------|
| Competitor Pricing | ✅ 15 competitors |
| Stock-Out Alerts | ✅ All locations |
| Demand Signals | ✅ Watch counts, search trends |
| Analytics Depth | Advanced |
| API Access | ✅ |
| White Label | ❌ |

**Key Value:**
- "Know what customers are searching for"
- "See which products have 50+ people waiting"
- "Optimize inventory based on actual demand"

### Enterprise ($499/month)
For dispensary chains and MSOs.

| Feature | Access |
|---------|--------|
| Everything in Growth | ✅ |
| Competitor Pricing | ✅ Unlimited |
| Analytics Depth | Enterprise |
| API Access | ✅ Full |
| White Label | ✅ |
| Dedicated Support | ✅ |
| Custom Integrations | ✅ |

---

## Retailer Dashboard Features

### 1. Competitive Pricing Intel
Real-time price comparison across tracked competitors.

**Display:**
- Product-by-product price comparison
- Price trend charts (are competitors lowering prices?)
- "You're $X more expensive than average" alerts
- Margin analysis (if they provide cost data)

**Value:**
- Stay competitive without constant price shopping
- React quickly to competitor sales
- Identify pricing opportunities

### 2. Stock-Out Alerts
Notifications when their own products go out of stock.

**Triggers:**
- Product shows "Sold Out" on their menu
- Inventory drops below threshold
- Product hasn't been updated in X days

**Value:**
- Catch inventory sync issues before customers notice
- Never lose sales to stock-out oversights
- Peace of mind for operations team

### 3. Demand Signals
See aggregated consumer interest data.

**Metrics:**
- Watch count per product ("87 people are waiting for Backpack Boyz")
- Search trends ("Runtz searches up 40% this week")
- Alert triggers ("3 restocks triggered 200+ alerts")

**Value:**
- Data-driven inventory decisions
- Know what to order more of
- Identify trending products before competitors

### 4. Market Intelligence
Broader market trends and insights.

**Reports:**
- Category performance (flower vs concentrates vs edibles)
- Brand momentum (which brands are gaining watches?)
- Regional trends (what's hot in Manhattan vs Brooklyn?)

---

## Path to $1K MRR

### Target Mix
| Segment | Subscribers | Price | MRR |
|---------|-------------|-------|-----|
| Premium | 100 | $7.99 | $799 |
| Pro | 15 | $14.99 | $225 |
| **Consumer Total** | **115** | | **$1,024** |

**Alternative path:**
- 5 Retailer Starters × $49 = $245
- 5 Retailer Growth × $149 = $745
- **Retailer Total** = $990

### Acquisition Funnel

**Consumer:**
1. User discovers CannaSignal via search/social
2. Uses free tier, watches 3 products
3. Hits limit → sees upgrade prompt
4. 10% convert → Premium subscriber

**Retailer:**
1. Retailer notices their products in CannaSignal
2. Outreach email: "See what 200+ customers want from your store"
3. Demo call showing demand signals
4. Trial → Paid conversion

### Timeline
- **Month 1:** Launch consumer subscriptions, 20 Premium signups
- **Month 2:** Add SMS alerts, reach 50 Premium
- **Month 3:** Launch Retailer Starter, 3 dispensary signups
- **Month 4:** Hit 100 Premium + 5 Retailers = $1K MRR

---

## Technical Implementation

### Stripe Integration
- Products/prices created in Stripe Dashboard
- Checkout Sessions for new subscriptions
- Customer Portal for management
- Webhooks for subscription lifecycle

### Environment Variables Needed
```bash
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_PREMIUM=price_xxx
STRIPE_PRICE_PRO=price_xxx
```

### Convex Schema Additions
- `subscriptions` table: Consumer subscription state
- `retailerAccounts` table: B2B accounts
- `paymentEvents` table: Audit trail

### Feature Gating
```typescript
// Check before allowing action
const canAdd = await ctx.runQuery(api.subscriptions.canAddWatch, { email });
if (!canAdd.canAdd) {
  throw new Error("Watch limit reached");
}
```

---

## Future Enhancements

1. **Annual Plans** - 2 months free (20% discount)
2. **Referral Program** - 1 month free for referrer + referee
3. **Family Plans** - Share Premium with household
4. **Retailer Co-Marketing** - Featured placement for paying dispensaries
5. **Data Licensing** - Aggregate trend data for brands/investors

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Free → Premium Conversion | 10% |
| Premium Churn (monthly) | <5% |
| Retailer Trial → Paid | 30% |
| NPS Score | 50+ |
| MRR Growth (month/month) | 20% |
