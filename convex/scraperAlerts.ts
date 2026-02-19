/**
 * Scraper Alerting System (REL-002)
 * 
 * Monitors scraper health and sends alerts when issues are detected:
 * - New failures in dead letter queue
 * - High failure rate (> threshold)
 * - Stale scrapers (no activity in X hours)
 * - Rate limit spikes
 * 
 * Supports Discord webhook delivery and dashboard notifications.
 */

import { mutation, query, action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// ============================================================
// ALERT THRESHOLDS (configurable)
// ============================================================

export const ALERT_CONFIG = {
  // New failures threshold (trigger alert after X new failures)
  newFailuresThreshold: 3,
  
  // Failure rate threshold (% of scrapes that failed)
  failureRateThreshold: 20,
  
  // Stale scraper alert (minutes since last successful scrape)
  // Changed from 6 hours to 45 minutes for 15-min scrape cycles (HIGH-001)
  staleMinutesThreshold: 45,
  
  // Rate limit spike (number of 429s in last hour)
  rateLimitThreshold: 5,
  
  // Minimum time between alerts for same issue (minutes)
  alertCooldownMinutes: 15, // Reduced from 30 for faster alerting
  
  // Alert severity levels
  SEVERITY: {
    LOW: "low",
    MEDIUM: "medium", 
    HIGH: "high",
    CRITICAL: "critical",
  },
};

// ============================================================
// ALERT TYPES
// ============================================================

export type AlertType = 
  | "new_failures"
  | "high_failure_rate"
  | "stale_scraper"
  | "rate_limit_spike"
  | "scraper_recovered";

// ============================================================
// QUERIES
// ============================================================

/**
 * Check current alert conditions without sending
 */
export const checkAlertConditions = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;
    const staleThresholdAgo = now - ALERT_CONFIG.staleMinutesThreshold * 60 * 1000;
    
    // Get dead letter stats
    const unresolved = await ctx.db
      .query("deadLetterQueue")
      .filter((f) => f.eq(f.field("resolvedAt"), undefined))
      .collect();
    
    // Get recent failures (last hour)
    const recentFailures = unresolved.filter(e => e.lastAttemptAt > hourAgo);
    
    // Get rate limit errors
    const rateLimitErrors = unresolved.filter(e => e.errorType === "rate_limit");
    const recentRateLimits = rateLimitErrors.filter(e => e.lastAttemptAt > hourAgo);
    
    // Get scrape job stats
    const recentJobs = await ctx.db
      .query("scrapeJobs")
      .filter((f) => f.gte(f.field("startedAt"), hourAgo))
      .collect();
    
    const successfulJobs = recentJobs.filter(j => j.status === "completed");
    const failedJobs = recentJobs.filter(j => j.status === "failed");
    const failureRate = recentJobs.length > 0 
      ? (failedJobs.length / recentJobs.length) * 100 
      : 0;
    
    // Check for stale retailers (active but not scraped recently)
    const retailers = await ctx.db.query("retailers").collect();
    const activeRetailers = retailers.filter(r => r.isActive);
    const staleRetailers = activeRetailers.filter(r => {
      const lastScraped = r.menuSources?.[0]?.lastScrapedAt;
      return !lastScraped || lastScraped < staleThresholdAgo;
    });
    
    // Build alert conditions
    const conditions: Array<{
      type: AlertType;
      severity: string;
      triggered: boolean;
      value: number;
      threshold: number;
      details: string;
    }> = [];
    
    // New failures alert
    conditions.push({
      type: "new_failures",
      severity: recentFailures.length >= 10 ? "critical" : 
                recentFailures.length >= 5 ? "high" : 
                recentFailures.length >= ALERT_CONFIG.newFailuresThreshold ? "medium" : "low",
      triggered: recentFailures.length >= ALERT_CONFIG.newFailuresThreshold,
      value: recentFailures.length,
      threshold: ALERT_CONFIG.newFailuresThreshold,
      details: `${recentFailures.length} new failure(s) in the last hour`,
    });
    
    // High failure rate alert
    conditions.push({
      type: "high_failure_rate",
      severity: failureRate >= 50 ? "critical" : 
                failureRate >= 30 ? "high" : 
                failureRate >= ALERT_CONFIG.failureRateThreshold ? "medium" : "low",
      triggered: failureRate >= ALERT_CONFIG.failureRateThreshold,
      value: Math.round(failureRate),
      threshold: ALERT_CONFIG.failureRateThreshold,
      details: `${Math.round(failureRate)}% failure rate (${failedJobs.length}/${recentJobs.length} jobs)`,
    });
    
    // Stale scraper alert
    conditions.push({
      type: "stale_scraper",
      severity: staleRetailers.length >= activeRetailers.length * 0.5 ? "high" :
                staleRetailers.length >= 3 ? "medium" : "low",
      triggered: staleRetailers.length >= 3,
      value: staleRetailers.length,
      threshold: 3,
      details: `${staleRetailers.length} retailer(s) not scraped in ${ALERT_CONFIG.staleHoursThreshold}+ hours`,
    });
    
    // Rate limit spike alert
    conditions.push({
      type: "rate_limit_spike",
      severity: recentRateLimits.length >= 10 ? "critical" :
                recentRateLimits.length >= ALERT_CONFIG.rateLimitThreshold ? "high" : "low",
      triggered: recentRateLimits.length >= ALERT_CONFIG.rateLimitThreshold,
      value: recentRateLimits.length,
      threshold: ALERT_CONFIG.rateLimitThreshold,
      details: `${recentRateLimits.length} rate limit error(s) in the last hour`,
    });
    
    return {
      conditions,
      summary: {
        totalUnresolved: unresolved.length,
        recentFailures: recentFailures.length,
        failureRate: Math.round(failureRate),
        staleRetailers: staleRetailers.length,
        rateLimitErrors: recentRateLimits.length,
        totalJobsLastHour: recentJobs.length,
        successfulJobsLastHour: successfulJobs.length,
      },
      triggeredAlerts: conditions.filter(c => c.triggered),
      checkedAt: new Date(now).toISOString(),
    };
  },
});

