import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useEffect, useState, useRef } from "react";

/**
 * Pulsing live indicator that shows real-time connection status
 */
export function LiveIndicator() {
  const ping = useQuery(api.dashboard.ping);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const prevTimestamp = useRef<number | null>(null);

  useEffect(() => {
    if (ping?.timestamp) {
      setConnected(true);
      // Only update if timestamp changed (indicates fresh data)
      if (prevTimestamp.current !== ping.timestamp) {
        setLastUpdate(Date.now());
        prevTimestamp.current = ping.timestamp;
      }
    }
  }, [ping]);

  // Detect stale connection (no updates in 30s)
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastUpdate && Date.now() - lastUpdate > 30000) {
        setConnected(false);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [lastUpdate]);

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="relative flex h-2 w-2">
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
            connected ? "bg-green-400" : "bg-yellow-400"
          }`}
        />
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${
            connected ? "bg-green-500" : "bg-yellow-500"
          }`}
        />
      </span>
      <span className={connected ? "text-green-400" : "text-yellow-400"}>
        {connected ? "LIVE" : "CONNECTING"}
      </span>
    </div>
  );
}

/**
 * Hook for tracking when data was last updated
 */
export function useLastUpdated<T>(data: T | undefined): {
  data: T | undefined;
  lastUpdated: Date | null;
  justUpdated: boolean;
} {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [justUpdated, setJustUpdated] = useState(false);
  const prevData = useRef<string | null>(null);

  useEffect(() => {
    if (data !== undefined) {
      const dataStr = JSON.stringify(data);
      if (prevData.current !== null && prevData.current !== dataStr) {
        // Data actually changed
        setLastUpdated(new Date());
        setJustUpdated(true);
        setTimeout(() => setJustUpdated(false), 2000);
      } else if (prevData.current === null) {
        // Initial load
        setLastUpdated(new Date());
      }
      prevData.current = dataStr;
    }
  }, [data]);

  return { data, lastUpdated, justUpdated };
}

/**
 * Formatted timestamp that shows relative time
 */
export function LastUpdatedText({ date }: { date: Date | null }) {
  const [, setTick] = useState(0);

  // Update every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  if (!date) return null;

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  let timeAgo: string;

  if (seconds < 10) {
    timeAgo = "just now";
  } else if (seconds < 60) {
    timeAgo = `${seconds}s ago`;
  } else if (seconds < 3600) {
    timeAgo = `${Math.floor(seconds / 60)}m ago`;
  } else {
    timeAgo = date.toLocaleTimeString();
  }

  return (
    <span className="text-gray-500 text-xs">
      Updated {timeAgo}
    </span>
  );
}
