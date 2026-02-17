import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useState } from "react";

// ============================================================
// PRICE HISTORY PAGE (DATA-006)
// Shows price trends, drops, and changes
// ============================================================

type ChangeType = "all" | "drop" | "increase";
type CategoryFilter = "all" | "flower" | "pre_roll" | "vape" | "edible" | "concentrate" | "tincture";

export function PriceHistory() {
  const [changeType, setChangeType] = useState<ChangeType>("all");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [minChangePercent, setMinChangePercent] = useState(5);

  // Get price summary
  const summary = useQuery(api.priceHistory.getPriceSummary);
  
  // Get price drops
  const drops = useQuery(api.priceHistory.getPriceDrops, {
    category: category !== "all" ? category : undefined,
    minDropPercent: 10,
    limit: 20,
  });
  
  // Get recent changes
  const changes = useQuery(api.priceHistory.getRecentPriceChanges, {
    changeType: changeType,
    category: category !== "all" ? category : undefined,
    minChangePercent: minChangePercent,
    limit: 30,
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Price History</h1>
          <p className="text-gray-400 text-xs sm:text-sm mt-0.5 sm:mt-1">
            Track price changes and find deals
          </p>
        </div>
        {summary && (
          <div className="flex gap-2 text-xs">
            <span className="px-2 py-1 bg-green-900/50 text-green-300 rounded border border-green-700">
              ↓ {summary.summary.priceDrops24h} drops today
            </span>
            <span className="px-2 py-1 bg-red-900/50 text-red-300 rounded border border-red-700">
              ↑ {summary.summary.priceIncreases24h} increases
            </span>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
          <SummaryCard 
            label="Tracked Items" 
            value={summary.summary.totalTracked}
            icon="📊"
          />
          <SummaryCard 
            label="With History" 
            value={summary.summary.totalWithHistory}
            icon="📈"
          />
          <SummaryCard 
            label="Snapshots (24h)" 
            value={summary.summary.snapshots24h}
            icon="📸"
          />
          <SummaryCard 
            label="Weekly Snapshots" 
            value={summary.summary.snapshotsWeek}
            icon="📅"
          />
        </div>
      )}

      {/* Category Averages */}
      {summary && summary.categoryAverages.length > 0 && (
        <div className="bg-gray-900 rounded-lg p-3 sm:p-4 border border-gray-800">
          <h2 className="text-sm sm:text-base font-semibold text-white mb-3">
            Average Prices by Category
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {summary.categoryAverages.map((cat) => (
              <div 
                key={cat.category}
                className="bg-gray-800/50 rounded p-2 sm:p-3 text-center"
              >
                <div className="text-xs text-gray-400 capitalize">
                  {cat.category.replace(/_/g, " ")}
                </div>
                <div className="text-base sm:text-lg font-bold text-green-400 mt-0.5">
                  ${cat.avgPrice}
                </div>
                <div className="text-[10px] text-gray-500">
                  {cat.count} items
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-400">Filter:</span>
        
        {/* Change Type */}
        <select
          value={changeType}
          onChange={(e) => setChangeType(e.target.value as ChangeType)}
          className="bg-gray-800 border border-gray-700 text-white text-xs sm:text-sm rounded px-2 py-1.5 focus:ring-green-500 focus:border-green-500"
        >
          <option value="all">All Changes</option>
          <option value="drop">Price Drops</option>
          <option value="increase">Price Increases</option>
        </select>
        
        {/* Category */}
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as CategoryFilter)}
          className="bg-gray-800 border border-gray-700 text-white text-xs sm:text-sm rounded px-2 py-1.5 focus:ring-green-500 focus:border-green-500"
        >
          <option value="all">All Categories</option>
          <option value="flower">Flower</option>
          <option value="pre_roll">Pre-Rolls</option>
          <option value="vape">Vapes</option>
          <option value="edible">Edibles</option>
          <option value="concentrate">Concentrates</option>
          <option value="tincture">Tinctures</option>
        </select>

        {/* Min Change */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">Min:</span>
          <input
            type="number"
            min={1}
            max={50}
            value={minChangePercent}
            onChange={(e) => setMinChangePercent(parseInt(e.target.value) || 5)}
            className="w-12 sm:w-14 bg-gray-800 border border-gray-700 text-white text-xs sm:text-sm rounded px-1.5 py-1 focus:ring-green-500 focus:border-green-500"
          />
          <span className="text-xs text-gray-400">%</span>
        </div>
      </div>

      {/* Price Drops Section */}
      <div className="bg-gray-900 rounded-lg border border-gray-800">
        <div className="p-3 sm:p-4 border-b border-gray-800">
          <h2 className="text-sm sm:text-base font-semibold text-white flex items-center gap-2">
            <span className="text-green-400">🔥</span>
            Hot Deals - Price Drops Today
          </h2>
        </div>
        <div className="p-3 sm:p-4">
          {!drops ? (
            <LoadingPlaceholder count={3} />
          ) : drops.drops.length === 0 ? (
            <EmptyState message="No significant price drops in the last 24 hours" />
          ) : (
            <div className="space-y-2">
              {drops.drops.map((drop, idx) => (
                <PriceChangeCard key={idx} item={drop} type="drop" />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Changes Section */}
      <div className="bg-gray-900 rounded-lg border border-gray-800">
        <div className="p-3 sm:p-4 border-b border-gray-800">
          <h2 className="text-sm sm:text-base font-semibold text-white flex items-center gap-2">
            📉 Recent Price Changes
            {changes && (
              <span className="text-xs text-gray-400 font-normal">
                ({changes.changes.length} results)
              </span>
            )}
          </h2>
        </div>
        <div className="p-3 sm:p-4">
          {!changes ? (
            <LoadingPlaceholder count={5} />
          ) : changes.changes.length === 0 ? (
            <EmptyState message="No price changes matching your filters" />
          ) : (
            <div className="space-y-2">
              {changes.changes.map((change, idx) => (
                <PriceChangeCard 
                  key={idx} 
                  item={change as any} 
                  type={change.changeAmount < 0 ? "drop" : "increase"} 
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// COMPONENTS
// ============================================================

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="bg-gray-900 rounded-lg p-3 sm:p-4 border border-gray-800">
      <div className="flex items-center gap-2">
        <span className="text-lg sm:text-xl">{icon}</span>
        <div>
          <div className="text-lg sm:text-xl font-bold text-white">{value.toLocaleString()}</div>
          <div className="text-[10px] sm:text-xs text-gray-400">{label}</div>
        </div>
      </div>
    </div>
  );
}

interface PriceChange {
  product: { id: string; name: string; category: string } | null;
  brand: { id: string; name: string } | null;
  retailer: { id: string; name: string; region: string } | null;
  previousPrice: number;
  currentPrice: number;
  changeAmount?: number;
  dropAmount?: number;
  changePercent?: number;
  dropPercent?: number;
  changedAt: number;
  inStock: boolean;
}

function PriceChangeCard({ item, type }: { item: PriceChange; type: "drop" | "increase" }) {
  const percent = item.dropPercent ?? item.changePercent ?? 0;
  const amount = item.dropAmount ?? item.changeAmount ?? 0;
  const isDrop = type === "drop" || amount < 0;
  
  const timeAgo = formatTimeAgo(item.changedAt);
  
  return (
    <div className="bg-gray-800/50 rounded-lg p-2.5 sm:p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      {/* Product Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            isDrop ? "bg-green-900/50 text-green-300" : "bg-red-900/50 text-red-300"
          }`}>
            {isDrop ? "↓" : "↑"} {Math.abs(percent).toFixed(1)}%
          </span>
          {!item.inStock && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
              Out of Stock
            </span>
          )}
        </div>
        <div className="text-sm sm:text-base font-medium text-white truncate mt-1">
          {item.product?.name || "Unknown Product"}
        </div>
        <div className="text-xs text-gray-400 truncate">
          {item.brand?.name || "Unknown Brand"} • {item.retailer?.name || "Unknown Retailer"}
        </div>
      </div>
      
      {/* Price Change */}
      <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4">
        <div className="text-right">
          <div className="text-xs text-gray-500 line-through">
            ${item.previousPrice.toFixed(2)}
          </div>
          <div className={`text-base sm:text-lg font-bold ${isDrop ? "text-green-400" : "text-red-400"}`}>
            ${item.currentPrice.toFixed(2)}
          </div>
        </div>
        <div className="text-right hidden xs:block">
          <div className={`text-sm font-semibold ${isDrop ? "text-green-400" : "text-red-400"}`}>
            {isDrop ? "-" : "+"}${Math.abs(amount).toFixed(2)}
          </div>
          <div className="text-[10px] text-gray-500">{timeAgo}</div>
        </div>
      </div>
    </div>
  );
}

function LoadingPlaceholder({ count }: { count: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div 
          key={i} 
          className="bg-gray-800/30 rounded-lg h-16 animate-pulse"
        />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-8">
      <div className="text-3xl mb-2">📊</div>
      <div className="text-gray-400 text-sm">{message}</div>
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
