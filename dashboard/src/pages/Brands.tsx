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
    { value: undefined, label: "All Categories" },
    { value: "flower", label: "🌸 Flower" },
    { value: "pre_roll", label: "🚬 Pre-Rolls" },
    { value: "vape", label: "💨 Vapes" },
    { value: "edible", label: "🍬 Edibles" },
    { value: "concentrate", label: "💎 Concentrates" },
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Brand Directory</h1>
        <p className="text-gray-400">
          Track brand distribution, pricing, and velocity across NYS dispensaries
        </p>
      </div>

      {/* Search + Category Filters */}
      <FilterBar 
        searchPlaceholder="Search brands by name or alias..."
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
          onClick={() => setSortBy("recent")}
          className={`px-2 py-1 rounded ${
            sortBy === "recent" ? "bg-gray-700 text-white" : "hover:text-white"
          }`}
        >
          Recently Added
        </button>
      </div>

      {/* Brand List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBrands === undefined ? (
          <div className="text-gray-500 col-span-full">Loading brands...</div>
        ) : filteredBrands.length === 0 ? (
          <div className="text-gray-500 col-span-full text-center py-8">
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
    <div className="bg-gray-900 rounded-lg p-5 hover:bg-gray-800 transition cursor-pointer">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">{highlight(brand.name)}</h3>
          <div className="text-sm text-gray-400 mt-1">
            {brand.category || "Multi-category"}
          </div>
        </div>
        {brand.isVerified && (
          <span className="text-green-400" title="Verified brand">
            ✓
          </span>
        )}
      </div>
      
      {brand.aliases && brand.aliases.length > 0 && (
        <div className="mt-3 text-xs text-gray-500">
          Also known as: {brand.aliases.map((a: string, i: number) => (
            <span key={i}>
              {i > 0 && ", "}
              {highlight(a)}
            </span>
          ))}
        </div>
      )}
      
      <div className="mt-4 pt-4 border-t border-gray-800 flex justify-between text-sm">
        <span className="text-gray-400">First seen</span>
        <span>{new Date(brand.firstSeenAt).toLocaleDateString()}</span>
      </div>
    </div>
  );
}
