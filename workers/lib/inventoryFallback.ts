/**
 * Inventory Fallback Hierarchy
 * 
 * Defines the priority order for inventory detection methods.
 * Each method returns a confidence level to help decide which result to use.
 * 
 * FALLBACK HIERARCHY:
 * 1. Cart hack exact count (most accurate)       → confidence: 'exact'
 * 2. Page text patterns ("X left in stock")      → confidence: 'exact'
 * 3. Variant quantity from GraphQL (if available)→ confidence: 'exact'
 * 4. Quantity dropdown max value                 → confidence: 'estimated'
 * 5. Cart auto-adjust detection                  → confidence: 'estimated'
 * 6. Boolean in-stock status                     → confidence: 'boolean'
 */

import { Page } from 'playwright-core';
import { 
  InventoryResult, 
  InventorySource,
  getExactInventory, 
  extractInventoryFromListing,
  CartHackOptions,
} from './cartHack';

// ============================================================
// TYPES
// ============================================================

export interface FallbackResult extends InventoryResult {
  methodsAttempted: InventorySource[];
  timeMs: number;
}

export interface FallbackOptions extends CartHackOptions {
  /** Skip slow methods (cart overflow) for batch processing */
  fastMode?: boolean;
  /** Skip GraphQL interception */
  skipGraphQL?: boolean;
  /** Max time for all methods combined */
  maxTotalTimeMs?: number;
}

// ============================================================
// FALLBACK HIERARCHY IMPLEMENTATION
// ============================================================

/**
 * Execute the full fallback hierarchy for a single product
 * 
 * @param page - Playwright page with product visible
 * @param productSelector - Optional CSS selector for the product
 * @param options - Configuration options
 */
export async function getInventoryWithFallback(
  page: Page,
  productSelector?: string,
  options: FallbackOptions = {}
): Promise<FallbackResult> {
  const startTime = Date.now();
  const methodsAttempted: InventorySource[] = [];
  const { fastMode = false, maxTotalTimeMs = 15000 } = options;

  const checkTimeout = () => {
    if (Date.now() - startTime > maxTotalTimeMs) {
      throw new Error('Fallback timeout exceeded');
    }
  };

  try {
    // Level 1: Page text patterns (fast, accurate)
    methodsAttempted.push('page-text');
    const pageTextResult = await extractFromPageTextFast(page, productSelector);
    if (pageTextResult.confidence === 'exact' && pageTextResult.quantity !== null) {
      return {
        ...pageTextResult,
        methodsAttempted,
        timeMs: Date.now() - startTime,
      };
    }
    checkTimeout();

    // Level 2: Quantity dropdown (fast, estimated)
    methodsAttempted.push('quantity-dropdown');
    const dropdownResult = await extractFromDropdownFast(page, productSelector);
    if (dropdownResult.quantity !== null) {
      // If dropdown shows low number (<20), likely inventory limited
      if (dropdownResult.quantity < 20) {
        return {
          ...dropdownResult,
          methodsAttempted,
          timeMs: Date.now() - startTime,
        };
      }
    }
    checkTimeout();

    // Level 3: Out of stock badge (fast, exact)
    methodsAttempted.push('out-of-stock-badge');
    const outOfStockResult = await checkOutOfStockBadge(page, productSelector);
    if (outOfStockResult.quantity === 0) {
      return {
        ...outOfStockResult,
        methodsAttempted,
        timeMs: Date.now() - startTime,
      };
    }
    checkTimeout();

    // Level 4: Cart overflow (slow, but most accurate when others fail)
    if (!fastMode) {
      methodsAttempted.push('cart-overflow');
      const cartResult = await getExactInventory(page, productSelector, {
        ...options,
        debug: options.debug,
      });
      if (cartResult.confidence === 'exact' && cartResult.quantity !== null) {
        return {
          ...cartResult,
          methodsAttempted,
          timeMs: Date.now() - startTime,
        };
      }
    }

    // Level 5: Return best available result
    // Priority: dropdown estimate > boolean
    if (dropdownResult.quantity !== null) {
      return {
        ...dropdownResult,
        methodsAttempted,
        timeMs: Date.now() - startTime,
      };
    }

    // Level 6: Fallback to boolean in-stock
    return {
      quantity: null,
      quantityWarning: null,
      inStock: true,
      source: 'unknown',
      confidence: 'boolean',
      methodsAttempted,
      timeMs: Date.now() - startTime,
    };

  } catch (error) {
    return {
      quantity: null,
      quantityWarning: null,
      inStock: true,
      source: 'unknown',
      confidence: 'boolean',
      rawError: error instanceof Error ? error.message : String(error),
      methodsAttempted,
      timeMs: Date.now() - startTime,
    };
  }
}

