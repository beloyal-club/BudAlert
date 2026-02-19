/**
 * Stripe Integration - Phase 6
 * 
 * Checkout session creation and webhook handling
 */

import { action, internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// ============================================================
// STRIPE CONFIG
// ============================================================

// These would be set via environment variables in production
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_placeholder";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_placeholder";

// Price IDs - Replace with real Stripe price IDs when ready
const PRICE_IDS = {
  premium: "price_PLACEHOLDER_PREMIUM",
  pro: "price_PLACEHOLDER_PRO",
  retailer_starter: "price_PLACEHOLDER_RETAILER_STARTER",
  retailer_growth: "price_PLACEHOLDER_RETAILER_GROWTH",
  retailer_enterprise: "price_PLACEHOLDER_RETAILER_ENTERPRISE",
};

// ============================================================
// CHECKOUT SESSION
// ============================================================

export const createCheckoutSession = action({
  args: {
    email: v.string(),
    tier: v.string(),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    
    // Validate tier
    const priceId = PRICE_IDS[args.tier as keyof typeof PRICE_IDS];
    if (!priceId) {
      throw new Error(`Invalid tier: ${args.tier}`);
    }
    
    // In production, this would call Stripe API
    // For now, return a mock checkout URL for scaffolding
    
    /*
    // PRODUCTION CODE:
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
    
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      metadata: {
        email,
        tier: args.tier,
      },
    });
    
    return { checkoutUrl: session.url, sessionId: session.id };
    */
    
    // Log checkout started event
    await ctx.runMutation(internal.stripe.logCheckoutStarted, {
      email,
      tier: args.tier,
    });
    
    // SCAFFOLDING: Return mock URL
    return {
      checkoutUrl: `https://checkout.stripe.com/pay/mock_session_${Date.now()}?tier=${args.tier}`,
      sessionId: `cs_mock_${Date.now()}`,
      note: "SCAFFOLDING: Replace with real Stripe integration",
    };
  },
});

export const createPortalSession = action({
  args: {
    email: v.string(),
    returnUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    
    // In production, get Stripe customer ID and create portal session
    /*
    const subscription = await ctx.runQuery(api.subscriptions.getSubscription, { email });
    if (!subscription.stripeCustomerId) {
      throw new Error("No Stripe customer found");
    }
    
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: args.returnUrl,
    });
    
    return { portalUrl: session.url };
    */
    
    // SCAFFOLDING: Return mock URL
    return {
      portalUrl: `https://billing.stripe.com/portal/mock_${Date.now()}`,
      note: "SCAFFOLDING: Replace with real Stripe integration",
    };
  },
});

// ============================================================
// INTERNAL MUTATIONS
// ============================================================

export const logCheckoutStarted = internalMutation({
  args: {
    email: v.string(),
    tier: v.string(),
  },
  handler: async (ctx, args) => {
    // Log to paymentEvents
    await ctx.db.insert("paymentEvents", {
      email: args.email.toLowerCase().trim(),
      eventType: "checkout_started",
      tier: args.tier,
      createdAt: Date.now(),
    });
  },
});

// ============================================================
// WEBHOOK PROCESSING (called from http.ts)
// ============================================================

export const processWebhook = internalAction({
  args: {
    payload: v.string(),
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    // In production, verify signature and parse event
    /*
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
    
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        args.payload,
        args.signature,
        STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      throw new Error('Invalid webhook signature');
    }
    
    // Extract email and other data based on event type
    let email = '';
    let stripeCustomerId = '';
    let stripeSubscriptionId = '';
    let stripePriceId = '';
    let currentPeriodEnd = undefined;
    
    switch (event.type) {
      case 'checkout.session.completed':
        email = event.data.object.customer_email;
        stripeCustomerId = event.data.object.customer;
        stripeSubscriptionId = event.data.object.subscription;
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        stripeSubscriptionId = event.data.object.id;
        stripeCustomerId = event.data.object.customer;
        stripePriceId = event.data.object.items.data[0]?.price?.id;
        currentPeriodEnd = event.data.object.current_period_end * 1000;
        // Need to lookup email from customer
        const customer = await stripe.customers.retrieve(stripeCustomerId);
        email = customer.email;
        break;
      case 'invoice.payment_failed':
        stripeCustomerId = event.data.object.customer;
        // Lookup email
        const cust = await stripe.customers.retrieve(stripeCustomerId);
        email = cust.email;
        break;
    }
    
    if (email) {
      await ctx.runMutation(internal.subscriptions.handleStripeWebhook, {
        eventType: event.type,
        email,
        stripeCustomerId,
        stripeSubscriptionId,
        stripePriceId,
        currentPeriodEnd,
        stripeEventId: event.id,
      });
    }
    */
    
    console.log("Webhook received (scaffolding mode):", args.payload.slice(0, 100));
    return { received: true };
  },
});
