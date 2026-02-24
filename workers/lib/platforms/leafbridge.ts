/**
 * LeafBridge Platform Scraper
 * 
 * Extracts products from LeafBridge WordPress menu sites (e.g., Alta Dispensary)
 * LeafBridge uses AJAX loading - initial HTML has placeholders, products load dynamically.
 * 
 * Key differences from Dutchie:
 * - Requires browser (AJAX loading, not SSR)
 * - Uses custom selectors (.leafbridge_product_card)
 * - Inventory via input[max] attribute or sold out class
 * - No product detail pages needed - inventory visible on listing
 * 
 * @module leafbridge
 */

// ============================================================================
// TYPES
// ============================================================================

export interface LeafBridgeScrapedProduct {
  rawProductName: string;
  rawBrandName: string;
  rawCategory?: string;
  price: number;
  originalPrice?: number;
  inStock: boolean;
  quantity: number | null;
  quantityWarning: string | null;
  quantitySource: string;
  imageUrl?: string;
  thcFormatted?: string;
  cbdFormatted?: string;
  sourceUrl: string;
  sourcePlatform: string;
  scrapedAt: number;
  productUrl?: string;
}

// ============================================================================
// SELECTORS
// ============================================================================

export const LEAFBRIDGE_SELECTORS = {
  productCard: '.leafbridge_product_card',
  productName: '.leafbridge_product_name',
  brandName: '.leafbridge_brand_name',
  price: '.leafbridge_product_price',
  soldOut: '.add_to_cart_soldout',
  lowStock: '.add_to_cart_warning',
  quantityInput: 'input[type="number"]',
  // Fallback selectors if main ones don't match
  productCardAlt: '[class*="leafbridge"][class*="product"]',
  image: '.leafbridge_product_image img, img[class*="leafbridge"]',
  category: '.leafbridge_product_category, .leafbridge_category',
  thc: '[class*="thc"], [class*="THC"]',
  cbd: '[class*="cbd"], [class*="CBD"]',
};

// ============================================================================
// PLATFORM DETECTION
// ============================================================================

const LEAFBRIDGE_URL_PATTERNS = [
  /altadispensary\.nyc/i,
  /leafbridge\.io/i,
  /leafbridge\.com/i,
];

const LEAFBRIDGE_HTML_SIGNATURES = [
  'leafbridge_product_card',
  '/plugins/leafbridge/',
  'leafbridge-menu',
  'leafbridge_brand_name',
  'wp-content/plugins/leafbridge',
];

/**
 * Detect if a URL/HTML belongs to a LeafBridge platform site
 * 
 * @param url - The URL to check
 * @param html - Optional HTML content for deeper detection
 * @returns true if this is a LeafBridge site
 */
export function isLeafBridgeSite(url: string, html?: string): boolean {
  // URL-based detection (fastest)
  for (const pattern of LEAFBRIDGE_URL_PATTERNS) {
    if (pattern.test(url)) return true;
  }
  
  // HTML-based detection (more reliable)
  if (html) {
    for (const sig of LEAFBRIDGE_HTML_SIGNATURES) {
      if (html.includes(sig)) return true;
    }
  }
  
  return false;
}

// ============================================================================
// DOM EXTRACTION (runs in browser context)
// ============================================================================

/**
 * Extract products from LeafBridge DOM after AJAX has loaded
 * This function runs inside the browser via evaluateFunction
 * 
 * @param sourceUrl - URL of the page being scraped
 * @param timestamp - When scraping started
 * @returns Array of scraped products
 */