/**
 * Fast batch extraction for product listings
 * Uses only fast methods (page text patterns, dropdown max)
 */
export async function getBatchInventory(page: Page): Promise<Map<string, FallbackResult>> {
  const startTime = Date.now();
  const results = await extractInventoryFromListing(page);
  
  const enhanced = new Map<string, FallbackResult>();
  results.forEach((result, name) => {
    enhanced.set(name, {
      ...result,
      methodsAttempted: [result.source],
      timeMs: Date.now() - startTime,
    });
  });
  
  return enhanced;
}

// ============================================================
// FAST EXTRACTION HELPERS
// ============================================================

async function extractFromPageTextFast(page: Page, selector?: string): Promise<InventoryResult> {
  const result = await page.evaluate((sel) => {
    const container = sel ? document.querySelector(sel) : document.body;
    if (!container) return { quantity: null, warning: null };

    const text = container.textContent || '';
    const patterns = [
      /(\d+)\s*left\s*in\s*stock/i,
      /only\s*(\d+)\s*left/i,
      /(\d+)\s*remaining/i,
      /(\d+)\s*available/i,
      /low\s*stock[:\s]*(\d+)/i,
      /hurry[,!]?\s*only\s*(\d+)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return { quantity: parseInt(match[1], 10), warning: match[0].trim() };
      }
    }
    return { quantity: null, warning: null };
  }, selector);

  return {
    quantity: result.quantity,
    quantityWarning: result.warning,
    inStock: result.quantity !== 0,
    source: 'page-text',
    confidence: result.quantity !== null ? 'exact' : 'boolean',
  };
}

async function extractFromDropdownFast(page: Page, selector?: string): Promise<InventoryResult> {
  const result = await page.evaluate((sel) => {
    const container = sel ? document.querySelector(sel) : document.body;
    if (!container) return { maxQuantity: null };

    // Check select dropdown
    const select = container.querySelector('select') as HTMLSelectElement | null;
    if (select && select.options.length > 0) {
      const options = Array.from(select.options)
        .map(o => parseInt(o.value, 10))
        .filter(n => !isNaN(n) && n > 0);
      if (options.length > 0) {
        return { maxQuantity: Math.max(...options) };
      }
    }

    // Check number input max
    const numInput = container.querySelector('input[type="number"]') as HTMLInputElement | null;
    if (numInput?.max) {
      const max = parseInt(numInput.max, 10);
      if (!isNaN(max) && max > 0) {
        return { maxQuantity: max };
      }
    }

    return { maxQuantity: null };
  }, selector);

  return {
    quantity: result.maxQuantity,
    quantityWarning: result.maxQuantity ? `Max qty: ${result.maxQuantity}` : null,
    inStock: true,
    source: 'quantity-dropdown',
    confidence: result.maxQuantity !== null ? 'estimated' : 'boolean',
  };
}

async function checkOutOfStockBadge(page: Page, selector?: string): Promise<InventoryResult> {
  const isOutOfStock = await page.evaluate((sel) => {
    const container = sel ? document.querySelector(sel) : document.body;
    if (!container) return false;

    const selectors = [
      '[class*="outOfStock"]',
      '[class*="soldOut"]',
      '[class*="OutOfStock"]',
      '[class*="SoldOut"]',
      '[class*="unavailable"]',
      '[class*="Unavailable"]',
    ];

    for (const s of selectors) {
      if (container.querySelector(s)) return true;
    }

    const text = container.textContent?.toLowerCase() || '';
    return /out\s*of\s*stock|sold\s*out/i.test(text);
  }, selector);

  return {
    quantity: isOutOfStock ? 0 : null,
    quantityWarning: isOutOfStock ? 'Out of stock' : null,
    inStock: !isOutOfStock,
    source: isOutOfStock ? 'out-of-stock-badge' : 'unknown',
    confidence: isOutOfStock ? 'exact' : 'boolean',
  };
}

// ============================================================
// CONFIDENCE COMPARISON
// ============================================================

/**
 * Compare two inventory results and return the more confident one
 */
export function pickBestResult(a: InventoryResult, b: InventoryResult): InventoryResult {
  const confidenceOrder = { exact: 3, estimated: 2, boolean: 1 };
  const aScore = confidenceOrder[a.confidence];
  const bScore = confidenceOrder[b.confidence];
  
  if (aScore > bScore) return a;
  if (bScore > aScore) return b;
  
  // Same confidence - prefer the one with actual quantity
  if (a.quantity !== null && b.quantity === null) return a;
  if (b.quantity !== null && a.quantity === null) return b;
  
  // Both have quantity or both null - prefer first
  return a;
}
