import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

const http = httpRouter();

// ============================================================
// CORS HANDLING (for Cloudflare Workers calling in)
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
  "Access-Control-Max-Age": "86400",
};

function corsResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function corsErrorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

// ============================================================
// OPTIONS HANDLER (CORS Preflight)
// ============================================================

http.route({
  path: "/ingest/scraped-batch",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }),
});

http.route({
  path: "/health",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }),
});

// ============================================================
// POST /ingest/scraped-batch
// Receives scraped menu data from Cloudflare Workers
// ============================================================

http.route({
  path: "/ingest/scraped-batch",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      // Optional: Verify API key
      const apiKey = request.headers.get("X-API-Key");
      const expectedKey = ((globalThis as any).process?.env?.CANNASIGNAL_INGEST_KEY) as string | undefined;
      
      if (expectedKey && apiKey !== expectedKey) {
        return corsErrorResponse("Unauthorized", 401);
      }

      // Parse request body
      const body = await request.json();
      
      // Validate required fields
      if (!body.batchId || typeof body.batchId !== "string") {
        return corsErrorResponse("Missing or invalid batchId");
      }
      
      if (!body.results || !Array.isArray(body.results)) {
        return corsErrorResponse("Missing or invalid results array");
      }

      // Call the mutation to process the batch
      const result = await ctx.runMutation(api.ingestion.ingestScrapedBatch, {
        batchId: body.batchId,
        results: body.results,
      });

      return corsResponse({
        success: true,
        ...result,
      });
    } catch (error) {
      console.error("Ingestion error:", error);
      return corsErrorResponse(
        error instanceof Error ? error.message : "Internal server error",
        500
      );
    }
  }),
});

// ============================================================
// GET /health
// Health check endpoint for monitoring
// ============================================================

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    return corsResponse({
      status: "healthy",
      service: "cannasignal-convex",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    });
  }),
});

// ============================================================
// POST /cache/refresh (PERF-002)
// Refresh the stats cache
// ============================================================

http.route({
  path: "/cache/refresh",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }),
});

http.route({
  path: "/cache/refresh",
  method: "POST",
  handler: httpAction(async (ctx) => {
    try {
      const result = await ctx.runMutation(api.cache.refreshGlobalCache, {});
      return corsResponse({
        success: true,
        ...result,
        refreshedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Cache refresh error:", error);
      return corsErrorResponse(
        error instanceof Error ? error.message : "Internal server error",
        500
      );
    }
  }),
});

// ============================================================
// GET /cache/info (PERF-002)
// Get cache status
// ============================================================

http.route({
  path: "/cache/info",
  method: "GET",
  handler: httpAction(async (ctx) => {
    try {
      const info = await ctx.runQuery(api.cache.getCacheInfo, {});
      return corsResponse(info);
    } catch (error) {
      console.error("Cache info error:", error);
      return corsErrorResponse(
        error instanceof Error ? error.message : "Internal server error",
        500
      );
    }
  }),
});

// ============================================================
// ALERT ENDPOINTS (REL-002)
// ============================================================

http.route({
  path: "/alerts/check",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }),
});

http.route({
  path: "/alerts/check",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json().catch(() => ({}));
      const webhookUrl = body.webhookUrl || ((globalThis as any).process?.env?.DISCORD_ALERT_WEBHOOK);
      const forceAlert = body.forceAlert === true;
      
      const result = await ctx.runAction(api.scraperAlerts.checkAndAlert, {
        webhookUrl,
        forceAlert,
      });
      
      return corsResponse(result);
    } catch (error) {
      console.error("Alert check error:", error);
      return corsErrorResponse(
        error instanceof Error ? error.message : "Internal server error",
        500
      );
    }
  }),
});

http.route({
  path: "/alerts/digest",
  method: "GET",
  handler: httpAction(async (ctx) => {
    try {
      const digest = await ctx.runQuery(api.scraperAlerts.getAlertDigest, {});
      return corsResponse(digest);
    } catch (error) {
      console.error("Alert digest error:", error);
      return corsErrorResponse(
        error instanceof Error ? error.message : "Internal server error",
        500
      );
    }
  }),
});

http.route({
  path: "/alerts/conditions",
  method: "GET",
  handler: httpAction(async (ctx) => {
    try {
      const conditions = await ctx.runQuery(api.scraperAlerts.checkAlertConditions, {});
      return corsResponse(conditions);
    } catch (error) {
      console.error("Alert conditions error:", error);
      return corsErrorResponse(
        error instanceof Error ? error.message : "Internal server error",
        500
      );
    }
  }),
});

