/**
 * AuthButton - Header authentication button
 * Shows sign-in button when logged out, user menu when logged in
 */

import { SignInButton, SignUpButton, UserButton } from "@clerk/clerk-react";
import { Authenticated, Unauthenticated, AuthLoading, useConvexAuth } from "convex/react";

interface AuthButtonProps {
  mode?: "compact" | "full";
}

export function AuthButton({ mode = "compact" }: AuthButtonProps) {
  const { isLoading } = useConvexAuth();

  if (isLoading) {
    return (
      <div className="w-8 h-8 rounded-full bg-neutral-800 animate-pulse" />
    );
  }

  return (
    <>
      <Unauthenticated>
        <div className="flex items-center gap-2">
          <SignInButton mode="modal">
            <button className="text-sm px-3 py-1.5 rounded-full bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors">
              Sign In
            </button>
          </SignInButton>
          {mode === "full" && (
            <SignUpButton mode="modal">
              <button className="text-sm px-3 py-1.5 rounded-full bg-cannabis-600 text-white hover:bg-cannabis-500 transition-colors">
                Sign Up
              </button>
            </SignUpButton>
          )}
        </div>
      </Unauthenticated>

      <Authenticated>
        <UserButton
          afterSignOutUrl="/"
          appearance={{
            elements: {
              avatarBox: "w-8 h-8",
              userButtonPopoverCard: "bg-neutral-900 border border-neutral-700",
              userButtonPopoverActionButton: "hover:bg-neutral-800",
              userButtonPopoverActionButtonText: "text-neutral-300",
              userButtonPopoverFooter: "hidden",
            },
          }}
        />
      </Authenticated>

      <AuthLoading>
        <div className="w-8 h-8 rounded-full bg-neutral-800 animate-pulse" />
      </AuthLoading>
    </>
  );
}

/**
 * Hook to get the current user's email (from Clerk)
 * Returns null if not authenticated
 */
export function useUserEmail(): string | null {
  // This is a lightweight way to get email without full user object
  // The actual implementation will use Clerk's useUser() hook
  return null; // Placeholder - see useAuthUser below
}
