import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

export function Overview() {
  const trending = useQuery(api.analytics.getTrending, {
    region: "statewide",
    period: "weekly",
    limit: 10,
  });

  const priceChanges = useQuery(api.inventory.getPriceChanges, {
    hoursAgo: 24,
    limit: 10,
  });

  const outOfStock = useQuery(api.inventory.getOutOfStock, {
    limit: 10,
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Market Overview</h1>
        <p className="text-gray-400">
          Real-time cannabis market intelligence for New York State
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Active Retailers"
          value="—"
          change="+3 this week"
          color="green"
        />
        <StatCard
          title="Tracked Brands"
          value={trending?.brands?.length || "—"}
          change="Top performers"
          color="blue"
        />
        <StatCard
          title="Price Drops"
          value={priceChanges?.filter((p: any) => p.direction === "down").length || "—"}
          change="Last 24h"
          color="yellow"
        />
        <StatCard
          title="Out of Stock"
          value={outOfStock?.length || "—"}
          change="High velocity signal"
          color="red"
        />
      </div>

      {/* Trending Brands */}
      <section className="bg-gray-900 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">🔥 Trending Brands</h2>
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
}: {
  title: string;
  value: string | number;
  change: string;
  color: "green" | "blue" | "yellow" | "red";
}) {
  const colorMap = {
    green: "border-green-500",
    blue: "border-blue-500",
    yellow: "border-yellow-500",
    red: "border-red-500",
  };

  return (
    <div className={`bg-gray-900 rounded-lg p-4 border-l-4 ${colorMap[color]}`}>
      <div className="text-sm text-gray-400">{title}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{change}</div>
    </div>
  );
}
