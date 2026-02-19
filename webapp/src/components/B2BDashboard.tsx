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

import { useState, useEffect, useMemo } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { RadiusCompetitorSelector, type NearbyCompetitor, type Coordinates } from "./RadiusCompetitorSelector";

// ============================================
// TYPES
// ============================================

interface Competitor {
  id: string;
  name: string;
  distance: string;
  lastUpdated: string;
  isSelected?: boolean;
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
  volumeChange: number;
  retailersCarrying: number;
  yourStore: "in_stock" | "out_of_stock" | "not_carried";
}

// ============================================
// FILTER TYPES
// ============================================

type StockStatus = "all" | "in_stock" | "out_of_stock";
type TimeRange = "24h" | "7d" | "30d" | "all";
type SortOption = "price_asc" | "price_desc" | "name_asc" | "name_desc" | "updated" | "distance";
type GroupByOption = "none" | "category" | "brand" | "competitor";

interface DashboardFilters {
  // Competitor selection
  selectedCompetitors: string[];
  
  // Data filters
  categories: string[];
  brands: string[];
  priceMin: number | null;
  priceMax: number | null;
  stockStatus: StockStatus;
  timeRange: TimeRange;
  
  // View options
  sortBy: SortOption;
  groupBy: GroupByOption;
}

const DEFAULT_FILTERS: DashboardFilters = {
  selectedCompetitors: [],
  categories: [],
  brands: [],
  priceMin: null,
  priceMax: null,
  stockStatus: "all",
  timeRange: "all",
  sortBy: "name_asc",
  groupBy: "none",
};

const STORAGE_KEY = "cannasignal_dashboard_filters";

// ============================================
// MOCK DATA
// ============================================

const MOCK_COMPETITORS: Competitor[] = [
  { id: "1", name: "Green Thumb Cannabis", distance: "0.3 mi", lastUpdated: "5 min ago" },
  { id: "2", name: "Housing Works Cannabis", distance: "0.8 mi", lastUpdated: "12 min ago" },
  { id: "3", name: "Smacked Village", distance: "1.2 mi", lastUpdated: "8 min ago" },
  { id: "4", name: "The Cannabist", distance: "1.5 mi", lastUpdated: "15 min ago" },
  { id: "5", name: "Rise Dispensary", distance: "2.1 mi", lastUpdated: "3 min ago" },
  { id: "6", name: "Medmen NYC", distance: "2.5 mi", lastUpdated: "20 min ago" },
  { id: "7", name: "Curaleaf Manhattan", distance: "3.0 mi", lastUpdated: "25 min ago" },
  { id: "8", name: "Columbia Care", distance: "3.2 mi", lastUpdated: "18 min ago" },
];

const ALL_CATEGORIES = ["Flower", "Pre-Roll", "Concentrate", "Edible", "Vape", "Tincture", "Topical"];
const ALL_BRANDS = ["Jeeter", "Cookies", "710 Labs", "Alien Labs", "Tyson 2.0", "Stiiizy", "Back Pack Boyz", "Humboldt Seed Co", "Ozone", "Rythm"];

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
    timestamp: Date.now() - 120000,
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
    timestamp: Date.now() - 3600000,
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
    timestamp: Date.now() - 1800000,
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
    timestamp: Date.now() - 86400000,
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
    timestamp: Date.now() - 7200000,
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
      { competitorName: "Housing Works Cannabis", price: 38.25, inStock: true },
      { competitorName: "Green Thumb Cannabis", price: 42, inStock: true },
      { competitorName: "Rise Dispensary", price: 48, inStock: false },
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
      { competitorName: "Housing Works Cannabis", price: 68, inStock: false },
    ],
  },
  {
    productId: "p3",
    productName: "LCG Live Rosin",
    brandName: "710 Labs",
    category: "Concentrate",
    yourPrice: null,
    marketLow: 75,
    marketHigh: 95,
    marketAvg: 82,
    competitorPrices: [
      { competitorName: "Green Thumb Cannabis", price: 85, inStock: true },
      { competitorName: "Rise Dispensary", price: 75, inStock: true },
    ],
  },
  {
    productId: "p4",
    productName: "Liquid Diamonds - Gelato",
    brandName: "Stiiizy",
    category: "Vape",
    yourPrice: 55,
    marketLow: 48,
    marketHigh: 62,
    marketAvg: 54,
    competitorPrices: [
      { competitorName: "Medmen NYC", price: 48, inStock: true },
      { competitorName: "Curaleaf Manhattan", price: 52, inStock: true },
      { competitorName: "Columbia Care", price: 58, inStock: false },
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

// ============================================
// FILTER PERSISTENCE HOOKS
// ============================================

function loadFiltersFromStorage(): DashboardFilters {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_FILTERS, ...parsed };
    }
  } catch (e) {
    console.warn("Failed to load filters from storage:", e);
  }
  return DEFAULT_FILTERS;
}

