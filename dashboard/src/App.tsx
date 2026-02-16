import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Overview } from "./pages/Overview";
import { Brands } from "./pages/Brands";
import { Retailers } from "./pages/Retailers";
import { Analytics } from "./pages/Analytics";

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL;
const isLiveMode = !!CONVEX_URL;

// Only create client if URL is available
const convex = CONVEX_URL ? new ConvexReactClient(CONVEX_URL) : null;

function ConnectionBadge() {
  return (
    <span
      className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${
        isLiveMode
          ? "bg-green-900 text-green-300 border border-green-700"
          : "bg-yellow-900 text-yellow-300 border border-yellow-700"
      }`}
    >
      {isLiveMode ? "● LIVE" : "◌ DEMO"}
    </span>
  );
}

function Navigation() {
  return (
    <nav className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center text-xl font-bold text-green-400">
            🌿 CannaSignal
            <ConnectionBadge />
          </Link>
          <div className="flex space-x-4">
            <Link to="/" className="hover:text-green-400 transition">
              Overview
            </Link>
            <Link to="/brands" className="hover:text-green-400 transition">
              Brands
            </Link>
            <Link to="/retailers" className="hover:text-green-400 transition">
              Retailers
            </Link>
            <Link to="/analytics" className="hover:text-green-400 transition">
              Analytics
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}

function DemoModeNotice() {
  return (
    <div className="bg-yellow-900/50 border border-yellow-700 rounded-lg p-4 mb-6">
      <h3 className="text-yellow-300 font-semibold">Demo Mode</h3>
      <p className="text-yellow-200/80 text-sm mt-1">
        Running without a Convex connection. Set <code className="bg-yellow-900 px-1 rounded">VITE_CONVEX_URL</code> in <code className="bg-yellow-900 px-1 rounded">.env.local</code> to enable live data.
      </p>
    </div>
  );
}

function AppContent() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-950 text-white">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 py-8">
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
