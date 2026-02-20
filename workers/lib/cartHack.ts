/**
 * Cart Hack Module for Exact Inventory Detection
 * 
 * Exploits Dutchie's cart system to discover exact inventory counts.
 * 
 * APPROACHES (in order of reliability):
 * 1. Direct page inventory text ("X left in stock")
 * 2. Quantity dropdown max value
 * 3. Cart overflow - add high quantity, parse error
 * 4. GraphQL API interception (if available)
 * 5. Fallback to boolean in-stock status
 * 
 * @see https://github.com/Perk4/BudAlert
 */

import { Page } from 'playwright-core';
import { sleep } from './retry';

// ============================================================
// TYPES
// ============================================================

export interface InventoryResult {
  quantity: number | null;        // Exact count (null = unknown)
  quantityWarning: string | null; // Raw text e.g., "Only 3 left"
  inStock: boolean;               // Always populated
  source: InventorySource;        // How we got the data
  confidence: 'exact' | 'estimated' | 'boolean'; // How reliable
  rawError?: string;              // Any error message captured
}

export type InventorySource = 
  | 'page-text'           // "5 left in stock" visible on page
  | 'quantity-dropdown'   // Max value in quantity selector
  | 'cart-overflow'       // Error from adding too many
  | 'cart-auto-adjust'    // Cart auto-adjusted quantity
  | 'graphql-api'         // Intercepted API response
  | 'out-of-stock-badge'  // "Sold out" badge visible
  | 'unknown';            // Fallback

export interface CartHackOptions {
  /** Target quantity to attempt (default: 99) */
  targetQuantity?: number;
  /** Timeout for each operation in ms (default: 5000) */
  operationTimeout?: number;
  /** Whether to clean up cart after test (default: true) */
  cleanupCart?: boolean;
  /** Enable GraphQL API interception (default: true) */
  interceptApi?: boolean;
  /** Enable debug logging (default: false) */
  debug?: boolean;
}

const DEFAULT_OPTIONS: Required<CartHackOptions> = {
  targetQuantity: 99,
  operationTimeout: 5000,
  cleanupCart: true,
  interceptApi: true,
  debug: false,
};

// ============================================================
// INVENTORY PATTERNS
// ============================================================

