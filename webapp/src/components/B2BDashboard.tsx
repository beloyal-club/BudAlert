/**
 * B2BDashboard - Retailer Dashboard for CannaSignal
 * 
 * Core features for dispensary customers:
 * - Competitor inventory monitoring
 * - Price intelligence
 * - Stock-out opportunities
 * - Market trends
 * 
 * Price point: $500-1000/mo
 */

import { useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";

// Types for B2B dashboard
interface Competitor {
  id: string;
  name: string;
  distance: string;
  lastUpdated: string;
}

interface Alert {
  id: string;
  type: "new_product" | "price_drop" | "price_increase" | "stock_out" | "restock" | "trending";
  severity: "low" | "medium" | "high" | "critical";
  competitorId: string;
  competitorName: string;
  productName: string;
  brandName: string;
  message: string;
  actionHint: string;
  timestamp: number;
  isRead: boolean;
  data?: {
    priceOld?: number;
    priceNew?: number;
    changePercent?: number;
    category?: string;
  };
}

interface PriceComparison {
  productId: string;
  productName: string;
  brandName: string;
  category: string;
  yourPrice: number | null;
  marketLow: number;
  marketHigh: number;
  marketAvg: number;
  competitorPrices: {
    competitorName: string;
    price: number;
    inStock: boolean;
  }[];
}

interface MarketTrend {
  productName: string;
  brandName: string;
  category: string;
  searchVolume: number;
  volumeChange: number; // percentage change
  retailersCarrying: number;
  yourStore: "in_stock" | "out_of_stock" | "not_carried";
}

// Mock data for demonstration
const MOCK_COMPETITORS: Competitor[] = [
  { id: "1", name: "Green Thumb Cannabis", distance: "0.3 mi", lastUpdated: "5 min ago" },
  { id: "2", name: "Housing Works Cannabis", distance: "0.8 mi", lastUpdated: "12 min ago" },
  { id: "3", name: "Smacked Village", distance: "1.2 mi", lastUpdated: "8 min ago" },
  { id: "4", name: "The Cannabist", distance: "1.5 mi", lastUpdated: "15 min ago" },
  { id: "5", name: "Rise Dispensary", distance: "2.1 mi", lastUpdated: "3 min ago" },
];

const MOCK_ALERTS: Alert[] = [
  {
    id: "a1",
    type: "new_product",
    severity: "high",
    competitorId: "1",
    competitorName: "Green Thumb Cannabis",
    productName: "Krypto Chronic",
    brandName: "Alien Labs",
    message: "Green Thumb just stocked 'Krypto Chronic' from Alien Labs — you don't carry this",
    actionHint: "High-demand strain. Consider stocking to capture cross-shoppers.",
    timestamp: Date.now() - 120000, // 2 min ago
    isRead: false,
  },
  {
    id: "a2",
    type: "price_drop",
    severity: "critical",
    competitorId: "2",
    competitorName: "Housing Works Cannabis",
    productName: "Baby Jeeter Infused",
    brandName: "Jeeter",
    message: "Housing Works dropped Jeeter prices by 15% across all SKUs",
    actionHint: "Your Jeeter prices are now 18% higher than nearest competitor.",
    timestamp: Date.now() - 3600000, // 1 hour ago
    isRead: false,
    data: { priceOld: 45, priceNew: 38.25, changePercent: -15 },
  },
  {
    id: "a3",
    type: "stock_out",
    severity: "high",
    competitorId: "3",
    competitorName: "Smacked Village",
    productName: "Gary Payton",
    brandName: "Cookies",
    message: "3 nearby competitors are out of Cookies 'Gary Payton'",
    actionHint: "You have this in stock. Opportunity to run a promo.",
    timestamp: Date.now() - 1800000, // 30 min ago
    isRead: true,
  },
  {
    id: "a4",
    type: "trending",
    severity: "medium",
    competitorId: "",
    competitorName: "Market",
    productName: "Various",
    brandName: "Back Pack Boyz",
    message: "Back Pack Boyz products up 340% in market demand this week",
    actionHint: "Consider expanding your BPB inventory while trend is hot.",
    timestamp: Date.now() - 86400000, // 1 day ago
    isRead: true,
  },
  {
    id: "a5",
    type: "restock",
    severity: "low",
    competitorId: "4",
    competitorName: "The Cannabist",
    productName: "Blue Dream",
    brandName: "Tyson 2.0",
    message: "The Cannabist restocked Tyson 2.0 'Blue Dream' after 5-day outage",
    actionHint: "Their customers may return. Monitor your Blue Dream sales.",
    timestamp: Date.now() - 7200000, // 2 hours ago
    isRead: true,
  },
];

const MOCK_PRICE_COMPARISONS: PriceComparison[] = [
  {
    productId: "p1",
    productName: "Baby Jeeter Infused - Blue Zkittlez",
    brandName: "Jeeter",
    category: "Pre-Roll",
    yourPrice: 45,
    marketLow: 38.25,
    marketHigh: 52,
    marketAvg: 44.50,
    competitorPrices: [
      { competitorName: "Housing Works", price: 38.25, inStock: true },
      { competitorName: "Green Thumb", price: 42, inStock: true },
      { competitorName: "Rise", price: 48, inStock: false },
    ],
  },
  {
    productId: "p2",
    productName: "Gary Payton",
    brandName: "Cookies",
    category: "Flower",
    yourPrice: 65,
    marketLow: 58,
    marketHigh: 72,
    marketAvg: 64.20,
    competitorPrices: [
      { competitorName: "Smacked Village", price: 58, inStock: false },
      { competitorName: "The Cannabist", price: 62, inStock: false },
      { competitorName: "Housing Works", price: 68, inStock: false },
    ],
  },
  {
    productId: "p3",
    productName: "LCG Live Rosin",
    brandName: "710 Labs",
    category: "Concentrate",
    yourPrice: null, // Not carried
    marketLow: 75,
    marketHigh: 95,
    marketAvg: 82,
    competitorPrices: [
      { competitorName: "Green Thumb", price: 85, inStock: true },
      { competitorName: "Rise", price: 75, inStock: true },
    ],
  },
];

const MOCK_TRENDS: MarketTrend[] = [
  {
    productName: "Various",
    brandName: "Back Pack Boyz",
    category: "Flower",
    searchVolume: 4200,
    volumeChange: 340,
    retailersCarrying: 12,
    yourStore: "not_carried",
  },
  {
    productName: "Liquid Diamonds",
    brandName: "Stiiizy",
    category: "Vape",
    searchVolume: 3800,
    volumeChange: 85,
    retailersCarrying: 28,
    yourStore: "in_stock",
  },
  {
    productName: "Blueberry Muffin",
    brandName: "Humboldt Seed Co",
    category: "Flower",
    searchVolume: 2100,
    volumeChange: 120,
    retailersCarrying: 8,
    yourStore: "out_of_stock",
  },
];

interface B2BDashboardProps {
  retailerName: string;
  email: string;
  tier: "starter" | "growth" | "enterprise";
  onLogout: () => void;
  onManageCompetitors: () => void;
  onSettings: () => void;
}

type TabType = "alerts" | "pricing" | "trends" | "competitors" | "discover";

export function B2BDashboard({
  retailerName,
  email,
  tier,
  onLogout,
  onManageCompetitors,
  onSettings,
}: B2BDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>("alerts");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filteredAlerts = MOCK_ALERTS.filter(alert => {
    if (showUnreadOnly && alert.isRead) return false;
    return true;
  });

  const unreadCount = MOCK_ALERTS.filter(a => !a.isRead).length;

  return (
    <div className="min-h-screen bg-neutral-950">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-neutral-950/95 backdrop-blur-sm border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🌿</span>
                <span className="text-xl font-bold text-cannabis-400">CannaSignal</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-600/20 text-amber-400 font-medium capitalize">
                {tier}
              </span>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right hidden md:block">
                <p className="text-sm font-medium text-white">{retailerName}</p>
                <p className="text-xs text-neutral-500">{email}</p>
              </div>
              <button
                onClick={onSettings}
                className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400"
              >
                ⚙️
              </button>
              <button
                onClick={onLogout}
                className="text-sm px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Competitors</p>
            <p className="text-2xl font-bold text-white">{MOCK_COMPETITORS.length}</p>
            <p className="text-xs text-neutral-500">being monitored</p>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Unread Alerts</p>
            <p className="text-2xl font-bold text-amber-400">{unreadCount}</p>
            <p className="text-xs text-neutral-500">require attention</p>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Price Position</p>
            <p className="text-2xl font-bold text-cannabis-400">+3.2%</p>
            <p className="text-xs text-neutral-500">vs. market avg</p>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Stock-Out Opps</p>
            <p className="text-2xl font-bold text-green-400">5</p>
            <p className="text-xs text-neutral-500">products you can capture</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {[
            { id: "alerts", label: "Alerts", icon: "🔔", count: unreadCount },
            { id: "pricing", label: "Price Intel", icon: "💰" },
            { id: "trends", label: "Market Trends", icon: "📈" },
            { id: "competitors", label: "Competitors", icon: "🏪" },
            { id: "discover", label: "Discover Nearby", icon: "📍" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? "bg-cannabis-600 text-white"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.count && tab.count > 0 && (
                <span className="ml-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "alerts" && (
          <AlertsTab
            alerts={filteredAlerts}
            showUnreadOnly={showUnreadOnly}
            onToggleUnread={() => setShowUnreadOnly(!showUnreadOnly)}
          />
        )}
        
        {activeTab === "pricing" && (
          <PricingTab
            comparisons={MOCK_PRICE_COMPARISONS}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
          />
        )}
        
        {activeTab === "trends" && (
          <TrendsTab trends={MOCK_TRENDS} />
        )}
        
        {activeTab === "competitors" && (
          <CompetitorsTab
            competitors={MOCK_COMPETITORS}
            onManage={onManageCompetitors}
          />
        )}
        
        {activeTab === "discover" && (
          <RadiusDiscoveryTab
            tier={tier}
            currentMonitorCount={MOCK_COMPETITORS.filter(c => 
              filters.selectedCompetitors.length === 0 || 
              filters.selectedCompetitors.includes(c.id)
            ).length}
          />
        )}
      </div>
    </div>
  );
}

// Alert Tab Component
function AlertsTab({
  alerts,
  showUnreadOnly,
  onToggleUnread,
}: {
  alerts: Alert[];
  showUnreadOnly: boolean;
  onToggleUnread: () => void;
}) {
  const getSeverityColor = (severity: Alert["severity"]) => {
    switch (severity) {
      case "critical": return "border-red-500 bg-red-500/10";
      case "high": return "border-amber-500 bg-amber-500/10";
      case "medium": return "border-cannabis-500 bg-cannabis-500/10";
      case "low": return "border-neutral-600 bg-neutral-800";
    }
  };

  const getTypeIcon = (type: Alert["type"]) => {
    switch (type) {
      case "new_product": return "🆕";
      case "price_drop": return "📉";
      case "price_increase": return "📈";
      case "stock_out": return "📦";
      case "restock": return "♻️";
      case "trending": return "🔥";
    }
  };

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hr ago`;
    return `${Math.floor(diff / 86400000)} days ago`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Competitive Alerts</h2>
        <label className="flex items-center gap-2 text-sm text-neutral-400 cursor-pointer">
          <input
            type="checkbox"
            checked={showUnreadOnly}
            onChange={onToggleUnread}
            className="w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-cannabis-500"
          />
          <span>Unread only</span>
        </label>
      </div>

      <div className="space-y-3">
        {alerts.length === 0 ? (
          <div className="text-center py-12 text-neutral-500">
            <p className="text-4xl mb-4">✅</p>
            <p>You're all caught up!</p>
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-4 rounded-xl border-l-4 transition-colors ${getSeverityColor(alert.severity)} ${
                !alert.isRead ? "ring-1 ring-cannabis-500/30" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="text-2xl">{getTypeIcon(alert.type)}</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-cannabis-400 capitalize">
                        {alert.type.replace("_", " ")}
                      </span>
                      {!alert.isRead && (
                        <span className="w-2 h-2 rounded-full bg-cannabis-500"></span>
                      )}
                    </div>
                    <span className="text-xs text-neutral-500">{formatTime(alert.timestamp)}</span>
                  </div>
                  <p className="text-white mb-2">{alert.message}</p>
                  <p className="text-sm text-neutral-400 flex items-center gap-1">
                    <span>💡</span> {alert.actionHint}
                  </p>
                  
                  {/* Price change data visualization */}
                  {alert.data?.priceOld && alert.data?.priceNew && (
                    <div className="mt-3 flex items-center gap-4 p-2 rounded-lg bg-neutral-900/50">
                      <div className="text-center">
                        <p className="text-xs text-neutral-500">Was</p>
                        <p className="text-lg font-semibold text-neutral-400 line-through">
                          ${alert.data.priceOld}
                        </p>
                      </div>
                      <div className="text-2xl">→</div>
                      <div className="text-center">
                        <p className="text-xs text-neutral-500">Now</p>
                        <p className="text-lg font-semibold text-red-400">
                          ${alert.data.priceNew}
                        </p>
                      </div>
                      <div className="text-sm font-medium text-red-400">
                        ({alert.data.changePercent}%)
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Pricing Intelligence Tab
function PricingTab({
  comparisons,
  selectedCategory,
  onCategoryChange,
}: {
  comparisons: PriceComparison[];
  selectedCategory: string | null;
  onCategoryChange: (cat: string | null) => void;
}) {
  const categories = [...new Set(comparisons.map(c => c.category))];
  const filtered = selectedCategory
    ? comparisons.filter(c => c.category === selectedCategory)
    : comparisons;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Price Intelligence</h2>
        <div className="flex gap-2">
          <button
            onClick={() => onCategoryChange(null)}
            className={`px-3 py-1 rounded-full text-sm ${
              !selectedCategory
                ? "bg-cannabis-600 text-white"
                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => onCategoryChange(cat)}
              className={`px-3 py-1 rounded-full text-sm ${
                selectedCategory === cat
                  ? "bg-cannabis-600 text-white"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {filtered.map((item) => (
          <div
            key={item.productId}
            className="bg-neutral-900 border border-neutral-800 rounded-xl p-4"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm text-cannabis-400">{item.brandName}</p>
                <h3 className="text-lg font-semibold text-white">{item.productName}</h3>
                <span className="text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-400">
                  {item.category}
                </span>
              </div>
              <div className="text-right">
                <p className="text-xs text-neutral-500">Your Price</p>
                {item.yourPrice ? (
                  <p className="text-2xl font-bold text-white">${item.yourPrice}</p>
                ) : (
                  <p className="text-lg text-amber-400">Not Carried</p>
                )}
              </div>
            </div>

            {/* Price Range Bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-neutral-500 mb-1">
                <span>Market Low: ${item.marketLow}</span>
                <span>Avg: ${item.marketAvg.toFixed(2)}</span>
                <span>High: ${item.marketHigh}</span>
              </div>
              <div className="relative h-2 bg-neutral-800 rounded-full">
                <div
                  className="absolute h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 rounded-full"
                  style={{ width: "100%" }}
                />
                {item.yourPrice && (
                  <div
                    className="absolute w-3 h-3 bg-white rounded-full -top-0.5 border-2 border-neutral-900"
                    style={{
                      left: `${((item.yourPrice - item.marketLow) / (item.marketHigh - item.marketLow)) * 100}%`,
                      transform: "translateX(-50%)",
                    }}
                  />
                )}
              </div>
            </div>

            {/* Competitor Breakdown */}
            <div className="grid grid-cols-3 gap-2">
              {item.competitorPrices.map((cp, i) => (
                <div
                  key={i}
                  className={`p-2 rounded-lg text-center ${
                    cp.inStock ? "bg-neutral-800" : "bg-neutral-800/50"
                  }`}
                >
                  <p className="text-xs text-neutral-400 truncate">{cp.competitorName}</p>
                  <p className={`text-sm font-semibold ${cp.inStock ? "text-white" : "text-neutral-500"}`}>
                    ${cp.price}
                  </p>
                  <p className={`text-xs ${cp.inStock ? "text-green-400" : "text-red-400"}`}>
                    {cp.inStock ? "In Stock" : "Out"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Market Trends Tab
function TrendsTab({ trends }: { trends: MarketTrend[] }) {
  const getStoreStatusBadge = (status: MarketTrend["yourStore"]) => {
    switch (status) {
      case "in_stock":
        return <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">You have it ✓</span>;
      case "out_of_stock":
        return <span className="px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-400">Restock needed</span>;
      case "not_carried":
        return <span className="px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400">Not carried</span>;
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Trending in Your Market</h2>
        <span className="text-xs text-neutral-500">Updated daily</span>
      </div>

      <div className="space-y-3">
        {trends.map((trend, i) => (
          <div
            key={i}
            className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 hover:border-neutral-700 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="text-3xl font-bold text-neutral-700">#{i + 1}</div>
                <div>
                  <p className="text-sm text-cannabis-400">{trend.brandName}</p>
                  <h3 className="font-semibold text-white">{trend.productName}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-400">
                      {trend.category}
                    </span>
                    {getStoreStatusBadge(trend.yourStore)}
                  </div>
                </div>
              </div>
              
              <div className="text-right">
                <div className="flex items-center gap-1 text-green-400 font-bold">
                  <span>↑</span>
                  <span>{trend.volumeChange}%</span>
                </div>
                <p className="text-xs text-neutral-500">search volume</p>
                <p className="text-xs text-neutral-400 mt-1">
                  {trend.retailersCarrying} retailers carry
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 rounded-xl bg-amber-900/20 border border-amber-700/30">
        <p className="text-sm text-amber-400 flex items-center gap-2">
          <span>💡</span>
          <span>
            <strong>Tip:</strong> Products you don't carry that are trending represent potential lost sales. Consider expanding your inventory.
          </span>
        </p>
      </div>
    </div>
  );
}

// Competitors Tab
function CompetitorsTab({
  competitors,
  onManage,
}: {
  competitors: Competitor[];
  onManage: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Monitored Competitors</h2>
        <button
          onClick={onManage}
          className="px-4 py-2 rounded-lg bg-cannabis-600 hover:bg-cannabis-500 text-white text-sm font-medium"
        >
          + Add Competitor
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {competitors.map((comp) => (
          <div
            key={comp.id}
            className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 hover:border-neutral-700 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-white">{comp.name}</h3>
                <p className="text-sm text-neutral-400">{comp.distance} away</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-green-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                  Active
                </p>
                <p className="text-xs text-neutral-500">Updated {comp.lastUpdated}</p>
              </div>
            </div>
            
            <div className="mt-3 flex gap-2">
              <button className="flex-1 py-2 rounded-lg bg-neutral-800 text-neutral-300 text-sm hover:bg-neutral-700">
                View Inventory
              </button>
              <button className="py-2 px-3 rounded-lg bg-neutral-800 text-neutral-400 text-sm hover:bg-neutral-700">
                ⚙️
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 p-6 rounded-xl bg-neutral-900 border border-neutral-800 text-center">
        <p className="text-2xl mb-2">📍</p>
        <h3 className="font-semibold text-white mb-2">Expand Your Monitoring</h3>
        <p className="text-sm text-neutral-400 mb-4">
          Your plan allows tracking up to {competitors.length === 5 ? "10" : "25"} competitors.
          Add more to get a complete market view.
        </p>
        <button
          onClick={onManage}
          className="px-6 py-2 rounded-lg bg-cannabis-600 hover:bg-cannabis-500 text-white text-sm font-medium"
        >
          Search Dispensaries
        </button>
      </div>
    </div>
  );
}

// ============================================
// RADIUS-BASED COMPETITOR DISCOVERY TAB
// ============================================

// Mock nearby competitors with coordinates (to be replaced with Convex query)
const MOCK_NEARBY_COMPETITORS: NearbyCompetitor[] = [
  {
    id: "1",
    name: "Housing Works Cannabis",
    slug: "housing-works-cannabis",
    address: { street: "750 Broadway", city: "New York", state: "NY", zip: "10003" },
    region: "manhattan",
    coordinates: { lat: 40.7308, lng: -73.9917 },
    distanceMiles: 0.4,
    distanceFormatted: "0.4 mi",
    isMonitored: true,
    lastUpdated: Date.now() - 300000,
  },
  {
    id: "2",
    name: "Gotham Bowery",
    slug: "gotham-bowery",
    address: { street: "3 E 3rd St", city: "New York", state: "NY" },
    region: "manhattan",
    coordinates: { lat: 40.7255, lng: -73.9920 },
    distanceMiles: 0.1,
    distanceFormatted: "0.1 mi",
    isMonitored: true,
    lastUpdated: Date.now() - 600000,
  },
  {
    id: "3",
    name: "Dagmar Cannabis SoHo",
    slug: "dagmar-soho",
    address: { street: "412 W Broadway", city: "New York", state: "NY" },
    region: "manhattan",
    coordinates: { lat: 40.7246, lng: -74.0002 },
    distanceMiles: 0.5,
    distanceFormatted: "0.5 mi",
    isMonitored: false,
    lastUpdated: Date.now() - 120000,
  },
  {
    id: "4",
    name: "Smacked Village",
    slug: "smacked-village",
    address: { street: "144 Bleecker St", city: "New York", state: "NY" },
    region: "manhattan",
    coordinates: { lat: 40.7283, lng: -73.9994 },
    distanceMiles: 0.3,
    distanceFormatted: "0.3 mi",
    isMonitored: true,
    lastUpdated: Date.now() - 480000,
  },
  {
    id: "5",
    name: "Alta Nolita",
    slug: "alta-nolita",
    address: { street: "52 Kenmare St A", city: "New York", state: "NY", zip: "10012" },
    region: "manhattan",
    coordinates: { lat: 40.7221, lng: -73.9960 },
    distanceMiles: 0.2,
    distanceFormatted: "0.2 mi",
    isMonitored: false,
    lastUpdated: Date.now() - 900000,
  },
  {
    id: "6",
    name: "Maison Canal",
    slug: "maison-canal",
    address: { street: "386 Canal St", city: "New York", state: "NY", zip: "10013" },
    region: "manhattan",
    coordinates: { lat: 40.7189, lng: -74.0015 },
    distanceMiles: 0.6,
    distanceFormatted: "0.6 mi",
    isMonitored: false,
    lastUpdated: Date.now() - 1800000,
  },
  {
    id: "7",
    name: "The Travel Agency Union Square",
    slug: "travel-agency-union-square",
    address: { street: "835 Broadway", city: "New York", state: "NY" },
    region: "manhattan",
    coordinates: { lat: 40.7340, lng: -73.9904 },
    distanceMiles: 0.7,
    distanceFormatted: "0.7 mi",
    isMonitored: true,
    lastUpdated: Date.now() - 240000,
  },
  {
    id: "8",
    name: "Kaya Bliss Brooklyn Heights",
    slug: "kaya-bliss-brooklyn-heights",
    address: { street: "64 Henry St", city: "Brooklyn", state: "NY", zip: "11201" },
    region: "brooklyn",
    coordinates: { lat: 40.6962, lng: -73.9919 },
    distanceMiles: 1.9,
    distanceFormatted: "1.9 mi",
    isMonitored: false,
    lastUpdated: Date.now() - 3600000,
  },
  {
    id: "9",
    name: "The Cannabist Brooklyn",
    slug: "the-cannabist-brooklyn",
    address: { street: "680 Atlantic Ave", city: "Brooklyn", state: "NY", zip: "11217" },
    region: "brooklyn",
    coordinates: { lat: 40.6849, lng: -73.9772 },
    distanceMiles: 2.8,
    distanceFormatted: "2.8 mi",
    isMonitored: false,
    lastUpdated: Date.now() - 7200000,
  },
  {
    id: "10",
    name: "Gotham Williamsburg",
    slug: "gotham-williamsburg",
    address: { street: "300 Kent Ave", city: "Brooklyn", state: "NY" },
    region: "brooklyn",
    coordinates: { lat: 40.7186, lng: -73.9618 },
    distanceMiles: 1.5,
    distanceFormatted: "1.5 mi",
    isMonitored: false,
    lastUpdated: Date.now() - 1200000,
  },
  {
    id: "11",
    name: "Daily Green Times Square",
    slug: "daily-green-times-square",
    address: { street: "719 7th Ave", city: "New York", state: "NY", zip: "10036" },
    region: "manhattan",
    coordinates: { lat: 40.7612, lng: -73.9847 },
    distanceMiles: 2.5,
    distanceFormatted: "2.5 mi",
    isMonitored: false,
    lastUpdated: Date.now() - 5400000,
  },
  {
    id: "12",
    name: "Gotham Chelsea",
    slug: "gotham-chelsea",
    address: { street: "146 10th Ave", city: "New York", state: "NY" },
    region: "manhattan",
    coordinates: { lat: 40.7455, lng: -74.0063 },
    distanceMiles: 1.8,
    distanceFormatted: "1.8 mi",
    isMonitored: false,
    lastUpdated: Date.now() - 2400000,
  },
  {
    id: "13",
    name: "Blue Forest Farms Manhattan",
    slug: "blue-forest-farms-manhattan",
    address: { street: "122 E 25th St", city: "New York", state: "NY", zip: "10010" },
    region: "manhattan",
    coordinates: { lat: 40.7406, lng: -73.9871 },
    distanceMiles: 1.1,
    distanceFormatted: "1.1 mi",
    isMonitored: false,
    lastUpdated: Date.now() - 4800000,
  },
];

// Conbud LES anchor coordinates
const CONBUD_LES_ANCHOR: Coordinates = { lat: 40.7246, lng: -73.9927 };

interface RadiusDiscoveryTabProps {
  tier: "starter" | "growth" | "enterprise";
  currentMonitorCount: number;
}

function RadiusDiscoveryTab({ tier, currentMonitorCount }: RadiusDiscoveryTabProps) {
  const [radiusMiles, setRadiusMiles] = useState(2);
  const [competitors, setCompetitors] = useState(MOCK_NEARBY_COMPETITORS);
  const [isLoading, setIsLoading] = useState(false);

  const planLimits = { starter: 10, growth: 25, enterprise: Infinity };
  const planLimit = planLimits[tier];

  // Filter competitors by radius
  const filteredCompetitors = useMemo(() => {
    return competitors
      .filter(c => c.distanceMiles <= radiusMiles)
      .sort((a, b) => a.distanceMiles - b.distanceMiles);
  }, [competitors, radiusMiles]);

  const handleRadiusChange = (newRadius: number) => {
    setRadiusMiles(newRadius);
    // In production, this would trigger a Convex query:
    // const data = useQuery(api.b2b.getCompetitorsInRadius, { 
    //   retailerAccountId, 
    //   radiusMiles: newRadius 
    // });
  };

  const handleAddCompetitor = (id: string) => {
    setCompetitors(prev => 
      prev.map(c => c.id === id ? { ...c, isMonitored: true } : c)
    );
    // In production: useMutation(api.b2b.addCompetitor)
  };

  const handleRemoveCompetitor = (id: string) => {
    setCompetitors(prev => 
      prev.map(c => c.id === id ? { ...c, isMonitored: false } : c)
    );
    // In production: useMutation(api.b2b.removeCompetitor)
  };

  const handleAddAllInRadius = () => {
    const monitoredCount = competitors.filter(c => c.isMonitored).length;
    const available = planLimit - monitoredCount;
    
    setCompetitors(prev => {
      let added = 0;
      return prev.map(c => {
        if (!c.isMonitored && c.distanceMiles <= radiusMiles && added < available) {
          added++;
          return { ...c, isMonitored: true };
        }
        return c;
      });
    });
    // In production: useMutation(api.b2b.addCompetitorsInRadius)
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Discover Nearby Competitors</h2>
          <p className="text-sm text-neutral-500">
            Find dispensaries within your target radius and add them to your monitoring list
          </p>
        </div>
      </div>

      <RadiusCompetitorSelector
        anchor={{
          name: "CONBUD LES",
          coordinates: CONBUD_LES_ANCHOR,
        }}
        competitors={filteredCompetitors}
        radiusMiles={radiusMiles}
        onRadiusChange={handleRadiusChange}
        onAddCompetitor={handleAddCompetitor}
        onRemoveCompetitor={handleRemoveCompetitor}
        onAddAllInRadius={handleAddAllInRadius}
        planLimit={planLimit}
        currentCount={currentMonitorCount}
        isLoading={isLoading}
      />
    </div>
  );
}

export default B2BDashboard;
