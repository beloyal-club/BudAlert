import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface WatchButtonProps {
  productId: Id<"products">;
  productName?: string;
}

// Get stored email from localStorage
const getStoredEmail = (): string | null => {
  try {
    return localStorage.getItem("cannasignal_email");
  } catch {
    return null;
  }
};

const setStoredEmail = (email: string): void => {
  try {
    localStorage.setItem("cannasignal_email", email);
  } catch {
    // Ignore storage errors
  }
};

export function WatchButton({ productId, productName }: WatchButtonProps) {
  const [email, setEmail] = useState(getStoredEmail() || "");
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const storedEmail = getStoredEmail();
  const isWatching = useQuery(
    api.alerts.checkWatchExists,
    storedEmail ? { email: storedEmail, productId } : "skip"
  );
  const watcherCount = useQuery(api.alerts.getWatcherCount, { productId });

  const watchProduct = useMutation(api.alerts.watchProduct);
  const unwatchProduct = useMutation(api.alerts.unwatchProduct);

  // Reset state when product changes
  useEffect(() => {
    setShowEmailInput(false);
    setError(null);
    setSuccess(false);
  }, [productId]);

  const handleWatch = async () => {
    // If we have a stored email and not watching, just subscribe
    if (storedEmail && !isWatching) {
      setIsLoading(true);
      setError(null);
      try {
        await watchProduct({ 
          email: storedEmail, 
          productId,
          alertTypes: ["restock", "price_drop"],
        });
        setSuccess(true);
        setTimeout(() => setSuccess(false), 2000);
      } catch (e: any) {
        setError(e.message || "Failed to watch product");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // If already watching, unwatch
    if (storedEmail && isWatching) {
      setIsLoading(true);
      try {
        await unwatchProduct({ email: storedEmail, productId });
      } catch (e: any) {
        setError(e.message || "Failed to unwatch");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // No email stored, show input
    setShowEmailInput(true);
  };

  const handleSubmitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter your email");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await watchProduct({ 
        email: email.trim(), 
        productId,
        alertTypes: ["restock", "price_drop"],
      });
      setStoredEmail(email.trim());
      setShowEmailInput(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e: any) {
      setError(e.message || "Failed to watch product");
    } finally {
      setIsLoading(false);
    }
  };

  // Email input form
  if (showEmailInput) {
    return (
      <div className="mt-4 p-4 bg-neutral-800 rounded-lg border border-neutral-700">
        <form onSubmit={handleSubmitEmail}>
          <p className="text-sm text-neutral-300 mb-3">
            Enter your email to get notified when this product restocks or drops in price
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white text-sm focus:outline-none focus:border-cannabis-500"
              autoFocus
            />
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-cannabis-600 text-white rounded-lg text-sm font-medium hover:bg-cannabis-500 disabled:opacity-50"
            >
              {isLoading ? "..." : "Watch"}
            </button>
          </div>
          {error && (
            <p className="text-red-400 text-xs mt-2">{error}</p>
          )}
          <button
            type="button"
            onClick={() => setShowEmailInput(false)}
            className="text-xs text-neutral-500 mt-2 hover:text-neutral-400"
          >
            Cancel
          </button>
        </form>
      </div>
    );
  }

  // Main button
  return (
    <div className="mt-4">
      <button
        onClick={handleWatch}
        disabled={isLoading}
        className={`w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors ${
          isWatching
            ? "bg-cannabis-600/20 text-cannabis-400 border border-cannabis-600 hover:bg-cannabis-600/30"
            : success
            ? "bg-green-600 text-white"
            : "bg-cannabis-600 text-white hover:bg-cannabis-500"
        } disabled:opacity-50`}
      >
        {isLoading ? (
          <>
            <span className="animate-spin">⟳</span>
            <span>Processing...</span>
          </>
        ) : success ? (
          <>
            <span>✓</span>
            <span>You're watching this!</span>
          </>
        ) : isWatching ? (
          <>
            <span>🔔</span>
            <span>Watching • Tap to unwatch</span>
          </>
        ) : (
          <>
            <span>🔔</span>
            <span>Watch for Restocks & Deals</span>
          </>
        )}
      </button>
      {watcherCount !== undefined && watcherCount > 0 && (
        <p className="text-center text-xs text-neutral-500 mt-2">
          {watcherCount} {watcherCount === 1 ? "person is" : "people are"} watching this
        </p>
      )}
      {error && !showEmailInput && (
        <p className="text-center text-xs text-red-400 mt-2">{error}</p>
      )}
    </div>
  );
}
