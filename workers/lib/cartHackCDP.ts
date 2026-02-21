/**
 * Cart Hack Module - CDP Compatible Version
 * 
 * This is a lightweight version of cartHack.ts that works with the
 * custom CDP client used in Cloudflare Workers (no Playwright dependency).
 * 
 * The CDP client's evaluate() only accepts string expressions, so all
 * JavaScript logic runs directly in the browser context.
 * 
 * v2.0.0 - Added product detail page inventory extraction
 *          - extractInventoryFromDetailPageCDP()
 *          - attemptCartHackCDP()
 *          - Enhanced pattern matching for "X left" text
 */

import { CDPPage } from './cdp';

// ============================================================
// TYPES
// ============================================================

export interface InventoryResult {
  quantity: number | null;
  quantityWarning: string | null;
  inStock: boolean;
  source: 'page-text' | 'quantity-dropdown' | 'out-of-stock-badge' | 'cart-overflow' | 'cart-hack' | 'unknown';
  confidence: 'exact' | 'estimated' | 'boolean';
}

export interface ProductInventory {
  name: string;
  quantity: number | null;
  quantityWarning: string | null;
  inStock: boolean;
  source: string;
  confidence: string;
}

export interface DetailPageInventory {
  quantity: number | null;
  quantityWarning: string | null;
  quantitySource: string;
  productName: string | null;
  price: number | null;
  thcFormatted: string | null;
  inStock: boolean;
}

// ============================================================
// PRODUCT DETAIL PAGE INVENTORY EXTRACTION
// ============================================================

/**
 * Extract inventory from a product detail page using text patterns.
 * This is the primary method - looks for "X left" and similar patterns.
 */
export async function extractInventoryFromDetailPageCDP(
  page: CDPPage
): Promise<DetailPageInventory> {
  return page.evaluate<DetailPageInventory>(`
    (function() {
      const bodyText = document.body.innerText || '';
      
      // Primary pattern: "X left" (proven to work on Dutchie product pages)
      const stockPatterns = [
        /(\\d+)\\s*left/i,
        /only\\s*(\\d+)\\s*left/i,
        /(\\d+)\\s*left\\s*in\\s*stock/i,
        /(\\d+)\\s*remaining/i,
        /(\\d+)\\s*available/i,
        /(\\d+)\\s*in\\s*stock/i,
        /hurry[,!]?\\s*only\\s*(\\d+)/i,
        /limited[:\\s]*(\\d+)/i,
        /low\\s*stock[:\\s]*(\\d+)/i,
      ];
      
      let quantity = null;
      let quantityWarning = null;
      let quantitySource = 'none';
      
      for (const pattern of stockPatterns) {
        const match = bodyText.match(pattern);
        if (match) {
          quantity = parseInt(match[1], 10);
          quantityWarning = match[0].trim();
          quantitySource = 'text_pattern';
          break;
        }
      }
      
      // Check for out of stock indicators
      const outOfStockPatterns = [
        /out\\s*of\\s*stock/i,
        /sold\\s*out/i,
        /unavailable/i,
        /not\\s*available/i,
      ];
      
      let inStock = true;
      for (const pattern of outOfStockPatterns) {
        if (pattern.test(bodyText)) {
          inStock = false;
          quantity = 0;
          quantityWarning = 'Out of stock';
          quantitySource = 'text_pattern';
          break;
        }
      }
      
      // Extract product name from page
      const nameEl = document.querySelector('h1, [class*="ProductName"], [class*="product-name"], [class*="productTitle"]');
      const productName = nameEl ? nameEl.textContent.trim() : null;
      
      // Extract price
      let price = null;
      const priceMatch = bodyText.match(/\\$(\\d+(?:\\.\\d{1,2})?)/);
      if (priceMatch) {
        price = parseFloat(priceMatch[1]);
      }
      
      // Extract THC
      let thcFormatted = null;
      const thcMatch = bodyText.match(/THC[:\\s]*(\\d+(?:\\.\\d+)?)\\s*%/i);
      if (thcMatch) {
        thcFormatted = thcMatch[1] + '%';
      }
      
      return {
        quantity,
        quantityWarning,
        quantitySource,
        productName,
        price,
        thcFormatted,
        inStock,
      };
    })()
  `);
}

