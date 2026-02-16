import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// ============================================================
// QUERIES
// ============================================================

export const list = query({
  args: {
    region: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query("retailers");
    
    if (args.region) {
      q = q.filter((q) => q.eq(q.field("region"), args.region));
    }
    
    const retailers = await q
      .filter((q) => q.eq(q.field("isActive"), true))
      .take(args.limit || 100);
    
    return retailers;
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("retailers")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

export const getById = query({
  args: { id: v.id("retailers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getActiveForScraping = query({
  args: { platform: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const retailers = await ctx.db
      .query("retailers")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    
    // Filter by platform if specified
    if (args.platform) {
      return retailers.filter((r) =>
        r.menuSources.some((s) => s.platform === args.platform && s.scrapeStatus === "active")
      );
    }
    
    return retailers;
  },
});

// ============================================================
// MUTATIONS
// ============================================================

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    licenseNumber: v.optional(v.string()),
    licenseType: v.optional(v.string()),
    address: v.object({
      street: v.string(),
      city: v.string(),
      state: v.string(),
      zip: v.string(),
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
    }),
    region: v.string(),
    menuSources: v.array(v.object({
      platform: v.string(),
      url: v.string(),
      embedType: v.string(),
      apiEndpoint: v.optional(v.string()),
      lastScrapedAt: v.optional(v.number()),
      scrapeStatus: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("retailers")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    
    if (existing) {
      throw new Error(`Retailer with slug ${args.slug} already exists`);
    }
    
    return await ctx.db.insert("retailers", {
      ...args,
      isActive: true,
      firstSeenAt: Date.now(),
    });
  },
});

export const updateScrapeStatus = mutation({
  args: {
    id: v.id("retailers"),
    platform: v.string(),
    status: v.string(),
    lastScrapedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const retailer = await ctx.db.get(args.id);
    if (!retailer) throw new Error("Retailer not found");
    
    const updatedSources = retailer.menuSources.map((s) =>
      s.platform === args.platform
        ? { ...s, scrapeStatus: args.status, lastScrapedAt: args.lastScrapedAt }
        : s
    );
    
    await ctx.db.patch(args.id, { menuSources: updatedSources });
  },
});

export const seedNYSRetailers = mutation({
  args: {},
  handler: async (ctx) => {
    // Seed with known NYS dispensaries for initial testing
    const nysRetailers = [
      {
        name: "Housing Works Cannabis Co.",
        slug: "housing-works-cannabis-co",
        licenseNumber: "OCM-AUCC-2022-00001",
        licenseType: "adult_use_retail",
        address: {
          street: "750 Broadway",
          city: "New York",
          state: "NY",
          zip: "10003",
          lat: 40.7308,
          lng: -73.9917,
        },
        region: "nyc",
        menuSources: [
          {
            platform: "dutchie",
            url: "https://dutchie.com/dispensary/housing-works-cannabis-co",
            embedType: "iframe",
            scrapeStatus: "active",
          },
        ],
      },
      {
        name: "The Cannabist - Brooklyn",
        slug: "the-cannabist-brooklyn",
        licenseNumber: "OCM-AUCC-2023-00015",
        licenseType: "adult_use_retail",
        address: {
          street: "680 Atlantic Ave",
          city: "Brooklyn",
          state: "NY",
          zip: "11217",
          lat: 40.6847,
          lng: -73.9762,
        },
        region: "nyc",
        menuSources: [
          {
            platform: "dutchie",
            url: "https://dutchie.com/dispensary/the-cannabist-brooklyn",
            embedType: "iframe",
            scrapeStatus: "active",
          },
        ],
      },
      {
        name: "Smacked Village",
        slug: "smacked-village",
        licenseNumber: "OCM-AUCC-2023-00042",
        licenseType: "adult_use_retail",
        address: {
          street: "117 Christopher St",
          city: "New York",
          state: "NY",
          zip: "10014",
          lat: 40.7334,
          lng: -74.0036,
        },
        region: "nyc",
        menuSources: [
          {
            platform: "dutchie",
            url: "https://dutchie.com/dispensary/smacked-village",
            embedType: "iframe",
            scrapeStatus: "active",
          },
        ],
      },
    ];
    
    const inserted = [];
    for (const retailer of nysRetailers) {
      const existing = await ctx.db
        .query("retailers")
        .withIndex("by_slug", (q) => q.eq("slug", retailer.slug))
        .first();
      
      if (!existing) {
        const id = await ctx.db.insert("retailers", {
          ...retailer,
          isActive: true,
          firstSeenAt: Date.now(),
        });
        inserted.push({ id, name: retailer.name });
      }
    }
    
    return { inserted, count: inserted.length };
  },
});
