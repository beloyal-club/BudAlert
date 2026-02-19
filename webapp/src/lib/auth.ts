/**
 * Auth utilities for CannaSignal
 * 
 * Provides a unified interface for getting user info,
 * with graceful fallback to localStorage for unauthenticated users
 */

import { useUser } from "@clerk/clerk-react";
import { useConvexAuth } from "convex/react";

// Legacy localStorage key (for migration)
const LEGACY_EMAIL_KEY = "cannasignal_email";

/**
 * Get stored email from localStorage (legacy)
 * @deprecated Use useAuthUser() hook instead
 */
export function getLegacyStoredEmail(): string | null {
  try {
    return localStorage.getItem(LEGACY_EMAIL_KEY);
  } catch {
    return null;
  }
}

/**
 * Set email in localStorage (legacy)
 * @deprecated Use Clerk authentication instead
 */
export function setLegacyStoredEmail(email: string): void {
  try {
    localStorage.setItem(LEGACY_EMAIL_KEY, email);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Clear legacy stored email (call after successful Clerk login)
 */
export function clearLegacyStoredEmail(): void {
  try {
    localStorage.removeItem(LEGACY_EMAIL_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Hook to get current user info from Clerk
 * Falls back to localStorage email for unauthenticated users (legacy support)
 */
export interface AuthUser {
  isLoaded: boolean;
  isAuthenticated: boolean;
  email: string | null;
  userId: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  imageUrl: string | null;
}

export function useAuthUser(): AuthUser {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { user, isLoaded: clerkLoaded } = useUser();

  if (!clerkLoaded || isLoading) {
    return {
      isLoaded: false,
      isAuthenticated: false,
      email: null,
      userId: null,
      firstName: null,
      lastName: null,
      fullName: null,
      imageUrl: null,
    };
  }

  if (isAuthenticated && user) {
    return {
      isLoaded: true,
      isAuthenticated: true,
      email: user.primaryEmailAddress?.emailAddress ?? null,
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      imageUrl: user.imageUrl,
    };
  }

  // Not authenticated - check for legacy localStorage email
  const legacyEmail = getLegacyStoredEmail();
  return {
    isLoaded: true,
    isAuthenticated: false,
    email: legacyEmail,
    userId: null,
    firstName: null,
    lastName: null,
    fullName: null,
    imageUrl: null,
  };
}

/**
 * Get user email for API calls
 * Returns authenticated user's email, or legacy localStorage email
 */
export function useUserEmail(): string | null {
  const { email, isAuthenticated } = useAuthUser();
  
  // Prefer authenticated email, fall back to legacy
  if (isAuthenticated && email) {
    return email;
  }
  
  return getLegacyStoredEmail();
}

/**
 * Check if user needs to sign up (has legacy email but no account)
 */
export function useNeedsSignup(): boolean {
  const { isLoaded, isAuthenticated } = useAuthUser();
  const legacyEmail = getLegacyStoredEmail();
  
  if (!isLoaded) return false;
  
  // Has legacy email but not authenticated = should prompt to sign up
  return !isAuthenticated && !!legacyEmail;
}
