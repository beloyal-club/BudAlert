import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

interface RegionStats {
  name: string;
  covered: number;
  total: number;
  percentage: number;
}

const NYC_MARKET_SIZE = 81; // Total operational NYC retailers from OCM data

export function CoverageDashboard() {
  // Fetch active retailers from Convex
  const retailers = useQuery(api.retailers.list, {});

  // Calculate coverage stats
  const calculateStats = () => {
    if (!retailers) return null;

    const regionMap: Record<string, { covered: number; total: number }> = {
      manhattan: { covered: 0, total: 21 },
      brooklyn: { covered: 0, total: 28 },
      queens: { covered: 0, total: 23 },
      bronx: { covered: 0, total: 4 },
      staten_island: { covered: 0, total: 5 },
    };

    // Count covered retailers by region
    retailers.forEach((r) => {
      const region = r.region.toLowerCase().replace(/[\s-]/g, "_");
      if (regionMap[region]) {
        regionMap[region].covered++;
      } else if (region === "nyc") {
        // Default nyc to manhattan
        regionMap.manhattan.covered++;
      }
    });

    const regions: RegionStats[] = Object.entries(regionMap).map(([name, stats]) => ({
      name: name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      covered: stats.covered,
      total: stats.total,
      percentage: stats.total > 0 ? Math.round((stats.covered / stats.total) * 100) : 0,
    }));

    const totalCovered = Object.values(regionMap).reduce((sum, r) => sum + r.covered, 0);
    const overallPercentage = Math.round((totalCovered / NYC_MARKET_SIZE) * 100);

    return {
      regions,
      totalCovered,
      totalMarket: NYC_MARKET_SIZE,
      overallPercentage,
      lastUpdated: new Date().toLocaleDateString(),
    };
  };

  const stats = calculateStats();

  if (!stats) {
    return (
      <div className="bg-gray-900 rounded-xl p-6 animate-pulse">
        <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-gray-700 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          📊 NYC Market Coverage
        </h2>
        <span className="text-sm text-gray-400">
          Updated: {stats.lastUpdated}
        </span>
      </div>

      {/* Overall Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-lg text-white font-medium">
            {stats.totalCovered} of {stats.totalMarket} retailers
          </span>
          <span className="text-2xl font-bold text-green-400">
            {stats.overallPercentage}%
          </span>
        </div>
        <div className="h-4 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-500"
            style={{ width: `${stats.overallPercentage}%` }}
          />
        </div>
        <p className="text-sm text-gray-400 mt-2">
          {stats.overallPercentage >= 50 ? "✅ Goal reached: 50%+ coverage!" : 
           `${50 - stats.overallPercentage}% more to reach 50% goal`}
        </p>
      </div>

      {/* Region Breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stats.regions.map((region) => (
          <div
            key={region.name}
            className="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-medium truncate">{region.name}</span>
              <span className={`text-sm font-bold ${
                region.percentage >= 50 ? "text-green-400" : 
                region.percentage >= 25 ? "text-yellow-400" : "text-red-400"
              }`}>
                {region.percentage}%
              </span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  region.percentage >= 50 ? "bg-green-500" : 
                  region.percentage >= 25 ? "bg-yellow-500" : "bg-red-500"
                }`}
                style={{ width: `${region.percentage}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {region.covered} / {region.total} retailers
            </p>
          </div>
        ))}
      </div>

      {/* Platform Breakdown */}
      <div className="mt-6 pt-6 border-t border-gray-700">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Platform Support</h3>
        <div className="flex flex-wrap gap-2">
          <span className="px-3 py-1 bg-green-900/50 text-green-400 rounded-full text-sm">
            ✓ Dutchie Embedded (Primary)
          </span>
          <span className="px-3 py-1 bg-green-900/50 text-green-400 rounded-full text-sm">
            ✓ Dutchie Direct
          </span>
          <span className="px-3 py-1 bg-yellow-900/50 text-yellow-400 rounded-full text-sm">
            ⚠ Alpine IQ (Limited)
          </span>
          <span className="px-3 py-1 bg-gray-800 text-gray-400 rounded-full text-sm">
            ✗ Shopify (Not Supported)
          </span>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="mt-6 grid grid-cols-3 gap-4 pt-6 border-t border-gray-700">
        <div className="text-center">
          <p className="text-2xl font-bold text-white">{stats.totalCovered}</p>
          <p className="text-xs text-gray-400">Active Retailers</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-green-400">
            {retailers?.reduce((sum, r) => sum + r.menuSources.filter(s => s.scrapeStatus === "active").length, 0) || 0}
          </p>
          <p className="text-xs text-gray-400">Active Scrapers</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-blue-400">
            {retailers?.reduce((sum, r) => sum + r.menuSources.length, 0) || 0}
          </p>
          <p className="text-xs text-gray-400">Menu Sources</p>
        </div>
      </div>
    </div>
  );
}

export default CoverageDashboard;
