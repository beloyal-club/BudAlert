/**
 * SubscriptionBadge - Phase 6 Monetization
 * 
 * Shows current subscription status with manage/upgrade options
 */

import { useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";

interface SubscriptionBadgeProps {
  email: string;
  onUpgrade: () => void;
  compact?: boolean;
}

export function SubscriptionBadge({ email, onUpgrade, compact }: SubscriptionBadgeProps) {
  const [isManaging, setIsManaging] = useState(false);
  const subscription = useQuery(api.subscriptions.getSubscription, { email });
  const createPortal = useAction(api.stripe.createPortalSession);

  if (!subscription) {
    return (
      <div className="h-6 w-24 rounded-full bg-neutral-800 animate-pulse" />
    );
  }

  const handleManage = async () => {
    setIsManaging(true);
    try {
      const result = await createPortal({
        email,
        returnUrl: window.location.href,
      });
      if (result.portalUrl) {
        window.location.href = result.portalUrl;
      }
    } catch (err) {
      console.error("Failed to open portal:", err);
    } finally {
      setIsManaging(false);
    }
  };

  const tierColors = {
    free: "bg-neutral-700 text-neutral-300",
    premium: "bg-cannabis-600 text-white",
    pro: "bg-purple-600 text-white",
  };

  const tierIcons = {
    free: "🌱",
    premium: "⭐",
    pro: "💎",
  };

  const tier = subscription.tier as keyof typeof tierColors;
  const isFreeTier = subscription.isFreeTier;

  if (compact) {
    return (
      <button
        onClick={isFreeTier ? onUpgrade : handleManage}
        disabled={isManaging}
        className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 transition-transform hover:scale-105 ${tierColors[tier] || tierColors.free}`}
      >
        <span>{tierIcons[tier] || "🌱"}</span>
        <span className="capitalize">{subscription.tier}</span>
        {!isFreeTier && !isManaging && (
          <svg className="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )}
        {isManaging && (
          <svg className="w-3 h-3 ml-0.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}
      </button>
    );
  }

  return (
    <div className={`p-4 rounded-xl border ${isFreeTier ? "bg-neutral-900 border-neutral-800" : "bg-gradient-to-r from-cannabis-900/30 to-cannabis-800/20 border-cannabis-700/30"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{tierIcons[tier] || "🌱"}</span>
          <div>
            <p className="font-semibold text-white capitalize">{subscription.tier} Plan</p>
            {subscription.currentPeriodEnd && (
              <p className="text-xs text-neutral-400">
                {subscription.cancelAtPeriodEnd ? "Cancels" : "Renews"} on{" "}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isFreeTier ? (
            <button
              onClick={onUpgrade}
              className="px-4 py-2 rounded-lg bg-cannabis-600 hover:bg-cannabis-500 text-white text-sm font-medium"
            >
              Upgrade
            </button>
          ) : (
            <button
              onClick={handleManage}
              disabled={isManaging}
              className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium disabled:opacity-50"
            >
              {isManaging ? "Loading..." : "Manage"}
            </button>
          )}
        </div>
      </div>

      {/* Features summary */}
      {!isFreeTier && subscription.features && (
        <div className="mt-3 pt-3 border-t border-neutral-800">
          <div className="flex flex-wrap gap-2">
            {subscription.features.smsAlerts && (
              <span className="text-xs px-2 py-1 rounded-full bg-cannabis-600/20 text-cannabis-400">
                📱 SMS
              </span>
            )}
            {subscription.features.priorityAlerts && (
              <span className="text-xs px-2 py-1 rounded-full bg-cannabis-600/20 text-cannabis-400">
                ⚡ Priority
              </span>
            )}
            {subscription.features.predictions && (
              <span className="text-xs px-2 py-1 rounded-full bg-cannabis-600/20 text-cannabis-400">
                🔮 Predictions
              </span>
            )}
            {subscription.features.maxWatches === -1 && (
              <span className="text-xs px-2 py-1 rounded-full bg-cannabis-600/20 text-cannabis-400">
                ∞ Unlimited Watches
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
