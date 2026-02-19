# Stripe Setup Guide for CannaSignal

This guide walks through setting up Stripe products, prices, and webhooks for CannaSignal's B2B subscription service.

---

## Prerequisites

- Stripe account (test mode for development, live mode for production)
- Access to the Stripe Dashboard
- Admin access to Convex environment variables

---

## Step 1: Create Stripe Products

### B2B Products (Primary Revenue)

Create these products in your Stripe Dashboard → Products:

#### Product 1: CannaSignal Starter
- **Name:** CannaSignal Starter
- **Description:** Competitive intelligence for single-location dispensaries
- **Price:** $499.00 USD / month (recurring)
- **Metadata (on price):**
  ```
  tier = starter
  competitors = 10
  team_members = 1
  api_access = false
  ```

#### Product 2: CannaSignal Growth
- **Name:** CannaSignal Growth  
- **Description:** Advanced analytics for multi-location dispensaries
- **Price:** $799.00 USD / month (recurring)
- **Metadata (on price):**
  ```
  tier = growth
  competitors = 25
  team_members = 5
  api_access = true
  demand_signals = true
  ```

#### Product 3: CannaSignal Enterprise
- **Name:** CannaSignal Enterprise
- **Description:** Full-featured solution for MSOs and large operations
- **Price:** Custom / Contact Sales (don't create a price, handle via quotes)
- **Metadata:**
  ```
  tier = enterprise
  contact_required = true
  ```

### Consumer Products (Future - Lower Priority)

For the consumer-facing product tracker (Phase 2 revenue):

#### Product: CannaSignal Premium
- **Name:** CannaSignal Premium
- **Price:** $7.99 USD / month
- **Metadata:** `tier = premium, unlimited_watches = true`

#### Product: CannaSignal Pro  
- **Name:** CannaSignal Pro
- **Price:** $14.99 USD / month
- **Metadata:** `tier = pro, api_access = true`

---

## Step 2: Copy Price IDs

After creating products, copy the Price IDs (format: `price_xxxxxxxxxxxxx`) and update:

### Code Locations Requiring Price IDs

| File | Line | Placeholder | Replace With |
|------|------|-------------|--------------|
| `convex/stripe.ts` | 21 | `price_PLACEHOLDER_PREMIUM` | Consumer Premium price ID |
| `convex/stripe.ts` | 22 | `price_PLACEHOLDER_PRO` | Consumer Pro price ID |
| `convex/stripe.ts` | 23 | `price_PLACEHOLDER_RETAILER_STARTER` | B2B Starter price ID |
| `convex/stripe.ts` | 24 | `price_PLACEHOLDER_RETAILER_GROWTH` | B2B Growth price ID |
| `convex/stripe.ts` | 25 | `price_PLACEHOLDER_RETAILER_ENTERPRISE` | B2B Enterprise price ID (if applicable) |
| `convex/subscriptions.ts` | 31 | `price_PLACEHOLDER_PREMIUM` | Consumer Premium price ID |
| `convex/subscriptions.ts` | 44 | `price_PLACEHOLDER_PRO` | Consumer Pro price ID |
| `convex/subscriptions.ts` | 60 | `price_PLACEHOLDER_RETAILER_STARTER` | B2B Starter price ID |
| `convex/subscriptions.ts` | 73 | `price_PLACEHOLDER_RETAILER_GROWTH` | B2B Growth price ID |
| `convex/subscriptions.ts` | 86 | `price_PLACEHOLDER_RETAILER_ENTERPRISE` | B2B Enterprise price ID |

### ⚠️ Price Mismatch Warning

The `subscriptions.ts` file has **incorrect prices** that need updating:

| Tier | Current Code | Correct Price |
|------|--------------|---------------|
| `RETAILER_TIERS.starter` | $49/mo (4900 cents) | **$499/mo (49900 cents)** |
| `RETAILER_TIERS.growth` | $149/mo (14900 cents) | **$799/mo (79900 cents)** |
| `RETAILER_TIERS.enterprise` | $499/mo (49900 cents) | **Custom pricing** |

Update `convex/subscriptions.ts` lines 55-87 to match B2B pricing page.

---

## Step 3: Configure Environment Variables

Add to Convex environment variables (Dashboard → Settings → Environment Variables):

```bash
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxx   # or sk_test_... for testing
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx  # from webhook setup below
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxx  # for frontend (optional)
```

**Test Mode:** Use `sk_test_` keys during development.
**Live Mode:** Switch to `sk_live_` keys for production.

---

## Step 4: Configure Stripe Webhooks

### Create Webhook Endpoint

1. Go to Stripe Dashboard → Developers → Webhooks
2. Click "Add endpoint"
3. **Endpoint URL:** `https://quick-weasel-225.convex.site/stripe/webhook`
4. **Events to send:**
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
   - `invoice.payment_succeeded`
   - `customer.created`

5. After creating, click "Reveal" under Signing secret and copy to `STRIPE_WEBHOOK_SECRET`

### Webhook Events Explained

| Event | When Fired | Our Action |
|-------|------------|------------|
| `checkout.session.completed` | Customer completes payment | Create/upgrade subscription |
| `customer.subscription.created` | New subscription starts | Record subscription details |
| `customer.subscription.updated` | Plan change, renewal | Update tier/period |
| `customer.subscription.deleted` | Subscription canceled | Downgrade to free |
| `invoice.payment_failed` | Payment declined | Mark as past_due, send alert |
| `invoice.payment_succeeded` | Renewal payment works | Update period end date |

---

## Step 5: Enable Customer Portal

1. Go to Stripe Dashboard → Settings → Billing → Customer portal
2. Enable the following:
   - ✅ Cancel subscriptions
   - ✅ Update payment methods
   - ✅ View invoice history
   - ✅ Update billing information
3. Customize branding (optional)
4. Save configuration

---

## Step 6: Testing with Stripe CLI

### Install Stripe CLI
```bash
# macOS
brew install stripe/stripe-cli/stripe

# Linux
curl -s https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg
echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" | sudo tee -a /etc/apt/sources.list.d/stripe.list
sudo apt update && sudo apt install stripe
```

### Login and Forward Webhooks
```bash
# Login to Stripe
stripe login

# Forward webhooks to local/dev
stripe listen --forward-to localhost:3000/stripe/webhook

# Or to Convex
stripe listen --forward-to https://quick-weasel-225.convex.site/stripe/webhook
```

### Test Events
```bash
# Trigger test checkout completion
stripe trigger checkout.session.completed

# Trigger subscription created
stripe trigger customer.subscription.created

# Trigger payment failure
stripe trigger invoice.payment_failed
```

### Test Card Numbers

| Card Number | Scenario |
|-------------|----------|
| `4242 4242 4242 4242` | Successful payment |
| `4000 0000 0000 0002` | Card declined |
| `4000 0000 0000 3220` | 3D Secure required |
| `4000 0000 0000 9995` | Insufficient funds |

Use any future expiry date, any CVC, any billing ZIP.

---

## Step 7: Production Checklist

Before going live:

- [ ] Switch to live API keys (`sk_live_`, `pk_live_`)
- [ ] Create live webhook endpoint with same events
- [ ] Update `STRIPE_WEBHOOK_SECRET` with live signing secret
- [ ] Replace all `price_PLACEHOLDER_*` with real price IDs
- [ ] Test full checkout flow with real card (refund after)
- [ ] Verify webhook handling in Convex logs
- [ ] Enable Stripe Radar for fraud protection
- [ ] Set up tax collection if required (Stripe Tax)
- [ ] Configure receipt emails in Stripe settings

---

## Checkout Flow Reference

```
User clicks "Start Free Trial"
         │
         ▼
B2BPricingPage.tsx → onSelectPlan(tier)
         │
         ▼
POST /subscription/checkout
  { email, tier, successUrl, cancelUrl }
         │
         ▼
convex/stripe.ts → createCheckoutSession()
  - Validates tier
  - Logs checkout_started event
  - Creates Stripe checkout session
  - Returns { checkoutUrl, sessionId }
         │
         ▼
Redirect to Stripe Checkout
         │
         ▼
User completes payment
         │
         ▼
Stripe fires webhook: checkout.session.completed
         │
         ▼
POST /stripe/webhook → convex/stripe.ts → processWebhook()
  - Verifies signature
  - Extracts customer/subscription info
         │
         ▼
convex/subscriptions.ts → handleStripeWebhook()
  - Creates/updates subscription record
  - Logs payment event
         │
         ▼
User redirected to successUrl with subscription active
```

---

## Troubleshooting

### Webhook Not Receiving Events
1. Check endpoint URL is exactly `https://quick-weasel-225.convex.site/stripe/webhook`
2. Verify `STRIPE_WEBHOOK_SECRET` matches signing secret
3. Check Convex function logs for errors
4. Use Stripe CLI to test locally first

### Subscription Not Updating
1. Check `paymentEvents` table in Convex for logged events
2. Verify `subscriptions` table has correct email
3. Check webhook handler logs for errors
4. Ensure price ID maps to correct tier

### Customer Portal Issues
1. Verify `stripeCustomerId` is stored in subscription record
2. Check portal is enabled in Stripe settings
3. Ensure return URL is correct

---

## API Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/subscription/checkout` | POST | Create checkout session |
| `/subscription/portal` | POST | Create billing portal session |
| `/subscription/status` | GET | Get subscription status |
| `/pricing` | GET | Get pricing tiers |
| `/stripe/webhook` | POST | Receive Stripe events |

---

*Document created: 2026-02-19*
*Last updated: 2026-02-19*
