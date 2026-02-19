/**
 * HotProductsFeed - Shows trending products across locations
 * 
 * Displays products that are "hot right now" based on:
 * - Frequent restocks (high demand)
 * - Quick sell-outs
 * - New drops gaining traction
 * - Activity across multiple locations
 */

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface HotProductsFeedProps {
  onProductClick: (productId: Id<"products">) => void;
  limit?: number;
  hoursBack?: number;
}

export function HotProductsFeed({ 
  onProductClick, 
  limit = 10,
  hoursBack = 24 
}: HotProductsFeedProps) {
  const hotProducts = useQuery(api.smartAnalytics.getHotProducts, { 
    limit, 
    hoursBack 
  });

  if (!hotProducts) {
    return (
      <div className="animate-pulse space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-neutral-900 rounded-xl p-4 h-24" />
        ))}
      </div>
    );
  }

  if (hotProducts.length === 0) {
    return (
      <div className="text-center py-8 bg-neutral-900 rounded-xl">
        <p className="text-4xl mb-2">📊</p>
        <p className="text-neutral-400">No trending data yet</p>
        <p className="text-sm text-neutral-600 mt-1">
          Check back as we gather more inventory data
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <span>🔥</span>
          <span>Hot Right Now</span>
        </h2>
        <span className="text-xs text-neutral-500">
          Last {hoursBack}h
        </span>
      </div>

      <div className="space-y-2">
        {hotProducts.map((product: any, index: number) => (
          <button
            key={product.productId}
            onClick={() => onProductClick(product.productId)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-left hover:border-neutral-700 transition-all hover:scale-[1.01] active:scale-[0.99]"
          >
            <div className="flex items-start gap-3">
              {/* Rank indicator */}
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                index === 0 ? 'bg-gradient-to-br from-yellow-500 to-orange-500 text-white' :
                index === 1 ? 'bg-gradient-to-br from-neutral-400 to-neutral-500 text-white' :
                index === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700 text-white' :
                'bg-neutral-800 text-neutral-400'
              }`}>
                {index + 1}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-cannabis-400 font-medium truncate">
                      {product.brandName}
                    </p>
                    <h3 className="text-white font-medium truncate leading-tight">
                      {product.productName}
                    </h3>
                  </div>
                  
                  {/* Hot score badge */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <HotScoreBadge score={product.hotScore} isNewDrop={product.isNewDrop} />
                  </div>
                </div>

                {/* Hot reason */}
                <p className="text-sm text-amber-400/80 mt-1">
                  {product.hotReason}
                </p>

                {/* Metrics row */}
                <div className="flex flex-wrap gap-2 mt-2 text-xs text-neutral-500">
                  {product.metrics.restocks > 0 && (
                    <span className="flex items-center gap-1">
                      <span>📦</span>
                      <span>{product.metrics.restocks} restocks</span>
                    </span>
                  )}
                  {product.metrics.soldOuts > 0 && (
                    <span className="flex items-center gap-1">
                      <span>💨</span>
                      <span>{product.metrics.soldOuts} sold out</span>
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <span>📍</span>
                    <span>{product.metrics.locationCount} locations</span>
                  </span>
                  {product.metrics.avgPrice && (
                    <span className="flex items-center gap-1">
                      <span>💵</span>
                      <span>~${product.metrics.avgPrice}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function HotScoreBadge({ score, isNewDrop }: { score: number; isNewDrop: boolean }) {
  if (isNewDrop) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gradient-to-r from-green-600 to-emerald-600 text-white text-xs font-medium">
        <span>🆕</span>
        <span>New</span>
      </span>
    );
  }

  if (score >= 10) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gradient-to-r from-red-600 to-orange-500 text-white text-xs font-medium animate-pulse">
        <span>🔥</span>
        <span>Fire</span>
      </span>
    );
  }

  if (score >= 6) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gradient-to-r from-amber-600 to-yellow-500 text-white text-xs font-medium">
        <span>⚡</span>
        <span>Hot</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-neutral-700 text-neutral-300 text-xs font-medium">
      <span>📈</span>
      <span>Trending</span>
    </span>
  );
}

export default HotProductsFeed;