/**
 * Attempt cart hack to discover inventory limits.
 * This is a fallback when text patterns don't reveal inventory.
 */
export async function attemptCartHackCDP(
  page: CDPPage
): Promise<{ quantity: number | null; quantityWarning: string | null; success: boolean }> {
  return page.evaluate<{ quantity: number | null; quantityWarning: string | null; success: boolean }>(`
    (function() {
      // Find add to cart button
      const addButtons = document.querySelectorAll('button:not([disabled])');
      let addButton = null;
      
      addButtons.forEach(btn => {
        const text = btn.textContent?.toLowerCase() || '';
        if ((text.includes('add') && (text.includes('cart') || text.includes('bag'))) || 
            (text.includes('add') && btn.textContent.length < 20)) {
          addButton = btn;
        }
      });
      
      if (!addButton) {
        return { quantity: null, quantityWarning: null, success: false };
      }
      
      // Look for quantity input
      const qtyInput = document.querySelector('input[type="number"], input[name*="qty"], input[name*="quantity"]');
      
      if (qtyInput) {
        // Set high value to trigger limit
        const originalValue = qtyInput.value;
        qtyInput.value = '999';
        qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
        qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Check for immediate validation error
        const pageText = document.body.innerText || '';
        
        // Look for error messages about limits
        const limitPatterns = [
          /max(?:imum)?\\s*(?:of\\s*)?(\\d+)/i,
          /limit(?:ed)?\\s*(?:to\\s*)?(\\d+)/i,
          /only\\s*(\\d+)\\s*(?:available|remaining|left)/i,
          /cannot\\s*add\\s*more\\s*than\\s*(\\d+)/i,
          /(\\d+)\\s*(?:items?\\s*)?(?:maximum|max|limit)/i,
        ];
        
        for (const pattern of limitPatterns) {
          const match = pageText.match(pattern);
          if (match) {
            qtyInput.value = originalValue;
            return {
              quantity: parseInt(match[1], 10),
              quantityWarning: match[0].trim(),
              success: true,
            };
          }
        }
        
        // Check if input was auto-corrected
        const correctedValue = parseInt(qtyInput.value, 10);
        if (correctedValue > 0 && correctedValue < 999) {
          qtyInput.value = originalValue;
          return {
            quantity: correctedValue,
            quantityWarning: 'Max quantity: ' + correctedValue,
            success: true,
          };
        }
        
        // Reset
        qtyInput.value = originalValue;
      }
      
      // Check for max attribute on input
      if (qtyInput && qtyInput.max) {
        const maxVal = parseInt(qtyInput.max, 10);
        if (maxVal > 0 && maxVal < 100) {
          return {
            quantity: maxVal,
            quantityWarning: 'Max: ' + maxVal,
            success: true,
          };
        }
      }
      
      // Check for select dropdown with quantity options
      const qtySelect = document.querySelector('select[name*="qty"], select[name*="quantity"]');
      if (qtySelect && qtySelect.options && qtySelect.options.length > 0) {
        const options = Array.from(qtySelect.options)
          .map(o => parseInt(o.value, 10))
          .filter(n => !isNaN(n) && n > 0);
        
        if (options.length > 0) {
          const maxOption = Math.max(...options);
          if (maxOption < 50) { // Likely inventory-capped
            return {
              quantity: maxOption,
              quantityWarning: 'Max qty: ' + maxOption,
              success: true,
            };
          }
        }
      }
      
      return { quantity: null, quantityWarning: null, success: false };
    })()
  `);
}

// ============================================================
// LISTING PAGE INVENTORY EXTRACTION (Original Functions)
// ============================================================

/**
 * Extract inventory data for all products on a listing page.
 * 
 * This runs entirely in the browser context via CDP evaluate.
 * Returns an array of products with their inventory data.
 */
