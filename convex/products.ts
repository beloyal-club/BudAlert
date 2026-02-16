import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ============================================================
// QUERIES
// ============================================================

export const list = query({
  args: {
    brandId: v.optional(v.id("brands")),
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query("products");
    
    if (args.brandId) {
      q = q.withIndex("by_brand", (q) => q.eq("brandId", args.brandId));
    } else if (args.category) {
      q = q.withIndex("by_category", (q) => q.eq("category", args.category));
    }
    
    const products = await q.take(args.limit || 100);
    
    // Enrich with brand data
    const enriched = await Promise.all(
      products.map(async (p) => {
        const brand = await ctx.db.get(p.brandId);
        return { ...p, brand };
      })
    );
    
    return enriched;
  },
});

export const getById = query({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.id);
    if (!product) return null;
    
    const brand = await ctx.db.get(product.brandId);
    return { ...product, brand };
  },
});

export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const searchTerm = args.query.toLowerCase();
    const products = await ctx.db.query("products").take(500);
    
    return products.filter((p) =>
      p.name.toLowerCase().includes(searchTerm) ||
      p.normalizedName.includes(searchTerm)
    );
  },
});

export const findByNormalizedName = query({
  args: {
    brandId: v.id("brands"),
    normalizedName: v.string(),
  },
  handler: async (ctx, args) => {
    const products = await ctx.db
      .query("products")
      .withIndex("by_brand", (q) => q.eq("brandId", args.brandId))
      .collect();
    
    return products.find((p) => p.normalizedName === args.normalizedName) || null;
  },
});

// ============================================================
// MUTATIONS
// ============================================================

export const create = mutation({
  args: {
    brandId: v.id("brands"),
    name: v.string(),
    normalizedName: v.string(),
    category: v.string(),
    subcategory: v.optional(v.string()),
    strain: v.optional(v.string()),
    weight: v.optional(v.object({
      amount: v.number(),
      unit: v.string(),
    })),
    thcRange: v.optional(v.object({
      min: v.optional(v.number()),
      max: v.optional(v.number()),
      unit: v.string(),
    })),
    cbdRange: v.optional(v.object({
      min: v.optional(v.number()),
      max: v.optional(v.number()),
      unit: v.string(),
    })),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    return await ctx.db.insert("products", {
      ...args,
      isActive: true,
      firstSeenAt: now,
      lastSeenAt: now,
    });
  },
});

export const updateLastSeen = mutation({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { lastSeenAt: Date.now() });
  },
});

// ============================================================
// INTERNAL MUTATIONS (for normalizer pipeline)
// ============================================================

export const findOrCreate = internalMutation({
  args: {
    brandId: v.id("brands"),
    name: v.string(),
    normalizedName: v.string(),
    category: v.string(),
    subcategory: v.optional(v.string()),
    strain: v.optional(v.string()),
    weight: v.optional(v.object({
      amount: v.number(),
      unit: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    // Try to find existing product
    const existing = await ctx.db
      .query("products")
      .withIndex("by_brand", (q) => q.eq("brandId", args.brandId))
      .collect();
    
    const match = existing.find((p) => p.normalizedName === args.normalizedName);
    
    if (match) {
      // Update last seen
      await ctx.db.patch(match._id, { lastSeenAt: Date.now() });
      return match._id;
    }
    
    // Create new product
    const now = Date.now();
    return await ctx.db.insert("products", {
      brandId: args.brandId,
      name: args.name,
      normalizedName: args.normalizedName,
      category: args.category,
      subcategory: args.subcategory,
      strain: args.strain,
      weight: args.weight,
      isActive: true,
      firstSeenAt: now,
      lastSeenAt: now,
    });
  },
});
