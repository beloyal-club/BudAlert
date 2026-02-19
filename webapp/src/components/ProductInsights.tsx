/**
 * ProductInsights - Shows smart analytics for a product
 * 
 * Displays:
 * - Sell-out velocity ("typically sells out in ~4 hours")
 * - Restock predictions ("usually restocks Tuesdays around 2PM")
 * - Popularity score
 * - Recent activity timeline
 */

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface ProductInsightsProps {
  productId: Id<"products">;
  compact?: boolean;
}

export function ProductInsights({ productId, compact = false }: ProductInsightsProps) {
  const insights = useQuery(api.smartAnalytics.getProductInsights, { productId });
  const popularity = useQuery(api.smartAnalytics.getPopularityScore, { productId });

  if (!insights || !popularity) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-12 bg-neutral-800 rounded-lg" />
        <div className="h-20 bg-neutral-800 rounded-lg" />
      </div>
    );
  }

  // No insights available yet
  if (insights.insights.totalEvents === 0) {
    return (
      <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
        <p className="text-sm text-neutral-500 text-center">
          📊 Not enough data yet to show trends
        </p>
        <p className="text-xs text-neutral-600 text-center mt-1">
          Check back as we track more inventory changes
        </p>
      </div>
    );
  }

  if (compact) {
    return <CompactInsights insights={insights} popularity={popularity} />;
  }

  return (
    <div className="space-y-4">
      {/* Popularity Score Card */}
      <PopularityCard popularity={popularity} />

      {/* Velocity & Prediction Cards */}
      <div className="grid grid-cols-2 gap-3">
        <VelocityCard insights={insights} />
        <RestockCard insights={insights} />
      </div>

      {/* Recent Activity */}
      {insights.recentEvents.length > 0 && (
        <RecentActivity events={insights.recentEvents} />
      )}
    </div>
  );
}

function CompactInsights({ insights, popularity }: { insights: any; popularity: any }) {
  return (
    <div className="flex flex-wrap gap-2">
      {/* Popularity pill */}
      <PopularityPill tier={popularity.tier} score={popularity.score} />
      
      {/* Velocity pill */}
      {insights.insights.velocity && (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-neutral-800 text-xs text-neutral-300">
          <span>⚡</span>
          <span>{insights.insights.velocity}</span>
        </span>
      )}

      {/* Restock prediction pill */}
      {insights.insights.restockPrediction && (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-neutral-800 text-xs text-neutral-300">
          <span>📦</span>
          <span>{insights.insights.restockPrediction}</span>
        </span>
      )}
    </div>
  );
}

function PopularityPill({ tier, score }: { tier: string; score: number }) {
  const config: Record<string, { emoji: string; color: string; label: string }> = {
    fire: { emoji: "🔥", color: "bg-gradient-to-r from-red-600 to-orange-500", label: "Fire" },
    hot: { emoji: "⚡", color: "bg-gradient-to-r from-amber-600 to-yellow-500", label: "Hot" },
    warm: { emoji: "📈", color: "bg-amber-700", label: "Trending" },
    normal: { emoji: "📊", color: "bg-neutral-700", label: "Normal" },
    cold: { emoji: "❄️", color: "bg-blue-900", label: "Low demand" },
  };

  const { emoji, color, label } = config[tier] || config.normal;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ${color} text-xs text-white font-medium`}>
      <span>{emoji}</span>
      <span>{label}</span>
      <span className="opacity-75">({score})</span>
    </span>
  );
}

function PopularityCard({ popularity }: { popularity: any }) {
  const tierColors: Record<string, string> = {
    fire: "from-red-600 via-orange-500 to-yellow-500",
    hot: "from-amber-500 to-yellow-400",
    warm: "from-amber-700 to-amber-600",
    normal: "from-neutral-600 to-neutral-500",
    cold: "from-blue-800 to-blue-700",
  };

  const tierEmojis: Record<string, string> = {
    fire: "🔥",
    hot: "⚡",
    warm: "📈",
    normal: "📊",
    cold: "❄️",
  };

  return (
    <div className={`rounded-xl p-4 bg-gradient-to-br ${tierColors[popularity.tier] || tierColors.normal}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-white/80 font-medium uppercase tracking-wide">
            Popularity Score
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-bold text-white">
              {popularity.score}
            </span>
            <span className="text-lg text-white/80">/100</span>
            <span className="text-2xl ml-2">{tierEmojis[popularity.tier]}</span>
          </div>
        </div>
        <div className="text-right text-white/90">
          <p className="text-sm font-medium capitalize">{popularity.tier}</p>
          <p className="text-xs text-white/70">
            {popularity.confidence} confidence
          </p>
        </div>
      </div>

      {/* Mini stats */}
      <div className="flex gap-4 mt-3 pt-3 border-t border-white/20 text-xs text-white/80">
        <span>📍 {popularity.metrics.locationsCarrying} locations</span>
        <span>📦 {popularity.metrics.restockCount} restocks</span>
        <span>💨 {popularity.metrics.soldOutCount} sold out</span>
      </div>
    </div>
  );
}

