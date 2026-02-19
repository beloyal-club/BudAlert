/**
 * UpgradePrompt - Phase 6 Monetization
 * 
 * Contextual upgrade prompts shown when users hit free tier limits
 */

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

interface UpgradePromptProps {
  email: string | null;
  context: "watch_limit" | "sms" | "predictions" | "export" | "api";
  onUpgrade: () => void;
  compact?: boolean;
}

const PROMPTS = {
  watch_limit: {
    emoji: "🔔",
    title: "Watch Limit Reached",
    description: "You're tracking 3 products (free tier max). Upgrade to Premium for unlimited watches!",
    cta: "Upgrade for Unlimited",
    color: "cannabis",
  },
  sms: {
    emoji: "📱",
    title: "SMS Alerts",
    description: "Get instant SMS notifications when products restock. Premium feature.",
    cta: "Get SMS Alerts",
    color: "cannabis",
  },
  predictions: {
    emoji: "🔮",
    title: "Restock Predictions",
    description: "Our AI predicts when products will restock. Know before everyone else!",
    cta: "Unlock Predictions",
    color: "purple",
  },
  export: {
    emoji: "📊",
    title: "Export Data",
    description: "Download your tracking data and price history as CSV.",
    cta: "Enable Exports",
    color: "blue",
  },
  api: {
    emoji: "🔌",
    title: "API Access",
    description: "Integrate CannaSignal data into your own apps with our API.",
    cta: "Get API Access",
    color: "amber",
  },
};

export function UpgradePrompt({ email, context, onUpgrade, compact }: UpgradePromptProps) {
  const subscription = useQuery(
    api.subscriptions.getSubscription,
    email ? { email } : "skip"
  );

  // Don't show if user already has premium
  if (subscription && subscription.tier !== "free") {
    return null;
  }

  const prompt = PROMPTS[context];
  const colorClasses = {
    cannabis: "from-cannabis-600/20 to-cannabis-900/20 border-cannabis-600/30",
    purple: "from-purple-600/20 to-purple-900/20 border-purple-600/30",
    blue: "from-blue-600/20 to-blue-900/20 border-blue-600/30",
    amber: "from-amber-600/20 to-amber-900/20 border-amber-600/30",
  };
  const buttonClasses = {
    cannabis: "bg-cannabis-600 hover:bg-cannabis-500",
    purple: "bg-purple-600 hover:bg-purple-500",
    blue: "bg-blue-600 hover:bg-blue-500",
    amber: "bg-amber-600 hover:bg-amber-500",
  };

  if (compact) {
    return (
      <button
        onClick={onUpgrade}
        className={`w-full p-3 rounded-xl bg-gradient-to-r ${colorClasses[prompt.color as keyof typeof colorClasses]} border flex items-center justify-between group transition-all hover:scale-[1.02]`}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{prompt.emoji}</span>
          <span className="text-sm font-medium text-white">{prompt.title}</span>
        </div>
        <span className="text-xs text-neutral-400 group-hover:text-white">
          Upgrade →
        </span>
      </button>
    );
  }

  return (
    <div className={`p-4 rounded-xl bg-gradient-to-r ${colorClasses[prompt.color as keyof typeof colorClasses]} border`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl">{prompt.emoji}</span>
        <div className="flex-1">
          <h4 className="font-semibold text-white">{prompt.title}</h4>
          <p className="text-sm text-neutral-400 mt-1">{prompt.description}</p>
          <button
            onClick={onUpgrade}
            className={`mt-3 px-4 py-2 rounded-lg ${buttonClasses[prompt.color as keyof typeof buttonClasses]} text-white text-sm font-medium transition-colors`}
          >
            {prompt.cta}
          </button>
        </div>
      </div>
    </div>
  );
}

// Usage indicator component for watch limits
interface WatchUsageBarProps {
  email: string;
  onUpgrade: () => void;
}

export function WatchUsageBar({ email, onUpgrade }: WatchUsageBarProps) {
  const usage = useQuery(api.subscriptions.getWatchUsage, { email });

  if (!usage) return null;

  // Don't show for unlimited
  if (usage.isUnlimited) {
    return (
      <div className="flex items-center gap-2 text-xs text-cannabis-400">
        <span>∞</span>
        <span>Unlimited watches (Premium)</span>
      </div>
    );
  }

  const percentUsed = usage.percentUsed;
  const isAtLimit = usage.currentCount >= usage.maxWatches;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-neutral-400">
          {usage.currentCount} / {usage.maxWatches} watches used
        </span>
        {isAtLimit && (
          <button
            onClick={onUpgrade}
            className="text-cannabis-400 hover:text-cannabis-300"
          >
            Upgrade →
          </button>
        )}
      </div>
      <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isAtLimit ? "bg-red-500" : percentUsed > 66 ? "bg-amber-500" : "bg-cannabis-500"
          }`}
          style={{ width: `${Math.min(percentUsed, 100)}%` }}
        />
      </div>
    </div>
  );
}

// Inline lock icon for premium features
interface PremiumLockProps {
  feature: string;
  onUpgrade: () => void;
}

export function PremiumLock({ feature, onUpgrade }: PremiumLockProps) {
  return (
    <button
      onClick={onUpgrade}
      className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
      title={`${feature} - Premium feature`}
    >
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
      </svg>
      <span>Premium</span>
    </button>
  );
}