/**
 * Get alert history
 */
export const getAlertHistory = query({
  args: {
    limit: v.optional(v.number()),
    since: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const since = args.since ?? Date.now() - 7 * 24 * 60 * 60 * 1000; // Last 7 days
    
    const alerts = await ctx.db
      .query("scraperAlerts")
      .filter((f) => f.gte(f.field("createdAt"), since))
      .order("desc")
      .take(limit);
    
    return alerts;
  },
});

/**
 * Get last alert of each type (for cooldown checking)
 */
export const getLastAlerts = query({
  args: {},
  handler: async (ctx) => {
    const types: AlertType[] = ["new_failures", "high_failure_rate", "stale_scraper", "rate_limit_spike"];
    const lastAlerts: Record<string, number> = {};
    
    for (const type of types) {
      const last = await ctx.db
        .query("scraperAlerts")
        .filter((f) => f.eq(f.field("type"), type))
        .order("desc")
        .first();
      
      if (last) {
        lastAlerts[type] = last.createdAt;
      }
    }
    
    return lastAlerts;
  },
});

// ============================================================
// MUTATIONS
// ============================================================

/**
 * Record a sent alert
 */
export const recordAlert = mutation({
  args: {
    type: v.string(),
    severity: v.string(),
    title: v.string(),
    message: v.string(),
    data: v.optional(v.any()),
    deliveredTo: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("scraperAlerts", {
      type: args.type,
      severity: args.severity,
      title: args.title,
      message: args.message,
      data: args.data,
      deliveredTo: args.deliveredTo,
      acknowledged: false,
      createdAt: Date.now(),
    });
  },
});

/**
 * Acknowledge an alert
 */
export const acknowledgeAlert = mutation({
  args: {
    id: v.id("scraperAlerts"),
    acknowledgedBy: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      acknowledged: true,
      acknowledgedAt: Date.now(),
      acknowledgedBy: args.acknowledgedBy,
      notes: args.notes,
    });
  },
});

// ============================================================
// ACTIONS (for external webhook calls)
// ============================================================

/**
 * Format alert message for Discord
 */
