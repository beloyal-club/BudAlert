/**
 * RadiusCompetitorSelector - Distance-based competitor selection
 * 
 * Allows dispensaries to:
 * - Set their anchor location
 * - Choose radius (1, 2, 3, 5 miles)
 * - See and select competitors within that radius
 * - Bulk add all nearby competitors
 */

import { useState, useMemo } from "react";

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface NearbyCompetitor {
  id: string;
  name: string;
  slug: string;
  address?: {
    street?: string;
    city: string;
    state: string;
    zip?: string;
  };
  region: string;
  coordinates: Coordinates;
  distanceMiles: number;
  distanceFormatted: string;
  isMonitored: boolean;
  lastUpdated?: number;
}

interface RadiusCompetitorSelectorProps {
  anchor: {
    name: string;
    coordinates: Coordinates;
  };
  competitors: NearbyCompetitor[];
  radiusMiles: number;
  onRadiusChange: (radius: number) => void;
  onAddCompetitor: (id: string) => void;
  onRemoveCompetitor: (id: string) => void;
  onAddAllInRadius: () => void;
  planLimit: number;
  currentCount: number;
  isLoading?: boolean;
}

const RADIUS_OPTIONS = [1, 2, 3, 5];

export function RadiusCompetitorSelector({
  anchor,
  competitors,
  radiusMiles,
  onRadiusChange,
  onAddCompetitor,
  onRemoveCompetitor,
  onAddAllInRadius,
  planLimit,
  currentCount,
  isLoading,
}: RadiusCompetitorSelectorProps) {
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Group competitors by region
  const regions = useMemo(() => {
    const regionMap: Record<string, number> = {};
    competitors.forEach((c) => {
      regionMap[c.region] = (regionMap[c.region] || 0) + 1;
    });
    return Object.entries(regionMap).sort((a, b) => b[1] - a[1]);
  }, [competitors]);

  // Filter competitors
  const filteredCompetitors = useMemo(() => {
    return competitors.filter((c) => {
      if (selectedRegion && c.region !== selectedRegion) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          c.name.toLowerCase().includes(query) ||
          c.address?.street?.toLowerCase().includes(query) ||
          c.address?.city.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [competitors, selectedRegion, searchQuery]);

  const monitoredCount = competitors.filter((c) => c.isMonitored).length;
  const availableSlots = planLimit - currentCount;

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return "Never";
    const diff = Date.now() - timestamp;
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  return (
    <div className="space-y-6">
      {/* Header with anchor info */}
      <div className="bg-gradient-to-r from-cannabis-900/50 to-cannabis-800/30 border border-cannabis-700/50 rounded-xl p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-cannabis-400 uppercase tracking-wide mb-1">Your Location</p>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              📍 {anchor.name}
            </h3>
            <p className="text-sm text-neutral-400">
              {anchor.coordinates.lat.toFixed(4)}, {anchor.coordinates.lng.toFixed(4)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-neutral-500">Monitoring</p>
            <p className="text-2xl font-bold text-cannabis-400">
              {monitoredCount} <span className="text-sm text-neutral-500">/ {planLimit}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Radius Selector */}
      <div>
        <p className="text-sm text-neutral-400 mb-3">Select competitor radius</p>
        <div className="flex gap-2">
          {RADIUS_OPTIONS.map((radius) => (
            <button
              key={radius}
              onClick={() => onRadiusChange(radius)}
              className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
                radiusMiles === radius
                  ? "bg-cannabis-600 text-white ring-2 ring-cannabis-400 ring-offset-2 ring-offset-neutral-900"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
              }`}
            >
              <div className="text-lg">{radius}</div>
              <div className="text-xs opacity-70">mile{radius !== 1 ? "s" : ""}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-between text-sm">
        <div className="text-neutral-400">
          <span className="text-cannabis-400 font-semibold">{competitors.length}</span> dispensaries
          within <span className="text-white font-medium">{radiusMiles} mile{radiusMiles !== 1 ? "s" : ""}</span>
        </div>
        {availableSlots > 0 && competitors.filter((c) => !c.isMonitored).length > 0 && (
          <button
            onClick={onAddAllInRadius}
            className="px-3 py-1.5 rounded-lg bg-cannabis-600 hover:bg-cannabis-500 text-white text-sm font-medium transition-colors"
          >
            + Add all ({Math.min(availableSlots, competitors.filter((c) => !c.isMonitored).length)})
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search dispensaries..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 px-4 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-cannabis-500"
        />
        <select
          value={selectedRegion || ""}
          onChange={(e) => setSelectedRegion(e.target.value || null)}
          className="px-4 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white focus:outline-none focus:ring-2 focus:ring-cannabis-500"
        >
          <option value="">All Regions</option>
          {regions.map(([region, count]) => (
            <option key={region} value={region}>
              {region.charAt(0).toUpperCase() + region.slice(1)} ({count})
            </option>
          ))}
        </select>
      </div>

      {/* Competitor List */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="text-center py-8 text-neutral-500">
            <div className="animate-spin w-8 h-8 border-2 border-cannabis-500 border-t-transparent rounded-full mx-auto mb-3"></div>
            <p>Loading nearby competitors...</p>
          </div>
        ) : filteredCompetitors.length === 0 ? (
          <div className="text-center py-8 text-neutral-500">
            <p className="text-3xl mb-2">🏪</p>
            <p>No dispensaries found in this range</p>
            <p className="text-sm">Try increasing the radius</p>
          </div>
        ) : (
          filteredCompetitors.map((competitor) => (
            <div
              key={competitor.id}
              className={`flex items-center justify-between p-4 rounded-xl transition-colors ${
                competitor.isMonitored
                  ? "bg-cannabis-900/30 border border-cannabis-700/50"
                  : "bg-neutral-900 border border-neutral-800 hover:border-neutral-700"
              }`}
            >
              <div className="flex items-center gap-4">
                {/* Distance badge */}
                <div className="w-16 text-center">
                  <div className="text-lg font-bold text-cannabis-400">
                    {competitor.distanceFormatted}
                  </div>
                </div>

                {/* Info */}
                <div>
                  <h4 className="font-medium text-white flex items-center gap-2">
                    {competitor.name}
                    {competitor.isMonitored && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-cannabis-600/30 text-cannabis-400">
                        Monitoring
                      </span>
                    )}
                  </h4>
                  <p className="text-sm text-neutral-500">
                    {competitor.address?.street && `${competitor.address.street}, `}
                    {competitor.address?.city}
                    <span className="mx-2">•</span>
                    <span className="capitalize">{competitor.region}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Last updated */}
                <div className="text-right text-xs text-neutral-500 hidden md:block">
                  <p>Updated</p>
                  <p>{formatTime(competitor.lastUpdated)}</p>
                </div>

                {/* Action button */}
                {competitor.isMonitored ? (
                  <button
                    onClick={() => onRemoveCompetitor(competitor.id)}
                    className="p-2 rounded-lg bg-neutral-800 hover:bg-red-900/50 text-neutral-400 hover:text-red-400 transition-colors"
                    title="Stop monitoring"
                  >
                    ✕
                  </button>
                ) : availableSlots > 0 ? (
                  <button
                    onClick={() => onAddCompetitor(competitor.id)}
                    className="px-4 py-2 rounded-lg bg-cannabis-600 hover:bg-cannabis-500 text-white text-sm font-medium transition-colors"
                  >
                    + Monitor
                  </button>
                ) : (
                  <span className="text-xs text-amber-400 px-3 py-2">
                    Plan limit reached
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Plan limit notice */}
      {availableSlots <= 3 && (
        <div className="p-4 rounded-xl bg-amber-900/20 border border-amber-700/50 text-amber-200 text-sm">
          <p className="font-medium">⚠️ Running low on competitor slots</p>
          <p className="text-amber-300/70 mt-1">
            You have {availableSlots} slot{availableSlots !== 1 ? "s" : ""} remaining.{" "}
            <a href="#upgrade" className="underline hover:text-white">
              Upgrade your plan
            </a>{" "}
            to monitor more competitors.
          </p>
        </div>
      )}
    </div>
  );
}

export default RadiusCompetitorSelector;
