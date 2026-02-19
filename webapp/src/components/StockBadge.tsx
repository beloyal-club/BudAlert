interface StockBadgeProps {
  inStock: boolean;
  stockLevel?: string | null;
  lastInStockAt?: number | null;
  size?: "sm" | "md";
}

export function StockBadge({ 
  inStock, 
  stockLevel, 
  lastInStockAt, 
  size = "md" 
}: StockBadgeProps) {
  const getStatus = () => {
    if (inStock) {
      if (stockLevel === "low") {
        return { emoji: "🟡", text: "Low Stock", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" };
      }
      return { emoji: "🟢", text: "In Stock", color: "bg-green-500/20 text-green-400 border-green-500/30" };
    }
    return { emoji: "🔴", text: "Sold Out", color: "bg-red-500/20 text-red-400 border-red-500/30" };
  };

  const status = getStatus();
  const sizeClasses = size === "sm" 
    ? "text-xs px-2 py-0.5" 
    : "text-sm px-2.5 py-1";

  return (
    <div className="flex flex-col items-end gap-1">
      <span
        className={`inline-flex items-center gap-1 rounded-full border font-medium ${status.color} ${sizeClasses}`}
      >
        <span>{status.emoji}</span>
        <span>{status.text}</span>
      </span>
      {!inStock && lastInStockAt && (
        <span className="text-xs text-neutral-500">
          Last seen {formatTimeAgo(lastInStockAt)}
        </span>
      )}
    </div>
  );
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