function formatDiscordAlert(
  type: AlertType,
  severity: string,
  summary: any,
  triggeredConditions: Array<{ type: string; details: string; value: number }>,
): { content: string; embeds: Array<any> } {
  const severityEmoji: Record<string, string> = {
    low: "🟡",
    medium: "🟠",
    high: "🔴",
    critical: "🚨",
  };
  
  const typeEmoji: Record<string, string> = {
    new_failures: "❌",
    high_failure_rate: "📉",
    stale_scraper: "⏰",
    rate_limit_spike: "🚫",
    scraper_recovered: "✅",
  };
  
  const emoji = severityEmoji[severity] || "⚠️";
  const icon = typeEmoji[type] || "📊";
  
  const alertLines = triggeredConditions.map(c => 
    `${typeEmoji[c.type] || "•"} ${c.details}`
  );
  
  return {
    content: `${emoji} **CannaSignal Scraper Alert** ${emoji}`,
    embeds: [{
      title: `${icon} ${formatAlertTitle(type)}`,
      description: alertLines.join("\n"),
      color: severity === "critical" ? 0xFF0000 : 
             severity === "high" ? 0xFF6B00 : 
             severity === "medium" ? 0xFFAA00 : 0xFFDD00,
      fields: [
        {
          name: "📊 Summary",
          value: [
            `Unresolved errors: **${summary.totalUnresolved}**`,
            `Jobs last hour: **${summary.totalJobsLastHour}** (${summary.successfulJobsLastHour} successful)`,
            `Failure rate: **${summary.failureRate}%**`,
          ].join("\n"),
          inline: false,
        },
      ],
      footer: {
        text: "CannaSignal Monitoring",
      },
      timestamp: new Date().toISOString(),
    }],
  };
}

function formatAlertTitle(type: AlertType): string {
  const titles: Record<AlertType, string> = {
    new_failures: "New Scraper Failures Detected",
    high_failure_rate: "High Failure Rate Alert",
    stale_scraper: "Stale Scraper Warning",
    rate_limit_spike: "Rate Limit Spike Detected",
    scraper_recovered: "Scraper Health Recovered",
  };
  return titles[type] || "Scraper Alert";
}

// Type definitions for alert data
interface AlertCondition {
  type: string;
  severity: string;
  triggered: boolean;
  value: number;
  threshold: number;
  details: string;
}

interface AlertSummary {
  totalUnresolved: number;
  recentFailures: number;
  failureRate: number;
  staleRetailers: number;
  rateLimitErrors: number;
  totalJobsLastHour: number;
  successfulJobsLastHour: number;
}

interface ConditionsResult {
  conditions: AlertCondition[];
  summary: AlertSummary;
  triggeredAlerts: AlertCondition[];
  checkedAt: string;
}

/**
 * Check conditions and send alerts if needed
 */
export const checkAndAlert = action({
  args: {
    webhookUrl: v.optional(v.string()),
    forceAlert: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    alertsSent: number;
    message?: string;
    primaryType?: string;
    severity?: string;
    deliveredTo?: string[];
    triggeredConditions?: number;
    conditions: AlertSummary;
  }> => {
    // Get current conditions - use internal query reference
    const conditions: ConditionsResult = await ctx.runQuery(
      api.scraperAlerts.checkAlertConditions, 
      {}
    );
    const lastAlerts: Record<string, number> = await ctx.runQuery(
      api.scraperAlerts.getLastAlerts, 
      {}
    );
    
    const now = Date.now();
    const cooldownMs = ALERT_CONFIG.alertCooldownMinutes * 60 * 1000;
    
    // Filter to triggered alerts that aren't in cooldown
    const alertsToSend = conditions.triggeredAlerts.filter((alert: AlertCondition) => {
      if (args.forceAlert) return true;
      const lastAlert = lastAlerts[alert.type];
      return !lastAlert || (now - lastAlert) > cooldownMs;
    });
    
    if (alertsToSend.length === 0) {
      return {
        success: true,
        alertsSent: 0,
        message: "No alerts to send (none triggered or all in cooldown)",
        conditions: conditions.summary,
      };
    }
    
    // Determine highest severity
    const severityOrder = ["low", "medium", "high", "critical"];
    const highestSeverity = alertsToSend.reduce((max: string, alert: AlertCondition) => {
      return severityOrder.indexOf(alert.severity) > severityOrder.indexOf(max) 
        ? alert.severity 
        : max;
    }, "low");
    
    // Primary alert type (first triggered)
    const primaryType = alertsToSend[0].type as AlertType;
    
    // Format message
    const discordMessage = formatDiscordAlert(
      primaryType,
      highestSeverity,
      conditions.summary,
      alertsToSend,
    );
    
    const deliveredTo: string[] = [];
    
    // Send to Discord webhook if provided
    if (args.webhookUrl) {
      try {
        const response = await fetch(args.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(discordMessage),
        });
        
        if (response.ok) {
          deliveredTo.push("discord");
        } else {
          console.error("Discord webhook failed:", await response.text());
        }
      } catch (error) {
        console.error("Discord webhook error:", error);
      }
    }
    
    // Record the alert
    await ctx.runMutation(api.scraperAlerts.recordAlert, {
      type: primaryType,
      severity: highestSeverity,
      title: formatAlertTitle(primaryType),
      message: alertsToSend.map((a: AlertCondition) => a.details).join("; "),
      data: {
        summary: conditions.summary,
        triggeredConditions: alertsToSend,
      },
      deliveredTo,
    });
    
    return {
      success: true,
      alertsSent: 1,
      primaryType,
      severity: highestSeverity,
      deliveredTo,
      triggeredConditions: alertsToSend.length,
      conditions: conditions.summary,
    };
  },
});

