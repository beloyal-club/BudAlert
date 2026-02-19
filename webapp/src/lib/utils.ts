/**
 * Shared utility functions
 */

/**
 * Format a timestamp as relative time (e.g., "2h ago", "just now")
 */
export function formatTimeAgo(timestamp: number): string {
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

/**
 * Check if data is stale (older than 24 hours)
 */
export function isStale(timestamp: number, thresholdHours = 24): boolean {
  const hours = (Date.now() - timestamp) / (1000 * 60 * 60);
  return hours > thresholdHours;
}

/**
 * Format category name for display
 */
export function formatCategory(cat: string): string {
  return cat
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Get emoji for product category
 */
export function getCategoryEmoji(category: string): string {
  const map: Record<string, string> = {
    flower: "🌸",
    pre_roll: "🚬",
    preroll: "🚬",
    vape: "💨",
    vaporizer: "💨",
    cartridge: "💨",
    edible: "🍪",
    edibles: "🍪",
    gummies: "🍬",
    concentrate: "💎",
    extracts: "💎",
    tincture: "💧",
    tinctures: "💧",
    topical: "🧴",
    topicals: "🧴",
    capsule: "💊",
    capsules: "💊",
  };
  return map[category.toLowerCase()] || "🌿";
}

/**
 * Format price consistently
 */
export function formatPrice(price: number, showCents = true): string {
  if (showCents) {
    return `$${price.toFixed(2)}`;
  }
  return `$${Math.round(price)}`;
}
