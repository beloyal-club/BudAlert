import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export function RecentChanges() {
  // Use dashboard activity feed which is already deployed
  const activity = useQuery(api.dashboard.getActivityFeed, { limit: 10 });

  if (!activity || activity.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-neutral-800 pt-6">
      <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span>⚡</span>
        <span>Recent Activity</span>
      </h2>
      
      <div className="space-y-3">
        {activity.map((event) => (
          <div
            key={event.id}
            className="bg-neutral-900 border border-neutral-800 rounded-lg p-3"
          >
            <div className="flex items-start gap-3">
              <span className="text-xl">📦</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white">
                  <span className="font-medium">{event.retailerName}</span>
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {event.productCount} products updated
                </p>
              </div>
              <span className="text-xs text-neutral-600 whitespace-nowrap">
                {formatTimeAgo(event.timestamp)}
              </span>
            </div>
          </div>
        ))}
      </div>
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
