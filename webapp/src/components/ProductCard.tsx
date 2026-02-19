import { StockBadge } from "./StockBadge";

interface ProductItem {
  id: string;
  productId: string;
  productName: string;
  brandName: string;
  category: string;
  strain?: string | null;
  weight?: { amount: number; unit: string } | null;
  thcRange?: { min?: number; max?: number; unit: string } | null;
  imageUrl?: string | null;
  retailerName: string;
  retailerSlug: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  price: number;
  previousPrice?: number | null;
  inStock: boolean;
  stockLevel?: string | null;
  lastInStockAt?: number | null;
  lastUpdatedAt: number;
  distance?: number | null;
}

interface ProductCardProps {
  item: ProductItem;
  onClick: () => void;
}

export function ProductCard({ item, onClick }: ProductCardProps) {
  const priceDropped = item.previousPrice && item.price < item.previousPrice;
  const priceIncreased = item.previousPrice && item.price > item.previousPrice;

  return (
    <button
      onClick={onClick}
      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-left hover:border-neutral-700 transition-colors active:bg-neutral-800"
    >
      <div className="flex gap-3">
        {/* Product Image */}
        <div className="w-16 h-16 rounded-lg bg-neutral-800 flex-shrink-0 overflow-hidden">
          {item.imageUrl ? (
            <img 
              src={item.imageUrl} 
              alt={item.productName}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl">
              {getCategoryEmoji(item.category)}
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-cannabis-400 font-medium truncate">
                {item.brandName}
              </p>
              <h3 className="text-white font-medium truncate leading-tight">
                {item.productName}
              </h3>
            </div>
            <StockBadge
              inStock={item.inStock}
              stockLevel={item.stockLevel}
              lastInStockAt={item.lastInStockAt}
              size="sm"
            />
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1 mt-1.5">
            <span className="text-xs px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
              {formatCategory(item.category)}
            </span>
            {item.strain && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                {item.strain}
              </span>
            )}
            {item.weight && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                {item.weight.amount}{item.weight.unit}
              </span>
            )}
            {item.thcRange?.max && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                THC {item.thcRange.max}%
              </span>
            )}
          </div>

          {/* Price & Location */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-white">
                ${item.price.toFixed(2)}
              </span>
              {priceDropped && (
                <span className="text-xs text-green-400 line-through">
                  ${item.previousPrice?.toFixed(2)}
                </span>
              )}
              {priceIncreased && (
                <span className="text-xs text-red-400 line-through">
                  ${item.previousPrice?.toFixed(2)}
                </span>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-neutral-400 truncate max-w-[120px]">
                {item.retailerName}
              </p>
              {item.distance !== null && item.distance !== undefined && (
                <p className="text-xs text-neutral-500">
                  {item.distance.toFixed(1)} mi
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

function formatCategory(cat: string): string {
  return cat
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getCategoryEmoji(category: string): string {
  const map: Record<string, string> = {
    flower: "🌸",
    pre_roll: "🚬",
    preroll: "🚬",
    vape: "💨",
    vaporizer: "💨",
    cartridge: "💨",
    edible: "🍪",
    edibles: "🍪",
    gummies: "🍬",
    concentrate: "💎",
    extracts: "💎",
    tincture: "💧",
    tinctures: "💧",
    topical: "🧴",
    topicals: "🧴",
    capsule: "💊",
    capsules: "💊",
  };
  return map[category.toLowerCase()] || "🌿";
}
