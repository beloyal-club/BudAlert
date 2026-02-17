import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

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
