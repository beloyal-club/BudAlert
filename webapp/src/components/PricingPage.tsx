/**
 * PricingPage - Phase 6 Monetization
 * 
 * Displays pricing tiers and handles checkout flow
 */

import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";

interface PricingPageProps {
  email: string | null;
  onClose: () => void;
  onLogin: () => void;
}

const FEATURE_LIST = {
  free: [
    { text: "Track up to 3 products", included: true },
    { text: "Discord notifications", included: true },
    { text: "Basic restock alerts", included: true },
    { text: "SMS alerts", included: false },
    { text: "Priority notifications", included: false },
    { text: "Restock predictions", included: false },
    { text: "Data export", included: false },
  ],
  premium: [
    { text: "Unlimited product tracking", included: true },
    { text: "Discord notifications", included: true },
    { text: "Instant restock alerts", included: true },
    { text: "SMS alerts", included: true },
    { text: "Priority notifications", included: true },
    { text: "AI restock predictions", included: true },
    { text: "Data export (CSV)", included: true },
  ],
  pro: [
    { text: "Everything in Premium", included: true },
    { text: "API access", included: true },
    { text: "Webhook integrations", included: true },
    { text: "Historical data access", included: true },
    { text: "Custom alert rules", included: true },
    { text: "Priority support", included: true },
    { text: "Early feature access", included: true },
  ],
};

