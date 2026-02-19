/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as alerts from "../alerts.js";
import type * as analytics from "../analytics.js";
import type * as authHelpers from "../authHelpers.js";
import type * as b2b from "../b2b.js";
import type * as brands from "../brands.js";
import type * as cache from "../cache.js";
import type * as dashboard from "../dashboard.js";
import type * as deadLetterQueue from "../deadLetterQueue.js";
import type * as discordAlerts from "../discordAlerts.js";
import type * as http from "../http.js";
import type * as ingestion from "../ingestion.js";
import type * as inventory from "../inventory.js";
import type * as inventoryEvents from "../inventoryEvents.js";
import type * as lib_discordConfig from "../lib/discordConfig.js";
import type * as lib_geo from "../lib/geo.js";
import type * as lib_productNormalizer from "../lib/productNormalizer.js";
import type * as notificationQueue from "../notificationQueue.js";
import type * as ocmSync from "../ocmSync.js";
import type * as onboarding from "../onboarding.js";
import type * as priceHistory from "../priceHistory.js";
import type * as products from "../products.js";
import type * as retailers from "../retailers.js";
import type * as scraperAlerts from "../scraperAlerts.js";
import type * as search from "../search.js";
import type * as smartAnalytics from "../smartAnalytics.js";
import type * as stripe from "../stripe.js";
import type * as subscriptions from "../subscriptions.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  alerts: typeof alerts;
  analytics: typeof analytics;
  authHelpers: typeof authHelpers;
  b2b: typeof b2b;
  brands: typeof brands;
  cache: typeof cache;
  dashboard: typeof dashboard;
  deadLetterQueue: typeof deadLetterQueue;
  discordAlerts: typeof discordAlerts;
  http: typeof http;
  ingestion: typeof ingestion;
  inventory: typeof inventory;
  inventoryEvents: typeof inventoryEvents;
  "lib/discordConfig": typeof lib_discordConfig;
  "lib/geo": typeof lib_geo;
  "lib/productNormalizer": typeof lib_productNormalizer;
  notificationQueue: typeof notificationQueue;
  ocmSync: typeof ocmSync;
  onboarding: typeof onboarding;
  priceHistory: typeof priceHistory;
  products: typeof products;
  retailers: typeof retailers;
  scraperAlerts: typeof scraperAlerts;
  search: typeof search;
  smartAnalytics: typeof smartAnalytics;
  stripe: typeof stripe;
  subscriptions: typeof subscriptions;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
