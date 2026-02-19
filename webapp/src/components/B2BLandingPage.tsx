/**
 * B2BLandingPage - CannaSignal for Dispensaries
 * 
 * Primary customer: Dispensaries monitoring competitor inventory
 * Price point: $500-1000/mo
 * MVP market: NYC, then expand
 */

import { useState } from "react";

interface B2BLandingPageProps {
  onGetStarted: () => void;
  onLogin: () => void;
}

const HERO_STATS = [
  { value: "238+", label: "NYS Dispensaries Tracked" },
  { value: "15min", label: "Data Refresh Rate" },
  { value: "10K+", label: "Products Monitored Daily" },
];

const VALUE_PROPS = [
  {
    icon: "🎯",
    title: "Know Before Your Customers Do",
    description: "Get instant alerts when competitors stock new products, drop prices, or run out of hot items.",
  },
  {
    icon: "📊",
    title: "Competitive Price Intelligence",
    description: "See real-time pricing across every competitor in your market. Never be the last to know about price drops.",
  },
  {
    icon: "🔥",
    title: "Spot Market Trends First",
    description: "Identify which strains and brands are gaining traction before they hit mainstream demand.",
  },
  {
    icon: "⚡",
    title: "Capitalize on Competitor Stock-Outs",
    description: "When competitors sell out of hot products, capture those customers with targeted campaigns.",
  },
];

const ALERT_EXAMPLES = [
  {
    type: "new_product",
    icon: "🆕",
    title: "New Product Alert",
    message: "Green Thumb Dispensary just stocked Alien Labs 'Krypto Chronic' that you don't carry",
    time: "2 minutes ago",
    action: "You could be first to market with this trending strain",
  },
  {
    type: "price_drop",
    icon: "📉",
    title: "Competitor Price Drop",
    message: "Housing Works dropped prices on all Jeeter products by 15%",
    time: "1 hour ago",
    action: "Consider matching or highlighting your value-adds",
  },
  {
    type: "stock_out",
    icon: "📦",
    title: "Competitor Stock-Out",
    message: "3 nearby competitors are out of stock on Cookies brand flower",
    time: "Just now",
    action: "Opportunity: Run a Cookies promo to capture their customers",
  },
  {
    type: "trending",
    icon: "📈",
    title: "Trending in Your Area",
    message: "Back Pack Boyz products up 340% in search volume this week",
    time: "Daily digest",
    action: "High demand signal — ensure your inventory meets it",
  },
];

const PRICING_TIERS = [
  {
    name: "Starter",
    price: "$499",
    period: "/month",
    description: "For single-location dispensaries",
    features: [
      "Track up to 10 competitors",
      "Real-time inventory alerts",
      "Price change notifications",
      "Stock-out opportunity alerts",
      "Weekly market digest",
      "Email + Slack notifications",
      "1 team member",
    ],
    cta: "Start Free Trial",
    popular: false,
  },
  {
    name: "Growth",
    price: "$799",
    period: "/month",
    description: "For growing retail operations",
    features: [
      "Track up to 25 competitors",
      "Everything in Starter, plus:",
      "Category-level price analytics",
      "Demand signals from consumer interest",
      "Custom alert rules",
      "API access for POS integration",
      "5 team members",
      "Priority support",
    ],
    cta: "Start Free Trial",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For multi-location operations",
    features: [
      "Unlimited competitor tracking",
      "Everything in Growth, plus:",
      "Multi-location dashboards",
      "White-label reports",
      "Historical data export",
      "Dedicated account manager",
      "Unlimited team members",
      "SLA guarantee",
    ],
    cta: "Contact Sales",
    popular: false,
  },
];

const TESTIMONIALS = [
  {
    quote: "We caught a competitor price drop in real-time and adjusted our promo same-day. That intel alone paid for a year's subscription.",
    author: "Operations Manager",
    company: "NYC Dispensary",
  },
  {
    quote: "The stock-out alerts are gold. When three competitors ran out of Cookies, we ran a flash sale and had our best Saturday ever.",
    author: "Store Manager",
    company: "Brooklyn Cannabis Retailer",
  },
];

