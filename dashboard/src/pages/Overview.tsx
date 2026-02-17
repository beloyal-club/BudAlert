import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useLastUpdated, LastUpdatedText } from "../components/LiveIndicator";

export function Overview() {
  // Live stats subscription
  const stats = useQuery(api.dashboard.getStats);
  const { lastUpdated: statsUpdated, justUpdated: statsJustUpdated } = useLastUpdated(stats);

  const trending = useQuery(api.analytics.getTrending, {
    region: "statewide",
    period: "weekly",
    limit: 10,
  });
  const { lastUpdated: trendingUpdated, justUpdated: trendingJustUpdated } = useLastUpdated(trending);

  const priceChanges = useQuery(api.inventory.getPriceChanges, {
    hoursAgo: 24,
    limit: 10,
  });

  const outOfStock = useQuery(api.inventory.getOutOfStock, {
    limit: 10,
  });

  const activity = useQuery(api.dashboard.getActivityFeed, { limit: 5 });

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold mb-2">Market Overview</h1>
          <p className="text-gray-400">
            Real-time cannabis market intelligence for New York State
          </p>
        </div>
        <div className="text-right">
          <LastUpdatedText date={statsUpdated} />
        </div>
      </div>

      {/* Stats Grid */}
      <div className={`grid grid-cols-1 md:grid-cols-4 gap-4 transition-all duration-300 ${
        statsJustUpdated ? "ring-2 ring-green-500/50 rounded-xl" : ""
      }`}>
        <StatCard
          title="Active Retailers"
          value={stats?.retailers.total ?? "—"}
          change={stats ? `${stats.retailers.byRegion.nyc || 0} in NYC` : "Loading..."}
          color="green"
          pulse={statsJustUpdated}
        />
        <StatCard
          title="Tracked Brands"
          value={stats?.brands.total ?? "—"}
          change={stats ? `${stats.brands.verified} verified` : "Loading..."}
          color="blue"
          pulse={statsJustUpdated}
        />
        <StatCard
          title="Price Drops"
          value={stats?.priceChanges.drops ?? "—"}
          change="Last 24h"
          color="yellow"
          pulse={statsJustUpdated}
        />
        <StatCard
          title="Out of Stock"
          value={stats?.inventory.outOfStock ?? "—"}
          change={stats ? `${stats.inventory.stockRate}% in stock` : "High velocity signal"}
          color="red"
          pulse={statsJustUpdated}
        />
      </div>

      {/* Inventory Summary */}
      {stats && stats.inventory.totalRecords > 0 && (
        <section className="bg-gray-900/50 rounded-lg p-4 border border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-2xl font-bold text-white">{stats.inventory.totalRecords}</span>
                <span className="text-gray-400 ml-2">inventory records</span>
              </div>
              <div className="text-gray-500">•</div>
              <div>
                <span className="text-xl font-semibold text-green-400">{stats.inventory.uniqueProducts}</span>
                <span className="text-gray-400 ml-2">unique products</span>
              </div>
            </div>
            {stats.scrapeHealth.unresolvedErrors > 0 && (
              <div className="flex items-center gap-2 text-yellow-400">
                <span className="text-sm">⚠️ {stats.scrapeHealth.unresolvedErrors} scrape errors</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Recent Activity Feed */}
      {activity && activity.length > 0 && (
        <section className="bg-gray-900 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">📡 Recent Scrapes</h2>
          <div className="space-y-2">
            {activity.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 bg-gray-800 rounded text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="text-green-400">✓</span>
                  <span className="font-medium">{item.retailerName}</span>
                </div>
                <div className="flex items-center gap-4 text-gray-400">
                  <span>{item.productCount} products</span>
                  <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Trending Brands */}
      <section className={`bg-gray-900 rounded-lg p-6 transition-all duration-300 ${
        trendingJustUpdated ? "ring-2 ring-blue-500/50" : ""
      }`}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">🔥 Trending Brands</h2>
          <LastUpdatedText date={trendingUpdated} />
        </div>
        {trending === undefined ? (
          <div className="text-gray-500">Loading...</div>
        ) : trending?.brands?.length === 0 ? (
          <div className="text-gray-500">No data yet. Run a scrape to populate.</div>
        ) : (
          <div className="grid gap-3">
            {trending?.brands?.map((item: any, i: number) => (
              <div
                key={item.brandId}
                className="flex items-center justify-between p-4 bg-gray-800 rounded-lg"
              >
                <div className="flex items-center space-x-4">
                  <span className="text-2xl font-bold text-gray-500">
                    #{i + 1}
                  </span>
                  <div>
                    <div className="font-semibold">
                      {item.brand?.name || "Unknown Brand"}
                    </div>
                    <div className="text-sm text-gray-400">
                      {item.retailerCount} retailers • {item.productCount} SKUs
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-green-400">
                    ${item.avgPrice}
                  </div>
                  <div className="text-sm text-gray-400">avg price</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent Price Changes */}
      <section className="bg-gray-900 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">💰 Recent Price Changes</h2>
        {priceChanges === undefined ? (
          <div className="text-gray-500">Loading...</div>
        ) : priceChanges?.length === 0 ? (
          <div className="text-gray-500">No price changes in the last 24 hours.</div>
        ) : (
          <div className="grid gap-2">
            {priceChanges?.slice(0, 5).map((item: any) => (
              <div
                key={`${item.retailerId}-${item.productId}`}
                className="flex items-center justify-between p-3 bg-gray-800 rounded"
              >
                <div>
                  <div className="font-medium">{item.product?.name}</div>
                  <div className="text-sm text-gray-400">
                    {item.brand?.name} • {item.retailer?.name}
                  </div>
                </div>
                <div
                  className={`font-semibold ${
                    item.direction === "down" ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {item.direction === "down" ? "↓" : "↑"} {Math.abs(item.changePercent)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Out of Stock Alerts */}
      <section className="bg-gray-900 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">📦 Out of Stock (High Velocity)</h2>
        {outOfStock === undefined ? (
          <div className="text-gray-500">Loading...</div>
        ) : outOfStock?.length === 0 ? (
          <div className="text-gray-500">All tracked products currently in stock.</div>
        ) : (
          <div className="grid gap-2">
            {outOfStock?.slice(0, 5).map((item: any) => (
              <div
                key={`${item.retailerId}-${item.productId}`}
                className="flex items-center justify-between p-3 bg-gray-800 rounded"
              >
                <div>
                  <div className="font-medium">{item.product?.name}</div>
                  <div className="text-sm text-gray-400">
                    {item.brand?.name} • {item.retailer?.name}
                  </div>
                </div>
                <span className="px-2 py-1 text-xs bg-red-900 text-red-200 rounded">
                  OUT OF STOCK
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  title,
  value,
  change,
  color,
  pulse = false,
}: {
  title: string;
  value: string | number;
  change: string;
  color: "green" | "blue" | "yellow" | "red";
  pulse?: boolean;
}) {
  const colorMap = {
    green: "border-green-500",
    blue: "border-blue-500",
    yellow: "border-yellow-500",
    red: "border-red-500",
  };

  const pulseColor = {
    green: "bg-green-500/20",
    blue: "bg-blue-500/20",
    yellow: "bg-yellow-500/20",
    red: "bg-red-500/20",
  };

  return (
    <div
      className={`bg-gray-900 rounded-lg p-4 border-l-4 ${colorMap[color]} transition-all duration-300 ${
        pulse ? pulseColor[color] : ""
      }`}
    >
      <div className="text-sm text-gray-400">{title}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{change}</div>
    </div>
  );
}
