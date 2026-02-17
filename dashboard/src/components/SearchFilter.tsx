import { useState, useCallback } from "react";

interface SearchFilterProps {
  placeholder?: string;
  onSearch: (query: string) => void;
  debounceMs?: number;
}

export function SearchFilter({ 
  placeholder = "Search...", 
  onSearch,
  debounceMs = 200 
}: SearchFilterProps) {
  const [value, setValue] = useState("");
  const [timeoutId, setTimeoutId] = useState<number | null>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    const id = window.setTimeout(() => {
      onSearch(newValue);
    }, debounceMs);
    
    setTimeoutId(id);
  }, [onSearch, debounceMs, timeoutId]);

  const handleClear = useCallback(() => {
    setValue("");
    onSearch("");
  }, [onSearch]);

  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <svg 
          className="h-5 w-5 text-gray-400" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" 
          />
        </svg>
      </div>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full pl-10 pr-10 py-2 bg-gray-800 border border-gray-700 rounded-lg 
                   text-white placeholder-gray-400 focus:outline-none focus:ring-2 
                   focus:ring-green-500 focus:border-transparent transition"
      />
      {value && (
        <button
          onClick={handleClear}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 
                     hover:text-white transition"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M6 18L18 6M6 6l12 12" 
            />
          </svg>
        </button>
      )}
    </div>
  );
}

interface FilterBarProps {
  children: React.ReactNode;
  searchPlaceholder?: string;
  onSearch: (query: string) => void;
  resultCount?: number;
  totalCount?: number;
}

export function FilterBar({ 
  children, 
  searchPlaceholder, 
  onSearch,
  resultCount,
  totalCount
}: FilterBarProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <SearchFilter placeholder={searchPlaceholder} onSearch={onSearch} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {children}
        </div>
      </div>
      {resultCount !== undefined && totalCount !== undefined && (
        <div className="text-sm text-gray-500">
          Showing {resultCount} of {totalCount} results
        </div>
      )}
    </div>
  );
}

interface FilterButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

export function FilterButton({ active, onClick, children }: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg transition whitespace-nowrap ${
        active
          ? "bg-green-600 text-white"
          : "bg-gray-800 text-gray-300 hover:bg-gray-700"
      }`}
    >
      {children}
    </button>
  );
}
