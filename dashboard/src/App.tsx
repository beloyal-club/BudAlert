import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Overview } from "./pages/Overview";
import { Brands } from "./pages/Brands";
import { Retailers } from "./pages/Retailers";
import { Analytics } from "./pages/Analytics";
import { LiveIndicator } from "./components/LiveIndicator";
import { MobileNav } from "./components/MobileNav";

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL;
const isLiveMode = !!CONVEX_URL;

// Only create client if URL is available
const convex = CONVEX_URL ? new ConvexReactClient(CONVEX_URL) : null;

function ConnectionBadge() {
  // In live mode, we use the LiveIndicator component for real-time status
  if (isLiveMode) {
    return (
      <span className="ml-2 sm:ml-3">
        <LiveIndicator />
      </span>
    );
  }
  
  return (
    <span className="ml-2 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full font-medium bg-yellow-900 text-yellow-300 border border-yellow-700">
      ◌ DEMO
    </span>
  );
}

function Navigation() {
  return (
    <nav className="bg-gray-900 text-white sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-3 sm:px-4">
        <div className="flex items-center justify-between h-14 sm:h-16">
          <Link to="/" className="flex items-center text-lg sm:text-xl font-bold text-green-400">
            <span className="mr-1">🌿</span>
            <span className="hidden xs:inline">CannaSignal</span>
            <span className="xs:hidden">CS</span>
            <ConnectionBadge />
          </Link>
          <MobileNav />
        </div>
      </div>
    </nav>
  );
}

function DemoModeNotice() {
  return (
    <div className="bg-yellow-900/50 border border-yellow-700 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
      <h3 className="text-yellow-300 font-semibold text-sm sm:text-base">Demo Mode</h3>
      <p className="text-yellow-200/80 text-xs sm:text-sm mt-1">
        Running without a Convex connection. Set <code className="bg-yellow-900 px-1 rounded text-[10px] sm:text-xs">VITE_CONVEX_URL</code> to enable live data.
      </p>
    </div>
  );
}

function AppContent() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-950 text-white">
        <Navigation />
        <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
          {!isLiveMode && <DemoModeNotice />}
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/brands" element={<Brands />} />
            <Route path="/retailers" element={<Retailers />} />
            <Route path="/analytics" element={<Analytics />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

function App() {
  // If no Convex URL, render without provider (pages will show empty states)
  if (!convex) {
    return <AppContent />;
  }

  return (
    <ConvexProvider client={convex}>
      <AppContent />
    </ConvexProvider>
  );
}

export default App;
