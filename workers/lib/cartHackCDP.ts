/**
 * Cart Hack Module - CDP Compatible Version
 * 
 * This is a lightweight version of cartHack.ts that works with the
 * custom CDP client used in Cloudflare Workers (no Playwright dependency).
 * 
 * The CDP client's evaluate() only accepts string expressions, so all
 * JavaScript logic runs directly in the browser context.
 */

import { CDPPage } from './cdp';

// ============================================================
// TYPES
// ============================================================

export interface InventoryResult {
  quantity: number | null;
  quantityWarning: string | null;
  inStock: boolean;
  source: 'page-text' | 'quantity-dropdown' | 'out-of-stock-badge' | 'cart-overflow' | 'unknown';
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

// ============================================================
// MAIN EXTRACTION FUNCTION
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
