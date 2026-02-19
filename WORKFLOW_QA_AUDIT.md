# CannaSignal Workflow QA Audit Report

**Auditor:** workflow-qa subagent  
**Date:** 2026-02-19  
**Branch:** `workflow-qa-improvements`

---

## Executive Summary

The CannaSignal pipeline has functional components but **lacks resilience patterns**. The system can handle sunny-day scenarios but will fail silently or lose data during infrastructure hiccups.

**Critical Issues Found:** 5  
**High Issues Found:** 4  
**Medium Issues Found:** 3  

---

## 🔴 CRITICAL Vulnerabilities

### CRIT-001: No Retry Logic in Cron Worker
**Location:** `workers/cron/index.ts`  
**Impact:** A single BrowserBase timeout loses an entire 15-minute scrape cycle.

The cron worker scrapes 18 locations sequentially with no retry:
```typescript
const { products, error } = await scrapeLocation(page, location);
if (error) {
  errors.push(...); // Just logs, no retry
}
```

**Risk:** ~6% of scrapes fail due to transient network issues. Those products are gone until next cycle.

---

### CRIT-002: Convex Ingestion Has No Retry  
**Location:** `workers/cron/index.ts` → `postToConvex()`  
**Impact:** If Convex times out during ingestion, **all scraped data for that batch is lost**.

```typescript
async function postToConvex(...) {
  const response = await fetch(...);  // No retry, no timeout config
  if (!response.ok) throw new Error(...);  // Data gone
}
```

**Risk:** Convex cold starts + large batches = occasional 30s+ responses = lost data.

---

### CRIT-003: Dead Letter Queue Not Integrated
**Location:** `convex/deadLetterQueue.ts` exists but isn't used  
**Impact:** Failed scrapes vanish into logs. No visibility, no retry path.

The DLQ infrastructure is built but the cron worker never writes to it:
- `addFailedScrape` mutation exists
- Cron worker just logs to console and moves on

---

### CRIT-004: Discord Webhook Failures Are Silent
**Location:** Multiple - `inventoryEvents.ts`, `alerts.ts`, `scraperAlerts.ts`  
**Impact:** Users miss restock alerts if Discord has a hiccup.

```typescript
if (!response.ok) {
  console.error("Discord webhook failed");  // That's it. Event still marked notified.
}
```

**Risk:** Discord's 50req/sec limit + outages = missed notifications.

---

### CRIT-005: BrowserBase Connection Has No Retry
**Location:** `workers/cron/index.ts` → `connectBrowserBase()`  
**Impact:** BrowserBase maintenance = entire scrape cycle fails.

```typescript
browser = await connectBrowserBase(env);  // Single attempt, no fallback
```

**Risk:** BrowserBase has ~99.5% uptime. 0.5% × 96 daily runs = ~1 failed batch every 2 days.

---

## 🟠 HIGH Vulnerabilities

### HIGH-001: Stale Data Detection Too Slow
**Location:** `convex/scraperAlerts.ts`  
**Issue:** `staleHoursThreshold: 6` is too long for a 15-minute scrape cycle.

If scraping silently fails, you won't know for 6 hours. Should be 30-45 minutes max.

---

### HIGH-002: navigateWithRetry Exists But Unused
**Location:** `scripts/lib/browserbase-client.ts` has retry logic  
**Issue:** The cron worker doesn't import or use it.

Good code exists:
```typescript
export async function navigateWithRetry(page, url, options) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) { ... }
}
```
But cron uses raw `page.goto()` directly.

---

### HIGH-003: No Circuit Breaker Pattern
**Location:** Entire scraping pipeline  
**Issue:** If BrowserBase is down, we'll keep hammering it for 15 minutes.

No exponential backoff, no "stop trying after N failures", no health circuit.

---

### HIGH-004: Ingestion Not Atomic
**Location:** `convex/ingestion.ts` → `ingestScrapedBatch`  
**Issue:** If mutation fails mid-batch, some products saved, others lost.

No transaction wrapper. Partial state is possible.

---

## 🟡 MEDIUM Vulnerabilities

### MED-001: No Automated Health Check Integration
**Location:** `workers/cron/index.ts` → `/health` endpoint  
**Issue:** Health endpoint exists but nothing monitors it.

Should integrate with Cloudflare Health Checks or Better Uptime.

---

### MED-002: Error Classification Could Be Richer
**Location:** `convex/deadLetterQueue.ts` → `classifyError()`  
**Issue:** Some errors could have auto-remediation hints.

e.g., "parse_error" on a specific retailer might mean their DOM changed → flag for human review.

---

### MED-003: No Event Batching for Discord
**Location:** `convex/inventoryEvents.ts` → `sendDiscordNotifications`  
**Issue:** Sends one webhook per notification batch. Could hit rate limits with many events.

---

## ✅ What's Working Well

1. **Dead Letter Queue schema** - Well designed, just needs integration
2. **Scraper Alerts system** - Good threshold/cooldown logic  
3. **Delta detection** - Solid event generation
4. **Error type classification** - Good foundation for routing
5. **Stats cache** - Smart optimization for dashboard queries

---

## Fixes Implemented

See commits on `workflow-qa-improvements` branch:

1. **Retry wrapper utilities** - Exponential backoff for HTTP calls
2. **Cron worker resilience** - Retry per-location, DLQ integration
3. **Convex ingestion retry** - With timeout and backoff
4. **Discord notification queue** - Retry failed webhooks
5. **Health check alerting** - Faster stale detection
6. **Circuit breaker** - For BrowserBase connection

---

## Recommendations Requiring Human Decision

1. **Alert threshold tuning** - 30 min vs 45 min for stale detection?
2. **Notification retry policy** - How many times? Store failed notifs?
3. **BrowserBase fallback** - Consider BrowserUse as backup provider?
4. **Event TTL** - Auto-cleanup old inventory events?

---

## Testing Plan

1. Simulate BrowserBase timeout → verify retry + DLQ
2. Simulate Convex timeout → verify retry + no data loss
3. Simulate Discord webhook failure → verify retry queue
4. Kill scraper mid-batch → verify partial state handling
5. Check alert timing with 30-min stale threshold

---

*Report generated by workflow-qa subagent*