/**
 * Test webhook delivery
 */
export const testWebhook = action({
  args: {
    webhookUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const testMessage = {
      content: "🧪 **CannaSignal Test Alert**",
      embeds: [{
        title: "✅ Webhook Test Successful",
        description: "This is a test alert from CannaSignal monitoring system.",
        color: 0x00FF00,
        fields: [
          {
            name: "Status",
            value: "Webhook is properly configured and working!",
            inline: false,
          },
        ],
        footer: {
          text: "CannaSignal Monitoring",
        },
        timestamp: new Date().toISOString(),
      }],
    };
    
    try {
      const response = await fetch(args.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testMessage),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Webhook returned ${response.status}: ${errorText}`,
        };
      }
      
      return {
        success: true,
        message: "Test alert sent successfully!",
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Get alert digest for dashboard
 */
export const getAlertDigest = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const hourAgo = now - 60 * 60 * 1000;
    
    // Get recent alerts
    const recentAlerts = await ctx.db
      .query("scraperAlerts")
      .filter((f) => f.gte(f.field("createdAt"), dayAgo))
      .order("desc")
      .take(10);
    
    // Get unacknowledged alerts
    const unacknowledged = recentAlerts.filter(a => !a.acknowledged);
    
    // Count by severity
    const bySeverity: Record<string, number> = {};
    for (const alert of recentAlerts) {
      bySeverity[alert.severity] = (bySeverity[alert.severity] || 0) + 1;
    }
    
    // Quick health check (inline, avoid circular call)
    const unresolvedErrors = await ctx.db
      .query("deadLetterQueue")
      .filter((f) => f.eq(f.field("resolvedAt"), undefined))
      .collect();
    
    const recentFailures = unresolvedErrors.filter(e => e.lastAttemptAt > hourAgo);
    const rateLimitErrors = unresolvedErrors.filter(e => 
      e.errorType === "rate_limit" && e.lastAttemptAt > hourAgo
    );
    
    // Build active conditions list
    const activeConditions: Array<{type: string; details: string}> = [];
    
    if (recentFailures.length >= ALERT_CONFIG.newFailuresThreshold) {
      activeConditions.push({
        type: "new_failures",
        details: `${recentFailures.length} failure(s) in the last hour`,
      });
    }
    
    if (rateLimitErrors.length >= ALERT_CONFIG.rateLimitThreshold) {
      activeConditions.push({
        type: "rate_limit_spike",
        details: `${rateLimitErrors.length} rate limit error(s)`,
      });
    }
    
    const isHealthy = activeConditions.length === 0;
    
    return {
      unacknowledgedCount: unacknowledged.length,
      alertsLast24h: recentAlerts.length,
      bySeverity,
      latestAlert: recentAlerts[0] || null,
      currentConditions: activeConditions,
      isHealthy,
      checkedAt: new Date(now).toISOString(),
    };
  },
});
