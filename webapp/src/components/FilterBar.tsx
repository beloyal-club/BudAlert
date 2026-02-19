import type { Id } from "../../../convex/_generated/dataModel";

interface FilterOptions {
  categories: string[];
  strains: string[];
  retailers: { id: Id<"retailers">; name: string; city: string }[];
}

interface Filters {
  query: string;
  category: string | null;
  strain: string | null;
  retailerId: Id<"retailers"> | null;
  inStockOnly: boolean;
}

interface FilterBarProps {
  options: FilterOptions;
  filters: Filters;
  onChange: (key: keyof Filters, value: any) => void;
  onClear: () => void;
}

export function FilterBar({ options, filters, onChange, onClear }: FilterBarProps) {
  return (
    <div className="bg-neutral-900 border-t border-neutral-800 px-4 py-4">
      <div className="max-w-3xl mx-auto space-y-3">
        {/* Category Pills */}
        <div>
          <p className="text-xs text-neutral-500 mb-2 font-medium">Category</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onChange("category", null)}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                !filters.category
                  ? "bg-cannabis-600 text-white"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
              }`}
            >
              All
            </button>
            {options.categories.slice(0, 8).map((cat) => (
              <button
                key={cat}
                onClick={() => onChange("category", cat)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  filters.category === cat
                    ? "bg-cannabis-600 text-white"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                }`}
              >
                {formatCategory(cat)}
              </button>
            ))}
          </div>
        </div>

        {/* Strain Type Pills */}
        <div>
          <p className="text-xs text-neutral-500 mb-2 font-medium">Strain Type</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onChange("strain", null)}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                !filters.strain
                  ? "bg-cannabis-600 text-white"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
              }`}
            >
              All
            </button>
            {["Indica", "Sativa", "Hybrid"].map((strain) => (
              <button
                key={strain}
                onClick={() => onChange("strain", strain)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  filters.strain === strain
                    ? "bg-cannabis-600 text-white"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                }`}
              >
                {strain}
              </button>
            ))}
          </div>
        </div>

        {/* Dispensary Select */}
        <div>
          <p className="text-xs text-neutral-500 mb-2 font-medium">Dispensary</p>
          <select
            value={filters.retailerId || ""}
            onChange={(e) => onChange("retailerId", e.target.value || null)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cannabis-500"
          >
            <option value="">All Dispensaries</option>
            {options.retailers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.city})
              </option>
            ))}
          </select>
        </div>

        {/* Clear Button */}
        <button
          onClick={onClear}
          className="w-full py-2 text-sm text-neutral-400 hover:text-white transition-colors"
        >
          Clear all filters
        </button>
      </div>
    </div>
  );
}

function formatCategory(cat: string): string {
  return cat
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
