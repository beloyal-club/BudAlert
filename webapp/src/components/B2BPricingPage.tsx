/**
 * B2BPricingPage - Business Pricing for CannaSignal
 * 
 * Price point: $500-1000/mo for retailers
 * Target: NYS dispensaries monitoring competitors
 */

import { useState } from "react";

interface B2BPricingPageProps {
  onSelectPlan: (plan: "starter" | "growth" | "enterprise") => void;
  onBack: () => void;
  currentPlan?: string | null;
}

const B2B_TIERS = [
  {
    id: "starter",
    name: "Starter",
    price: 499,
    period: "month",
    description: "For single-location dispensaries getting started with competitive intelligence",
    highlight: null,
    features: [
      { text: "Track up to 10 competitors", included: true },
      { text: "Real-time inventory alerts", included: true },
      { text: "Price change notifications", included: true },
      { text: "Stock-out opportunity alerts", included: true },
      { text: "Weekly market digest email", included: true },
      { text: "Email & Slack notifications", included: true },
      { text: "1 team member", included: true },
      { text: "Basic analytics dashboard", included: true },
      { text: "Category-level insights", included: false },
      { text: "Demand signals (consumer data)", included: false },
      { text: "Custom alert rules", included: false },
      { text: "API access", included: false },
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: 799,
    period: "month",
    description: "For multi-location or aggressive growth-focused dispensaries",
    highlight: "Most Popular",
    features: [
      { text: "Track up to 25 competitors", included: true },
      { text: "Real-time inventory alerts", included: true },
      { text: "Price change notifications", included: true },
      { text: "Stock-out opportunity alerts", included: true },
      { text: "Daily market digest email", included: true },
      { text: "Email, Slack & SMS notifications", included: true },
      { text: "5 team members", included: true },
      { text: "Advanced analytics dashboard", included: true },
      { text: "Category-level price analytics", included: true },
      { text: "Demand signals (consumer interest data)", included: true },
      { text: "Custom alert rules", included: true },
      { text: "API access for POS integration", included: true },
      { text: "Priority support", included: true },
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: null, // Custom pricing
    period: null,
    description: "For MSOs and large retail operations with advanced needs",
    highlight: null,
    features: [
      { text: "Unlimited competitor tracking", included: true },
      { text: "Everything in Growth, plus:", included: true, isHeader: true },
      { text: "Multi-location dashboards", included: true },
      { text: "White-label reports", included: true },
      { text: "Historical data export (CSV/API)", included: true },
      { text: "Custom integrations", included: true },
      { text: "Dedicated account manager", included: true },
      { text: "Unlimited team members", included: true },
      { text: "SLA guarantee (99.9% uptime)", included: true },
      { text: "Quarterly business reviews", included: true },
      { text: "Early access to new features", included: true },
    ],
  },
];

const FAQ_ITEMS = [
  {
    q: "How does CannaSignal get competitor data?",
    a: "We monitor publicly available menu data from dispensary websites and platforms like Dutchie. Our automated systems check inventory every 15 minutes for freshness.",
  },
  {
    q: "What counts as a 'competitor' in my plan limit?",
    a: "Each dispensary location counts as one competitor. If a chain has 3 locations, that's 3 competitors. You can add or remove competitors anytime.",
  },
  {
    q: "Can I integrate with my POS system?",
    a: "Growth and Enterprise plans include API access. We have pre-built integrations for Treez, Dutchie POS, and Flowhub, or you can use our REST API for custom integrations.",
  },
  {
    q: "Is there a contract or can I cancel anytime?",
    a: "All plans are month-to-month with no long-term contract. Cancel anytime and keep access until the end of your billing period. Enterprise plans may have custom terms.",
  },
  {
    q: "What regions do you cover?",
    a: "We currently cover all licensed dispensaries in New York State. We're expanding to New Jersey and other markets soon—Enterprise customers get priority access to new markets.",
  },
  {
    q: "How are 'demand signals' different from inventory data?",
    a: "Demand signals come from our consumer-facing product tracker. When consumers watch a product for restocks, that interest data becomes a demand signal for your store—helping you stock what people actually want.",
  },
];

const ROI_EXAMPLES = [
  {
    scenario: "Competitor Price Match",
    description: "Catch a competitor's 15% price drop same-day instead of losing a week of sales",
    savings: "$2,500+",
    frequency: "/month",
  },
  {
    scenario: "Stock-Out Capture",
    description: "Run targeted promos when 3+ competitors run out of popular products",
    savings: "$5,000+",
    frequency: "/month",
  },
  {
    scenario: "New Product Timing",
    description: "Stock trending products 2 weeks before competitors notice the demand",
    savings: "$3,000+",
    frequency: "/quarter",
  },
];

export function B2BPricingPage({ onSelectPlan, onBack, currentPlan }: B2BPricingPageProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const getAnnualPrice = (monthly: number) => Math.round(monthly * 10); // 2 months free

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Header */}
      <header className="border-b border-neutral-800">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors"
            >
              <span>←</span>
              <span>Back</span>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🌿</span>
              <span className="text-xl font-bold text-cannabis-400">CannaSignal</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-600/20 text-amber-400 font-medium">
                for Business
              </span>
            </div>
            <div className="w-20"></div> {/* Spacer for centering */}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl font-bold mb-4">
            Competitive Intelligence for<br />
            <span className="text-cannabis-400">Winning Dispensaries</span>
          </h1>
          <p className="text-xl text-neutral-400 mb-8">
            Real-time inventory tracking, price intelligence, and market insights.<br />
            Start your 14-day free trial today.
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center gap-4 p-1 rounded-full bg-neutral-800 mb-12">
            <button
              onClick={() => setBillingCycle("monthly")}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                billingCycle === "monthly"
                  ? "bg-cannabis-600 text-white"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle("annual")}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${
                billingCycle === "annual"
                  ? "bg-cannabis-600 text-white"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Annual
              <span className="px-1.5 py-0.5 rounded text-xs bg-green-500/20 text-green-400">
                Save 17%
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            {B2B_TIERS.map((tier) => (
              <div
                key={tier.id}
                className={`relative rounded-2xl p-6 border-2 transition-colors ${
                  tier.highlight
                    ? "bg-cannabis-900/20 border-cannabis-600"
                    : currentPlan === tier.id
                    ? "bg-neutral-800/50 border-cannabis-500"
                    : "bg-neutral-900 border-neutral-800 hover:border-neutral-700"
                }`}
              >
                {tier.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 rounded-full bg-cannabis-600 text-white text-xs font-semibold">
                      {tier.highlight}
                    </span>
                  </div>
                )}

                <div className="mb-6 mt-2">
                  <h3 className="text-xl font-bold text-white">{tier.name}</h3>
                  <div className="mt-2">
                    {tier.price ? (
                      <>
                        <span className="text-4xl font-bold text-white">
                          ${billingCycle === "annual" ? getAnnualPrice(tier.price) : tier.price}
                        </span>
                        <span className="text-neutral-500">
                          /{billingCycle === "annual" ? "year" : "month"}
                        </span>
                        {billingCycle === "annual" && (
                          <p className="text-sm text-green-400 mt-1">
                            ${tier.price}/mo billed annually (2 months free)
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-3xl font-bold text-white">Custom</span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-neutral-400">{tier.description}</p>
                </div>

                <ul className="space-y-3 mb-8">
                  {tier.features.map((feature, i) => (
                    <li
                      key={i}
                      className={`flex items-start gap-2 text-sm ${
                        feature.isHeader ? "font-medium text-cannabis-400 mt-4" : ""
                      }`}
                    >
                      {!feature.isHeader && (
                        feature.included ? (
                          <span className="text-cannabis-400 mt-0.5">✓</span>
                        ) : (
                          <span className="text-neutral-600 mt-0.5">✗</span>
                        )
                      )}
                      <span className={feature.included || feature.isHeader ? "text-neutral-300" : "text-neutral-600"}>
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => onSelectPlan(tier.id as any)}
                  disabled={currentPlan === tier.id}
                  className={`w-full py-3 rounded-xl font-medium transition-colors ${
                    currentPlan === tier.id
                      ? "bg-neutral-700 text-neutral-400 cursor-not-allowed"
                      : tier.highlight
                      ? "bg-cannabis-600 text-white hover:bg-cannabis-500"
                      : tier.price
                      ? "bg-neutral-800 text-white hover:bg-neutral-700"
                      : "bg-amber-600 text-white hover:bg-amber-500"
                  }`}
                >
                  {currentPlan === tier.id
                    ? "Current Plan"
                    : tier.price
                    ? "Start Free Trial"
                    : "Contact Sales"}
                </button>
              </div>
            ))}
          </div>

          <p className="text-center text-neutral-500 text-sm mt-8">
            All plans include: Unlimited alert notifications • 15-minute data refresh • 24/7 monitoring
          </p>
        </div>
      </section>

      {/* ROI Section */}
      <section className="py-20 px-4 bg-neutral-900/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">
            The ROI Speaks for Itself
          </h2>
          <p className="text-neutral-400 text-center max-w-2xl mx-auto mb-12">
            Our customers regularly see returns that dwarf their subscription cost.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {ROI_EXAMPLES.map((example, i) => (
              <div
                key={i}
                className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center"
              >
                <h3 className="font-semibold text-white mb-2">{example.scenario}</h3>
                <p className="text-sm text-neutral-400 mb-4">{example.description}</p>
                <div className="text-3xl font-bold text-cannabis-400">
                  {example.savings}
                  <span className="text-sm text-neutral-500">{example.frequency}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 p-4 rounded-xl bg-cannabis-900/20 border border-cannabis-700/30 text-center">
            <p className="text-cannabis-400">
              <strong>Bottom line:</strong> One prevented lost sale or one captured competitor stock-out 
              pays for months of service.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            Frequently Asked Questions
          </h2>

          <div className="space-y-4">
            {FAQ_ITEMS.map((faq, i) => (
              <div
                key={i}
                className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-neutral-800/50 transition-colors"
                >
                  <h4 className="font-medium text-white">{faq.q}</h4>
                  <span className="text-neutral-500 text-xl">
                    {expandedFaq === i ? "−" : "+"}
                  </span>
                </button>
                {expandedFaq === i && (
                  <div className="px-4 pb-4">
                    <p className="text-neutral-400">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-b from-cannabis-900/20 to-neutral-950">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Outsmart Your Competition?
          </h2>
          <p className="text-xl text-neutral-400 mb-8">
            Start your 14-day free trial. No credit card required.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => onSelectPlan("growth")}
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-cannabis-600 hover:bg-cannabis-500 text-white font-semibold text-lg transition-colors"
            >
              Start Free Trial
            </button>
            <button
              onClick={() => window.open("mailto:sales@cannasignal.com", "_blank")}
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-lg transition-colors"
            >
              Talk to Sales
            </button>
          </div>
          
          <p className="text-sm text-neutral-500 mt-4">
            Questions? Email us at sales@cannasignal.com
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-neutral-800 py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">🌿</span>
              <span className="font-bold text-cannabis-400">CannaSignal</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-neutral-500">
              <a href="/privacy" className="hover:text-white transition-colors">Privacy</a>
              <a href="/terms" className="hover:text-white transition-colors">Terms</a>
              <a href="mailto:support@cannasignal.com" className="hover:text-white transition-colors">Support</a>
            </div>
            <p className="text-sm text-neutral-600">
              © 2025 CannaSignal
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default B2BPricingPage;