http.route({
  path: "/alerts/history",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      
      const history = await ctx.runQuery(api.scraperAlerts.getAlertHistory, { limit });
      return corsResponse({ alerts: history });
    } catch (error) {
      console.error("Alert history error:", error);
      return corsErrorResponse(
        error instanceof Error ? error.message : "Internal server error",
        500
      );
    }
  }),
});

http.route({
  path: "/alerts/webhook-test",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const webhookUrl = body.webhookUrl;
      
      if (!webhookUrl || typeof webhookUrl !== "string") {
        return corsErrorResponse("Missing webhookUrl in request body", 400);
      }
      
      const result = await ctx.runAction(api.scraperAlerts.testWebhook, { webhookUrl });
      return corsResponse(result);
    } catch (error) {
      console.error("Webhook test error:", error);
      return corsErrorResponse(
        error instanceof Error ? error.message : "Internal server error",
        500
      );
    }
  }),
});

// ============================================================
// PRICE HISTORY ENDPOINTS (DATA-006)
// ============================================================

http.route({
  path: "/price/summary",
  method: "GET",
  handler: httpAction(async (ctx) => {
    try {
      const summary = await ctx.runQuery(api.priceHistory.getPriceSummary, {});
      return corsResponse(summary);
    } catch (error) {
      console.error("Price summary error:", error);
      return corsErrorResponse(
        error instanceof Error ? error.message : "Internal server error",
        500
      );
    }
  }),
});

http.route({
  path: "/price/drops",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const region = url.searchParams.get("region") || undefined;
      const category = url.searchParams.get("category") || undefined;
      const minDropPercent = parseFloat(url.searchParams.get("minDropPercent") || "10");
      const limit = parseInt(url.searchParams.get("limit") || "25", 10);
      
      const drops = await ctx.runQuery(api.priceHistory.getPriceDrops, {
        region,
        category,
        minDropPercent,
        limit,
      });
      return corsResponse(drops);
    } catch (error) {
      console.error("Price drops error:", error);
      return corsErrorResponse(
        error instanceof Error ? error.message : "Internal server error",
        500
      );
    }
  }),
});

http.route({
  path: "/price/changes",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const region = url.searchParams.get("region") || undefined;
      const category = url.searchParams.get("category") || undefined;
      const changeType = (url.searchParams.get("type") as "drop" | "increase" | "all") || "all";
      const minChangePercent = parseFloat(url.searchParams.get("minChangePercent") || "5");
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      
      const changes = await ctx.runQuery(api.priceHistory.getRecentPriceChanges, {
        region,
        category,
        changeType,
        minChangePercent,
        limit,
      });
      return corsResponse(changes);
    } catch (error) {
      console.error("Price changes error:", error);
      return corsErrorResponse(
        error instanceof Error ? error.message : "Internal server error",
        500
      );
    }
  }),
});

// ============================================================
// INVENTORY EVENTS ENDPOINTS (Phase 1)
// ============================================================

http.route({
  path: "/events/recent",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }),
});

http.route({
  path: "/events/recent",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      const eventTypes = url.searchParams.get("types")?.split(",").filter(Boolean);
      const region = url.searchParams.get("region") || undefined;
      
      const events = await ctx.runQuery(api.inventoryEvents.getRecentEvents, {
        limit,
        eventTypes,
        region,
      });
      return corsResponse({ events, count: events.length });
    } catch (error) {
      console.error("Get events error:", error);
      return corsErrorResponse(
        error instanceof Error ? error.message : "Internal server error",
        500
      );
    }
  }),
});

http.route({
  path: "/events/notify",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }),
});

http.route({
  path: "/events/notify",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json().catch(() => ({}));
      const webhookUrl = body.webhookUrl || ((globalThis as any).process?.env?.DISCORD_WEBHOOK_URL);
      
      if (!webhookUrl) {
        return corsErrorResponse("Missing webhookUrl", 400);
      }
      
      const result = await ctx.runAction(api.inventoryEvents.sendDiscordNotifications, {
        webhookUrl,
        maxEvents: body.maxEvents || 25,
      });
      
      return corsResponse(result);
    } catch (error) {
      console.error("Notify error:", error);
      return corsErrorResponse(
        error instanceof Error ? error.message : "Internal server error",
        500
      );
    }
  }),
});

