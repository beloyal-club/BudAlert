/**
 * Discord Webhook Configuration
 * 
 * Centralizes Discord webhook URL management.
 * Reads from Convex environment variables.
 * 
 * Environment Variables:
 * - DISCORD_WEBHOOK_PRODUCT_ALERTS: Default webhook for product alerts
 * - DISCORD_WEBHOOK_SCRAPER_ALERTS: Webhook for scraper health alerts
 */

/**
 * Get the product alerts webhook URL from environment
 */
export function getProductAlertsWebhook(): string | undefined {
  return process.env.DISCORD_WEBHOOK_PRODUCT_ALERTS;
}

/**
 * Get the scraper alerts webhook URL from environment
 */
export function getScraperAlertsWebhook(): string | undefined {
  return process.env.DISCORD_WEBHOOK_SCRAPER_ALERTS;
}

/**
 * Validate a Discord webhook URL format
 */
export function isValidWebhookUrl(url: string): boolean {
  const webhookPattern = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/;
  return webhookPattern.test(url);
}

/**
 * Send a message to a Discord webhook
 */
export async function sendToWebhook(
  webhookUrl: string,
  payload: DiscordWebhookPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Discord webhook message payload
 */
export interface DiscordWebhookPayload {
  content?: string | null;
  username?: string;
  avatar_url?: string;
  embeds?: DiscordEmbed[];
}

/**
 * Discord embed structure
 */
export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  timestamp?: string;
  footer?: {
    text: string;
    icon_url?: string;
  };
  thumbnail?: {
    url: string;
  };
  image?: {
    url: string;
  };
  author?: {
    name: string;
    url?: string;
    icon_url?: string;
  };
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
}

/**
 * Color constants for embed severity
 */
export const EMBED_COLORS = {
  SUCCESS: 0x00ff00, // Green
  INFO: 0x5865f2,    // Discord blurple
  WARNING: 0xffaa00, // Orange
  ERROR: 0xff6b00,   // Red-orange
  CRITICAL: 0xff0000, // Red
  PRICE_DROP: 0x00ff00, // Green
  RESTOCK: 0x00ff00,   // Green
  NEW_PRODUCT: 0x5865f2, // Blurple
};

/**
 * Emoji constants for alert types
 */
export const ALERT_EMOJIS = {
  RESTOCK: "🔔",
  PRICE_DROP: "📉",
  NEW_PRODUCT: "🆕",
  NEW_DROP: "🆕",
  FAILURE: "❌",
  RATE_LIMIT: "🚫",
  STALE: "⏰",
  RECOVERED: "✅",
  TEST: "🧪",
  LOCATION: "📍",
  PRICE: "💵",
};

/**
 * Build a product alert embed
 */
export function buildProductAlertEmbed(
  alertType: "restock" | "price_drop" | "new_product",
  productName: string,
  brandName: string,
  retailerName: string,
  location?: string,
  price?: number,
  previousPrice?: number,
  changePercent?: number,
  watcherEmail?: string,
): DiscordEmbed {
  let description = "";
  let title = "";
  let color = EMBED_COLORS.SUCCESS;

  switch (alertType) {
    case "restock":
      title = `${ALERT_EMOJIS.RESTOCK} Product Alert`;
      description = `**${brandName} - ${productName}** is back in stock!`;
      if (price) {
        description += `\n${ALERT_EMOJIS.PRICE} Price: $${price.toFixed(2)}`;
      }
      break;
    case "price_drop":
      title = `${ALERT_EMOJIS.PRICE_DROP} Product Alert`;
      color = EMBED_COLORS.PRICE_DROP;
      description = `**${brandName} - ${productName}** price dropped!`;
      if (previousPrice && price) {
        description += `\n${ALERT_EMOJIS.PRICE} $${previousPrice.toFixed(2)} → $${price.toFixed(2)}`;
        if (changePercent) {
          description += ` (${changePercent}% off)`;
        }
      }
      break;
    case "new_product":
      title = `${ALERT_EMOJIS.NEW_PRODUCT} Product Alert`;
      color = EMBED_COLORS.NEW_PRODUCT;
      description = `**${brandName}** just dropped **${productName}**!`;
      if (price) {
        description += `\n${ALERT_EMOJIS.PRICE} Price: $${price.toFixed(2)}`;
      }
      break;
  }

  description += `\n${ALERT_EMOJIS.LOCATION} @ ${retailerName}`;
  if (location) {
    description += ` (${location})`;
  }

  return {
    title,
    description,
    color,
    footer: watcherEmail ? { text: `Watching: ${watcherEmail}` } : undefined,
    timestamp: new Date().toISOString(),
  };
}
