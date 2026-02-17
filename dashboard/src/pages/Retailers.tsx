import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useState, useMemo } from "react";
import { FilterBar, FilterButton } from "../components/SearchFilter";

export function Retailers() {
  const [region, setRegion] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "lastScraped">("name");
  
  const retailers = useQuery(api.retailers.list, {
    region,
    limit: 100,
  });

  const regions = [
    { value: undefined, label: "All Regions" },
    { value: "nyc", label: "🏙️ NYC" },
    { value: "long_island", label: "🏖️ Long Island" },
    { value: "hudson_valley", label: "🏔️ Hudson Valley" },
    { value: "upstate", label: "🌲 Upstate" },
  ];

  // Filter and sort retailers
  const filteredRetailers = useMemo(() => {
    if (!retailers) return undefined;
    
    let filtered = retailers;
    
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((r) => 
        r.name.toLowerCase().includes(query) ||
        r.address?.city?.toLowerCase().includes(query) ||
        r.licenseNumber?.toLowerCase().includes(query) ||
        r.menuSources?.some((s: any) => s.platform?.toLowerCase().includes(query))
      );
    }
    
    // Sort
    return [...filtered].sort((a, b) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      } else {
        const aTime = a.menuSources?.[0]?.lastScrapedAt || 0;
        const bTime = b.menuSources?.[0]?.lastScrapedAt || 0;
        return bTime - aTime;
      }
    });
  }, [retailers, searchQuery, sortBy]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Retailer Directory</h1>
        <p className="text-gray-400">
          Licensed NYS cannabis dispensaries with menu tracking
        </p>
      </div>

      {/* Search + Region Filter */}
      <FilterBar 
        searchPlaceholder="Search retailers by name, city, license..."
        onSearch={setSearchQuery}
        resultCount={filteredRetailers?.length}
        totalCount={retailers?.length}
      >
        {regions.map((r) => (
          <FilterButton
            key={r.value || "all"}
            active={region === r.value}
            onClick={() => setRegion(r.value)}
          >
            {r.label}
          </FilterButton>
        ))}
      </FilterBar>

      {/* Sort Options */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <span>Sort by:</span>
        <button
          onClick={() => setSortBy("name")}
          className={`px-2 py-1 rounded ${
            sortBy === "name" ? "bg-gray-700 text-white" : "hover:text-white"
          }`}
        >
          Name
        </button>
        <button
          onClick={() => setSortBy("lastScraped")}
          className={`px-2 py-1 rounded ${
            sortBy === "lastScraped" ? "bg-gray-700 text-white" : "hover:text-white"
          }`}
        >
          Recently Scraped
        </button>
      </div>

      {/* Retailer List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredRetailers === undefined ? (
          <div className="text-gray-500 col-span-full">Loading retailers...</div>
        ) : filteredRetailers.length === 0 ? (
          <div className="text-gray-500 col-span-full text-center py-8">
            {searchQuery ? (
              <>No retailers match "{searchQuery}"</>
            ) : (
              <>No retailers found. Seed the database to get started.</>
            )}
          </div>
        ) : (
          filteredRetailers.map((retailer) => (
            <RetailerCard key={retailer._id} retailer={retailer} searchQuery={searchQuery} />
          ))
        )}
      </div>
    </div>
  );
}

function RetailerCard({ retailer, searchQuery }: { retailer: any; searchQuery: string }) {
  const platformColors: Record<string, string> = {
    dutchie: "bg-purple-900 text-purple-200",
    iheartjane: "bg-pink-900 text-pink-200",
    weedmaps: "bg-green-900 text-green-200",
    custom: "bg-gray-700 text-gray-300",
  };

  // Highlight matching text
  const highlight = (text: string) => {
    if (!searchQuery.trim() || !text) return text;
    const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) => 
      regex.test(part) ? (
        <mark key={i} className="bg-green-700 text-white rounded px-0.5">{part}</mark>
      ) : part
    );
  };

  return (
    <div className="bg-gray-900 rounded-lg p-5 hover:bg-gray-800 transition">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-semibold">{highlight(retailer.name)}</h3>
          <div className="text-sm text-gray-400 mt-1">
            {highlight(retailer.address?.city || "")}, {retailer.address?.state}
          </div>
        </div>
        <span className="text-xs px-2 py-1 bg-gray-800 rounded">
          {retailer.region?.toUpperCase() || "N/A"}
        </span>
      </div>

      {retailer.licenseNumber && (
        <div className="mt-2 text-xs text-gray-500">
          License: {highlight(retailer.licenseNumber)}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {retailer.menuSources?.map((source: any, i: number) => (
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
            {retailer.menuSources?.[0]?.lastScrapedAt
              ? new Date(retailer.menuSources[0].lastScrapedAt).toLocaleString()
              : "Never"}
          </span>
        </div>
      </div>
    </div>
  );
}
