/**
 * Authentication Helpers for Convex Functions
 * 
 * Provides utilities for checking user identity in queries/mutations
 */

import { QueryCtx, MutationCtx, ActionCtx } from "./_generated/server";

/**
 * User identity from Clerk JWT
 */
export interface UserIdentity {
  tokenIdentifier: string;  // Unique identifier from auth provider
  email?: string;
  name?: string;
  pictureUrl?: string;
  // Add more fields as needed from Clerk JWT claims
}

/**
 * Get authenticated user identity from context
 * Returns null if not authenticated
 */
export async function getAuthUser(
  ctx: QueryCtx | MutationCtx | ActionCtx
): Promise<UserIdentity | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }
  
  return {
    tokenIdentifier: identity.tokenIdentifier,
    email: identity.email ?? undefined,
    name: identity.name ?? undefined,
    pictureUrl: identity.pictureUrl ?? undefined,
  };
}

/**
 * Get authenticated user identity or throw
 * Use in functions that require authentication
 */
export async function requireAuth(
  ctx: QueryCtx | MutationCtx | ActionCtx
): Promise<UserIdentity> {
  const user = await getAuthUser(ctx);
  if (!user) {
    throw new Error("Authentication required");
  }
  return user;
}

/**
 * Get user email - from auth if available, or from args
 * This allows backward compatibility with email-based operations
 */
export async function getUserEmail(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  providedEmail?: string
): Promise<string | null> {
  // First try to get from authentication
  const authUser = await getAuthUser(ctx);
  if (authUser?.email) {
    return authUser.email;
  }
  
  // Fall back to provided email (legacy support)
  return providedEmail ?? null;
}

/**
 * Verify that the provided email matches the authenticated user
 * This prevents users from operating on other users' data
 */
export async function verifyEmailAccess(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  email: string
): Promise<boolean> {
  const authUser = await getAuthUser(ctx);
  
  // If user is authenticated, they can only access their own email
  if (authUser?.email) {
    return authUser.email.toLowerCase() === email.toLowerCase();
  }
  
  // If not authenticated, allow access (legacy behavior)
  // In production, you might want to be more restrictive
  return true;
}

/**
 * Get or create user record linked to auth identity
 * Call this after user signs in to ensure they have a database record
 */
export async function getOrCreateAuthUser(
  ctx: MutationCtx,
  identity: UserIdentity
): Promise<{ userId: any; isNew: boolean }> {
  // Check if user exists by external auth ID
  const existing = await ctx.db
    .query("users")
    .withIndex("by_external_auth", (q) => 
      q.eq("authProvider", "clerk").eq("externalAuthId", identity.tokenIdentifier)
    )
    .first();
  
  if (existing) {
    // Update last active timestamp
    await ctx.db.patch(existing._id, {
      lastActiveAt: Date.now(),
      ...(identity.name && { name: identity.name }),
    });
    return { userId: existing._id, isNew: false };
  }
  
  // Check if user exists by email (migration from email-only)
  if (identity.email) {
    const byEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();
    
    if (byEmail) {
      // Link existing email-based user to auth provider
      await ctx.db.patch(byEmail._id, {
        authProvider: "clerk",
        externalAuthId: identity.tokenIdentifier,
        lastActiveAt: Date.now(),
        ...(identity.name && { name: identity.name }),
      });
      return { userId: byEmail._id, isNew: false };
    }
  }
  
  // Create new user
  const userId = await ctx.db.insert("users", {
    email: identity.email ?? "",
    name: identity.name,
    plan: "free",
    authProvider: "clerk",
    externalAuthId: identity.tokenIdentifier,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  });
  
  return { userId, isNew: true };
}
