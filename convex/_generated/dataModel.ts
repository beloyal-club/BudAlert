/**
 * AUTO-GENERATED STUB — Replace with real Convex codegen after `npx convex dev`
 * 
 * This file provides type definitions matching the schema.
 */

import type { GenericId } from "convex/values";

// Table ID types
export type Id<TableName extends string> = GenericId<TableName>;

// Address type
export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
}

// Menu source type
export interface MenuSource {
  platform: string;
  url: string;
  embedType: string;
  apiEndpoint?: string;
  lastScrapedAt?: number;
  scrapeStatus: string;
}

// Weight type
export interface Weight {
  amount: number;
  unit: string;
}

// THC/CBD range type
export interface PotencyRange {
  min?: number;
  max?: number;
  unit: string;
}

// Alert rule type
export interface AlertRule {
  condition: string;
  threshold?: number;
  channels: string[];
  isActive: boolean;
}

// Watchlist filters type
export interface WatchlistFilters {
  brandIds?: Id<"brands">[];
  productIds?: Id<"products">[];
  retailerIds?: Id<"retailers">[];
  regions?: string[];
  categories?: string[];
}

// User preferences type
export interface UserPreferences {
  timezone?: string;
  alertDigestTime?: string;
  defaultRegion?: string;
}

// OpenClaw config type
export interface OpenClawConfig {
  channelType?: string;
  channelId?: string;
}

/**
 * DataModel interface — describes all tables and their document types
 */
export interface DataModel {
  retailers: {
    _id: Id<"retailers">;
    _creationTime: number;
    name: string;
    slug: string;
    licenseNumber?: string;
    licenseType?: string;
    address: Address;
    region: string;
    menuSources: MenuSource[];
    operatingHours?: any;
    isActive: boolean;
    firstSeenAt: number;
    metadata?: any;
  };
  
  brands: {
    _id: Id<"brands">;
    _creationTime: number;
    name: string;
    normalizedName: string;
    aliases: string[];
    category?: string;
    imageUrl?: string;
    websiteUrl?: string;
    isVerified: boolean;
    firstSeenAt: number;
    metadata?: any;
  };
  
  products: {
    _id: Id<"products">;
    _creationTime: number;
    brandId: Id<"brands">;
    name: string;
    normalizedName: string;
    category: string;
    subcategory?: string;
    strain?: string;
    weight?: Weight;
    thcRange?: PotencyRange;
    cbdRange?: PotencyRange;
    imageUrl?: string;
    isActive: boolean;
    firstSeenAt: number;
    lastSeenAt: number;
    metadata?: any;
  };
  
  menuSnapshots: {
    _id: Id<"menuSnapshots">;
    _creationTime: number;
    retailerId: Id<"retailers">;
    productId: Id<"products">;
    scrapedAt: number;
    batchId: string;
    price: number;
    originalPrice?: number;
    isOnSale: boolean;
    discountPercent?: number;
    inStock: boolean;
    stockLevel?: string;
    sourceUrl: string;
    sourcePlatform: string;
    rawProductName: string;
    rawBrandName?: string;
    rawCategory?: string;
    rawData?: any;
  };
  
  currentInventory: {
    _id: Id<"currentInventory">;
    _creationTime: number;
    retailerId: Id<"retailers">;
    productId: Id<"products">;
    brandId: Id<"brands">;
    currentPrice: number;
    previousPrice?: number;
    priceChangedAt?: number;
    inStock: boolean;
    stockLevel?: string;
    lastInStockAt?: number;
    outOfStockSince?: number;
    daysOnMenu: number;
    estimatedVelocity?: string;
    lastUpdatedAt: number;
    lastSnapshotId: Id<"menuSnapshots">;
  };
  
  brandAnalytics: {
    _id: Id<"brandAnalytics">;
    _creationTime: number;
    brandId: Id<"brands">;
    region: string;
    period: string;
    periodStart: number;
    periodEnd: number;
    totalRetailersCarrying: number;
    newRetailersAdded: number;
    retailersDropped: number;
    totalSkusListed: number;
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
    avgDiscountPercent?: number;
    outOfStockEvents: number;
    avgDaysOnMenu: number;
    estimatedSellThrough?: string;
    categoryBreakdown?: any;
  };
  
  watchlists: {
    _id: Id<"watchlists">;
    _creationTime: number;
    userId: Id<"users">;
    name: string;
    type: string;
    filters: WatchlistFilters;
    alertRules: AlertRule[];
    isActive: boolean;
    createdAt: number;
  };
  
  alerts: {
    _id: Id<"alerts">;
    _creationTime: number;
    watchlistId: Id<"watchlists">;
    userId: Id<"users">;
    type: string;
    severity: string;
    title: string;
    body: string;
    data: any;
    retailerId?: Id<"retailers">;
    productId?: Id<"products">;
    brandId?: Id<"brands">;
    deliveredVia: string[];
    isRead: boolean;
    createdAt: number;
  };
  
  users: {
    _id: Id<"users">;
    _creationTime: number;
    email: string;
    name?: string;
    company?: string;
    role?: string;
    plan: string;
    planExpiresAt?: number;
    authProvider: string;
    externalAuthId: string;
    preferences?: UserPreferences;
    openclawConfig?: OpenClawConfig;
    createdAt: number;
    lastActiveAt: number;
  };
  
  scrapeJobs: {
    _id: Id<"scrapeJobs">;
    _creationTime: number;
    retailerId: Id<"retailers">;
    sourcePlatform: string;
    sourceUrl: string;
    batchId: string;
    status: string;
    startedAt?: number;
    completedAt?: number;
    itemsScraped: number;
    itemsFailed: number;
    errorMessage?: string;
    retryCount: number;
    metadata?: any;
  };
}

// Document type helper
export type Doc<TableName extends keyof DataModel> = DataModel[TableName];