// ============================================================
// CONSUMER ALERTS (Phase 3)
// Process watched product alerts
// ============================================================

http.route({
  path: "/alerts/process-watches",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }),
});

http.route({
  path: "/alerts/process-watches",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json().catch(() => ({}));
      const webhookUrl = body.webhookUrl || ((globalThis as any).process?.env?.DISCORD_WEBHOOK_URL);
      
      if (!webhookUrl) {
        return corsErrorResponse("Missing webhookUrl - set DISCORD_WEBHOOK_URL or pass in body", 400);
      }
      
      const result = await ctx.runAction(api.alerts.processWatchedAlerts, {
        defaultWebhookUrl: webhookUrl,
        maxEvents: body.maxEvents || 50,
      });
      
      return corsResponse(result);
    } catch (error) {
      console.error("Process watches error:", error);
      return corsErrorResponse(
        error instanceof Error ? error.message : "Internal server error",
        500
      );
    }
  }),
});

// ============================================================
// STRIPE WEBHOOK (Phase 6 - Monetization)
// ============================================================

http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const signature = request.headers.get("stripe-signature");
      if (!signature) {
        return corsErrorResponse("Missing Stripe signature", 400);
      }
      
      const payload = await request.text();
      
      // Process webhook (handles signature verification internally)
      const result = await ctx.runAction(internal.stripe.processWebhook, {
        payload,
        signature,
      });
      
      return corsResponse(result);
    } catch (error) {
      console.error("Stripe webhook error:", error);
      return corsErrorResponse(
        error instanceof Error ? error.message : "Webhook processing failed",
        500
      );
    }
  }),
});

// ============================================================
// SUBSCRIPTION ENDPOINTS (Phase 6)
// ============================================================

http.route({
  path: "/subscription/checkout",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }),
});

http.route({
  path: "/subscription/checkout",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      
      if (!body.email || !body.tier) {
        return corsErrorResponse("Missing email or tier", 400);
      }
      
      const origin = request.headers.get("origin") || "https://cannasignal.pages.dev";
      
      const result = await ctx.runAction(api.stripe.createCheckoutSession, {
        email: body.email,
        tier: body.tier,
        successUrl: body.successUrl || `${origin}/?checkout=success`,
        cancelUrl: body.cancelUrl || `${origin}/?checkout=canceled`,
      });
      
      return corsResponse(result);
    } catch (error) {
      console.error("Checkout error:", error);
      return corsErrorResponse(
        error instanceof Error ? error.message : "Checkout creation failed",
        500
      );
    }
  }),
});

http.route({
  path: "/subscription/portal",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }),
});

http.route({
  path: "/subscription/portal",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      
      if (!body.email) {
        return corsErrorResponse("Missing email", 400);
      }
      
      const origin = request.headers.get("origin") || "https://cannasignal.pages.dev";
      
      const result = await ctx.runAction(api.stripe.createPortalSession, {
        email: body.email,
        returnUrl: body.returnUrl || `${origin}/`,
      });
      
      return corsResponse(result);
    } catch (error) {
      console.error("Portal error:", error);
      return corsErrorResponse(
        error instanceof Error ? error.message : "Portal creation failed",
        500
      );
    }
  }),
});

http.route({
  path: "/subscription/status",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const email = url.searchParams.get("email");
      
      if (!email) {
        return corsErrorResponse("Missing email parameter", 400);
      }
      
      const subscription = await ctx.runQuery(api.subscriptions.getSubscription, { email });
      return corsResponse(subscription);
    } catch (error) {
      console.error("Subscription status error:", error);
      return corsErrorResponse(
        error instanceof Error ? error.message : "Status check failed",
        500
      );
    }
  }),
});

http.route({
  path: "/pricing",
  method: "GET",
  handler: httpAction(async (ctx) => {
    try {
      const tiers = await ctx.runQuery(api.subscriptions.getPricingTiers, {});
      return corsResponse(tiers);
    } catch (error) {
      console.error("Pricing error:", error);
      return corsErrorResponse(
        error instanceof Error ? error.message : "Pricing fetch failed",
        500
      );
    }
  }),
});

// ============================================================
// Catch-all for unmatched routes
// ============================================================

http.route({
  pathPrefix: "/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    return corsErrorResponse(`Not found: ${url.pathname}`, 404);
  }),
});

export default http;
