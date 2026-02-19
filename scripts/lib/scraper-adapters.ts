/**
 * Scraper Adapters for Different Menu Platforms
 * 
 * Supports:
 * - Dutchie Embedded (primary)
 * - Dutchie Direct (with stealth)
 * - WooCommerce
 * - Future: Alpine IQ
 */

import { Page, Browser } from 'playwright';
import * as dutchieExtractor from './dutchie-extractor';

export interface ScrapedProduct {
  name: string;
  brand: string;
  price: number;
  originalPrice?: number;
  category: string;
  weight?: string;
  thcPercent?: number;
  cbdPercent?: number;
  inventoryCount?: number;
  inStock: boolean;
  imageUrl?: string;
  sourceUrl: string;
  scrapedAt: string;
}

export interface ScrapeResult {
  success: boolean;
  retailerSlug: string;
  locationName: string;
  platform: string;
  products: ScrapedProduct[];
  errorMessage?: string;
  scrapedAt: string;
  durationMs: number;
}

/**
 * Platform-specific scraper interface
 */
export interface PlatformAdapter {
  name: string;
  supportedPlatforms: string[];
  scrape(page: Page, menuUrl: string, options?: ScrapeOptions): Promise<ScrapedProduct[]>;
}

export interface ScrapeOptions {
  maxProducts?: number;
  includeOutOfStock?: boolean;
  extractInventory?: boolean;
  timeout?: number;
}

/**
 * Dutchie Embedded Adapter
 * Works for sites with embedded Dutchie menus
 */
export class DutchieEmbeddedAdapter implements PlatformAdapter {
  name = 'dutchie-embedded';
  supportedPlatforms = [
    'dutchie-embedded',
    'dutchie-plus',
    'joint-dutchie-plugin',
    'dutchie-backend',
    'wordpress-joint-dutchie',
  ];

  async scrape(page: Page, menuUrl: string, options: ScrapeOptions = {}): Promise<ScrapedProduct[]> {
    const products: ScrapedProduct[] = [];
    const maxProducts = options.maxProducts || 100;
    
    // Navigate to menu
    await page.goto(menuUrl, { waitUntil: 'networkidle', timeout: options.timeout || 30000 });
    
    // Handle age verification if present
    await this.handleAgeVerification(page);
    
    // Wait for products to load
    await page.waitForTimeout(3000);
    
    // Get all product cards
    const cards = await dutchieExtractor.getProductCards(page);
    
    for (let i = 0; i < Math.min(cards.length, maxProducts); i++) {
      const card = cards[i];
      
      // Skip out of stock if not including them
      if (!options.includeOutOfStock && !card.inStock) {
        continue;
      }
      
      let inventory: Awaited<ReturnType<typeof dutchieExtractor.extractInventoryFromModal>> | null = null;
      
      // Click to get detailed info if extracting inventory
      if (options.extractInventory) {
        const clicked = await dutchieExtractor.clickProductCard(page, i);
        if (clicked) {
          inventory = await dutchieExtractor.extractInventoryFromModal(page);
          await dutchieExtractor.closeModal(page);
        }
      }
      
      products.push({
        name: inventory?.fullName || card.name,
        brand: inventory?.brand || card.brand,
        price: inventory?.price || card.price,
        originalPrice: card.originalPrice,
        category: inventory?.category || card.category || 'Unknown',
        weight: inventory?.weight,
        thcPercent: inventory?.thcPercent,
        cbdPercent: inventory?.cbdPercent,
        inventoryCount: inventory?.inventoryCount,
        inStock: card.inStock,
        imageUrl: card.imageUrl,
        sourceUrl: menuUrl,
        scrapedAt: new Date().toISOString(),
      });
    }
    
    return products;
  }
  
  private async handleAgeVerification(page: Page): Promise<void> {
    // Common age verification selectors
    const verifySelectors = [
      'button:has-text("Yes")',
      'button:has-text("I am 21")',
      'button:has-text("Enter")',
      '[data-testid="age-gate-submit"]',
      '.age-gate-submit',
      '#age-yes',
    ];
    
    for (const selector of verifySelectors) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 1000 })) {
          await btn.click();
          await page.waitForTimeout(1500);
          return;
        }
      } catch {
        continue;
      }
    }
  }
}

/**
 * Dutchie Direct Adapter
 * For scraping dutchie.com directly (requires stealth/proxy)
 */
export class DutchieDirectAdapter implements PlatformAdapter {
  name = 'dutchie-direct';
  supportedPlatforms = ['dutchie-direct'];