export async function extractInventoryFromListingCDP(
  page: CDPPage
): Promise<ProductInventory[]> {
  // The entire extraction logic runs in the browser
  const products = await page.evaluate<ProductInventory[]>(`
    (function() {
      const results = [];
      
      // INVENTORY PATTERNS
      const inventoryPatterns = [
        /^(\\d+)\\s*left\\s*in\\s*stock/i,
        /only\\s*(\\d+)\\s*left/i,
        /(\\d+)\\s*remaining/i,
        /(\\d+)\\s*available/i,
        /limited[:\\s]*(\\d+)/i,
        /low\\s*stock[:\\s]*(\\d+)/i,
        /hurry[,!]?\\s*only\\s*(\\d+)/i,
      ];
      
      // Find product cards
      const cardSelectors = [
        '[data-testid="product-card"]',
        '[class*="ProductCard"]',
        '[class*="product-card"]',
        'div[class*="styles_productCard"]',
      ];
      
      let cards = [];
      for (const sel of cardSelectors) {
        cards = Array.from(document.querySelectorAll(sel));
        if (cards.length > 0) break;
      }
      
      // Fallback: find via price elements
      if (cards.length === 0) {
        const priceEls = document.querySelectorAll('[class*="price"], [class*="Price"]');
        const seen = new Set();
        priceEls.forEach(priceEl => {
          const card = priceEl.closest('a') || priceEl.closest('div[class*="product"]') || priceEl.parentElement?.parentElement;
          if (card && !seen.has(card)) {
            seen.add(card);
            cards.push(card);
          }
        });
      }
      
      // Process each card
      for (const card of cards) {
        const text = card.textContent || '';
        
        // Get product name
        const nameEl = card.querySelector('h2, h3, [class*="productName"], [class*="ProductName"], [class*="name"]');
        const name = nameEl?.textContent?.trim() || '';
        if (!name || name.length < 3) continue;
        
        // Check out of stock
        const outOfStockEl = card.querySelector('[class*="outOfStock"], [class*="soldOut"], [class*="OutOfStock"], [class*="SoldOut"], [class*="unavailable"]');
        if (outOfStockEl) {
          results.push({
            name,
            quantity: 0,
            quantityWarning: 'Out of stock',
            inStock: false,
            source: 'out-of-stock-badge',
            confidence: 'exact',
          });
          continue;
        }
        
        // Look for inventory text
        let foundQuantity = false;
        for (const pattern of inventoryPatterns) {
          const match = text.match(pattern);
          if (match) {
            results.push({
              name,
              quantity: parseInt(match[1], 10),
              quantityWarning: match[0].trim(),
              inStock: true,
              source: 'page-text',
              confidence: 'exact',
            });
            foundQuantity = true;
            break;
          }
        }
        
        if (!foundQuantity) {
          // Check quantity dropdown for estimate
          const select = card.querySelector('select');
          let maxQty = null;
          
          if (select) {
            const options = Array.from(select.options)
              .map(o => parseInt(o.value, 10))
              .filter(n => !isNaN(n) && n > 0);
            if (options.length > 0) {
              maxQty = Math.max(...options);
              // Only use if reasonably low (likely inventory-capped)
              if (maxQty < 50) {
                results.push({
                  name,
                  quantity: maxQty,
                  quantityWarning: 'Max qty: ' + maxQty,
                  inStock: true,
                  source: 'quantity-dropdown',
                  confidence: 'estimated',
                });
                foundQuantity = true;
              }
            }
          }
        }
        
        // Fallback: boolean in-stock
        if (!foundQuantity) {
          results.push({
            name,
            quantity: null,
            quantityWarning: null,
            inStock: true,
            source: 'unknown',
            confidence: 'boolean',
          });
        }
      }
      
      return results;
    })()
  `);
  
  return products || [];
}

/**
 * Enhance existing scraped products with inventory data
 */
