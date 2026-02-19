import { query } from "./_generated/server";
import { v } from "convex/values";

// ============================================================
// PUBLIC SEARCH QUERIES (for consumer webapp)
// ============================================================

interface EnrichedInventoryItem {
  _id: any;
  retailerId: any;
  productId: any;
  brandId: any;
  currentPrice: number;
  previousPrice?: number;
  inStock: boolean;
  stockLevel?: string;
  lastInStockAt?: number;
  lastUpdatedAt: number;
  product: any;
  brand: any;
  retailer: any;
  distance?: number | null;
}

/**
 * Search products with filters
 * Returns products with their stock status across all retailers
 */
export const searchProducts = query({
  args: {
    query: v.optional(v.string()),
    category: v.optional(v.string()),
    strain: v.optional(v.string()),
    retailerId: v.optional(v.id("retailers")),
    inStockOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    // User location for sorting by distance
    userLat: v.optional(v.number()),
    userLng: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    const offset = args.offset || 0;
    const searchTerm = args.query?.toLowerCase().trim() || "";

    // Get all current inventory with product and retailer info
    let inventory = await ctx.db.query("currentInventory").collect();

    // If filtering by retailer
    if (args.retailerId) {
      inventory = inventory.filter(i => i.retailerId === args.retailerId);
    }

    // If in-stock only
    if (args.inStockOnly) {
      inventory = inventory.filter(i => i.inStock);
    }

    // Enrich with product, brand, and retailer data
    const enrichedItems = await Promise.all(
      inventory.map(async (item): Promise<EnrichedInventoryItem | null> => {
        const [product, brand, retailer] = await Promise.all([
          ctx.db.get(item.productId),
          ctx.db.get(item.brandId),
          ctx.db.get(item.retailerId),
        ]);
        
        if (!product || !brand || !retailer) return null;
        
        return {
          ...item,
          product,
          brand,
          retailer,
        };
      })
    );

    let results = enrichedItems.filter((item): item is EnrichedInventoryItem => item !== null);

    // Apply text search filter
    if (searchTerm) {
      results = results.filter((item) => {
        const searchFields = [
          item.product.name,
          item.product.normalizedName,
          item.brand.name,
          item.product.category,
          item.product.strain,
        ].filter(Boolean).map(s => s!.toLowerCase());
        
        return searchFields.some(field => field.includes(searchTerm));
      });
    }

    // Apply category filter
    if (args.category) {
      results = results.filter(item => 
        item.product.category.toLowerCase() === args.category!.toLowerCase()
      );
    }

    // Apply strain filter  
    if (args.strain) {
      results = results.filter(item =>
        item.product.strain?.toLowerCase() === args.strain!.toLowerCase()
      );
    }

    // Calculate distance if user location provided
    if (args.userLat !== undefined && args.userLng !== undefined) {
      results = results.map(item => ({
        ...item,
        distance: item.retailer.address.lat && item.retailer.address.lng
          ? haversineDistance(
              args.userLat!,
              args.userLng!,
              item.retailer.address.lat,
              item.retailer.address.lng
            )
          : null,
      }));

      // Sort by distance (nearest first), then by in-stock status
      results.sort((a, b) => {
        // In-stock items first
        if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
        // Then by distance
        if (a.distance === null || a.distance === undefined) return 1;
        if (b.distance === null || b.distance === undefined) return -1;
        return a.distance - b.distance;
      });
    } else {
      // Default sort: in-stock first, then by last updated
      results.sort((a, b) => {
        if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
        return b.lastUpdatedAt - a.lastUpdatedAt;
      });
    }

    // Paginate
    const total = results.length;
    const paginatedResults = results.slice(offset, offset + limit);

    return {
      results: paginatedResults.map(item => ({
        id: item._id,
        productId: item.productId,
        productName: item.product.name,
        brandName: item.brand.name,
        category: item.product.category,
        strain: item.product.strain,
        weight: item.product.weight,
        thcRange: item.product.thcRange,
        imageUrl: item.product.imageUrl,
        retailerId: item.retailerId,
        retailerName: item.retailer.name,
        retailerSlug: item.retailer.slug,
        address: item.retailer.address,
        price: item.currentPrice,
        previousPrice: item.previousPrice,
        inStock: item.inStock,
        stockLevel: item.stockLevel,
        lastInStockAt: item.lastInStockAt,
        lastUpdatedAt: item.lastUpdatedAt,
        distance: item.distance,
      })),
      total,
      hasMore: offset + limit < total,
    };
  },
});

