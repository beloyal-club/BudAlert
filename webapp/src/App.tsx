import { useState, useEffect, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SearchBar } from "./components/SearchBar";
import { FilterBar } from "./components/FilterBar";
import { ProductCard } from "./components/ProductCard";
import { ProductModal } from "./components/ProductModal";
import { WatchlistPage } from "./components/WatchlistPage";
import { LoadingSkeleton } from "./components/LoadingSkeleton";
import { HotProductsFeed } from "./components/HotProductsFeed";
import type { Id } from "../../convex/_generated/dataModel";

type Filters = {
  query: string;
  category: string | null;
  strain: string | null;
  retailerId: Id<"retailers"> | null;
  inStockOnly: boolean;
};

function App() {
  const [filters, setFilters] = useState<Filters>({
    query: "",
    category: null,
    strain: null,
    retailerId: null,
    inStockOnly: false,
  });
  const [selectedProductId, setSelectedProductId] = useState<Id<"products"> | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [activeTab, setActiveTab] = useState<"search" | "trending">("trending");

  // Request user location on mount
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        () => {
          // User denied or error - use NYC default
          setUserLocation({ lat: 40.7128, lng: -74.006 });
        }
      );
    }
  }, []);

  // Fetch retailers for filter
  const retailers = useQuery(api.retailers.list, {});
  
  // Fetch products
  const products = useQuery(api.products.list, { 
    category: filters.category || undefined,
    limit: 100 
  });

  // Search products
  const searchedProducts = useQuery(api.products.search, { 
    query: filters.query || "" 
  });

  // Use searched results if query exists, otherwise use category-filtered products
  const displayProducts = filters.query ? searchedProducts : products;

  // Create filter options from loaded data
  const filterOptions = {
    categories: [...new Set(products?.map(p => p.category) || [])].sort(),
    strains: [...new Set(products?.map(p => p.strain).filter(Boolean) || [])].sort() as string[],
    retailers: (retailers || []).map(r => ({
      id: r._id,
      name: r.name,
      city: r.address.city,
      region: r.region,
    })),
  };

  const handleSearch = useCallback((query: string) => {
    setFilters((f) => ({ ...f, query }));
  }, []);

  const handleFilterChange = useCallback((key: keyof Filters, value: any) => {
    setFilters((f) => ({ ...f, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      query: "",
      category: null,
      strain: null,
      retailerId: null,
      inStockOnly: false,
    });
  }, []);

  const activeFilterCount = [
    filters.category,
    filters.strain,
    filters.retailerId,
    filters.inStockOnly,
  ].filter(Boolean).length;

  // Filter and transform results for display
  const results = (displayProducts || [])
    .filter(p => {
      if (filters.strain && p.strain !== filters.strain) return false;
      return true;
    })
    .slice(0, 50);

  return (
    <div className="min-h-screen bg-neutral-950">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-neutral-950/95 backdrop-blur-sm border-b border-neutral-800">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-cannabis-400 flex items-center gap-2">
              <span>🌿</span>
              <span>CannaSignal</span>
            </h1>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowWatchlist(true)}
                className="text-sm px-3 py-1.5 rounded-full bg-neutral-800 text-neutral-300 hover:bg-neutral-700 flex items-center gap-1"
              >
                <span>🔔</span>
                <span>Alerts</span>
              </button>
              <span className="text-xs text-neutral-500 flex items-center gap-1">
                {userLocation ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-cannabis-500"></span>
                    <span>📍 NYC</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
                    <span>...</span>
                  </>
                )}
              </span>
            </div>
          </div>
          
          {/* Tab Switcher */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setActiveTab("trending")}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === "trending"
                  ? "bg-gradient-to-r from-orange-600 to-amber-500 text-white"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
              }`}
            >
              <span>🔥</span>
              <span>Trending</span>
            </button>
            <button
              onClick={() => setActiveTab("search")}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === "search"
                  ? "bg-cannabis-600 text-white"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
              }`}
            >
              <span>🔍</span>
              <span>Search</span>
            </button>
          </div>

          {activeTab === "search" && (
            <>
              <SearchBar 
                value={filters.query} 
                onChange={handleSearch} 
              />
            </>
          )}
          
          {activeTab === "search" && (
          <div className="flex items-center justify-between mt-3">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`text-sm px-3 py-1.5 rounded-full flex items-center gap-1 transition-colors ${
                activeFilterCount > 0
                  ? "bg-cannabis-600 text-white"
                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              }`}
            >
              <span>🎛️</span>
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="ml-1 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs font-medium">
                  {activeFilterCount}
                </span>
              )}
            </button>

            <label className="flex items-center gap-2 text-sm text-neutral-400 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.inStockOnly}
                onChange={(e) => handleFilterChange("inStockOnly", e.target.checked)}
                className="w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-cannabis-500 focus:ring-cannabis-500 focus:ring-offset-0"
              />
              <span>In stock only</span>
            </label>
          </div>
          )}
        </div>
        
        {activeTab === "search" && showFilters && filterOptions.categories.length > 0 && (
          <FilterBar
            options={filterOptions}
            filters={filters}
            onChange={handleFilterChange}
            onClear={clearFilters}
          />
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 py-4">
        {activeTab === "trending" ? (
          /* Trending Feed */
          <HotProductsFeed 
            onProductClick={(productId) => setSelectedProductId(productId)}
            limit={15}
            hoursBack={48}
          />
        ) : (
          /* Search Results */
          <>
            {/* Results count */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-neutral-500">
                {displayProducts ? (
                  <>
                    <span className="text-neutral-300 font-medium">{results.length}</span>
                    {" "}products found
                  </>
                ) : (
                  <span className="skeleton inline-block w-24 h-4 rounded"></span>
                )}
              </p>
              {results.length > 0 && (
                <p className="text-xs text-neutral-600">
                  Sorted by {userLocation ? "distance" : "last updated"}
                </p>
              )}
            </div>

            {/* Product Grid */}
            {!displayProducts ? (
              <LoadingSkeleton count={6} />
            ) : results.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-4xl mb-4">🔍</p>
                <p className="text-neutral-400 mb-2">No products found</p>
                <p className="text-sm text-neutral-600">
                  Try adjusting your search or filters
                </p>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="mt-4 text-sm text-cannabis-400 hover:text-cannabis-300"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((product) => (
                  <ProductCardSimple
                    key={product._id}
                    product={product}
                    onClick={() => setSelectedProductId(product._id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Product Detail Modal */}
      {selectedProductId && (
        <ProductModal
          productId={selectedProductId}
          userLocation={userLocation}
          onClose={() => setSelectedProductId(null)}
        />
      )}

      {/* Watchlist Page */}
      {showWatchlist && (
        <WatchlistPage
          onClose={() => setShowWatchlist(false)}
          onProductClick={(productId) => {
            setShowWatchlist(false);
            setSelectedProductId(productId);
          }}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-neutral-800 mt-8 py-6">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <p className="text-xs text-neutral-600">
            Real-time inventory tracking for NYS licensed dispensaries
          </p>
          <p className="text-xs text-neutral-700 mt-1">
            Data updates every 15 minutes • Not affiliated with any dispensary
          </p>
        </div>
      </footer>
    </div>
  );
}

// Simplified product card for product list view (without inventory data)
function ProductCardSimple({ 
  product, 
  onClick 
}: { 
  product: any; 
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-left hover:border-neutral-700 transition-colors active:bg-neutral-800"
    >
      <div className="flex gap-3">
        <div className="w-16 h-16 rounded-lg bg-neutral-800 flex-shrink-0 overflow-hidden">
          {product.imageUrl ? (
            <img 
              src={product.imageUrl} 
              alt={product.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl">
              {getCategoryEmoji(product.category)}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-cannabis-400 font-medium truncate">
                {product.brand?.name || "Unknown Brand"}
              </p>
              <h3 className="text-white font-medium truncate leading-tight">
                {product.name}
              </h3>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border text-xs px-2 py-0.5 font-medium bg-neutral-500/20 text-neutral-400 border-neutral-500/30">
              <span>⚪</span>
              <span>Check</span>
            </span>
          </div>

          <div className="flex flex-wrap gap-1 mt-1.5">
            <span className="text-xs px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
              {formatCategory(product.category)}
            </span>
            {product.strain && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                {product.strain}
              </span>
            )}
            {product.weight && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                {product.weight.amount}{product.weight.unit}
              </span>
            )}
            {product.thcRange?.max && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                THC {product.thcRange.max}%
              </span>
            )}
          </div>

          <p className="text-xs text-neutral-500 mt-2">
            Tap to see availability across locations
          </p>
        </div>
      </div>
    </button>
  );
}

function formatCategory(cat: string): string {
  return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getCategoryEmoji(category: string): string {
  const map: Record<string, string> = {
    flower: "🌸",
    pre_roll: "🚬",
    preroll: "🚬",
    vape: "💨",
    edible: "🍪",
    concentrate: "💎",
    tincture: "💧",
    topical: "🧴",
  };
  return map[category.toLowerCase()] || "🌿";
}

export default App;
