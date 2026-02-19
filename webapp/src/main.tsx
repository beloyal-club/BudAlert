import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { B2BPricingPage } from "./components/B2BPricingPage";
import { B2BLandingPage } from "./components/B2BLandingPage";
import { B2BDashboard } from "./components/B2BDashboard";
import "./index.css";

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL || "https://quick-weasel-225.convex.cloud";
const convex = new ConvexReactClient(CONVEX_URL);

// Simple onboarding completion handler
function OnboardingPage() {
  return (
    <OnboardingWizard
      onComplete={(accountId) => {
        console.log("Account created:", accountId);
        window.location.href = "/dashboard";
      }}
      onBack={() => {
        window.location.href = "/business";
      }}
    />
  );
}

// B2B landing wrapper
function B2BLanding() {
  return (
    <B2BLandingPage
      onGetStarted={() => window.location.href = "/onboarding"}
      onLogin={() => window.location.href = "/dashboard"}
    />
  );
}

// Pricing wrapper
function PricingPageWrapper() {
  return (
    <B2BPricingPage
      onSelectPlan={(plan) => {
        // Store plan preference and go to onboarding
        sessionStorage.setItem("selectedPlan", plan);
        window.location.href = "/onboarding";
      }}
      onBack={() => window.location.href = "/business"}
    />
  );
}

// Dashboard wrapper (mock for now)
function DashboardPage() {
  return (
    <B2BDashboard
      retailerName="Demo Dispensary"
      email="demo@example.com"
      tier="growth"
      onLogout={() => window.location.href = "/"}
      onManageCompetitors={() => {}}
      onSettings={() => {}}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexProvider client={convex}>
      <BrowserRouter>
        <Routes>
          {/* Consumer app */}
          <Route path="/" element={<App />} />
          
          {/* B2B routes */}
          <Route path="/business" element={<B2BLanding />} />
          <Route path="/pricing" element={<PricingPageWrapper />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          
          {/* Redirects */}
          <Route path="/signup" element={<Navigate to="/onboarding" replace />} />
          <Route path="/b2b" element={<Navigate to="/business" replace />} />
        </Routes>
      </BrowserRouter>
    </ConvexProvider>
  </React.StrictMode>
);