export function B2BLandingPage({ onGetStarted, onLogin }: B2BLandingPageProps) {
  const [showDemo, setShowDemo] = useState(false);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-neutral-950/95 backdrop-blur-sm border-b border-neutral-800">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🌿</span>
              <span className="text-xl font-bold text-cannabis-400">CannaSignal</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-600/20 text-amber-400 font-medium">
                for Business
              </span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={onLogin}
                className="text-sm text-neutral-400 hover:text-white transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={onGetStarted}
                className="px-4 py-2 rounded-lg bg-cannabis-600 hover:bg-cannabis-500 text-white text-sm font-medium transition-colors"
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cannabis-900/30 border border-cannabis-700/30 text-cannabis-400 text-sm mb-8">
            <span>🏪</span>
            <span>Built for NYS Licensed Dispensaries</span>
          </div>
          
          <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-6">
            Know What Your Competitors<br />
            <span className="text-cannabis-400">Are Stocking</span><br />
            Before Your Customers Do
          </h1>
          
          <p className="text-xl text-neutral-400 max-w-2xl mx-auto mb-8">
            Real-time competitive intelligence for cannabis retailers. 
            Track competitor inventory, prices, and stock-outs across every dispensary in your market.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <button
              onClick={onGetStarted}
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-cannabis-600 hover:bg-cannabis-500 text-white font-semibold text-lg transition-colors"
            >
              Start 14-Day Free Trial
            </button>
            <button
              onClick={() => setShowDemo(true)}
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-lg transition-colors flex items-center justify-center gap-2"
            >
              <span>▶</span>
              <span>Watch Demo</span>
            </button>
          </div>
          
          {/* Trust Stats */}
          <div className="grid grid-cols-3 gap-8 max-w-lg mx-auto">
            {HERO_STATS.map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-2xl md:text-3xl font-bold text-white">{stat.value}</div>
                <div className="text-xs text-neutral-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section className="py-20 px-4 bg-neutral-900/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">
            Competitive Intelligence That Drives Revenue
          </h2>
          <p className="text-neutral-400 text-center max-w-2xl mx-auto mb-12">
            Stop guessing what your competitors are doing. Get real-time visibility into every move they make.
          </p>
          
          <div className="grid md:grid-cols-2 gap-8">
            {VALUE_PROPS.map((prop, i) => (
              <div 
                key={i}
                className="p-6 rounded-2xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition-colors"
              >
                <div className="text-4xl mb-4">{prop.icon}</div>
                <h3 className="text-xl font-semibold mb-2">{prop.title}</h3>
                <p className="text-neutral-400">{prop.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Alert Examples - Dashboard Preview */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">
            Actionable Alerts, Not Noise
          </h2>
          <p className="text-neutral-400 text-center max-w-2xl mx-auto mb-12">
            Every alert includes context and recommended actions. Here's what your dashboard might show:
          </p>
          
          <div className="space-y-4">
            {ALERT_EXAMPLES.map((alert, i) => (
              <div
                key={i}
                className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-cannabis-700/50 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="text-3xl">{alert.icon}</div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-cannabis-400">{alert.title}</span>
                      <span className="text-xs text-neutral-500">{alert.time}</span>
                    </div>
                    <p className="text-white mb-2">{alert.message}</p>
                    <p className="text-sm text-neutral-400 italic">💡 {alert.action}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <p className="text-center text-neutral-500 text-sm mt-8">
            Alerts delivered via Email, Slack, SMS, or Dashboard
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-4 bg-neutral-900/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-neutral-400 text-center max-w-2xl mx-auto mb-12">
            Start with a 14-day free trial. No credit card required.
          </p>
          
          <div className="grid md:grid-cols-3 gap-8">
            {PRICING_TIERS.map((tier, i) => (
              <div
                key={i}
                className={`relative rounded-2xl p-6 border-2 transition-colors ${
                  tier.popular
                    ? "bg-cannabis-900/20 border-cannabis-600"
                    : "bg-neutral-900 border-neutral-800 hover:border-neutral-700"
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 rounded-full bg-cannabis-600 text-white text-xs font-semibold">
                      Most Popular
                    </span>
                  </div>
                )}
                
                <div className="mb-6 mt-2">
                  <h3 className="text-xl font-bold text-white">{tier.name}</h3>
                  <div className="mt-2">
                    <span className="text-3xl font-bold text-white">{tier.price}</span>
                    <span className="text-neutral-500">{tier.period}</span>
                  </div>
                  <p className="mt-2 text-sm text-neutral-400">{tier.description}</p>
                </div>
                
                <ul className="space-y-3 mb-8">
                  {tier.features.map((feature, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm">
                      <span className="text-cannabis-400 mt-0.5">✓</span>
                      <span className="text-neutral-300">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <button
                  onClick={tier.name === "Enterprise" ? () => window.open("mailto:sales@cannasignal.com", "_blank") : onGetStarted}
                  className={`w-full py-3 rounded-xl font-medium transition-colors ${
                    tier.popular
                      ? "bg-cannabis-600 text-white hover:bg-cannabis-500"
                      : "bg-neutral-800 text-white hover:bg-neutral-700"
                  }`}
                >
                  {tier.cta}
                </button>
              </div>
            ))}
          </div>
          
          <p className="text-center text-neutral-500 text-sm mt-8">
            All plans include unlimited alert notifications and API access. Cancel anytime.
          </p>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            Trusted by NYS Dispensaries
          </h2>
          
          <div className="grid md:grid-cols-2 gap-8">
            {TESTIMONIALS.map((testimonial, i) => (
              <div
                key={i}
                className="p-6 rounded-2xl bg-neutral-900 border border-neutral-800"
              >
                <p className="text-lg text-neutral-300 mb-4 italic">
                  "{testimonial.quote}"
                </p>
                <div>
                  <p className="font-medium text-white">{testimonial.author}</p>
                  <p className="text-sm text-neutral-500">{testimonial.company}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-b from-cannabis-900/20 to-neutral-950">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">
            Stop Flying Blind
          </h2>
          <p className="text-xl text-neutral-400 mb-8">
            Join dispensaries using CannaSignal to stay ahead of the competition. 
            Start your free trial today.
          </p>
          
          <button
            onClick={onGetStarted}
            className="px-8 py-4 rounded-xl bg-cannabis-600 hover:bg-cannabis-500 text-white font-semibold text-lg transition-colors"
          >
            Start 14-Day Free Trial →
          </button>
          
          <p className="text-sm text-neutral-500 mt-4">
            No credit card required • Cancel anytime
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
              © 2025 CannaSignal. Real-time cannabis retail intelligence.
            </p>
          </div>
        </div>
      </footer>

      {/* Demo Modal (placeholder) */}
      {showDemo && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setShowDemo(false)}
        >
          <div 
            className="bg-neutral-900 rounded-2xl p-8 max-w-2xl w-full text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-2xl font-bold mb-4">Demo Coming Soon</h3>
            <p className="text-neutral-400 mb-6">
              We're putting together a product demo. In the meantime, start your free trial to explore the platform.
            </p>
            <button
              onClick={() => {
                setShowDemo(false);
                onGetStarted();
              }}
              className="px-6 py-3 rounded-xl bg-cannabis-600 hover:bg-cannabis-500 text-white font-medium"
            >
              Start Free Trial Instead
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
