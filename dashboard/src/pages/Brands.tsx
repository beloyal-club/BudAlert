import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";

export function Brands() {
  const [category, setCategory] = useState<string | undefined>(undefined);
  
  const brands = useQuery(api.brands.list, {
    category,
    limit: 50,
  });

  const categories = [
    { value: undefined, label: "All Categories" },
    { value: "flower", label: "🌸 Flower" },
    { value: "pre_roll", label: "🚬 Pre-Rolls" },
    { value: "vape", label: "💨 Vapes" },
    { value: "edible", label: "🍬 Edibles" },
    { value: "concentrate", label: "💎 Concentrates" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Brand Directory</h1>
        <p className="text-gray-400">
          Track brand distribution, pricing, and velocity across NYS dispensaries
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {categories.map((cat) => (
          <button
            key={cat.value || "all"}
            onClick={() => setCategory(cat.value)}
            className={`px-4 py-2 rounded-lg transition ${
              category === cat.value
                ? "bg-green-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Brand List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {brands === undefined ? (
          <div className="text-gray-500 col-span-full">Loading brands...</div>
        ) : brands.length === 0 ? (
          <div className="text-gray-500 col-span-full">
            No brands found. Run a scrape to populate data.
          </div>
        ) : (
          brands.map((brand) => (
            <BrandCard key={brand._id} brand={brand} />
          ))
        )}
      </div>
    </div>
  );
}

function BrandCard({ brand }: { brand: any }) {
  return (
    <div className="bg-gray-900 rounded-lg p-5 hover:bg-gray-800 transition cursor-pointer">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">{brand.name}</h3>
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
          Also known as: {brand.aliases.join(", ")}
        </div>
      )}
      
      <div className="mt-4 pt-4 border-t border-gray-800 flex justify-between text-sm">
        <span className="text-gray-400">First seen</span>
        <span>{new Date(brand.firstSeenAt).toLocaleDateString()}</span>
      </div>
    </div>
  );
}
