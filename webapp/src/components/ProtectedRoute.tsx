/**
 * ProtectedRoute - Wrapper for auth-required pages
 * 
 * Shows sign-in prompt when user is not authenticated
 */

import { ReactNode } from "react";
import { SignInButton, SignUpButton } from "@clerk/clerk-react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";

interface ProtectedRouteProps {
  children: ReactNode;
  /** What to show while checking auth */
  loadingFallback?: ReactNode;
  /** Custom sign-in prompt */
  signInPrompt?: {
    title: string;
    description: string;
  };
}

export function ProtectedRoute({ 
  children, 
  loadingFallback,
  signInPrompt = {
    title: "Sign in required",
    description: "Please sign in to access this page."
  }
}: ProtectedRouteProps) {
  return (
    <>
      <AuthLoading>
        {loadingFallback || (
          <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
            <div className="animate-pulse text-cannabis-400">
              <div className="w-12 h-12 border-4 border-cannabis-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-neutral-400">Checking authentication...</p>
            </div>
          </div>
        )}
      </AuthLoading>

      <Unauthenticated>
        <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-neutral-900 rounded-2xl p-8 border border-neutral-800">
            <div className="text-center mb-8">
              <div className="text-4xl mb-4">🔐</div>
              <h1 className="text-2xl font-bold text-white mb-2">
                {signInPrompt.title}
              </h1>
              <p className="text-neutral-400">
                {signInPrompt.description}
              </p>
            </div>
            
            <div className="space-y-3">
              <SignInButton mode="modal">
                <button className="w-full py-3 bg-cannabis-600 text-white rounded-lg font-medium hover:bg-cannabis-500 transition-colors">
                  Sign In
                </button>
              </SignInButton>
              
              <SignUpButton mode="modal">
                <button className="w-full py-3 bg-neutral-800 text-white rounded-lg font-medium hover:bg-neutral-700 transition-colors border border-neutral-700">
                  Create Account
                </button>
              </SignUpButton>
            </div>
            
            <p className="text-center text-xs text-neutral-500 mt-6">
              By signing in, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </div>
      </Unauthenticated>

      <Authenticated>
        {children}
      </Authenticated>
    </>
  );
}

/**
 * B2B specific protected route with business context
 */
export function B2BProtectedRoute({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute
      signInPrompt={{
        title: "Dispensary Dashboard",
        description: "Sign in to access your competitive intelligence dashboard and manage your store analytics."
      }}
      loadingFallback={
        <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
          <div className="text-center">
            <div className="flex items-center gap-2 justify-center mb-4">
              <span className="text-2xl">🌿</span>
              <span className="text-xl font-bold text-cannabis-400">CannaSignal</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-600/20 text-amber-400">
                B2B
              </span>
            </div>
            <div className="w-8 h-8 border-4 border-cannabis-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-neutral-400">Loading dashboard...</p>
          </div>
        </div>
      }
    >
      {children}
    </ProtectedRoute>
  );
}
