import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useState, useMemo } from "react";
import { FilterBar, FilterButton } from "../components/SearchFilter";

export function Brands() {
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "recent">("name");
  
  const brands = useQuery(api.brands.list, {
    category,
    limit: 100,
  });

  const categories = [
    { value: undefined, label: "All" },
    { value: "flower", label: "🌸 Flower" },
    { value: "pre_roll", label: "🚬 Pre-Roll" },
    { value: "vape", label: "💨 Vape" },
    { value: "edible", label: "🍬 Edible" },
    { value: "concentrate", label: "💎 Conc." },
  ];

  // Filter and sort brands
  const filteredBrands = useMemo(() => {
    if (!brands) return undefined;
    
    let filtered = brands;
    
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((b) => 
        b.name.toLowerCase().includes(query) ||
        b.aliases?.some((a: string) => a.toLowerCase().includes(query)) ||
        b.category?.toLowerCase().includes(query)
      );
    }
    
    // Sort
    return [...filtered].sort((a, b) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      } else {
        return new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime();
      }
    });
  }, [brands, searchQuery, sortBy]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">Brand Directory</h1>
        <p className="text-gray-400 text-sm sm:text-base">
          Track brand distribution across NYS
        </p>
      </div>

      {/* Search + Category Filters */}
      <FilterBar 
        searchPlaceholder="Search brands..."
        onSearch={setSearchQuery}
        resultCount={filteredBrands?.length}
        totalCount={brands?.length}
      >
        {categories.map((cat) => (
          <FilterButton
            key={cat.value || "all"}
            active={category === cat.value}
            onClick={() => setCategory(cat.value)}
          >
            {cat.label}
          </FilterButton>
        ))}
      </FilterBar>

      {/* Sort Options */}
      <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-400">
        <span>Sort:</span>
        <button
          onClick={() => setSortBy("name")}
          className={`px-2 py-1 rounded ${
            sortBy === "name" ? "bg-gray-700 text-white" : "hover:text-white"
          }`}
        >
          Name
        </button>
        <button
          onClick={() => setSortBy("recent")}
          className={`px-2 py-1 rounded ${
            sortBy === "recent" ? "bg-gray-700 text-white" : "hover:text-white"
          }`}
        >
          Recent
        </button>
      </div>

      {/* Brand List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {filteredBrands === undefined ? (
          <div className="text-gray-500 col-span-full text-sm">Loading brands...</div>
        ) : filteredBrands.length === 0 ? (
          <div className="text-gray-500 col-span-full text-center py-6 sm:py-8 text-sm">
            {searchQuery ? (
              <>No brands match "{searchQuery}"</>
            ) : (
              <>No brands found. Run a scrape to populate data.</>
            )}
          </div>
        ) : (
          filteredBrands.map((brand) => (
            <BrandCard key={brand._id} brand={brand} searchQuery={searchQuery} />
          ))
        )}
      </div>
    </div>
  );
}

function BrandCard({ brand, searchQuery }: { brand: any; searchQuery: string }) {
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
    <div className="bg-gray-900 rounded-lg p-4 sm:p-5 hover:bg-gray-800 transition cursor-pointer">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-base sm:text-lg font-semibold truncate">{highlight(brand.name)}</h3>
          <div className="text-xs sm:text-sm text-gray-400 mt-0.5 sm:mt-1">
            {brand.category || "Multi-category"}
          </div>
        </div>
        {brand.isVerified && (
          <span className="text-green-400 flex-shrink-0" title="Verified brand">
            ✓
          </span>
        )}
      </div>
      
      {brand.aliases && brand.aliases.length > 0 && (
        <div className="mt-2 sm:mt-3 text-[10px] sm:text-xs text-gray-500 truncate">
          Also: {brand.aliases.slice(0, 3).map((a: string, i: number) => (
            <span key={i}>
              {i > 0 && ", "}
              {highlight(a)}
            </span>
          ))}
          {brand.aliases.length > 3 && ` +${brand.aliases.length - 3}`}
        </div>
      )}
      
      <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-800 flex justify-between text-xs sm:text-sm">
        <span className="text-gray-400">First seen</span>
        <span className="text-gray-300">{new Date(brand.firstSeenAt).toLocaleDateString()}</span>
      </div>
    </div>
  );
}
