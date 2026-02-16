import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";

export function Retailers() {
  const [region, setRegion] = useState<string | undefined>(undefined);
  
  const retailers = useQuery(api.retailers.list, {
    region,
    limit: 50,
  });

  const regions = [
    { value: undefined, label: "All Regions" },
    { value: "nyc", label: "🏙️ NYC" },
    { value: "long_island", label: "🏖️ Long Island" },
    { value: "hudson_valley", label: "🏔️ Hudson Valley" },
    { value: "upstate", label: "🌲 Upstate" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Retailer Directory</h1>
        <p className="text-gray-400">
          Licensed NYS cannabis dispensaries with menu tracking
        </p>
      </div>

      {/* Region Filter */}
      <div className="flex gap-2">
        {regions.map((r) => (
          <button
            key={r.value || "all"}
            onClick={() => setRegion(r.value)}
            className={`px-4 py-2 rounded-lg transition ${
              region === r.value
                ? "bg-green-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Retailer List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {retailers === undefined ? (
          <div className="text-gray-500 col-span-full">Loading retailers...</div>
        ) : retailers.length === 0 ? (
          <div className="text-gray-500 col-span-full">
            No retailers found. Seed the database to get started.
          </div>
        ) : (
          retailers.map((retailer) => (
            <RetailerCard key={retailer._id} retailer={retailer} />
          ))
        )}
      </div>
    </div>
  );
}

function RetailerCard({ retailer }: { retailer: any }) {
  const platformColors: Record<string, string> = {
    dutchie: "bg-purple-900 text-purple-200",
    iheartjane: "bg-pink-900 text-pink-200",
    weedmaps: "bg-green-900 text-green-200",
    custom: "bg-gray-700 text-gray-300",
  };

  return (
    <div className="bg-gray-900 rounded-lg p-5 hover:bg-gray-800 transition">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-semibold">{retailer.name}</h3>
          <div className="text-sm text-gray-400 mt-1">
            {retailer.address.city}, {retailer.address.state}
          </div>
        </div>
        <span className="text-xs px-2 py-1 bg-gray-800 rounded">
          {retailer.region.toUpperCase()}
        </span>
      </div>

      {retailer.licenseNumber && (
        <div className="mt-2 text-xs text-gray-500">
          License: {retailer.licenseNumber}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {retailer.menuSources.map((source: any, i: number) => (
          <span
            key={i}
            className={`text-xs px-2 py-1 rounded ${
              platformColors[source.platform] || platformColors.custom
            }`}
          >
            {source.platform}
            {source.scrapeStatus === "active" && " ✓"}
          </span>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-800">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Last scraped</span>
          <span>
            {retailer.menuSources[0]?.lastScrapedAt
              ? new Date(retailer.menuSources[0].lastScrapedAt).toLocaleString()
              : "Never"}
          </span>
        </div>
      </div>
    </div>
  );
}
