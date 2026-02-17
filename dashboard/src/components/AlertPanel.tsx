/**
 * AlertPanel Component (REL-002)
 * 
 * Displays scraper health alerts and system status.
 */

import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

// Severity color mapping
const severityColors: Record<string, string> = {
  low: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  medium: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  high: "bg-red-500/20 text-red-400 border-red-500/30",
  critical: "bg-red-600/30 text-red-300 border-red-500/50 animate-pulse",
};

const severityIcons: Record<string, string> = {
  low: "🟡",
  medium: "🟠",
  high: "🔴",
  critical: "🚨",
};

const typeIcons: Record<string, string> = {
  new_failures: "❌",
  high_failure_rate: "📉",
  stale_scraper: "⏰",
  rate_limit_spike: "🚫",
  scraper_recovered: "✅",
};

interface AlertCondition {
  type: string;
  severity: string;
  triggered: boolean;
  value: number;
  threshold: number;
  details: string;
}

interface Alert {
  _id: Id<"scraperAlerts">;
  type: string;
  severity: string;
  title: string;
  message: string;
  acknowledged: boolean;
  createdAt: number;
}

/**
 * Compact alert status indicator for nav/header
 */
export function AlertStatusBadge() {
  const digest = useQuery(api.scraperAlerts.getAlertDigest);
  
  if (!digest) return null;
  
  const { isHealthy, unacknowledgedCount, currentConditions } = digest;
  
  if (isHealthy) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400">
        ✓ Healthy
      </span>
    );
  }
  
  const highestSeverity = currentConditions.reduce((max: string, c: AlertCondition) => {
    const order = ["low", "medium", "high", "critical"];
    return order.indexOf(c.severity) > order.indexOf(max) ? c.severity : max;
  }, "low");
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${severityColors[highestSeverity]}`}>
      {severityIcons[highestSeverity]} {unacknowledgedCount} alert{unacknowledgedCount !== 1 ? "s" : ""}
    </span>
  );
}

/**
 * Alert panel for dashboard overview
 */
export function AlertPanel() {
  const conditions = useQuery(api.scraperAlerts.checkAlertConditions);
  const recentAlerts = useQuery(api.scraperAlerts.getAlertHistory, { limit: 5 });
  const acknowledgeAlert = useMutation(api.scraperAlerts.acknowledgeAlert);
  
  if (!conditions) {
    return (
      <div className="bg-gray-800/50 rounded-xl p-4 animate-pulse">
        <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
        <div className="space-y-2">
          <div className="h-4 bg-gray-700 rounded w-full"></div>
          <div className="h-4 bg-gray-700 rounded w-2/3"></div>
        </div>
      </div>
    );
  }
  
  const triggeredConditions = conditions.conditions.filter((c: AlertCondition) => c.triggered);
  const isHealthy = triggeredConditions.length === 0;
  
  return (
    <div className="bg-gray-800/50 rounded-xl p-3 sm:p-4 border border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2">
          {isHealthy ? (
            <>
              <span className="text-green-400">✓</span>
              <span>System Healthy</span>
            </>
          ) : (
            <>
              <span>{severityIcons[triggeredConditions[0]?.severity || "low"]}</span>
              <span>Alert Conditions</span>
            </>
          )}
        </h3>
        <span className="text-xs text-gray-400">
          Checked {new Date(conditions.checkedAt).toLocaleTimeString()}
        </span>
      </div>
      
      {/* Current Conditions */}
      {isHealthy ? (
        <div className="bg-green-500/10 rounded-lg p-3 border border-green-500/20">
          <div className="text-sm text-green-400 mb-2">All systems operating normally</div>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
            <div>Unresolved errors: <span className="text-white">{conditions.summary.totalUnresolved}</span></div>
            <div>Jobs (1h): <span className="text-white">{conditions.summary.successfulJobsLastHour}/{conditions.summary.totalJobsLastHour}</span></div>
            <div>Failure rate: <span className="text-white">{conditions.summary.failureRate}%</span></div>
            <div>Stale retailers: <span className="text-white">{conditions.summary.staleRetailers}</span></div>
          </div>
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          {triggeredConditions.map((condition: AlertCondition, i: number) => (
            <div 
              key={i}
              className={`rounded-lg p-3 border ${severityColors[condition.severity]}`}
            >
              <div className="flex items-start gap-2">
                <span className="text-lg">{typeIcons[condition.type] || "⚠️"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{condition.details}</div>
                  <div className="text-xs opacity-75 mt-0.5">
                    Value: {condition.value} / Threshold: {condition.threshold}
                  </div>
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded uppercase font-medium ${severityColors[condition.severity]}`}>
                  {condition.severity}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Recent Alert History */}
      {recentAlerts && recentAlerts.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-700">
          <h4 className="text-xs font-medium text-gray-400 mb-2">Recent Alerts</h4>
          <div className="space-y-1.5">
            {recentAlerts.slice(0, 3).map((alert: Alert) => (
              <div 
                key={alert._id}
                className={`flex items-center gap-2 text-xs p-2 rounded ${
                  alert.acknowledged ? "bg-gray-700/30" : "bg-gray-700/50"
                }`}
              >
                <span>{severityIcons[alert.severity]}</span>
                <span className="flex-1 truncate">{alert.title}</span>
                <span className="text-gray-500">
                  {formatRelativeTime(alert.createdAt)}
                </span>
                {!alert.acknowledged && (
                  <button
                    onClick={() => acknowledgeAlert({ id: alert._id })}
                    className="text-blue-400 hover:text-blue-300 transition-colors"
                    title="Acknowledge"
                  >
                    ✓
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Summary Stats */}
      <div className="mt-4 pt-3 border-t border-gray-700">
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div>
            <div className="text-gray-400">Errors</div>
            <div className="text-lg font-bold text-white">{conditions.summary.totalUnresolved}</div>
          </div>
          <div>
            <div className="text-gray-400">Rate Limits</div>
            <div className="text-lg font-bold text-white">{conditions.summary.rateLimitErrors}</div>
          </div>
          <div>
            <div className="text-gray-400">Stale</div>
            <div className="text-lg font-bold text-white">{conditions.summary.staleRetailers}</div>
          </div>
          <div>
            <div className="text-gray-400">Jobs/hr</div>
            <div className="text-lg font-bold text-white">{conditions.summary.totalJobsLastHour}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Format relative time
 */
function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Mini alert indicator for mobile header
 */
export function MiniAlertBadge() {
  const digest = useQuery(api.scraperAlerts.getAlertDigest);
  
  if (!digest || digest.isHealthy) return null;
  
  return (
    <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
  );
}