export function PricingPage({ email, onClose, onLogin }: PricingPageProps) {
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pricing = useQuery(api.subscriptions.getPricingTiers);
  const subscription = useQuery(
    api.subscriptions.getSubscription,
    email ? { email } : "skip"
  );
  const createCheckout = useAction(api.stripe.createCheckoutSession);

  const handleSelectTier = async (tierId: string) => {
    if (!email) {
      onLogin();
      return;
    }

    if (tierId === "free") {
      // Already on free or downgrading - handle separately
      return;
    }

    setSelectedTier(tierId);
    setIsLoading(true);
    setError(null);

    try {
      const result = await createCheckout({
        email,
        tier: tierId,
        successUrl: `${window.location.origin}/?checkout=success&tier=${tierId}`,
        cancelUrl: `${window.location.origin}/?checkout=canceled`,
      });

      // Redirect to Stripe checkout
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout");
      setIsLoading(false);
    }
  };

  const currentTier = subscription?.tier || "free";

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/95 overflow-y-auto">
      <div className="min-h-screen px-4 py-8">
        {/* Header */}
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-white">Upgrade Your Experience</h1>
              <p className="text-neutral-400 mt-1">
                Get more from CannaSignal with premium features
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Current Plan Badge */}
          {email && (
            <div className="mb-8 p-4 rounded-xl bg-neutral-900 border border-neutral-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-neutral-500">Current Plan</p>
                  <p className="text-lg font-semibold text-white capitalize flex items-center gap-2">
                    {currentTier}
                    {currentTier !== "free" && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-cannabis-600/20 text-cannabis-400">
                        Active
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-sm text-neutral-400">
                  {email}
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-900/20 border border-red-800 text-red-400">
              {error}
            </div>
          )}

          {/* Pricing Cards */}
          <div className="grid md:grid-cols-3 gap-6">
            {/* Free Tier */}
            <div className={`rounded-2xl p-6 border-2 transition-colors ${
              currentTier === "free" 
                ? "bg-neutral-800/50 border-cannabis-600" 
                : "bg-neutral-900 border-neutral-800 hover:border-neutral-700"
            }`}>
              <div className="mb-6">
                <h3 className="text-xl font-bold text-white">Free</h3>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-white">$0</span>
                  <span className="text-neutral-500">/month</span>
                </div>
                <p className="mt-2 text-sm text-neutral-400">
                  Perfect for casual users
                </p>
              </div>

              <ul className="space-y-3 mb-8">
                {FEATURE_LIST.free.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    {feature.included ? (
                      <span className="text-cannabis-400 mt-0.5">✓</span>
                    ) : (
                      <span className="text-neutral-600 mt-0.5">✗</span>
                    )}
                    <span className={feature.included ? "text-neutral-300" : "text-neutral-600"}>
                      {feature.text}
                    </span>
                  </li>
                ))}
              </ul>

              <button
                disabled={currentTier === "free"}
                className={`w-full py-3 rounded-xl font-medium transition-colors ${
                  currentTier === "free"
                    ? "bg-neutral-700 text-neutral-400 cursor-not-allowed"
                    : "bg-neutral-800 text-white hover:bg-neutral-700"
                }`}
              >
                {currentTier === "free" ? "Current Plan" : "Downgrade"}
              </button>
            </div>

            {/* Premium Tier - Popular */}
            <div className={`rounded-2xl p-6 border-2 relative transition-colors ${
              currentTier === "premium"
                ? "bg-cannabis-900/30 border-cannabis-500"
                : "bg-gradient-to-b from-cannabis-900/20 to-neutral-900 border-cannabis-600/50 hover:border-cannabis-500"
            }`}>
              {/* Popular Badge */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="px-3 py-1 rounded-full bg-cannabis-600 text-white text-xs font-semibold">
                  Most Popular
                </span>
              </div>

              <div className="mb-6 mt-2">
                <h3 className="text-xl font-bold text-white">Premium</h3>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-white">$7.99</span>
                  <span className="text-neutral-500">/month</span>
                </div>
                <p className="mt-2 text-sm text-neutral-400">
                  For serious deal hunters
                </p>
              </div>

              <ul className="space-y-3 mb-8">
                {FEATURE_LIST.premium.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-cannabis-400 mt-0.5">✓</span>
                    <span className="text-neutral-300">{feature.text}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSelectTier("premium")}
                disabled={currentTier === "premium" || isLoading}
                className={`w-full py-3 rounded-xl font-medium transition-colors ${
                  currentTier === "premium"
                    ? "bg-cannabis-700 text-cannabis-200 cursor-not-allowed"
                    : isLoading && selectedTier === "premium"
                    ? "bg-cannabis-700 text-white animate-pulse"
                    : "bg-cannabis-600 text-white hover:bg-cannabis-500"
                }`}
              >
                {currentTier === "premium"
                  ? "Current Plan"
                  : isLoading && selectedTier === "premium"
                  ? "Loading..."
                  : "Upgrade to Premium"}
              </button>
            </div>

            {/* Pro Tier */}
            <div className={`rounded-2xl p-6 border-2 transition-colors ${
              currentTier === "pro"
                ? "bg-purple-900/30 border-purple-500"
                : "bg-neutral-900 border-neutral-800 hover:border-purple-600/50"
            }`}>
              <div className="mb-6">
                <h3 className="text-xl font-bold text-white">Pro</h3>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-white">$14.99</span>
                  <span className="text-neutral-500">/month</span>
                </div>
                <p className="mt-2 text-sm text-neutral-400">
                  For power users & developers
                </p>
              </div>

              <ul className="space-y-3 mb-8">
                {FEATURE_LIST.pro.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-purple-400 mt-0.5">✓</span>
                    <span className="text-neutral-300">{feature.text}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSelectTier("pro")}
                disabled={currentTier === "pro" || isLoading}
                className={`w-full py-3 rounded-xl font-medium transition-colors ${
                  currentTier === "pro"
                    ? "bg-purple-700 text-purple-200 cursor-not-allowed"
                    : isLoading && selectedTier === "pro"
                    ? "bg-purple-700 text-white animate-pulse"
                    : "bg-purple-600 text-white hover:bg-purple-500"
                }`}
              >
                {currentTier === "pro"
                  ? "Current Plan"
                  : isLoading && selectedTier === "pro"
                  ? "Loading..."
                  : "Upgrade to Pro"}
              </button>
            </div>
          </div>

          {/* Retailer CTA */}
          <div className="mt-12 p-6 rounded-2xl bg-gradient-to-r from-amber-900/20 to-orange-900/20 border border-amber-700/30">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span>🏪</span>
                  Are you a dispensary?
                </h3>
                <p className="text-neutral-400 text-sm mt-1">
                  Get competitive pricing intel, demand signals, and stock alerts for your business.
                </p>
              </div>
              <button
                onClick={() => window.open("mailto:dispensary@cannasignal.com?subject=Retailer Dashboard Interest", "_blank")}
                className="px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium whitespace-nowrap"
              >
                Contact Sales
              </button>
            </div>
          </div>

          {/* FAQ */}
          <div className="mt-12">
            <h2 className="text-xl font-bold text-white mb-6">Frequently Asked Questions</h2>
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800">
                <h4 className="font-medium text-white">Can I cancel anytime?</h4>
                <p className="text-sm text-neutral-400 mt-1">
                  Yes! Cancel anytime from your account. You'll keep premium features until the end of your billing period.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800">
                <h4 className="font-medium text-white">What payment methods do you accept?</h4>
                <p className="text-sm text-neutral-400 mt-1">
                  We accept all major credit cards via Stripe. Apple Pay and Google Pay are also supported.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800">
                <h4 className="font-medium text-white">How do restock predictions work?</h4>
                <p className="text-sm text-neutral-400 mt-1">
                  Our AI analyzes historical inventory patterns to predict when products are likely to restock. Premium users get notified before the rush.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