  async scrape(page: Page, menuUrl: string, options: ScrapeOptions = {}): Promise<ScrapedProduct[]> {
    // Direct Dutchie scraping requires additional stealth measures
    // due to Cloudflare protection
    
    // Note: This adapter may fail without proper proxy/stealth setup
    console.warn('[DutchieDirectAdapter] Direct Dutchie scraping may be blocked by Cloudflare');
    
    // Use same extraction logic as embedded
    const embeddedAdapter = new DutchieEmbeddedAdapter();
    return embeddedAdapter.scrape(page, menuUrl, options);
  }
}

/**
 * WooCommerce Adapter
 * For WordPress sites using WooCommerce
 */
export class WooCommerceAdapter implements PlatformAdapter {
  name = 'woocommerce';
  supportedPlatforms = ['woocommerce'];

  async scrape(page: Page, menuUrl: string, options: ScrapeOptions = {}): Promise<ScrapedProduct[]> {
    const products: ScrapedProduct[] = [];
    const maxProducts = options.maxProducts || 100;
    
    await page.goto(menuUrl, { waitUntil: 'networkidle', timeout: options.timeout || 30000 });
    await page.waitForTimeout(2000);
    
    // WooCommerce product extraction
    const wooProducts = await page.evaluate(() => {
      const items: any[] = [];
      
      // Common WooCommerce product selectors
      const productElements = document.querySelectorAll(
        '.product, .wc-block-grid__product, [class*="product-item"], .products > li'
      );
      
      productElements.forEach((el) => {
        const text = el.textContent || '';
        
        // Extract name
        const nameEl = el.querySelector('.woocommerce-loop-product__title, h2, .product-title, .wc-block-grid__product-title');
        const name = nameEl?.textContent?.trim() || 'Unknown';
        
        // Extract price
        const priceEl = el.querySelector('.price, .woocommerce-Price-amount');
        const priceText = priceEl?.textContent || '';
        const priceMatch = priceText.match(/\$(\d+\.?\d*)/);
        const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
        
        // Extract image
        const imgEl = el.querySelector('img');
        const imageUrl = imgEl?.src || imgEl?.getAttribute('data-src');
        
        // Check stock status
        const outOfStock = text.toLowerCase().includes('out of stock') ||
                          el.querySelector('.outofstock, .out-of-stock') !== null;
        
        // Extract category from class or breadcrumb
        const categoryMatch = el.className.match(/product-cat-(\w+)/);
        const category = categoryMatch ? categoryMatch[1] : 'Unknown';
        
        items.push({
          name,
          price,
          imageUrl,
          inStock: !outOfStock,
          category,
        });
      });
      
      return items;
    });
    
    for (const p of wooProducts.slice(0, maxProducts)) {
      if (!options.includeOutOfStock && !p.inStock) continue;
      
      products.push({
        name: p.name,
        brand: 'Unknown',
        price: p.price,
        category: p.category,
        inStock: p.inStock,
        imageUrl: p.imageUrl,
        sourceUrl: menuUrl,
        scrapedAt: new Date().toISOString(),
      });
    }
    
    return products;
  }
}

/**
 * Adapter registry
 */
const adapters: PlatformAdapter[] = [
  new DutchieEmbeddedAdapter(),
  new DutchieDirectAdapter(),
  new WooCommerceAdapter(),
];

/**
 * Get appropriate adapter for platform type
 */
export function getAdapter(platform: string): PlatformAdapter | null {
  for (const adapter of adapters) {
    if (adapter.supportedPlatforms.includes(platform)) {
      return adapter;
    }
  }
  return null;
}

/**
 * Scrape a retailer location using the appropriate adapter
 */
export async function scrapeRetailer(
  page: Page,
  retailerSlug: string,
  locationName: string,
  menuUrl: string,
  platform: string,
  options: ScrapeOptions = {}
): Promise<ScrapeResult> {
  const startTime = Date.now();
  
  const adapter = getAdapter(platform);
  
  if (!adapter) {
    return {
      success: false,
      retailerSlug,
      locationName,
      platform,
      products: [],
      errorMessage: `No adapter found for platform: ${platform}`,
      scrapedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
  }
  
  try {
    const products = await adapter.scrape(page, menuUrl, options);
    
    return {
      success: true,
      retailerSlug,
      locationName,
      platform,
      products,
      scrapedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      retailerSlug,
      locationName,
      platform,
      products: [],
      errorMessage: (error as Error).message,
      scrapedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
  }
}

export default {
  DutchieEmbeddedAdapter,
  DutchieDirectAdapter,
  WooCommerceAdapter,
  getAdapter,
  scrapeRetailer,
};