export function enhanceProductsWithInventoryCDP<T extends {
  rawProductName: string;
  inStock: boolean;
  quantity?: number | null;
  quantityWarning?: string | null;
}>(
  products: T[],
  inventoryData: ProductInventory[]
): T[] {
  // Create lookup map by normalized name
  const inventoryMap = new Map<string, ProductInventory>();
  for (const inv of inventoryData) {
    const key = inv.name.toLowerCase().trim();
    inventoryMap.set(key, inv);
  }
  
  return products.map(product => {
    const key = product.rawProductName.toLowerCase().trim();
    const inv = inventoryMap.get(key);
    
    if (inv) {
      // Only override if we have better data
      const currentConfidence = product.quantity !== null ? 'exact' : 'boolean';
      const newConfidence = inv.confidence;
      
      // Prefer exact > estimated > boolean
      const shouldUpdate = 
        newConfidence === 'exact' ||
        (newConfidence === 'estimated' && currentConfidence === 'boolean');
      
      if (shouldUpdate) {
        return {
          ...product,
          inStock: inv.inStock,
          quantity: inv.quantity ?? product.quantity,
          quantityWarning: inv.quantityWarning ?? product.quantityWarning,
        };
      }
    }
    
    return product;
  });
}

/**
 * Check if a product is out of stock (quick check)
 */
export async function isOutOfStockCDP(page: CDPPage): Promise<boolean> {
  return page.evaluate<boolean>(`
    (function() {
      const selectors = [
        '[class*="outOfStock"]',
        '[class*="soldOut"]',
        '[class*="OutOfStock"]',
        '[class*="SoldOut"]',
        '[class*="unavailable"]',
      ];
      
      for (const sel of selectors) {
        if (document.querySelector(sel)) return true;
      }
      
      const text = document.body.textContent?.toLowerCase() || '';
      return /out\\s*of\\s*stock|sold\\s*out/i.test(text);
    })()
  `);
}

/**
 * Extract inventory from page text patterns (fast, exact)
 */
export async function extractInventoryFromPageTextCDP(
  page: CDPPage
): Promise<{ quantity: number | null; warning: string | null }> {
  return page.evaluate<{ quantity: number | null; warning: string | null }>(`
    (function() {
      const text = document.body.textContent || '';
      const patterns = [
        /(\\d+)\\s*left\\s*in\\s*stock/i,
        /only\\s*(\\d+)\\s*left/i,
        /(\\d+)\\s*remaining/i,
        /(\\d+)\\s*available/i,
      ];
      
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          return {
            quantity: parseInt(match[1], 10),
            warning: match[0].trim(),
          };
        }
      }
      
      return { quantity: null, warning: null };
    })()
  `);
}

/**
 * Extract product URLs from a listing page for detail page visits
 */
export async function extractProductUrlsCDP(
  page: CDPPage
): Promise<{ name: string; url: string }[]> {
  return page.evaluate<{ name: string; url: string }[]>(`
    (function() {
      const productLinks = [];
      
      // Find all product links - Dutchie embeds typically use <a> tags
      const linkSelectors = [
        'a[href*="/product"]',
        'a[href*="/products/"]',
        '[data-testid="product-card"] a',
        '[class*="ProductCard"] a',
        '[class*="product-card"] a',
      ];
      
      const seen = new Set();
      
      for (const selector of linkSelectors) {
        const links = document.querySelectorAll(selector);
        links.forEach(link => {
          const href = link.href;
          if (href && !seen.has(href) && !href.includes('#')) {
            seen.add(href);
            
            // Try to get product name from the link or nearby elements
            const nameEl = link.querySelector('h2, h3, [class*="productName"], [class*="name"]') ||
                          link.closest('[data-testid="product-card"], [class*="ProductCard"]')?.querySelector('h2, h3, [class*="productName"], [class*="name"]');
            const name = nameEl?.textContent?.trim() || link.textContent?.trim() || '';
            
            if (name.length > 2) {
              productLinks.push({ name, url: href });
            }
          }
        });
      }
      
      return productLinks;
    })()
  `);
}