export function extractLeafBridgeProductsFromDOM(
  sourceUrl: string,
  timestamp: number
): LeafBridgeScrapedProduct[] {
  const items: LeafBridgeScrapedProduct[] = [];
  
  // Primary selector
  let productCards = document.querySelectorAll('.leafbridge_product_card');
  
  // Fallback if primary doesn't match
  if (productCards.length === 0) {
    productCards = document.querySelectorAll('[class*="leafbridge"][class*="product"]');
  }
  
  // Another fallback - any div with leafbridge in class
  if (productCards.length === 0) {
    const allDivs = document.querySelectorAll('div[class*="leafbridge"]');
    const cards: Element[] = [];
    allDivs.forEach(div => {
      // Look for divs that contain price (likely product cards)
      if (div.textContent?.includes('$')) {
        cards.push(div);
      }
    });
    productCards = cards as unknown as NodeListOf<Element>;
  }
  
  console.log(`[LeafBridge] Found ${productCards.length} product cards`);
  
  productCards.forEach((card) => {
    try {
      // Product name
      const nameEl = card.querySelector('.leafbridge_product_name, [class*="product_name"], [class*="productName"], h2, h3');
      const name = nameEl?.textContent?.trim();
      if (!name || name.length < 2) return;
      
      // Brand
      const brandEl = card.querySelector('.leafbridge_brand_name, [class*="brand_name"], [class*="brandName"]');
      const brand = brandEl?.textContent?.trim() || 'Unknown';
      
      // Price
      let price = 0;
      const priceEl = card.querySelector('.leafbridge_product_price, [class*="price"], [class*="Price"]');
      if (priceEl) {
        const priceMatch = priceEl.textContent?.match(/\$(\d+(?:\.\d{1,2})?)/);
        if (priceMatch) {
          price = parseFloat(priceMatch[1]);
        }
      }
      
      // Fallback: scan card text for price
      if (!price) {
        const cardText = card.textContent || '';
        const priceMatch = cardText.match(/\$(\d+(?:\.\d{1,2})?)/);
        if (priceMatch) {
          price = parseFloat(priceMatch[1]);
        }
      }
      
      if (price <= 0) return; // Skip if no valid price
      
      // Check if sold out
      const soldOutEl = card.querySelector('.add_to_cart_soldout, [class*="soldout"], [class*="sold-out"], [class*="out-of-stock"]');
      const isSoldOut = !!soldOutEl;
      
      // Quantity from input max attribute (key inventory source!)
      let quantity: number | null = null;
      let quantityWarning: string | null = null;
      let quantitySource = 'none';
      
      const qtyInput = card.querySelector('input[type="number"]') as HTMLInputElement | null;
      if (qtyInput && qtyInput.max) {
        const maxVal = parseInt(qtyInput.max, 10);
        if (maxVal > 0 && maxVal < 100) {
          quantity = maxVal;
          quantitySource = 'input_max';
          if (maxVal <= 5) {
            quantityWarning = `Only ${maxVal} left`;
          }
        }
      }
      
      // Low stock warning element
      const lowStockEl = card.querySelector('.add_to_cart_warning, [class*="low-stock"], [class*="lowStock"], [class*="warning"]');
      if (lowStockEl) {
        const warningText = lowStockEl.textContent?.trim() || '';
        if (warningText && !quantityWarning) {
          quantityWarning = warningText;
          // Try to extract number from warning
          const numMatch = warningText.match(/(\d+)/);
          if (numMatch && quantity === null) {
            quantity = parseInt(numMatch[1], 10);
            quantitySource = 'warning_text';
          }
        }
      }
      
      // If sold out, set quantity to 0
      if (isSoldOut) {
        quantity = 0;
        quantityWarning = 'Sold out';
        quantitySource = 'sold_out_class';
      }
      
      // Image
      const imgEl = card.querySelector('.leafbridge_product_image img, img');
      const imageUrl = imgEl?.getAttribute('src') || undefined;
      
      // Category
      const categoryEl = card.querySelector('.leafbridge_product_category, [class*="category"]');
      const rawCategory = categoryEl?.textContent?.trim();
      
      // THC/CBD
      const thcEl = card.querySelector('[class*="thc"], [class*="THC"]');
      const cbdEl = card.querySelector('[class*="cbd"], [class*="CBD"]');
      const thcFormatted = thcEl?.textContent?.trim();
      const cbdFormatted = cbdEl?.textContent?.trim();
      
      // Product URL (if card is a link or contains one)
      const linkEl = card.querySelector('a[href]') || (card.tagName === 'A' ? card : null);
      const productUrl = linkEl?.getAttribute('href') || undefined;
      
      items.push({
        rawProductName: name,
        rawBrandName: brand,
        rawCategory,
        price,
        inStock: !isSoldOut,
        quantity,
        quantityWarning,
        quantitySource,
        imageUrl,
        thcFormatted,
        cbdFormatted,
        sourceUrl,
        productUrl: productUrl && productUrl.startsWith('http') ? productUrl : undefined,
        sourcePlatform: 'leafbridge',
        scrapedAt: timestamp,
      });
      
    } catch (e) {
      // Skip malformed cards
      console.log('[LeafBridge] Error parsing card:', e);
    }
  });
  
  return items;
}

// ============================================================================
// AJAX WAIT SELECTOR
// ============================================================================

/**
 * The selector to wait for before extracting products
 * LeafBridge loads products via AJAX, so we need to wait for cards to appear
 */
export const LEAFBRIDGE_WAIT_SELECTOR = '.leafbridge_product_card';

/**
 * Fallback selectors if primary doesn't appear
 */
export const LEAFBRIDGE_WAIT_SELECTORS_FALLBACK = [
  '[class*="leafbridge"][class*="product"]',
  '.leafbridge-menu',
  '[class*="leafbridge_product"]',
];

/**
 * Time to wait for AJAX content to load (ms)
 */
export const LEAFBRIDGE_AJAX_WAIT_MS = 5000;
