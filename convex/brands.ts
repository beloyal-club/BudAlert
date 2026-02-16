import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// ============================================================
// QUERIES
// ============================================================

export const list = query({
  args: {
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.category) {
      return await ctx.db.query("brands")
        .withIndex("by_category", (q) => q.eq("category", args.category!))
        .take(args.limit || 100);
    }
    return await ctx.db.query("brands").take(args.limit || 100);
  },
});

export const getByNormalizedName = query({
  args: { normalizedName: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("brands")
      .withIndex("by_normalized_name", (q) => q.eq("normalizedName", args.normalizedName))
      .first();
  },
});

export const getById = query({
  args: { id: v.id("brands") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const searchTerm = args.query.toLowerCase();
    const brands = await ctx.db.query("brands").collect();
    
    return brands.filter((b) =>
      b.name.toLowerCase().includes(searchTerm) ||
      b.normalizedName.includes(searchTerm) ||
      b.aliases.some((a) => a.toLowerCase().includes(searchTerm))
    );
  },
});

// ============================================================
// MUTATIONS
// ============================================================

export const create = mutation({
  args: {
    name: v.string(),
    normalizedName: v.string(),
    aliases: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    isVerified: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("brands")
      .withIndex("by_normalized_name", (q) => q.eq("normalizedName", args.normalizedName))
      .first();
    
    if (existing) {
      return existing._id;
    }
    
    return await ctx.db.insert("brands", {
      name: args.name,
      normalizedName: args.normalizedName,
      aliases: args.aliases || [],
      category: args.category,
      imageUrl: args.imageUrl,
      websiteUrl: args.websiteUrl,
      isVerified: args.isVerified || false,
      firstSeenAt: Date.now(),
    });
  },
});

export const addAlias = mutation({
  args: {
    id: v.id("brands"),
    alias: v.string(),
  },
  handler: async (ctx, args) => {
    const brand = await ctx.db.get(args.id);
    if (!brand) throw new Error("Brand not found");
    
    const aliases = brand.aliases || [];
    if (!aliases.includes(args.alias)) {
      aliases.push(args.alias);
      await ctx.db.patch(args.id, { aliases });
    }
  },
});

export const seedPopularBrands = mutation({
  args: {},
  handler: async (ctx) => {
    const popularBrands = [
      { name: "Cookies", normalizedName: "cookies", category: "flower" },
      { name: "Tyson 2.0", normalizedName: "tyson-2-0", category: "flower" },
      { name: "Jeeter", normalizedName: "jeeter", category: "pre_roll" },
      { name: "Backpack Boyz", normalizedName: "backpack-boyz", category: "flower" },
      { name: "Lemonnade", normalizedName: "lemonnade", category: "flower" },
      { name: "Connected Cannabis Co", normalizedName: "connected-cannabis-co", category: "flower" },
      { name: "Alien Labs", normalizedName: "alien-labs", category: "flower" },
      { name: "Stiiizy", normalizedName: "stiiizy", category: "vape" },
      { name: "Raw Garden", normalizedName: "raw-garden", category: "concentrate" },
      { name: "Select", normalizedName: "select", category: "vape" },
    ];
    
    const inserted = [];
    for (const brand of popularBrands) {
      const existing = await ctx.db
        .query("brands")
        .withIndex("by_normalized_name", (q) => q.eq("normalizedName", brand.normalizedName))
        .first();
      
      if (!existing) {
        const id = await ctx.db.insert("brands", {
          ...brand,
          aliases: [],
          isVerified: true,
          firstSeenAt: Date.now(),
        });
        inserted.push({ id, name: brand.name });
      }
    }
    
    return { inserted, count: inserted.length };
  },
});
