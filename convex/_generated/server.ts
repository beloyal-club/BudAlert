/**
 * AUTO-GENERATED STUB — Replace with real Convex codegen after `npx convex dev`
 * 
 * This file provides type stubs for Convex server-side functions.
 */

import {
  mutation as baseMutation,
  query as baseQuery,
  action as baseAction,
  internalMutation as baseInternalMutation,
  internalQuery as baseInternalQuery,
  internalAction as baseInternalAction,
  httpAction as baseHttpAction,
} from "convex/server";
import type { DataModel } from "./dataModel";

// Re-export with proper typing for this project's schema

/**
 * Define a query function
 */
export const query = baseQuery as typeof baseQuery;

/**
 * Define a mutation function
 */
export const mutation = baseMutation as typeof baseMutation;

/**
 * Define an action function (can call external APIs)
 */
export const action = baseAction as typeof baseAction;

/**
 * Define an internal mutation (only callable from other Convex functions)
 */
export const internalMutation = baseInternalMutation as typeof baseInternalMutation;

/**
 * Define an internal query
 */
export const internalQuery = baseInternalQuery as typeof baseInternalQuery;

/**
 * Define an internal action
 */
export const internalAction = baseInternalAction as typeof baseInternalAction;

/**
 * Define an HTTP action (for HTTP routes)
 */
export const httpAction = baseHttpAction as typeof baseHttpAction;

// Re-export DataModel for type inference
export type { DataModel };
