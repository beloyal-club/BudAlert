/**
 * LeafBridge Platform Detection and Scraping
 * 
 * WordPress plugin used by some dispensaries (e.g., Alta Dispensary)
 * Products are rendered via AJAX with custom CSS classes.
 * 
 * Unlike Tymber, LeafBridge requires browser-based extraction since
 * products are loaded via AJAX after initial page render.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface LeafBridgeScrapedProduct {
  rawProductName: string;
  rawBrandName: string;
  rawCategory?: string;
  price: number;
  inStock: boolean;
  quantity: number | null;
  quantityWarning: string | null;
  quantitySource: string;
  sourceUrl: string;
  sourcePlatform: string;
  scrapedAt: number;
}

// ============================================================================
// PLATFORM DETECTION
// ============================================================================

const LEAFBRIDGE_URL_PATTERNS = [
  /altadispensary\.nyc/i,
];

const LEAFBRIDGE_HTML_SIGNATURES = [
  'leafbridge_product_card',
  '/plugins/leafbridge/',
  'leafbridge_public_ajax_obj',
];

/**
 * Detect if a URL/HTML belongs to a LeafBridge platform site
 */
export function isLeafBridgeSite(url: string, html?: string): boolean {
  // URL-based detection
  for (const pattern of LEAFBRIDGE_URL_PATTERNS) {
    if (pattern.test(url)) return true;
  }
  
  // HTML-based detection
  if (html) {
    for (const sig of LEAFBRIDGE_HTML_SIGNATURES) {
      if (html.includes(sig)) return true;
    }
  }
  
  return false;
}

// ============================================================================
// SELECTORS
// ============================================================================

/**
 * CSS selectors for LeafBridge product elements
 */
export const LEAFBRIDGE_SELECTORS = {
  productCard: '.leafbridge_product_card',
  productName: '.leafbridge_product_name',
  brandName: '.leafbridge_brand_name',
  price: '.leafbridge_product_price',
  soldOut: '.add_to_cart_soldout',
  quantityInput: 'input[type="number"]',
};

/**
 * The primary selector to wait for before extracting products.
 * LeafBridge loads products via AJAX, so we need to wait for cards to appear.
 */
export const LEAFBRIDGE_WAIT_SELECTOR = '.leafbridge_product_card';

/**
 * Time to wait for AJAX content to load (ms).
 * LeafBridge can be slow to load products; 5s is conservative.
 */
export const LEAFBRIDGE_AJAX_WAIT_MS = 5000;

// ============================================================================
// BROWSER-BASED EXTRACTION
// ============================================================================

/**
 * Extract products from the DOM after AJAX loads.
 * 
 * IMPORTANT: This function runs in browser context via page.evaluate().
 * It cannot access Node.js APIs or external variables.
 * 
 * Usage with BrowserSession:
 * ```typescript
 * await session.goto(url);
 * await session.waitForTimeout(LEAFBRIDGE_AJAX_WAIT_MS);
 * const products = await session.evaluateFunction(
 *   extractLeafBridgeProductsFromDOM,
 *   sourceUrl,
 *   Date.now()
 * );
 * ```
 * 
 * @param sourceUrl - The URL being scraped (passed from caller)
 * @param timestamp - When scraping started (passed from caller)
 * @returns Array of scraped products from the current page
 */
export function extractLeafBridgeProductsFromDOM(
  sourceUrl: string,
  timestamp: number
): LeafBridgeScrapedProduct[] {
  const products: LeafBridgeScrapedProduct[] = [];
  
  // Primary selector
  let cards = document.querySelectorAll('.leafbridge_product_card');
  
  // Fallback if primary doesn't match
  if (cards.length === 0) {
    cards = document.querySelectorAll('[class*="leafbridge"][class*="product"]');
  }
  
  console.log(`[LeafBridge] Found ${cards.length} product cards`);
  
  cards.forEach(card => {
    try {
      // Product name
      const nameEl = card.querySelector('.leafbridge_product_name, [class*="product_name"]');
      const name = nameEl?.textContent?.trim();
      if (!name || name.length < 2) return;
      
      // Brand
      const brandEl = card.querySelector('.leafbridge_brand_name, [class*="brand_name"]');
      const brand = brandEl?.textContent?.trim() || 'Unknown';
      
      // Price
      const priceEl = card.querySelector('.leafbridge_product_price, [class*="price"]');
      const priceText = priceEl?.textContent || '';
      const priceMatch = priceText.match(/\$?(\d+(?:\.\d{1,2})?)/);
      const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
      
      if (price <= 0) return; // Skip invalid products
      
      // Stock status
      const soldOut = !!card.querySelector('.add_to_cart_soldout, [class*="soldout"], [class*="sold-out"]');
      
      // Quantity from input max attribute
      const qtyInput = card.querySelector('input[type="number"]') as HTMLInputElement | null;
      let quantity: number | null = null;
      let quantityWarning: string | null = null;
      let quantitySource = 'none';
      
      if (qtyInput && qtyInput.max) {
        const maxVal = parseInt(qtyInput.max, 10);
        if (maxVal > 0 && maxVal < 100) {
          quantity = maxVal;
          quantitySource = 'leafbridge_input_max';
          if (maxVal <= 5) {
            quantityWarning = `Only ${maxVal} left`;
          }
        }
      }
      
      // Low stock warning element
      const lowStockEl = card.querySelector('.add_to_cart_warning, [class*="low-stock"], [class*="warning"]');
      if (lowStockEl && !quantityWarning) {
        const warningText = lowStockEl.textContent?.trim() || '';
        if (warningText) {
          quantityWarning = warningText;
          const numMatch = warningText.match(/(\d+)/);
          if (numMatch && quantity === null) {
            quantity = parseInt(numMatch[1], 10);
            quantitySource = 'warning_text';
          }
        }
      }
      
      // If sold out, set quantity to 0
      if (soldOut) {
        quantity = 0;
        quantityWarning = 'Sold out';
        quantitySource = 'sold_out_class';
      }
      
      // Category
      const categoryEl = card.querySelector('[class*="category"]');
      const rawCategory = categoryEl?.textContent?.trim();
      
      products.push({
        rawProductName: name,
        rawBrandName: brand,
        rawCategory,
        price,
        inStock: !soldOut,
        quantity,
        quantityWarning,
        quantitySource,
        sourceUrl,
        sourcePlatform: 'leafbridge',
        scrapedAt: timestamp,
      });
    } catch (e) {
      // Skip malformed cards
      console.log('[LeafBridge] Error parsing card:', e);
    }
  });
  
  return products;
}
