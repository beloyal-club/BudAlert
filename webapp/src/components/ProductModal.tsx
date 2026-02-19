import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { StockBadge } from "./StockBadge";
import { WatchButton } from "./WatchButton";
import { ProductInsights } from "./ProductInsights";
import type { Id } from "../../../convex/_generated/dataModel";

interface ProductModalProps {
  productId: Id<"products">;
  userLocation: { lat: number; lng: number } | null;
  onClose: () => void;
}

export function ProductModal({ productId, userLocation, onClose }: ProductModalProps) {
  // Get product details
  const product = useQuery(api.products.getById, { id: productId });
  
  // Get inventory data
  const inventory = useQuery(api.inventory.getByProduct, { productId });

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Calculate distance
  const calcDistance = (retailerLat?: number, retailerLng?: number) => {
    if (!userLocation || !retailerLat || !retailerLng) return null;
    return haversineDistance(userLocation.lat, userLocation.lng, retailerLat, retailerLng);
  };

  // Sort inventory by distance/stock status
  const sortedInventory = [...(inventory || [])].sort((a, b) => {
    // In-stock first
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    // Then by distance if available
    const distA = calcDistance(a.retailer?.address?.lat, a.retailer?.address?.lng);
    const distB = calcDistance(b.retailer?.address?.lat, b.retailer?.address?.lng);
    if (distA !== null && distB !== null) return distA - distB;
    return 0;
  });

  const inStockCount = sortedInventory.filter(i => i.inStock).length;
  const lowestPrice = sortedInventory.length > 0 
    ? Math.min(...sortedInventory.map(i => i.currentPrice))
    : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center"
      onClick={handleBackdropClick}
      tabIndex={-1}
    >
      <div className="w-full max-w-lg bg-neutral-900 rounded-t-2xl sm:rounded-2xl max-h-[85vh] overflow-hidden flex flex-col animate-slide-up">
        {/* Header */}
        <div className="p-4 border-b border-neutral-800 flex items-start justify-between">
          <div className="flex-1 min-w-0">
            {product ? (
              <>
                <p className="text-sm text-cannabis-400 font-medium">
                  {product.brand?.name}
                </p>
                <h2 className="text-xl font-bold text-white truncate">
                  {product.name}
                </h2>
                <div className="flex flex-wrap gap-1 mt-1">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
                    {formatCategory(product.category)}
                  </span>
                  {product.strain && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
                      {product.strain}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <div className="skeleton h-4 w-24 rounded"></div>
                <div className="skeleton h-6 w-48 rounded"></div>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 -mt-2 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Summary */}
        {inventory && (
          <div className="px-4 py-3 bg-neutral-800/50 border-b border-neutral-800">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-cannabis-400">
                  {inStockCount}
                </p>
                <p className="text-xs text-neutral-500">In Stock</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {sortedInventory.length}
                </p>
                <p className="text-xs text-neutral-500">Locations</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {lowestPrice ? `$${lowestPrice.toFixed(0)}` : "-"}
                </p>
                <p className="text-xs text-neutral-500">Lowest Price</p>
              </div>
            </div>
            
            {/* Watch Button */}
            <WatchButton 
              productId={productId} 
              productName={product?.name}
            />
          </div>
        )}

        {/* Smart Insights Section */}
        <div className="px-4 py-3 border-b border-neutral-800">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">📊</span>
            <h3 className="text-sm font-medium text-neutral-400">Smart Insights</h3>
          </div>
          <ProductInsights productId={productId} />
        </div>

        {/* Locations List */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <h3 className="text-sm font-medium text-neutral-400 mb-3">
              Available at {sortedInventory.length} locations
            </h3>
            
            {!inventory ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-20 rounded-lg"></div>
                ))}
              </div>
            ) : sortedInventory.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-neutral-500">Not available at any tracked location</p>
                <p className="text-xs text-neutral-600 mt-2">
                  This product hasn't been seen in recent inventory scans
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedInventory.map((item) => {
                  const distance = calcDistance(
                    item.retailer?.address?.lat,
                    item.retailer?.address?.lng
                  );
                  
                  return (
                    <div
                      key={item._id}
                      className="bg-neutral-800/50 rounded-lg p-3 border border-neutral-700/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-white truncate">
                            {item.retailer?.name || "Unknown"}
                          </p>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {item.retailer?.address?.city}, {item.retailer?.address?.state}
                            {distance !== null && (
                              <span> • {distance.toFixed(1)} mi away</span>
                            )}
                          </p>
                        </div>
                        <StockBadge
                          inStock={item.inStock}
                          stockLevel={item.stockLevel}
                          lastInStockAt={item.lastInStockAt}
                          size="sm"
                        />
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-neutral-700/50">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-lg font-bold text-white">
                            ${item.currentPrice.toFixed(2)}
                          </span>
                          {item.previousPrice && item.currentPrice < item.previousPrice && (
                            <span className="text-xs text-green-400">
                              ↓ ${(item.previousPrice - item.currentPrice).toFixed(2)} off
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-neutral-500">
                          Updated {formatTimeAgo(item.lastUpdatedAt)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up {
          animation: slide-up 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}

function formatCategory(cat: string): string {
  return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