function VelocityCard({ insights }: { insights: any }) {
  const velocity = insights.insights.avgHoursToSellout;
  const velocityText = insights.insights.velocity;

  return (
    <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
      <p className="text-xs text-neutral-500 uppercase tracking-wide mb-2">
        ⚡ Sell-Out Speed
      </p>
      
      {velocityText ? (
        <p className="text-sm text-white font-medium">{velocityText}</p>
      ) : (
        <p className="text-sm text-neutral-500">No data yet</p>
      )}

      {velocity !== null && (
        <div className="mt-2">
          <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all ${
                velocity < 4 ? 'bg-red-500 w-full animate-pulse' :
                velocity < 12 ? 'bg-orange-500 w-4/5' :
                velocity < 24 ? 'bg-yellow-500 w-3/5' :
                velocity < 48 ? 'bg-green-500 w-2/5' :
                'bg-neutral-600 w-1/5'
              }`}
            />
          </div>
          <p className="text-xs text-neutral-600 mt-1">
            Avg: {velocity < 24 ? `${Math.round(velocity)}h` : `${Math.round(velocity / 24)}d`}
          </p>
        </div>
      )}
    </div>
  );
}

function RestockCard({ insights }: { insights: any }) {
  const prediction = insights.insights.restockPrediction;
  const topDays = insights.insights.topRestockDays;

  return (
    <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
      <p className="text-xs text-neutral-500 uppercase tracking-wide mb-2">
        📦 Restock Pattern
      </p>
      
      {prediction ? (
        <p className="text-sm text-white font-medium">{prediction}</p>
      ) : topDays.length > 0 ? (
        <p className="text-sm text-neutral-400">
          Often restocks {topDays.join(", ")}
        </p>
      ) : (
        <p className="text-sm text-neutral-500">No pattern detected</p>
      )}

      {topDays.length > 0 && (
        <div className="flex gap-1 mt-2">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
            <div
              key={day}
              className={`flex-1 h-6 rounded text-xs flex items-center justify-center ${
                topDays.includes(day) 
                  ? 'bg-cannabis-600 text-white font-medium' 
                  : 'bg-neutral-800 text-neutral-600'
              }`}
            >
              {day.charAt(0)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecentActivity({ events }: { events: any[] }) {
  const eventConfig: Record<string, { emoji: string; label: string; color: string }> = {
    restock: { emoji: "📦", label: "Restocked", color: "text-green-400" },
    sold_out: { emoji: "💨", label: "Sold out", color: "text-red-400" },
    price_drop: { emoji: "📉", label: "Price drop", color: "text-green-400" },
    price_increase: { emoji: "📈", label: "Price up", color: "text-amber-400" },
    new_product: { emoji: "🆕", label: "New drop", color: "text-blue-400" },
    removed: { emoji: "🗑️", label: "Removed", color: "text-neutral-500" },
  };

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'just now';
  };

  return (
    <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
      <p className="text-xs text-neutral-500 uppercase tracking-wide mb-3">
        📋 Recent Activity
      </p>
      <div className="space-y-2">
        {events.slice(0, 5).map((event, i) => {
          const config = eventConfig[event.type] || { emoji: "📝", label: event.type, color: "text-neutral-400" };
          return (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className={`flex items-center gap-2 ${config.color}`}>
                <span>{config.emoji}</span>
                <span>{config.label}</span>
              </span>
              <span className="text-xs text-neutral-600">{formatTime(event.timestamp)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ProductInsights;
