/**
 * OnboardingWizard - Multi-step dispensary signup flow
 * 
 * Steps:
 * 1. Welcome / Sign Up - Dispensary name, email
 * 2. Select Your Store - Choose from NYC dispensaries or add new
 * 3. Select Competitors - Radius-based competitor selection
 * 4. Choose Plan - Pricing tiers
 * 5. Confirmation - Summary and dashboard link
 */

import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { RadiusCompetitorSelector, type NearbyCompetitor, type Coordinates } from "./RadiusCompetitorSelector";

// ============================================
// TYPES
// ============================================

type OnboardingStep = 1 | 2 | 3 | 4 | 5;

interface OnboardingData {
  // Step 1: Account Info
  dispensaryName: string;
  contactEmail: string;
  
  // Step 2: Store Selection
  selectedRetailerId: Id<"retailers"> | null;
  isNewStore: boolean;
  newStoreData: {
    name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
  };
  
  // Step 3: Competitors
  competitorIds: string[];
  radiusMiles: number;
  
  // Step 4: Plan
  selectedPlan: "starter" | "growth" | "enterprise";
  billingCycle: "monthly" | "annual";
}

interface OnboardingWizardProps {
  onComplete: (accountId: Id<"retailerAccounts">) => void;
  onBack?: () => void;
}

// ============================================
// PRICING DATA
// ============================================

const PLANS = [
  {
    id: "starter" as const,
    name: "Starter",
    price: 499,
    description: "For single-location dispensaries getting started",
    competitorLimit: 10,
    features: [
      "Track up to 10 competitors",
      "Real-time inventory alerts",
      "Price change notifications",
      "Stock-out opportunity alerts",
      "Weekly market digest",
      "1 team member",
    ],
    highlight: false,
  },
  {
    id: "growth" as const,
    name: "Growth",
    price: 799,
    description: "For multi-location or aggressive growth-focused dispensaries",
    competitorLimit: 25,
    features: [
      "Track up to 25 competitors",
      "Everything in Starter, plus:",
      "Daily market digest",
      "SMS notifications",
      "Category-level analytics",
      "Demand signals (consumer data)",
      "Custom alert rules",
      "API access",
      "5 team members",
    ],
    highlight: true,
  },
  {
    id: "enterprise" as const,
    name: "Enterprise",
    price: null,
    description: "For MSOs and large retail operations",
    competitorLimit: Infinity,
    features: [
      "Unlimited competitor tracking",
      "Everything in Growth, plus:",
      "Multi-location dashboards",
      "White-label reports",
      "Historical data export",
      "Custom integrations",
      "Dedicated account manager",
      "Unlimited team members",
    ],
    highlight: false,
  },
];

// ============================================
// NYC RETAILER DATA (static for demo)
// ============================================

const NYC_RETAILERS = [
  { slug: "conbud-les", name: "CONBUD LES", address: "88 E Houston St", city: "New York", region: "manhattan", lat: 40.7246, lng: -73.9927 },
  { slug: "conbud-bronx", name: "CONBUD Bronx", address: "", city: "Bronx", region: "bronx", lat: 40.8448, lng: -73.8648 },
  { slug: "gotham-bowery", name: "Gotham Bowery", address: "3 E 3rd St", city: "New York", region: "manhattan", lat: 40.7255, lng: -73.9920 },
  { slug: "gotham-williamsburg", name: "Gotham Williamsburg", address: "300 Kent Ave", city: "Brooklyn", region: "brooklyn", lat: 40.7186, lng: -73.9618 },
  { slug: "gotham-chelsea", name: "Gotham Chelsea", address: "146 10th Ave", city: "New York", region: "manhattan", lat: 40.7455, lng: -74.0063 },
  { slug: "housing-works-cannabis", name: "Housing Works Cannabis", address: "750 Broadway", city: "New York", region: "manhattan", lat: 40.7308, lng: -73.9917 },
  { slug: "travel-agency-union-square", name: "Travel Agency Union Square", address: "835 Broadway", city: "New York", region: "manhattan", lat: 40.7340, lng: -73.9904 },
  { slug: "dagmar-soho", name: "Dagmar Cannabis SoHo", address: "412 W Broadway", city: "New York", region: "manhattan", lat: 40.7246, lng: -74.0002 },
  { slug: "smacked-village", name: "Smacked Village", address: "144 Bleecker St", city: "New York", region: "manhattan", lat: 40.7292, lng: -73.9995 },
  { slug: "strain-stars-harlem", name: "Strain Stars Harlem", address: "2150 Frederick Douglass Blvd", city: "New York", region: "manhattan", lat: 40.8040, lng: -73.9550 },
  { slug: "the-cannabis-place", name: "The Cannabis Place", address: "123 W 14th St", city: "New York", region: "manhattan", lat: 40.7383, lng: -73.9978 },
  { slug: "medmen-5th-ave", name: "MedMen 5th Ave", address: "433 5th Ave", city: "New York", region: "manhattan", lat: 40.7513, lng: -73.9817 },
];

