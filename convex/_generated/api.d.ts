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
import type * as analytics from "../analytics.js";
import type * as brands from "../brands.js";
import type * as cache from "../cache.js";
import type * as dashboard from "../dashboard.js";
import type * as deadLetterQueue from "../deadLetterQueue.js";
import type * as http from "../http.js";
import type * as ingestion from "../ingestion.js";
import type * as inventory from "../inventory.js";
import type * as lib_productNormalizer from "../lib/productNormalizer.js";
import type * as ocmSync from "../ocmSync.js";
import type * as products from "../products.js";
import type * as retailers from "../retailers.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  analytics: typeof analytics;
  brands: typeof brands;
  cache: typeof cache;
  dashboard: typeof dashboard;
  deadLetterQueue: typeof deadLetterQueue;
  http: typeof http;
  ingestion: typeof ingestion;
  inventory: typeof inventory;
  "lib/productNormalizer": typeof lib_productNormalizer;
  ocmSync: typeof ocmSync;
  products: typeof products;
  retailers: typeof retailers;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
