import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface WatchlistPageProps {
  onClose: () => void;
  onProductClick: (productId: Id<"products">) => void;
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

export function WatchlistPage({ onClose, onProductClick }: WatchlistPageProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState(getStoredEmail() || "");
  const [isEmailSet, setIsEmailSet] = useState(!!getStoredEmail());
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  
  // Keyboard handling - Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    
    document.addEventListener("keydown", handleKeyDown);
    modalRef.current?.focus();
    document.body.style.overflow = "hidden";
    
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  
  const watches = useQuery(
    api.alerts.getWatchesByEmail,
    isEmailSet ? { email } : "skip"
  );
  
  const deleteWatch = useMutation(api.alerts.deleteWatch);
  const toggleWatch = useMutation(api.alerts.toggleWatch);
  
  const handleSetEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError("Please enter your email address");
      return;
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      setEmailError("Please enter a valid email address");
      return;
    }
    
    setStoredEmail(trimmed);
    setIsEmailSet(true);
    setEditingEmail(false);
  };
  
  const handleDeleteWatch = async (watchId: Id<"productWatches">) => {
    if (confirm("Remove this from your watchlist?")) {
      await deleteWatch({ watchId });
    }
  };
  
  const handleToggleWatch = async (watchId: Id<"productWatches">) => {
    await toggleWatch({ watchId });
  };
  
  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };
  
  // Email entry screen
  if (!isEmailSet || editingEmail) {
    return (
      <div
        ref={modalRef}
        className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        onClick={handleBackdropClick}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Enter email for watchlist"
      >
        <div className="w-full max-w-md bg-neutral-900 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">My Watchlist</h2>
            <button
              onClick={onClose}
              className="p-2 -mr-2 rounded-full hover:bg-neutral-800 text-neutral-400"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          
          <form onSubmit={handleSetEmail}>
            <p className="text-neutral-400 mb-4">
              Enter your email to view and manage your watched products.
            </p>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError(null);
              }}
              placeholder="your@email.com"
              className={`w-full px-4 py-3 bg-neutral-800 border rounded-lg text-white focus:outline-none focus:border-cannabis-500 ${
                emailError ? "border-red-500" : "border-neutral-700"
              }`}
              autoFocus
              aria-invalid={!!emailError}
              aria-describedby={emailError ? "email-error" : undefined}
            />
            {emailError && (
              <p id="email-error" className="text-red-400 text-sm mt-2">
                {emailError}
              </p>
            )}
            <button
              type="submit"
              className="w-full mt-4 py-3 bg-cannabis-600 text-white rounded-lg font-medium hover:bg-cannabis-500"
            >
              View Watchlist
            </button>
            {editingEmail && (
              <button
                type="button"
                onClick={() => setEditingEmail(false)}
                className="w-full mt-2 py-2 text-neutral-500 text-sm hover:text-neutral-400"
              >
                Cancel
              </button>
            )}
          </form>
        </div>
      </div>
    );
  }
  
  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center"
      onClick={handleBackdropClick}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Your watchlist"
    >
      <div className="w-full max-w-lg bg-neutral-900 rounded-t-2xl sm:rounded-2xl max-h-[85vh] overflow-hidden flex flex-col animate-slide-up">
        {/* Header */}
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span>🔔</span>
              <span>My Watchlist</span>
            </h2>
            <button
              onClick={() => setEditingEmail(true)}
              className="text-xs text-neutral-500 hover:text-neutral-400"
            >
              {email} • Change
            </button>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 rounded-full hover:bg-neutral-800 text-neutral-400"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {!watches ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-neutral-800 rounded-lg animate-pulse"></div>
              ))}
            </div>
          ) : watches.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-4xl mb-4">👀</p>
              <p className="text-neutral-400 mb-2">No watched products yet</p>
              <p className="text-sm text-neutral-600">
                Find a product and tap "Watch" to get alerted when it restocks
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-neutral-500 mb-2">
                You'll be notified when these products restock or drop in price
              </p>
              
              {watches.map((watch) => (
                <div
                  key={watch._id}
                  className={`bg-neutral-800/50 rounded-lg p-4 border transition-opacity ${
                    watch.isActive ? "border-neutral-700/50" : "border-neutral-800 opacity-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => onProductClick(watch.productId)}
                      className="flex-1 text-left min-w-0"
                    >
                      <p className="text-xs text-cannabis-400 font-medium">
                        {watch.brand?.name || "Unknown Brand"}
                      </p>
                      <p className="text-white font-medium truncate">
                        {watch.product?.name || "Unknown Product"}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {watch.alertTypes.map((type) => (
                          <span
                            key={type}
                            className="text-xs px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-400"
                          >
                            {type === "restock" ? "📦 Restock" :
                             type === "price_drop" ? "📉 Price Drop" :
                             type === "new_drop" ? "🆕 New Drop" : type}
                          </span>
                        ))}
                      </div>
                    </button>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleWatch(watch._id)}
                        className={`p-2 rounded-lg transition-colors ${
                          watch.isActive
                            ? "text-cannabis-400 hover:bg-cannabis-600/20"
                            : "text-neutral-600 hover:bg-neutral-700"
                        }`}
                        title={watch.isActive ? "Pause alerts" : "Resume alerts"}
                      >
                        {watch.isActive ? "🔔" : "🔕"}
                      </button>
                      <button
                        onClick={() => handleDeleteWatch(watch._id)}
                        className="p-2 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-600/10"
                        title="Remove from watchlist"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  
                  {watch.lastNotifiedAt && (
                    <p className="text-xs text-neutral-600 mt-2">
                      Last alert: {formatTimeAgo(watch.lastNotifiedAt)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Footer info */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-800/50">
          <p className="text-xs text-neutral-500 text-center">
            Alerts are sent to Discord when products restock or prices drop.
            <br />
            Email notifications coming soon!
          </p>
        </div>
      </div>
      
      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up {
          animation: slide-up 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}
