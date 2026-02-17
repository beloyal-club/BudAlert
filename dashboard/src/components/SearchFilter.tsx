import { useState, useCallback, useEffect } from "react";

interface SearchFilterProps {
  placeholder?: string;
  onSearch: (query: string) => void;
  debounceMs?: number;
}

/**
 * Debounced search input with clear button
 */
export function SearchFilter({
  placeholder = "Search...",
  onSearch,
  debounceMs = 200,
}: SearchFilterProps) {
  const [value, setValue] = useState("");

  // Debounce the search callback
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(value);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [value, onSearch, debounceMs]);

  const handleClear = useCallback(() => {
    setValue("");
    onSearch("");
  }, [onSearch]);

  return (
    <div className="relative flex-1 min-w-0">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base 
                   placeholder-gray-500 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500
                   pr-8 sm:pr-10"
      />
      {value && (
        <button
          onClick={handleClear}
          className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white 
                     p-1 text-sm sm:text-base"
          aria-label="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  );
}

interface FilterBarProps {
  searchPlaceholder?: string;
  onSearch: (query: string) => void;
  resultCount?: number;
  totalCount?: number;
  children?: React.ReactNode;
}

/**
 * Combined search + filter bar with result count
 */
export function FilterBar({
  searchPlaceholder,
  onSearch,
  resultCount,
  totalCount,
  children,
}: FilterBarProps) {
  return (
    <div className="space-y-3">
      {/* Search Row */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <SearchFilter placeholder={searchPlaceholder} onSearch={onSearch} />
        
        {/* Result count - desktop inline, mobile below */}
        {resultCount !== undefined && totalCount !== undefined && (
          <div className="text-xs sm:text-sm text-gray-400 sm:whitespace-nowrap">
            {resultCount === totalCount ? (
              <span>{totalCount} total</span>
            ) : (
              <span>
                <span className="text-white font-medium">{resultCount}</span> of {totalCount}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Filter Buttons Row - horizontal scroll on mobile */}
      {children && (
        <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0 pb-2 sm:pb-0">
          <div className="flex gap-2 min-w-max sm:flex-wrap">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

interface FilterButtonProps {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

/**
 * Filter button with active state
 */
export function FilterButton({ active, onClick, children }: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition whitespace-nowrap
                  ${
                    active
                      ? "bg-green-600 text-white"
                      : "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
                  }`}
    >
      {children}
    </button>
  );
}
