import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

export function Analytics() {
  const trending = useQuery(api.analytics.getTrending, {
    region: "statewide",
    period: "weekly",
    limit: 20,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Market Analytics</h1>
        <p className="text-gray-400">
          Deep insights into NYS cannabis market trends
        </p>
      </div>

      {/* Coming Soon Notice */}
      <div className="bg-gray-900 rounded-lg p-8 text-center">
        <div className="text-4xl mb-4">📊</div>
        <h2 className="text-xl font-semibold mb-2">Analytics Dashboard Coming Soon</h2>
        <p className="text-gray-400 max-w-md mx-auto">
          This page will feature:
        </p>
        <ul className="text-gray-500 mt-4 space-y-2">
          <li>• Price trend charts by brand/product</li>
          <li>• Regional distribution heatmaps</li>
          <li>• Sell-through velocity rankings</li>
          <li>• Brand comparison tools</li>
          <li>• Discount pattern detection</li>
        </ul>
      </div>

      {/* Quick Stats */}
      {trending && (
        <div className="bg-gray-900 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Quick Market Stats</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-800 rounded p-4">
              <div className="text-2xl font-bold text-green-400">
                {trending.brands?.length || 0}
              </div>
              <div className="text-sm text-gray-400">Active Brands</div>
            </div>
            <div className="bg-gray-800 rounded p-4">
              <div className="text-2xl font-bold text-blue-400">
                {trending.brands?.reduce((sum: number, b: any) => sum + b.retailerCount, 0) || 0}
              </div>
              <div className="text-sm text-gray-400">Brand-Retailer Links</div>
            </div>
            <div className="bg-gray-800 rounded p-4">
              <div className="text-2xl font-bold text-yellow-400">
                $
                {trending.brands?.length
                  ? Math.round(
                      trending.brands.reduce((sum: number, b: any) => sum + b.avgPrice, 0) /
                        trending.brands.length
                    )
                  : 0}
              </div>
              <div className="text-sm text-gray-400">Avg Price (all)</div>
            </div>
            <div className="bg-gray-800 rounded p-4">
              <div className="text-2xl font-bold text-red-400">
                {trending.brands?.reduce((sum: number, b: any) => sum + b.outOfStockCount, 0) || 0}
              </div>
              <div className="text-sm text-gray-400">OOS Events</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