// ============================================
// UTILITY FUNCTIONS
// ============================================

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(miles: number): string {
  if (miles < 0.1) return "< 0.1 mi";
  return `${miles.toFixed(1)} mi`;
}

// ============================================
// MAIN COMPONENT
// ============================================

export function OnboardingWizard({ onComplete, onBack }: OnboardingWizardProps) {
  const [step, setStep] = useState<OnboardingStep>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<OnboardingData>({
    dispensaryName: "",
    contactEmail: "",
    selectedRetailerId: null,
    isNewStore: false,
    newStoreData: { name: "", address: "", city: "", state: "NY", zip: "" },
    competitorIds: [],
    radiusMiles: 2,
    selectedPlan: "growth",
    billingCycle: "monthly",
  });

  // Get the selected store info
  const selectedStore = useMemo(() => {
    if (data.isNewStore) {
      return {
        name: data.newStoreData.name || data.dispensaryName,
        coordinates: { lat: 40.7128, lng: -74.006 } as Coordinates, // Default NYC coords
        address: data.newStoreData.address,
        city: data.newStoreData.city,
      };
    }
    const store = NYC_RETAILERS.find(r => r.slug === data.selectedRetailerId);
    if (store) {
      return {
        name: store.name,
        coordinates: { lat: store.lat, lng: store.lng },
        address: store.address,
        city: store.city,
      };
    }
    return null;
  }, [data.selectedRetailerId, data.isNewStore, data.newStoreData, data.dispensaryName]);

  // Get nearby competitors
  const nearbyCompetitors = useMemo((): NearbyCompetitor[] => {
    if (!selectedStore) return [];
    
    return NYC_RETAILERS
      .filter(r => r.slug !== data.selectedRetailerId)
      .map(r => {
        const distanceMiles = calculateDistance(
          selectedStore.coordinates.lat,
          selectedStore.coordinates.lng,
          r.lat,
          r.lng
        );
        return {
          id: r.slug,
          name: r.name,
          slug: r.slug,
          address: {
            street: r.address,
            city: r.city,
            state: "NY",
          },
          region: r.region,
          coordinates: { lat: r.lat, lng: r.lng },
          distanceMiles,
          distanceFormatted: formatDistance(distanceMiles),
          isMonitored: data.competitorIds.includes(r.slug),
          lastUpdated: Date.now() - Math.random() * 3600000,
        };
      })
      .filter(c => c.distanceMiles <= data.radiusMiles)
      .sort((a, b) => a.distanceMiles - b.distanceMiles);
  }, [selectedStore, data.selectedRetailerId, data.radiusMiles, data.competitorIds]);

  const updateData = <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => {
    setData(prev => ({ ...prev, [key]: value }));
    setError(null);
  };

  const validateStep = (): boolean => {
    switch (step) {
      case 1:
        if (!data.dispensaryName.trim()) {
          setError("Please enter your dispensary name");
          return false;
        }
        if (!data.contactEmail.trim() || !data.contactEmail.includes("@")) {
          setError("Please enter a valid email address");
          return false;
        }
        return true;
      case 2:
        if (!data.isNewStore && !data.selectedRetailerId) {
          setError("Please select your store or add a new one");
          return false;
        }
        if (data.isNewStore && !data.newStoreData.name.trim()) {
          setError("Please enter your store name");
          return false;
        }
        return true;
      case 3:
        // Competitors are optional
        return true;
      case 4:
        if (!data.selectedPlan) {
          setError("Please select a plan");
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const nextStep = () => {
    if (validateStep()) {
      setStep(prev => Math.min(prev + 1, 5) as OnboardingStep);
    }
  };

  const prevStep = () => {
    setStep(prev => Math.max(prev - 1, 1) as OnboardingStep);
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Simulate API call - in production, call Convex mutations
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mock account ID for now
      const mockAccountId = "demo-account" as unknown as Id<"retailerAccounts">;
      onComplete(mockAccountId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsSubmitting(false);
    }
  };

  const getPlanLimit = () => {
    const plan = PLANS.find(p => p.id === data.selectedPlan);
    return plan?.competitorLimit ?? 10;
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Header */}
      <header className="border-b border-neutral-800">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🌿</span>
              <span className="text-xl font-bold text-cannabis-400">CannaSignal</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-600/20 text-amber-400 font-medium">
                for Business
              </span>
            </div>
            {onBack && (
              <button
                onClick={onBack}
                className="text-sm text-neutral-400 hover:text-white"
              >
                ← Back to home
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="border-b border-neutral-800">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
                    s === step
                      ? "bg-cannabis-600 text-white"
                      : s < step
                      ? "bg-cannabis-600/30 text-cannabis-400"
                      : "bg-neutral-800 text-neutral-500"
                  }`}
                >
                  {s < step ? "✓" : s}
                </div>
                {s < 5 && (
                  <div
                    className={`w-12 md:w-20 h-1 mx-2 rounded ${
                      s < step ? "bg-cannabis-600/50" : "bg-neutral-800"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-neutral-500">
            <span className={step === 1 ? "text-cannabis-400" : ""}>Sign Up</span>
            <span className={step === 2 ? "text-cannabis-400" : ""}>Your Store</span>
            <span className={step === 3 ? "text-cannabis-400" : ""}>Competitors</span>
            <span className={step === 4 ? "text-cannabis-400" : ""}>Plan</span>
            <span className={step === 5 ? "text-cannabis-400" : ""}>Confirm</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-900/20 border border-red-700/50 text-red-400">
            <p className="flex items-center gap-2">
              <span>⚠️</span>
              {error}
            </p>
          </div>
        )}

        {/* Step 1: Welcome / Sign Up */}
        {step === 1 && (
          <div className="space-y-8">
            <div className="text-center">
              <h1 className="text-3xl font-bold mb-4">
                Welcome to CannaSignal for Business
              </h1>
              <p className="text-lg text-neutral-400 max-w-xl mx-auto">
                Get competitive intelligence that helps you stock smarter, price better,
                and capture more sales.
              </p>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Dispensary Name
                </label>
                <input
                  type="text"
                  value={data.dispensaryName}
                  onChange={(e) => updateData("dispensaryName", e.target.value)}
                  placeholder="e.g., Green Leaf Cannabis"
                  className="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-cannabis-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={data.contactEmail}
                  onChange={(e) => updateData("contactEmail", e.target.value)}
                  placeholder="you@dispensary.com"
                  className="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-cannabis-500 focus:border-transparent"
                />
                <p className="text-xs text-neutral-500 mt-2">
                  We'll use this to send alerts and account notifications
                </p>
              </div>
            </div>

            <div className="bg-gradient-to-r from-cannabis-900/30 to-cannabis-800/20 border border-cannabis-700/30 rounded-xl p-6">
              <h3 className="font-semibold text-cannabis-400 mb-3">
                What you'll get with CannaSignal:
              </h3>
              <ul className="grid md:grid-cols-2 gap-3 text-sm text-neutral-300">
                <li className="flex items-center gap-2">
                  <span className="text-cannabis-400">✓</span>
                  Real-time competitor inventory tracking
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-cannabis-400">✓</span>
                  Price intelligence & alerts
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-cannabis-400">✓</span>
                  Stock-out opportunity detection
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-cannabis-400">✓</span>
                  Market trends & demand signals
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Step 2: Select Your Store */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Select Your Store</h2>
              <p className="text-neutral-400">
                Choose your dispensary from our database or add a new location
              </p>
            </div>

            {!data.isNewStore ? (
              <div className="space-y-4">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search NYC dispensaries..."
                    className="w-full px-4 py-3 pl-10 rounded-xl bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-cannabis-500"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
                    🔍
                  </span>
                </div>

                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {NYC_RETAILERS.map((retailer) => (
                    <button
                      key={retailer.slug}
                      onClick={() => updateData("selectedRetailerId", retailer.slug as any)}
                      className={`w-full p-4 rounded-xl text-left transition-colors ${
                        data.selectedRetailerId === retailer.slug
                          ? "bg-cannabis-900/50 border-2 border-cannabis-500"
                          : "bg-neutral-900 border border-neutral-800 hover:border-neutral-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-white">{retailer.name}</h3>
                          <p className="text-sm text-neutral-400">
                            {retailer.address && `${retailer.address}, `}
                            {retailer.city}
                            <span className="mx-2">•</span>
                            <span className="capitalize">{retailer.region}</span>
                          </p>
                        </div>
                        {data.selectedRetailerId === retailer.slug && (
                          <span className="text-cannabis-400 text-xl">✓</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => updateData("isNewStore", true)}
                  className="w-full p-4 rounded-xl border-2 border-dashed border-neutral-700 hover:border-cannabis-600 text-neutral-400 hover:text-cannabis-400 transition-colors"
                >
                  <span className="text-xl mr-2">+</span>
                  My store isn't listed — Add new store
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <button
                  onClick={() => updateData("isNewStore", false)}
                  className="text-sm text-cannabis-400 hover:text-cannabis-300"
                >
                  ← Back to store list
                </button>

                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-4">
                  <h3 className="font-semibold text-white">Add Your Store</h3>
                  
                  <div>
                    <label className="block text-sm text-neutral-400 mb-1">Store Name</label>
                    <input
                      type="text"
                      value={data.newStoreData.name}
                      onChange={(e) => updateData("newStoreData", { ...data.newStoreData, name: e.target.value })}
                      placeholder="e.g., Green Leaf Cannabis"
                      className="w-full px-4 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-cannabis-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-400 mb-1">Street Address</label>
                    <input
                      type="text"
                      value={data.newStoreData.address}
                      onChange={(e) => updateData("newStoreData", { ...data.newStoreData, address: e.target.value })}
                      placeholder="123 Main St"
                      className="w-full px-4 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-cannabis-500"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2">
                      <label className="block text-sm text-neutral-400 mb-1">City</label>
                      <input
                        type="text"
                        value={data.newStoreData.city}
                        onChange={(e) => updateData("newStoreData", { ...data.newStoreData, city: e.target.value })}
                        placeholder="New York"
                        className="w-full px-4 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-cannabis-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-neutral-400 mb-1">ZIP</label>
                      <input
                        type="text"
                        value={data.newStoreData.zip}
                        onChange={(e) => updateData("newStoreData", { ...data.newStoreData, zip: e.target.value })}
                        placeholder="10001"
                        className="w-full px-4 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-cannabis-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Selected store confirmation */}
            {selectedStore && (
              <div className="p-4 rounded-xl bg-cannabis-900/20 border border-cannabis-700/30">
                <p className="text-sm text-cannabis-400 flex items-center gap-2">
                  <span>✓</span>
                  <span>
                    <strong>{selectedStore.name}</strong> selected
                    {selectedStore.address && ` — ${selectedStore.address}, ${selectedStore.city}`}
                  </span>
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Select Competitors */}
        {step === 3 && selectedStore && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Select Competitors to Monitor</h2>
              <p className="text-neutral-400">
                Choose which nearby dispensaries you want to track. You can always add or remove competitors later.
              </p>
            </div>

            <RadiusCompetitorSelector
              anchor={{
                name: selectedStore.name,
                coordinates: selectedStore.coordinates,
              }}
              competitors={nearbyCompetitors}
              radiusMiles={data.radiusMiles}
              onRadiusChange={(r) => updateData("radiusMiles", r)}
              onAddCompetitor={(id) => updateData("competitorIds", [...data.competitorIds, id])}
              onRemoveCompetitor={(id) => updateData("competitorIds", data.competitorIds.filter(c => c !== id))}
              onAddAllInRadius={() => {
                const ids = nearbyCompetitors
                  .filter(c => !c.isMonitored)
                  .slice(0, getPlanLimit() - data.competitorIds.length)
                  .map(c => c.id);
                updateData("competitorIds", [...data.competitorIds, ...ids]);
              }}
              planLimit={getPlanLimit()}
              currentCount={data.competitorIds.length}
              isLoading={false}
            />

            {data.competitorIds.length === 0 && (
              <div className="p-4 rounded-xl bg-amber-900/20 border border-amber-700/30 text-amber-400 text-sm">
                <p>
                  <strong>💡 Tip:</strong> Select at least a few competitors to get the most value from CannaSignal.
                  You can skip this step and add them later if you prefer.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Choose Plan */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Choose Your Plan</h2>
              <p className="text-neutral-400">
                All plans include a 14-day free trial. No credit card required.
              </p>
            </div>

            {/* Billing Toggle */}
            <div className="flex justify-center">
              <div className="inline-flex items-center gap-4 p-1 rounded-full bg-neutral-800">
                <button
                  onClick={() => updateData("billingCycle", "monthly")}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    data.billingCycle === "monthly"
                      ? "bg-cannabis-600 text-white"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => updateData("billingCycle", "annual")}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${
                    data.billingCycle === "annual"
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

            {/* Plan Cards */}
            <div className="grid md:grid-cols-3 gap-4">
              {PLANS.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => updateData("selectedPlan", plan.id)}
                  className={`relative p-6 rounded-2xl text-left transition-all ${
                    data.selectedPlan === plan.id
                      ? "bg-cannabis-900/30 border-2 border-cannabis-500 ring-2 ring-cannabis-500/20"
                      : plan.highlight
                      ? "bg-cannabis-900/20 border-2 border-cannabis-600/50 hover:border-cannabis-500"
                      : "bg-neutral-900 border-2 border-neutral-800 hover:border-neutral-700"
                  }`}
                >
                  {plan.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="px-3 py-1 rounded-full bg-cannabis-600 text-white text-xs font-semibold">
                        Most Popular
                      </span>
                    </div>
                  )}

                  <div className="mb-4 mt-2">
                    <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                    {plan.price ? (
                      <div className="mt-1">
                        <span className="text-3xl font-bold text-white">
                          ${data.billingCycle === "annual" ? Math.round(plan.price * 10) : plan.price}
                        </span>
                        <span className="text-neutral-500">
                          /{data.billingCycle === "annual" ? "year" : "month"}
                        </span>
                      </div>
                    ) : (
                      <p className="text-2xl font-bold text-white mt-1">Custom</p>
                    )}
                    <p className="text-sm text-neutral-400 mt-2">{plan.description}</p>
                  </div>

                  <ul className="space-y-2">
                    {plan.features.slice(0, 5).map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-neutral-300">
                        <span className="text-cannabis-400 mt-0.5">✓</span>
                        {feature}
                      </li>
                    ))}
                    {plan.features.length > 5 && (
                      <li className="text-xs text-neutral-500">
                        +{plan.features.length - 5} more features
                      </li>
                    )}
                  </ul>

                  {data.selectedPlan === plan.id && (
                    <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-cannabis-500 flex items-center justify-center">
                      <span className="text-white text-sm">✓</span>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Competitor count warning */}
            {data.competitorIds.length > getPlanLimit() && (
              <div className="p-4 rounded-xl bg-amber-900/20 border border-amber-700/30 text-amber-400 text-sm">
                <p>
                  <strong>⚠️ Note:</strong> You selected {data.competitorIds.length} competitors, but the{" "}
                  {data.selectedPlan} plan only includes {getPlanLimit()}. Upgrade your plan or remove some competitors.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 5: Confirmation */}
        {step === 5 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-3xl font-bold mb-2">You're All Set!</h2>
              <p className="text-neutral-400">
                Review your selections and start your free trial
              </p>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-6">
              {/* Account Summary */}
              <div>
                <h3 className="text-sm text-neutral-500 uppercase tracking-wide mb-3">Account</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Dispensary</span>
                    <span className="text-white font-medium">{data.dispensaryName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Email</span>
                    <span className="text-white">{data.contactEmail}</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-neutral-800" />

              {/* Store Summary */}
              <div>
                <h3 className="text-sm text-neutral-500 uppercase tracking-wide mb-3">Your Store</h3>
                <p className="text-white font-medium">{selectedStore?.name}</p>
                {selectedStore?.address && (
                  <p className="text-neutral-400 text-sm">
                    {selectedStore.address}, {selectedStore.city}
                  </p>
                )}
              </div>

              <div className="border-t border-neutral-800" />

              {/* Competitors Summary */}
              <div>
                <h3 className="text-sm text-neutral-500 uppercase tracking-wide mb-3">
                  Competitors to Monitor
                </h3>
                {data.competitorIds.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {data.competitorIds.slice(0, 5).map(id => {
                      const comp = NYC_RETAILERS.find(r => r.slug === id);
                      return comp ? (
                        <span key={id} className="px-3 py-1 rounded-full bg-neutral-800 text-sm text-white">
                          {comp.name}
                        </span>
                      ) : null;
                    })}
                    {data.competitorIds.length > 5 && (
                      <span className="px-3 py-1 rounded-full bg-neutral-800 text-sm text-neutral-400">
                        +{data.competitorIds.length - 5} more
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-neutral-400 text-sm">
                    No competitors selected — you can add them later
                  </p>
                )}
              </div>

              <div className="border-t border-neutral-800" />

              {/* Plan Summary */}
              <div>
                <h3 className="text-sm text-neutral-500 uppercase tracking-wide mb-3">Plan</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium capitalize">{data.selectedPlan}</p>
                    <p className="text-neutral-400 text-sm">
                      {data.billingCycle === "annual" ? "Annual billing" : "Monthly billing"}
                    </p>
                  </div>
                  <div className="text-right">
                    {PLANS.find(p => p.id === data.selectedPlan)?.price ? (
                      <>
                        <p className="text-2xl font-bold text-cannabis-400">
                          ${data.billingCycle === "annual"
                            ? Math.round(PLANS.find(p => p.id === data.selectedPlan)!.price! * 10)
                            : PLANS.find(p => p.id === data.selectedPlan)!.price}
                        </p>
                        <p className="text-xs text-neutral-500">
                          /{data.billingCycle === "annual" ? "year" : "month"} after trial
                        </p>
                      </>
                    ) : (
                      <p className="text-xl font-bold text-cannabis-400">Custom pricing</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-cannabis-900/20 border border-cannabis-700/30">
              <p className="text-cannabis-400 text-sm text-center">
                <strong>🎁 14-day free trial</strong> — No credit card required to start
              </p>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-neutral-800">
          <button
            onClick={step === 1 ? onBack : prevStep}
            disabled={step === 1 && !onBack}
            className={`px-6 py-3 rounded-xl font-medium transition-colors ${
              step === 1 && !onBack
                ? "bg-neutral-800 text-neutral-600 cursor-not-allowed"
                : "bg-neutral-800 text-white hover:bg-neutral-700"
            }`}
          >
            {step === 1 ? "Cancel" : "← Back"}
          </button>

          {step < 5 ? (
            <button
              onClick={nextStep}
              className="px-8 py-3 rounded-xl bg-cannabis-600 hover:bg-cannabis-500 text-white font-semibold transition-colors"
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={handleComplete}
              disabled={isSubmitting}
              className={`px-8 py-3 rounded-xl font-semibold transition-colors ${
                isSubmitting
                  ? "bg-neutral-700 text-neutral-400 cursor-not-allowed"
                  : "bg-cannabis-600 hover:bg-cannabis-500 text-white"
              }`}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">⏳</span>
                  Creating account...
                </span>
              ) : (
                "Start Free Trial 🚀"
              )}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

export default OnboardingWizard;
