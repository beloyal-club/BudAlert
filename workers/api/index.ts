/**
 * CannaSignal API Gateway
 * 
 * Hono-based API running on Cloudflare Workers.
 * Proxies requests to Convex and handles auth/rate limiting.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { bearerAuth } from "hono/bearer-auth";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

type Bindings = {
  CONVEX_URL: string;
  CONVEX_DEPLOY_KEY: string;
  API_KEYS: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

// CORS
app.use("/*", cors({
  origin: ["https://cannasignal.com", "https://app.cannasignal.com", "http://localhost:5173"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Health check (no auth)
app.get("/health", (c) => {
  return c.json({ status: "ok", service: "cannasignal-api", timestamp: Date.now() });
});

// API key validation middleware
const validateApiKey = async (c: any, next: any) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing API key" }, 401);
  }
  
  const apiKey = authHeader.replace("Bearer ", "");
  
  // In production, validate against KV store
  // For MVP, accept any non-empty key
  if (!apiKey) {
    return c.json({ error: "Invalid API key" }, 401);
  }
  
  await next();
};

// ============================================================
// PUBLIC API ROUTES (v1)
// ============================================================

const v1 = new Hono<{ Bindings: Bindings }>();

// Apply auth to all v1 routes
v1.use("/*", validateApiKey);

// Helper to get Convex client
const getConvex = (c: any) => new ConvexHttpClient(c.env.CONVEX_URL);

// ---------- BRANDS ----------

v1.get("/brands", async (c) => {
  const convex = getConvex(c);
  const { category, limit } = c.req.query();
  
  try {
    const brands = await convex.query(api.brands.list, {
      category: category || undefined,
      limit: limit ? parseInt(limit) : 50,
    });
    
    return c.json({ data: brands, meta: { count: brands.length } });
  } catch (error) {
    return c.json({ error: "Failed to fetch brands" }, 500);
  }
});

v1.get("/brands/:id", async (c) => {
  const convex = getConvex(c);
  const id = c.req.param("id");
  
  try {
    const brand = await convex.query(api.brands.getById, { id: id as any });
    
    if (!brand) {
      return c.json({ error: "Brand not found" }, 404);
    }
    
    return c.json({ data: brand });
  } catch (error) {
    return c.json({ error: "Failed to fetch brand" }, 500);
  }
});

v1.get("/brands/search", async (c) => {
  const convex = getConvex(c);
  const { q } = c.req.query();
  
  if (!q) {
    return c.json({ error: "Search query required" }, 400);
  }
  
  try {
    const brands = await convex.query(api.brands.search, { query: q });
    return c.json({ data: brands, meta: { count: brands.length } });
  } catch (error) {
    return c.json({ error: "Search failed" }, 500);
  }
});

// ---------- RETAILERS ----------

v1.get("/retailers", async (c) => {
  const convex = getConvex(c);
  const { region, limit } = c.req.query();
  
  try {
    const retailers = await convex.query(api.retailers.list, {
      region: region || undefined,
      limit: limit ? parseInt(limit) : 50,
    });
    
    return c.json({ data: retailers, meta: { count: retailers.length } });
  } catch (error) {
    return c.json({ error: "Failed to fetch retailers" }, 500);
  }
});

v1.get("/retailers/:id", async (c) => {
  const convex = getConvex(c);
  const id = c.req.param("id");
  
  try {
    const retailer = await convex.query(api.retailers.getById, { id: id as any });
    
    if (!retailer) {
      return c.json({ error: "Retailer not found" }, 404);
    }
    
    return c.json({ data: retailer });
  } catch (error) {
    return c.json({ error: "Failed to fetch retailer" }, 500);
  }
});

v1.get("/retailers/:id/menu", async (c) => {
  const convex = getConvex(c);
  const id = c.req.param("id");
  
  try {
    const inventory = await convex.query(api.inventory.getByRetailer, { retailerId: id as any });
    return c.json({ data: inventory, meta: { count: inventory.length } });
  } catch (error) {
    return c.json({ error: "Failed to fetch menu" }, 500);
  }
});

// ---------- PRODUCTS ----------

v1.get("/products", async (c) => {
  const convex = getConvex(c);
  const { brand, category, limit } = c.req.query();
  
  try {
    const products = await convex.query(api.products.list, {
      brandId: brand as any || undefined,
      category: category || undefined,
      limit: limit ? parseInt(limit) : 50,
    });
    
    return c.json({ data: products, meta: { count: products.length } });
  } catch (error) {
    return c.json({ error: "Failed to fetch products" }, 500);
  }
});

v1.get("/products/:id", async (c) => {
  const convex = getConvex(c);
  const id = c.req.param("id");
  
  try {
    const product = await convex.query(api.products.getById, { id: id as any });
    
    if (!product) {
      return c.json({ error: "Product not found" }, 404);
    }
    
    return c.json({ data: product });
  } catch (error) {
    return c.json({ error: "Failed to fetch product" }, 500);
  }
});

v1.get("/products/search", async (c) => {
  const convex = getConvex(c);
  const { q } = c.req.query();
  
  if (!q) {
    return c.json({ error: "Search query required" }, 400);
  }
  
  try {
    const products = await convex.query(api.products.search, { query: q });
    return c.json({ data: products, meta: { count: products.length } });
  } catch (error) {
    return c.json({ error: "Search failed" }, 500);
  }
});

// ---------- TRENDING / ANALYTICS ----------

v1.get("/trending", async (c) => {
  const convex = getConvex(c);
  const { region, period, category } = c.req.query();
  
  try {
    const trending = await convex.query(api.analytics.getTrending, {
      region: region || "statewide",
      period: period || "weekly",
      category: category || undefined,
    });
    
    return c.json({
      data: trending,
      meta: { region, period, timestamp: Date.now() },
    });
  } catch (error) {
    return c.json({ error: "Failed to fetch trending data" }, 500);
  }
});

// ---------- WEBHOOKS (for scraper callbacks) ----------

v1.post("/ingest/scraped-batch", async (c) => {
  const convex = getConvex(c);
  const body = await c.req.json();
  
  try {
    const result = await convex.mutation(api.ingestion.ingestScrapedBatch, body);
    return c.json({ success: true, ...result });
  } catch (error) {
    console.error("Ingestion failed:", error);
    return c.json({ error: "Ingestion failed" }, 500);
  }
});

// Mount v1 API
app.route("/api/v1", v1);

// Catch-all for API
app.all("/api/*", (c) => {
  return c.json({ error: "Not found" }, 404);
});

export default app;