function saveFiltersToStorage(filters: DashboardFilters) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch (e) {
    console.warn("Failed to save filters to storage:", e);
  }
}

// ============================================
// MAIN COMPONENT
// ============================================

interface B2BDashboardProps {
  retailerName: string;
  email: string;
  tier: "starter" | "growth" | "enterprise";
  onLogout: () => void;
  onManageCompetitors: () => void;
  onSettings: () => void;
}

type TabType = "alerts" | "pricing" | "trends" | "competitors";

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
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  
  // Initialize filters from localStorage
  const [filters, setFilters] = useState<DashboardFilters>(() => loadFiltersFromStorage());
  
  // Persist filters to localStorage on change
  useEffect(() => {
    saveFiltersToStorage(filters);
  }, [filters]);

  // Filter update helpers
  const updateFilter = <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const hasActiveFilters = useMemo(() => {
    return (
      filters.selectedCompetitors.length > 0 ||
      filters.categories.length > 0 ||
      filters.brands.length > 0 ||
      filters.priceMin !== null ||
      filters.priceMax !== null ||
      filters.stockStatus !== "all" ||
      filters.timeRange !== "all"
    );
  }, [filters]);

  // Apply filters to alerts
  const filteredAlerts = useMemo(() => {
    let result = [...MOCK_ALERTS];
    
    if (showUnreadOnly) {
      result = result.filter(a => !a.isRead);
    }
    
    if (filters.selectedCompetitors.length > 0) {
      result = result.filter(a => 
        !a.competitorId || filters.selectedCompetitors.includes(a.competitorId)
      );
    }
    
    if (filters.brands.length > 0) {
      result = result.filter(a => filters.brands.includes(a.brandName));
    }
    
    if (filters.timeRange !== "all") {
      const now = Date.now();
      const ranges: Record<TimeRange, number> = {
        "24h": 24 * 60 * 60 * 1000,
        "7d": 7 * 24 * 60 * 60 * 1000,
        "30d": 30 * 24 * 60 * 60 * 1000,
        "all": Infinity,
      };
      result = result.filter(a => now - a.timestamp <= ranges[filters.timeRange]);
    }
    
    return result;
  }, [showUnreadOnly, filters]);

  // Apply filters to price comparisons
  const filteredPriceComparisons = useMemo(() => {
    let result = [...MOCK_PRICE_COMPARISONS];
    
    if (filters.categories.length > 0) {
      result = result.filter(p => filters.categories.includes(p.category));
    }
    
    if (filters.brands.length > 0) {
      result = result.filter(p => filters.brands.includes(p.brandName));
    }
    
    if (filters.priceMin !== null) {
      result = result.filter(p => p.yourPrice === null || p.yourPrice >= filters.priceMin!);
    }
    
    if (filters.priceMax !== null) {
      result = result.filter(p => p.yourPrice === null || p.yourPrice <= filters.priceMax!);
    }
    
    if (filters.stockStatus !== "all") {
      result = result.filter(p => {
        const hasInStock = p.competitorPrices.some(cp => cp.inStock);
        return filters.stockStatus === "in_stock" ? hasInStock : !hasInStock;
      });
    }
    
    // Apply sorting
    result.sort((a, b) => {
      switch (filters.sortBy) {
        case "price_asc":
          return (a.yourPrice ?? a.marketAvg) - (b.yourPrice ?? b.marketAvg);
        case "price_desc":
          return (b.yourPrice ?? b.marketAvg) - (a.yourPrice ?? a.marketAvg);
        case "name_asc":
          return a.productName.localeCompare(b.productName);
        case "name_desc":
          return b.productName.localeCompare(a.productName);
        default:
          return 0;
      }
    });
    
    return result;
  }, [filters]);

  // Group price comparisons
  const groupedPriceComparisons = useMemo(() => {
    if (filters.groupBy === "none") {
      return { "All Products": filteredPriceComparisons };
    }
    
    const groups: Record<string, PriceComparison[]> = {};
    
    filteredPriceComparisons.forEach(item => {
      let key: string;
      switch (filters.groupBy) {
        case "category":
          key = item.category;
          break;
        case "brand":
          key = item.brandName;
          break;
        case "competitor":
          // Group by first competitor with stock
          const inStockComp = item.competitorPrices.find(cp => cp.inStock);
          key = inStockComp?.competitorName ?? "No Stock Available";
          break;
        default:
          key = "All";
      }
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    
    return groups;
  }, [filteredPriceComparisons, filters.groupBy]);

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
            <p className="text-2xl font-bold text-white">
              {filters.selectedCompetitors.length || MOCK_COMPETITORS.length}
            </p>
            <p className="text-xs text-neutral-500">
              {filters.selectedCompetitors.length > 0 ? "selected" : "in region"}
            </p>
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

        {/* Filter Bar */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setShowFiltersPanel(!showFiltersPanel)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              showFiltersPanel || hasActiveFilters
                ? "bg-cannabis-600 text-white"
                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
            }`}
          >
            <span>🔍</span>
            <span>Filters</span>
            {hasActiveFilters && (
              <span className="ml-1 w-5 h-5 rounded-full bg-white/20 text-xs flex items-center justify-center">
                {filters.selectedCompetitors.length + filters.categories.length + filters.brands.length + 
                 (filters.priceMin !== null ? 1 : 0) + (filters.priceMax !== null ? 1 : 0) +
                 (filters.stockStatus !== "all" ? 1 : 0) + (filters.timeRange !== "all" ? 1 : 0)}
              </span>
            )}
          </button>
          
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-900/20"
            >
              <span>✕</span>
              <span>Reset Filters</span>
            </button>
          )}
          
          <div className="flex-1" />
          
          {/* Quick filter chips */}
          {filters.selectedCompetitors.length > 0 && (
            <span className="px-2 py-1 rounded-full bg-cannabis-600/20 text-cannabis-400 text-xs">
              {filters.selectedCompetitors.length} competitors
            </span>
          )}
          {filters.categories.length > 0 && (
            <span className="px-2 py-1 rounded-full bg-blue-600/20 text-blue-400 text-xs">
              {filters.categories.join(", ")}
            </span>
          )}
          {filters.timeRange !== "all" && (
            <span className="px-2 py-1 rounded-full bg-purple-600/20 text-purple-400 text-xs">
              Last {filters.timeRange}
            </span>
          )}
        </div>

        {/* Expanded Filters Panel */}
        {showFiltersPanel && (
          <FiltersPanel
            filters={filters}
            competitors={MOCK_COMPETITORS}
            allCategories={ALL_CATEGORIES}
            allBrands={ALL_BRANDS}
            onUpdateFilter={updateFilter}
            onReset={resetFilters}
            onClose={() => setShowFiltersPanel(false)}
          />
        )}

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {[
            { id: "alerts", label: "Alerts", icon: "🔔", count: unreadCount },
            { id: "pricing", label: "Price Intel", icon: "💰" },
            { id: "trends", label: "Market Trends", icon: "📈" },
            { id: "competitors", label: "Competitors", icon: "🏪" },
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
            hasFilters={hasActiveFilters}
          />
        )}
        
        {activeTab === "pricing" && (
          <PricingTab
            groupedComparisons={groupedPriceComparisons}
            filters={filters}
            onUpdateFilter={updateFilter}
          />
        )}
        
        {activeTab === "trends" && (
          <TrendsTab trends={MOCK_TRENDS} />
        )}
        
        {activeTab === "competitors" && (
          <CompetitorsTab
            competitors={MOCK_COMPETITORS}
            selectedCompetitors={filters.selectedCompetitors}
            onToggleCompetitor={(id) => {
              const current = filters.selectedCompetitors;
              if (current.includes(id)) {
                updateFilter("selectedCompetitors", current.filter(c => c !== id));
              } else {
                updateFilter("selectedCompetitors", [...current, id]);
              }
            }}
            onSelectAll={() => updateFilter("selectedCompetitors", MOCK_COMPETITORS.map(c => c.id))}
            onDeselectAll={() => updateFilter("selectedCompetitors", [])}
            onManage={onManageCompetitors}
          />
        )}
      </div>
    </div>
  );
}

// ============================================
// FILTERS PANEL COMPONENT
// ============================================

interface FiltersPanelProps {
  filters: DashboardFilters;
  competitors: Competitor[];
  allCategories: string[];
  allBrands: string[];
  onUpdateFilter: <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => void;
  onReset: () => void;
  onClose: () => void;
}

function FiltersPanel({
  filters,
  competitors,
  allCategories,
  allBrands,
  onUpdateFilter,
  onReset,
  onClose,
}: FiltersPanelProps) {
  const [competitorSearch, setCompetitorSearch] = useState("");
  const [brandSearch, setBrandSearch] = useState("");

  const filteredCompetitors = competitors.filter(c =>
    c.name.toLowerCase().includes(competitorSearch.toLowerCase())
  );

  const filteredBrands = allBrands.filter(b =>
    b.toLowerCase().includes(brandSearch.toLowerCase())
  );

  const toggleCompetitor = (id: string) => {
    const current = filters.selectedCompetitors;
    if (current.includes(id)) {
      onUpdateFilter("selectedCompetitors", current.filter(c => c !== id));
    } else {
      onUpdateFilter("selectedCompetitors", [...current, id]);
    }
  };

  const toggleCategory = (cat: string) => {
    const current = filters.categories;
    if (current.includes(cat)) {
      onUpdateFilter("categories", current.filter(c => c !== cat));
    } else {
      onUpdateFilter("categories", [...current, cat]);
    }
  };

  const toggleBrand = (brand: string) => {
    const current = filters.brands;
    if (current.includes(brand)) {
      onUpdateFilter("brands", current.filter(b => b !== brand));
    } else {
      onUpdateFilter("brands", [...current, brand]);
    }
  };

  return (
    <div className="mb-6 p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">Filter & View Options</h3>
        <div className="flex gap-2">
          <button
            onClick={onReset}
            className="px-3 py-1.5 rounded-lg text-sm text-neutral-400 hover:bg-neutral-800"
          >
            Reset All
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm bg-neutral-800 text-white hover:bg-neutral-700"
          >
            Done
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Competitor Selection */}
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-2">
            Competitors ({filters.selectedCompetitors.length || "All"})
          </label>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Search competitors..."
              value={competitorSearch}
              onChange={(e) => setCompetitorSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm placeholder:text-neutral-500 focus:outline-none focus:border-cannabis-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => onUpdateFilter("selectedCompetitors", competitors.map(c => c.id))}
                className="text-xs text-cannabis-400 hover:text-cannabis-300"
              >
                Select All
              </button>
              <button
                onClick={() => onUpdateFilter("selectedCompetitors", [])}
                className="text-xs text-neutral-400 hover:text-neutral-300"
              >
                Deselect All
              </button>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {filteredCompetitors.map((comp) => (
                <label
                  key={comp.id}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-neutral-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={filters.selectedCompetitors.length === 0 || filters.selectedCompetitors.includes(comp.id)}
                    onChange={() => toggleCompetitor(comp.id)}
                    className="w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-cannabis-500"
                  />
                  <span className="text-sm text-white truncate">{comp.name}</span>
                  <span className="text-xs text-neutral-500 ml-auto">{comp.distance}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Category Filter */}
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-2">
            Categories ({filters.categories.length || "All"})
          </label>
          <div className="flex flex-wrap gap-2">
            {allCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  filters.categories.includes(cat)
                    ? "bg-cannabis-600 text-white"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Brand Filter */}
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-2">
            Brands ({filters.brands.length || "All"})
          </label>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Search brands..."
              value={brandSearch}
              onChange={(e) => setBrandSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm placeholder:text-neutral-500 focus:outline-none focus:border-cannabis-500"
            />
            <div className="max-h-32 overflow-y-auto flex flex-wrap gap-1">
              {filteredBrands.map((brand) => (
                <button
                  key={brand}
                  onClick={() => toggleBrand(brand)}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    filters.brands.includes(brand)
                      ? "bg-cannabis-600 text-white"
                      : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                  }`}
                >
                  {brand}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Additional Filters */}
        <div className="space-y-4">
          {/* Price Range */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Price Range</label>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                placeholder="Min"
                value={filters.priceMin ?? ""}
                onChange={(e) => onUpdateFilter("priceMin", e.target.value ? Number(e.target.value) : null)}
                className="w-20 px-2 py-1.5 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:border-cannabis-500"
              />
              <span className="text-neutral-500">—</span>
              <input
                type="number"
                placeholder="Max"
                value={filters.priceMax ?? ""}
                onChange={(e) => onUpdateFilter("priceMax", e.target.value ? Number(e.target.value) : null)}
                className="w-20 px-2 py-1.5 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:border-cannabis-500"
              />
            </div>
          </div>

          {/* Stock Status */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Stock Status</label>
            <select
              value={filters.stockStatus}
              onChange={(e) => onUpdateFilter("stockStatus", e.target.value as StockStatus)}
              className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:border-cannabis-500"
            >
              <option value="all">All</option>
              <option value="in_stock">In Stock</option>
              <option value="out_of_stock">Out of Stock</option>
            </select>
          </div>

          {/* Time Range */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Time Range</label>
            <select
              value={filters.timeRange}
              onChange={(e) => onUpdateFilter("timeRange", e.target.value as TimeRange)}
              className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:border-cannabis-500"
            >
              <option value="all">All Time</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>
        </div>
      </div>

      {/* View Options */}
      <div className="mt-6 pt-6 border-t border-neutral-800">
        <h4 className="text-sm font-medium text-neutral-300 mb-3">View Options</h4>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Sort By</label>
            <select
              value={filters.sortBy}
              onChange={(e) => onUpdateFilter("sortBy", e.target.value as SortOption)}
              className="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:border-cannabis-500"
            >
              <option value="name_asc">Name (A-Z)</option>
              <option value="name_desc">Name (Z-A)</option>
              <option value="price_asc">Price (Low to High)</option>
              <option value="price_desc">Price (High to Low)</option>
              <option value="updated">Last Updated</option>
              <option value="distance">Distance</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Group By</label>
            <select
              value={filters.groupBy}
              onChange={(e) => onUpdateFilter("groupBy", e.target.value as GroupByOption)}
              className="px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:border-cannabis-500"
            >
              <option value="none">No Grouping</option>
              <option value="category">Category</option>
              <option value="brand">Brand</option>
              <option value="competitor">Competitor</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// ALERT TAB COMPONENT
// ============================================

function AlertsTab({
  alerts,
  showUnreadOnly,
  onToggleUnread,
  hasFilters,
}: {
  alerts: Alert[];
  showUnreadOnly: boolean;
  onToggleUnread: () => void;
  hasFilters: boolean;
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
        <div>
          <h2 className="text-lg font-semibold text-white">Competitive Alerts</h2>
          {hasFilters && (
            <p className="text-xs text-neutral-500">Showing filtered results</p>
          )}
        </div>
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
            <p className="text-4xl mb-4">{hasFilters ? "🔍" : "✅"}</p>
            <p>{hasFilters ? "No alerts match your filters" : "You're all caught up!"}</p>
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

// ============================================
// PRICING INTELLIGENCE TAB
// ============================================

function PricingTab({
  groupedComparisons,
  filters,
  onUpdateFilter,
}: {
  groupedComparisons: Record<string, PriceComparison[]>;
  filters: DashboardFilters;
  onUpdateFilter: <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => void;
}) {
  const totalItems = Object.values(groupedComparisons).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Price Intelligence</h2>
          <p className="text-xs text-neutral-500">{totalItems} products</p>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-neutral-500">Group:</span>
          <select
            value={filters.groupBy}
            onChange={(e) => onUpdateFilter("groupBy", e.target.value as GroupByOption)}
            className="px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-xs focus:outline-none focus:border-cannabis-500"
          >
            <option value="none">None</option>
            <option value="category">Category</option>
            <option value="brand">Brand</option>
          </select>
        </div>
      </div>

      {Object.entries(groupedComparisons).map(([groupName, items]) => (
        <div key={groupName} className="mb-6">
          {filters.groupBy !== "none" && (
            <h3 className="text-md font-semibold text-cannabis-400 mb-3 flex items-center gap-2">
              <span>{groupName}</span>
              <span className="text-xs text-neutral-500 font-normal">({items.length})</span>
            </h3>
          )}
          
          <div className="space-y-4">
            {items.map((item) => (
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
      ))}

      {totalItems === 0 && (
        <div className="text-center py-12 text-neutral-500">
          <p className="text-4xl mb-4">🔍</p>
          <p>No products match your filters</p>
        </div>
      )}
    </div>
  );
}

// ============================================
// MARKET TRENDS TAB
// ============================================

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

// ============================================
// COMPETITORS TAB COMPONENT
// ============================================

function CompetitorsTab({
  competitors,
  selectedCompetitors,
  onToggleCompetitor,
  onSelectAll,
  onDeselectAll,
  onManage,
}: {
  competitors: Competitor[];
  selectedCompetitors: string[];
  onToggleCompetitor: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onManage: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCompetitors = competitors.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isSelected = (id: string) => 
    selectedCompetitors.length === 0 || selectedCompetitors.includes(id);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Monitored Competitors</h2>
          <p className="text-xs text-neutral-500">
            {selectedCompetitors.length > 0 
              ? `${selectedCompetitors.length} of ${competitors.length} selected`
              : `${competitors.length} competitors in region`}
          </p>
        </div>
        <button
          onClick={onManage}
          className="px-4 py-2 rounded-lg bg-cannabis-600 hover:bg-cannabis-500 text-white text-sm font-medium"
        >
          + Add Competitor
        </button>
      </div>

      {/* Search and bulk actions */}
      <div className="flex gap-4 mb-4">
        <input
          type="text"
          placeholder="Search competitors..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 px-4 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm placeholder:text-neutral-500 focus:outline-none focus:border-cannabis-500"
        />
        <div className="flex gap-2">
          <button
            onClick={onSelectAll}
            className="px-3 py-2 rounded-lg bg-neutral-800 text-neutral-300 text-sm hover:bg-neutral-700"
          >
            Select All
          </button>
          <button
            onClick={onDeselectAll}
            className="px-3 py-2 rounded-lg bg-neutral-800 text-neutral-300 text-sm hover:bg-neutral-700"
          >
            Deselect All
          </button>
        </div>
      </div>

      {/* Selected competitor hint */}
      {selectedCompetitors.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-cannabis-900/20 border border-cannabis-700/30">
          <p className="text-sm text-cannabis-400">
            <strong>🎯 Filtered view active:</strong> Only showing data from {selectedCompetitors.length} selected competitors. 
            <button 
              onClick={onDeselectAll}
              className="ml-2 underline hover:no-underline"
            >
              Show all
            </button>
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {filteredCompetitors.map((comp) => (
          <div
            key={comp.id}
            className={`bg-neutral-900 border rounded-xl p-4 transition-colors cursor-pointer ${
              isSelected(comp.id)
                ? "border-cannabis-600 ring-1 ring-cannabis-600/30"
                : "border-neutral-800 opacity-60 hover:opacity-100"
            }`}
            onClick={() => onToggleCompetitor(comp.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={isSelected(comp.id)}
                  onChange={() => onToggleCompetitor(comp.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-5 h-5 rounded border-neutral-600 bg-neutral-800 text-cannabis-500"
                />
                <div>
                  <h3 className="font-semibold text-white">{comp.name}</h3>
                  <p className="text-sm text-neutral-400">{comp.distance} away</p>
                </div>
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
              <button 
                className="flex-1 py-2 rounded-lg bg-neutral-800 text-neutral-300 text-sm hover:bg-neutral-700"
                onClick={(e) => {
                  e.stopPropagation();
                  // TODO: Navigate to inventory view
                }}
              >
                View Inventory
              </button>
              <button 
                className="py-2 px-3 rounded-lg bg-neutral-800 text-neutral-400 text-sm hover:bg-neutral-700"
                onClick={(e) => {
                  e.stopPropagation();
                  // TODO: Open settings
                }}
              >
                ⚙️
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredCompetitors.length === 0 && (
        <div className="text-center py-12 text-neutral-500">
          <p className="text-4xl mb-4">🔍</p>
          <p>No competitors match "{searchQuery}"</p>
        </div>
      )}

      <div className="mt-8 p-6 rounded-xl bg-neutral-900 border border-neutral-800 text-center">
        <p className="text-2xl mb-2">📍</p>
        <h3 className="font-semibold text-white mb-2">Expand Your Monitoring</h3>
        <p className="text-sm text-neutral-400 mb-4">
          Your plan allows tracking up to {competitors.length <= 5 ? "10" : "25"} competitors.
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

export default B2BDashboard;
