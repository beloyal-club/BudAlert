/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as alerts from "../alerts.js";
import type * as analytics from "../analytics.js";
import type * as brands from "../brands.js";
import type * as cache from "../cache.js";
import type * as dashboard from "../dashboard.js";
import type * as deadLetterQueue from "../deadLetterQueue.js";
import type * as http from "../http.js";
import type * as ingestion from "../ingestion.js";
import type * as inventory from "../inventory.js";
import type * as inventoryEvents from "../inventoryEvents.js";
import type * as lib_productNormalizer from "../lib/productNormalizer.js";
import type * as ocmSync from "../ocmSync.js";
import type * as priceHistory from "../priceHistory.js";
import type * as products from "../products.js";
import type * as retailers from "../retailers.js";
import type * as scraperAlerts from "../scraperAlerts.js";
import type * as search from "../search.js";
import type * as smartAnalytics from "../smartAnalytics.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  alerts: typeof alerts;
  analytics: typeof analytics;
  brands: typeof brands;
  cache: typeof cache;
  dashboard: typeof dashboard;
  deadLetterQueue: typeof deadLetterQueue;
  http: typeof http;
  ingestion: typeof ingestion;
  inventory: typeof inventory;
  inventoryEvents: typeof inventoryEvents;
  "lib/productNormalizer": typeof lib_productNormalizer;
  ocmSync: typeof ocmSync;
  priceHistory: typeof priceHistory;
  products: typeof products;
  retailers: typeof retailers;
  scraperAlerts: typeof scraperAlerts;
  search: typeof search;
  smartAnalytics: typeof smartAnalytics;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