/**
 * Get aggregated stock status for a product across all retailers
 */
export const getProductAvailability = query({
  args: {
    productId: v.id("products"),
    userLat: v.optional(v.number()),
    userLng: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) return null;

    const brand = await ctx.db.get(product.brandId);

    const inventory = await ctx.db
      .query("currentInventory")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();

    const locations = await Promise.all(
      inventory.map(async (item) => {
        const retailer = await ctx.db.get(item.retailerId);
        if (!retailer) return null;

        let distance: number | null = null;
        if (args.userLat !== undefined && args.userLng !== undefined && 
            retailer.address.lat && retailer.address.lng) {
          distance = haversineDistance(
            args.userLat,
            args.userLng,
            retailer.address.lat,
            retailer.address.lng
          );
        }

        return {
          retailerId: item.retailerId,
          retailerName: retailer.name,
          retailerSlug: retailer.slug,
          address: retailer.address,
          price: item.currentPrice,
          previousPrice: item.previousPrice,
          inStock: item.inStock,
          stockLevel: item.stockLevel,
          lastInStockAt: item.lastInStockAt,
          lastUpdatedAt: item.lastUpdatedAt,
          distance,
        };
      })
    );

    const validLocations = locations.filter((l): l is NonNullable<typeof l> => l !== null);
    
    // Sort by distance if available, else by stock status
    validLocations.sort((a, b) => {
      if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
      if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
      return 0;
    });

    return {
      product: {
        id: product._id,
        name: product.name,
        category: product.category,
        strain: product.strain,
        weight: product.weight,
        thcRange: product.thcRange,
        imageUrl: product.imageUrl,
      },
      brand: brand ? { id: brand._id, name: brand.name, imageUrl: brand.imageUrl } : null,
      locations: validLocations,
      summary: {
        totalLocations: validLocations.length,
        inStock: validLocations.filter(l => l.inStock).length,
        lowestPrice: validLocations.length > 0 
          ? Math.min(...validLocations.map(l => l.price))
          : null,
        highestPrice: validLocations.length > 0
          ? Math.max(...validLocations.map(l => l.price))
          : null,
      },
    };
  },
});

/**
 * Get filter options (categories, strains, retailers)
 */
export const getFilterOptions = query({
  args: {},
  handler: async (ctx) => {
    const [products, retailers] = await Promise.all([
      ctx.db.query("products").collect(),
      ctx.db.query("retailers").filter(q => q.eq(q.field("isActive"), true)).collect(),
    ]);

    // Extract unique categories
    const categories = [...new Set(products.map(p => p.category))].sort();
    
    // Extract unique strains (filter out undefined/null)
    const strains = [...new Set(products.map(p => p.strain).filter(Boolean))].sort() as string[];

    // Format retailers for filter dropdown
    const retailerOptions = retailers.map(r => ({
      id: r._id,
      name: r.name,
      city: r.address.city,
      region: r.region,
    })).sort((a, b) => a.name.localeCompare(b.name));

    return {
      categories,
      strains,
      retailers: retailerOptions,
    };
  },
});

/**
 * Get recent inventory events (restocks, price drops)
 */
export const getRecentChanges = query({
  args: {
    eventTypes: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;
    const types = args.eventTypes || ["restock", "price_drop", "new_product"];

    let events = await ctx.db
      .query("inventoryEvents")
      .withIndex("by_time")
      .order("desc")
      .take(100);

    // Filter by event types
    events = events.filter(e => types.includes(e.eventType));

    // Take limit
    events = events.slice(0, limit);

    // Enrich with product and retailer data
    const enriched = await Promise.all(
      events.map(async (event) => {
        const [product, retailer] = await Promise.all([
          event.productId ? ctx.db.get(event.productId) : null,
          ctx.db.get(event.retailerId),
        ]);

        let brand = null;
        if (product) {
          brand = await ctx.db.get(product.brandId);
        }

        const metadata = event.metadata as Record<string, unknown> | undefined;

        return {
          id: event._id,
          eventType: event.eventType,
          timestamp: event.timestamp,
          productName: product?.name || metadata?.rawName,
          brandName: brand?.name,
          retailerName: retailer?.name,
          previousValue: event.previousValue,
          newValue: event.newValue,
          metadata: event.metadata,
        };
      })
    );

    return enriched;
  },
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in miles
 */
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