/** Patterns to extract inventory count from page text */
const INVENTORY_PATTERNS = [
  // Dutchie standard patterns
  /(\d+)\s*left\s*in\s*stock/i,
  /only\s*(\d+)\s*left/i,
  /(\d+)\s*remaining/i,
  /(\d+)\s*available/i,
  /limited[:\s]*(\d+)/i,
  /low\s*stock[:\s]*(\d+)/i,
  /hurry[,!]?\s*only\s*(\d+)/i,
  // Cart error patterns
  /only\s*(\d+)\s*(?:available|in\s*stock)/i,
  /max(?:imum)?\s*(?:is|:)?\s*(\d+)/i,
  /can(?:'t|not)\s*add\s*more\s*than\s*(\d+)/i,
  /exceeds?\s*(?:available|inventory)[:\s]*(\d+)/i,
  /adjusted\s*to\s*(\d+)/i,
  /changed\s*to\s*(\d+)/i,
];

/** Patterns that indicate out of stock */
const OUT_OF_STOCK_PATTERNS = [
  /out\s*of\s*stock/i,
  /sold\s*out/i,
  /unavailable/i,
  /no\s*longer\s*available/i,
];

// ============================================================
// MAIN FUNCTIONS
// ============================================================

/**
 * Get exact inventory for a product using the cart hack technique.
 * 
 * This runs in the browser context where the product is already visible.
 * It uses a multi-layered approach to maximize accuracy.
 * 
 * @param page - Playwright page object
 * @param productSelector - Optional CSS selector for the specific product card
 * @param options - Configuration options
 * @returns InventoryResult with quantity and metadata
 */
export async function getExactInventory(
  page: Page,
  productSelector?: string,
  options: CartHackOptions = {}
): Promise<InventoryResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const log = opts.debug ? console.log.bind(console, '[CartHack]') : () => {};
  
  try {
    // STEP 1: Check for out-of-stock badges first
    log('Step 1: Checking for out-of-stock indicators...');
    const outOfStock = await checkOutOfStock(page, productSelector);
    if (outOfStock) {
      return {
        quantity: 0,
        quantityWarning: 'Out of stock',
        inStock: false,
        source: 'out-of-stock-badge',
        confidence: 'exact',
      };
    }

    // STEP 2: Try to extract inventory from visible page text
    log('Step 2: Scanning for inventory text on page...');
    const pageTextResult = await extractInventoryFromPageText(page, productSelector);
    if (pageTextResult.quantity !== null) {
      log(`Found inventory from page text: ${pageTextResult.quantity}`);
      return pageTextResult;
    }

    // STEP 3: Check quantity dropdown for max value
    log('Step 3: Checking quantity dropdown...');
    const dropdownResult = await extractInventoryFromDropdown(page, productSelector);
    if (dropdownResult.quantity !== null) {
      log(`Found inventory from dropdown: ${dropdownResult.quantity}`);
      return dropdownResult;
    }

    // STEP 4: Try cart overflow technique
    log('Step 4: Attempting cart overflow technique...');
    const cartResult = await attemptCartOverflow(page, productSelector, opts);
    if (cartResult.quantity !== null) {
      log(`Found inventory from cart overflow: ${cartResult.quantity}`);
      if (opts.cleanupCart) {
        await cleanupCart(page);
      }
      return cartResult;
    }

    // STEP 5: Fallback - assume in stock but unknown quantity
    log('Step 5: Fallback to boolean in-stock status');
    return {
      quantity: null,
      quantityWarning: null,
      inStock: true,
      source: 'unknown',
      confidence: 'boolean',
    };
  } catch (error) {
    log('Error in getExactInventory:', error);
    return {
      quantity: null,
      quantityWarning: null,
      inStock: true,
      source: 'unknown',
      confidence: 'boolean',
      rawError: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================
// DETECTION METHODS
// ============================================================

/**
 * Check if product is out of stock via badges or text
 */
async function checkOutOfStock(page: Page, productSelector?: string): Promise<boolean> {
  return page.evaluate((selector) => {
    const container = selector 
      ? document.querySelector(selector) 
      : document.body;
    
    if (!container) return false;

    // Check for out-of-stock elements
    const outOfStockSelectors = [
      '[class*="outOfStock"]',
      '[class*="soldOut"]',
      '[class*="OutOfStock"]',
      '[class*="SoldOut"]',
      '[class*="unavailable"]',
      '[data-testid*="out-of-stock"]',
      '[data-testid*="sold-out"]',
    ];

    for (const sel of outOfStockSelectors) {
      if (container.querySelector(sel)) return true;
    }

    // Check text content
    const text = container.textContent?.toLowerCase() || '';
    return /out\s*of\s*stock|sold\s*out|unavailable/i.test(text);
  }, productSelector);
}

/**
 * Extract inventory from visible page text
 */
async function extractInventoryFromPageText(
  page: Page,
  productSelector?: string
): Promise<InventoryResult> {
  const result = await page.evaluate((selector) => {
    const container = selector 
      ? document.querySelector(selector) 
      : document.body;
    
    if (!container) {
      return { quantity: null, warning: null };
    }

    const text = container.textContent || '';
    
    // Try each pattern
    const patterns = [
      /(\d+)\s*left\s*in\s*stock/i,
      /only\s*(\d+)\s*left/i,
      /(\d+)\s*remaining/i,
      /(\d+)\s*available/i,
      /limited[:\s]*(\d+)/i,
      /low\s*stock[:\s]*(\d+)/i,
      /hurry[,!]?\s*only\s*(\d+)/i,
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
  }, productSelector);

  if (result.quantity !== null) {
    return {
      quantity: result.quantity,
      quantityWarning: result.warning,
      inStock: result.quantity > 0,
      source: 'page-text',
      confidence: 'exact',
    };
  }

  return {
    quantity: null,
    quantityWarning: null,
    inStock: true,
    source: 'unknown',
    confidence: 'boolean',
  };
}

/**
 * Extract inventory from quantity dropdown max value
 */
async function extractInventoryFromDropdown(
  page: Page,
  productSelector?: string
): Promise<InventoryResult> {
  const result = await page.evaluate((selector) => {
    const container = selector 
      ? document.querySelector(selector) 
      : document.body;
    
    if (!container) {
      return { maxQuantity: null };
    }

    // Look for select dropdown
    const select = container.querySelector('select') as HTMLSelectElement | null;
    if (select && select.options.length > 0) {
      const options = Array.from(select.options).map(o => parseInt(o.value, 10)).filter(n => !isNaN(n));
      if (options.length > 0) {
        const max = Math.max(...options);
        // Only use if max is reasonable (< 50 suggests inventory limit)
        if (max > 0 && max < 50) {
          return { maxQuantity: max };
        }
      }
    }

    // Look for number input with max attribute
    const numInput = container.querySelector('input[type="number"]') as HTMLInputElement | null;
    if (numInput && numInput.max) {
      const max = parseInt(numInput.max, 10);
      if (!isNaN(max) && max > 0 && max < 100) {
        return { maxQuantity: max };
      }
    }

    return { maxQuantity: null };
  }, productSelector);

  if (result.maxQuantity !== null) {
    return {
      quantity: result.maxQuantity,
      quantityWarning: `Dropdown max: ${result.maxQuantity}`,
      inStock: true,
      source: 'quantity-dropdown',
      confidence: 'estimated', // Dropdown max may not equal actual inventory
    };
  }

  return {
    quantity: null,
    quantityWarning: null,
    inStock: true,
    source: 'unknown',
    confidence: 'boolean',
  };
}

/**
 * Attempt cart overflow technique to reveal inventory
 */
async function attemptCartOverflow(
  page: Page,
  productSelector?: string,
  opts: Required<CartHackOptions> = DEFAULT_OPTIONS
): Promise<InventoryResult> {
  try {
    // Step 1: Find and click add to cart button
    const addButtonFound = await clickAddToCart(page, productSelector);
    if (!addButtonFound) {
      return {
        quantity: null,
        quantityWarning: null,
        inStock: true,
        source: 'unknown',
        confidence: 'boolean',
      };
    }

    await sleep(500);

    // Step 2: Try to set high quantity
    const quantitySet = await setHighQuantity(page, opts.targetQuantity);
    if (!quantitySet) {
      // Try clicking + button multiple times instead
      await clickIncrementMultipleTimes(page, opts.targetQuantity);
    }

    await sleep(500);

    // Step 3: Try to submit/confirm
    await clickAddToCart(page);
    await sleep(1500);

    // Step 4: Check for error messages
    const errorResult = await captureCartError(page);
    if (errorResult.quantity !== null) {
      return errorResult;
    }

    // Step 5: Check if cart auto-adjusted
    const autoAdjustResult = await checkCartAutoAdjust(page);
    if (autoAdjustResult.quantity !== null) {
      return autoAdjustResult;
    }

    return {
      quantity: null,
      quantityWarning: null,
      inStock: true,
      source: 'unknown',
      confidence: 'boolean',
    };
  } catch (error) {
    return {
      quantity: null,
      quantityWarning: null,
      inStock: true,
      source: 'unknown',
      confidence: 'boolean',
      rawError: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Click the add to cart button
 */
async function clickAddToCart(page: Page, productSelector?: string): Promise<boolean> {
  const selectors = [
    'button:has-text("Add to Cart")',
    'button:has-text("Add to Bag")',
    'button:has-text("ADD TO CART")',
    'button:has-text("Add")',
    '[data-testid*="add-to-cart"]',
    'button[aria-label*="add to cart"]',
    'button[class*="AddToCart"]',
    'button[class*="add-to-cart"]',
  ];

  for (const selector of selectors) {
    try {
      const button = await page.$(selector);
      if (button) {
        await button.click();
        return true;
      }
    } catch {}
  }

  // Fallback: Find button with + sign
  try {
    const plusButton = await page.$('button:has-text("+")');
    if (plusButton) {
      await plusButton.click();
      return true;
    }
  } catch {}

  return false;
}

/**
 * Set high quantity in input field
 */
async function setHighQuantity(page: Page, quantity: number): Promise<boolean> {
  try {
    const input = await page.$('input[type="number"], input[aria-label*="quantity"], input[name*="quantity"]');
    if (input) {
      await input.click({ clickCount: 3 });
      await input.fill(String(quantity));
      return true;
    }

    // Try select dropdown
    const select = await page.$('select');
    if (select) {
      const options = await select.evaluate(s => {
        const sel = s as HTMLSelectElement;
        return Array.from(sel.options).map(o => o.value);
      });
      if (options.length > 0) {
        await select.selectOption(options[options.length - 1]);
        return true;
      }
    }
  } catch {}

  return false;
}

/**
 * Click increment button multiple times
 */
async function clickIncrementMultipleTimes(page: Page, times: number): Promise<number> {
  const selectors = [
    'button[aria-label*="increase"]',
    'button[aria-label*="increment"]',
    'button[aria-label*="add"]',
    'button:has-text("+")',
  ];

  let clicked = 0;

  for (const selector of selectors) {
    try {
      const button = await page.$(selector);
      if (button) {
        for (let i = 0; i < times && i < 50; i++) {
          try {
            await button.click();
            clicked++;
            await sleep(100);
          } catch {
            break;
          }
        }
        break;
      }
    } catch {}
  }

  return clicked;
}

/**
 * Capture cart error messages and extract inventory count
 */
async function captureCartError(page: Page): Promise<InventoryResult> {
  const result = await page.evaluate(() => {
    // Check for error/alert elements
    const errorSelectors = [
      '[role="alert"]',
      '[class*="error"]',
      '[class*="Error"]',
      '[class*="warning"]',
      '[class*="Warning"]',
      '[class*="toast"]',
      '[class*="Toast"]',
      '[class*="notification"]',
      '[aria-live="polite"]',
      '[aria-live="assertive"]',
    ];

    const errors: string[] = [];
    for (const sel of errorSelectors) {
      document.querySelectorAll(sel).forEach(el => {
        const text = el.textContent?.trim();
        if (text && text.length > 5 && text.length < 500) {
          errors.push(text);
        }
      });
    }

    // Also scan full page text
    const pageText = document.body.innerText;
    
    // Error patterns that reveal inventory
    const patterns = [
      /only\s*(\d+)\s*(?:available|in\s*stock|left)/i,
      /max(?:imum)?\s*(?:is|:)?\s*(\d+)/i,
      /can(?:'t|not)\s*add\s*more\s*than\s*(\d+)/i,
      /exceeds?\s*(?:available|inventory)[:\s]*(\d+)/i,
      /adjusted\s*to\s*(\d+)/i,
      /changed\s*to\s*(\d+)/i,
      /limit(?:ed)?\s*to\s*(\d+)/i,
    ];

    for (const text of [...errors, pageText]) {
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          return {
            quantity: parseInt(match[1], 10),
            warning: match[0].trim(),
          };
        }
      }
    }

    return { quantity: null, warning: null };
  });

  if (result.quantity !== null) {
    return {
      quantity: result.quantity,
      quantityWarning: result.warning,
      inStock: result.quantity > 0,
      source: 'cart-overflow',
      confidence: 'exact',
    };
  }

  return {
    quantity: null,
    quantityWarning: null,
    inStock: true,
    source: 'unknown',
    confidence: 'boolean',
  };
}

/**
 * Check if cart auto-adjusted the quantity
 */
async function checkCartAutoAdjust(page: Page): Promise<InventoryResult> {
  const result = await page.evaluate(() => {
    // Check cart drawer or modal for quantity
    const cartSelectors = [
      '[class*="cart"]',
      '[class*="Cart"]',
      '[class*="drawer"]',
      '[class*="Drawer"]',
      '[class*="modal"]',
      '[class*="Modal"]',
    ];

    for (const sel of cartSelectors) {
      const cart = document.querySelector(sel);
      if (cart) {
        const cartText = cart.textContent || '';
        
        // Look for quantity in cart that's different from what we requested
        const qtyMatch = cartText.match(/qty[:\s]*(\d+)|quantity[:\s]*(\d+)|×\s*(\d+)/i);
        if (qtyMatch) {
          const qty = parseInt(qtyMatch[1] || qtyMatch[2] || qtyMatch[3], 10);
          // If qty is small, it might be the auto-adjusted max
          if (!isNaN(qty) && qty > 0 && qty < 50) {
            return {
              quantity: qty,
              source: 'cart-auto-adjust',
            };
          }
        }
      }
    }

    return { quantity: null };
  });

  if (result.quantity !== null) {
    return {
      quantity: result.quantity,
      quantityWarning: `Auto-adjusted to ${result.quantity}`,
      inStock: true,
      source: 'cart-auto-adjust',
      confidence: 'estimated',
    };
  }

  return {
    quantity: null,
    quantityWarning: null,
    inStock: true,
    source: 'unknown',
    confidence: 'boolean',
  };
}

/**
 * Clean up cart after testing
 */
async function cleanupCart(page: Page): Promise<void> {
  try {
    // Try to find and click remove/clear button
    const removeSelectors = [
      'button:has-text("Remove")',
      'button:has-text("Clear")',
      'button[aria-label*="remove"]',
      'button[aria-label*="delete"]',
      '[data-testid*="remove"]',
      'button:has-text("×")',
      'button:has-text("X")',
    ];

    for (const selector of removeSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          await button.click();
          await sleep(500);
          break;
        }
      } catch {}
    }
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================
// BATCH EXTRACTION (for product listings)
// ============================================================

/**
 * Extract inventory for all products on a listing page
 * 
 * This is optimized for scraping multiple products efficiently
 * without the full cart overflow technique (which would be too slow).
 */
export async function extractInventoryFromListing(page: Page): Promise<Map<string, InventoryResult>> {
  const results = new Map<string, InventoryResult>();

  const productsData = await page.evaluate(() => {
    const products: Array<{
      name: string;
      quantity: number | null;
      warning: string | null;
      inStock: boolean;
    }> = [];

    // Find all product cards
    const cardSelectors = [
      '[data-testid="product-card"]',
      '[class*="ProductCard"]',
      '[class*="product-card"]',
      'div[class*="styles_productCard"]',
    ];

    let cards: Element[] = [];
    for (const sel of cardSelectors) {
      cards = Array.from(document.querySelectorAll(sel));
      if (cards.length > 0) break;
    }

    for (const card of cards) {
      const text = card.textContent || '';
      
      // Get product name
      const nameEl = card.querySelector('h2, h3, [class*="productName"], [class*="ProductName"]');
      const name = nameEl?.textContent?.trim() || '';
      if (!name) continue;

      // Check out of stock
      const outOfStock = card.querySelector('[class*="outOfStock"], [class*="soldOut"], [class*="OutOfStock"]');
      if (outOfStock) {
        products.push({
          name,
          quantity: 0,
          warning: 'Out of stock',
          inStock: false,
        });
        continue;
      }

      // Look for inventory text
      const patterns = [
        /(\d+)\s*left\s*in\s*stock/i,
        /only\s*(\d+)\s*left/i,
        /(\d+)\s*remaining/i,
        /(\d+)\s*available/i,
      ];

      let foundQuantity = false;
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          products.push({
            name,
            quantity: parseInt(match[1], 10),
            warning: match[0].trim(),
            inStock: true,
          });
          foundQuantity = true;
          break;
        }
      }

      if (!foundQuantity) {
        products.push({
          name,
          quantity: null,
          warning: null,
          inStock: true,
        });
      }
    }

    return products;
  });

  for (const product of productsData) {
    results.set(product.name, {
      quantity: product.quantity,
      quantityWarning: product.warning,
      inStock: product.inStock,
      source: product.quantity !== null ? 'page-text' : 'unknown',
      confidence: product.quantity !== null ? 'exact' : 'boolean',
    });
  }

  return results;
}

// ============================================================
// INTEGRATION HELPER
// ============================================================

/**
 * Enhance scraped products with inventory data from cart hack
 * 
 * @param products - Array of scraped products
 * @param inventoryMap - Map from extractInventoryFromListing
 */
export function enhanceProductsWithInventory<T extends { rawProductName: string; inStock: boolean; quantity?: number | null; quantityWarning?: string | null }>(
  products: T[],
  inventoryMap: Map<string, InventoryResult>
): T[] {
  return products.map(product => {
    const inventory = inventoryMap.get(product.rawProductName);
    if (inventory) {
      return {
        ...product,
        inStock: inventory.inStock,
        quantity: inventory.quantity ?? product.quantity,
        quantityWarning: inventory.quantityWarning ?? product.quantityWarning,
      };
    }
    return product;
  });
}
