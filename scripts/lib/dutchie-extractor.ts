/**
 * Dutchie Extractor - Extract product and inventory data from Dutchie-powered menus
 * Works with both embedded Dutchie and dutchie.com domains
 */

import { Page } from 'playwright';

export interface ProductCard {
  element: string;  // Selector for clicking
  name: string;
  brand: string;
  price: number;
  originalPrice?: number;
  category?: string;
  imageUrl?: string;
  inStock: boolean;
}

export interface ProductInventory {
  name: string;
  brand: string;
  price: number;
  originalPrice?: number;
  weight: string;
  category: string;
  thcPercent?: number;
  cbdPercent?: number;
  inventoryCount: number;
  inStock: boolean;
  imageUrl?: string;
  scrapedAt: string;
  sourceUrl: string;
}

/**
 * Get all product cards from the current page
 */
export async function getProductCards(page: Page): Promise<ProductCard[]> {
  console.log('[Extractor] Scanning for product cards...');
  
  const cards = await page.evaluate(() => {
    const results: Array<{
      index: number;
      name: string;
      brand: string;
      price: number;
      originalPrice?: number;
      category?: string;
      imageUrl?: string;
      inStock: boolean;
    }> = [];
    
    // Find all product card elements
    const cardSelectors = [
      '[data-testid="product-card"]',
      '[class*="ProductCard"]',
      '[class*="product-card"]',
      'a[href*="/product/"]',
      '.product-listing-item',
      '[data-product-id]',
    ];
    
    let cards: Element[] = [];
    for (const sel of cardSelectors) {
      const found = Array.from(document.querySelectorAll(sel));
      if (found.length > 0) {
        cards = found;
        break;
      }
    }
    
    // Fallback: look for product grid items
    if (cards.length === 0) {
      const gridItems = document.querySelectorAll('[class*="grid"] > div, [class*="Grid"] > div');
      cards = Array.from(gridItems).filter(el => {
        const text = el.textContent || '';
        return text.includes('$') && (text.includes('THC') || text.includes('%'));
      });
    }
    
    cards.forEach((card, index) => {
      const text = card.textContent || '';
      
      // Extract name (usually first heading or strong text)
      const nameEl = card.querySelector('h3, h4, h2, [class*="name"], [class*="Name"], strong');
      const name = nameEl?.textContent?.trim() || text.split('\n')[0]?.trim() || 'Unknown';
      
      // Extract brand
      const brandEl = card.querySelector('[class*="brand"], [class*="Brand"], .subtitle');
      const brand = brandEl?.textContent?.trim() || 'Unknown';
      
      // Extract price
      const priceMatch = text.match(/\$(\d+\.?\d*)/);
      const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
      
      // Check for original/crossed price (sale)
      const originalPriceMatch = text.match(/\$(\d+\.?\d*)\s*\$(\d+\.?\d*)/);
      const originalPrice = originalPriceMatch ? parseFloat(originalPriceMatch[1]) : undefined;
      
      // Extract category from URL or text
      const categoryEl = card.querySelector('[class*="category"], [class*="Category"]');
      const category = categoryEl?.textContent?.trim();
      
      // Get image
      const imgEl = card.querySelector('img');
      const imageUrl = imgEl?.src || imgEl?.getAttribute('data-src');
      
      // Check stock status
      const outOfStock = text.toLowerCase().includes('out of stock') || 
                         text.toLowerCase().includes('sold out') ||
                         card.querySelector('[class*="outOfStock"], [class*="sold-out"]') !== null;
      
      results.push({
        index,
        name,
        brand,
        price,
        originalPrice,
        category,
        imageUrl,
        inStock: !outOfStock,
      });
    });
    
    return results;
  });
  
  console.log(`[Extractor] Found ${cards.length} product cards`);
  
  return cards.map((c, i) => ({
    element: `[data-product-index="${i}"]`,  // We'll use index-based clicking
    ...c,
  }));
}

/**
 * Click on a product card to open modal/detail page
 */
export async function clickProductCard(page: Page, cardIndex: number): Promise<boolean> {
  try {
    // Multiple strategies for clicking
    const strategies = [
      // Strategy 1: Click by index on product grid
      async () => {
        const cards = await page.locator('[data-testid="product-card"], [class*="ProductCard"], [class*="product-card"], a[href*="/product/"]').all();
        if (cards[cardIndex]) {
          await cards[cardIndex].click();
          return true;
        }
        return false;
      },
      // Strategy 2: Click on nth product in grid
      async () => {
        const card = page.locator('[class*="product"], [class*="Product"]').nth(cardIndex);
        if (await card.isVisible({ timeout: 1000 })) {
          await card.click();
          return true;
        }
        return false;
      },
    ];
    
    for (const strategy of strategies) {
      try {
        if (await strategy()) {
          await page.waitForTimeout(2000);  // Wait for modal/page to load
          return true;
        }
      } catch {
        continue;
      }
    }
    
    return false;
  } catch (err) {
    console.log(`[Extractor] Failed to click card ${cardIndex}: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Extract inventory data from open product modal/detail
 */
export async function extractInventoryFromModal(page: Page): Promise<{
  inventoryCount: number;
  thcPercent?: number;
  cbdPercent?: number;
  weight?: string;
  fullName?: string;
  brand?: string;
  category?: string;
  price?: number;
}> {
  const data = await page.evaluate(() => {
    const text = document.body.innerText;
    
    // Look for inventory patterns
    // "X left in stock" / "X left" / "Only X left"
    const inventoryPatterns = [
      /(\d+)\s*left\s*in\s*stock/i,
      /(\d+)\s*left/i,
      /only\s*(\d+)\s*(left|remaining|available)/i,
      /(\d+)\s*(in stock|available|remaining)/i,
      /stock:\s*(\d+)/i,
      /quantity:\s*(\d+)/i,
    ];
    
    let inventoryCount = 0;
    for (const pattern of inventoryPatterns) {
      const match = text.match(pattern);
      if (match) {
        inventoryCount = parseInt(match[1], 10);
        break;
      }
    }
    
    // Extract THC%
    const thcMatch = text.match(/THC[:\s]*(\d+\.?\d*)%?/i) || 
                     text.match(/(\d+\.?\d*)%\s*THC/i);
    const thcPercent = thcMatch ? parseFloat(thcMatch[1]) : undefined;
    
    // Extract CBD%
    const cbdMatch = text.match(/CBD[:\s]*(\d+\.?\d*)%?/i) ||
                     text.match(/(\d+\.?\d*)%\s*CBD/i);
    const cbdPercent = cbdMatch ? parseFloat(cbdMatch[1]) : undefined;
    
    // Extract weight
    const weightPatterns = [
      /(\d+\.?\d*)\s*g(?:ram)?s?\b/i,
      /(\d+\.?\d*)\s*oz/i,
      /1\/8\s*oz/i,
      /1\/4\s*oz/i,
      /eighth/i,
      /quarter/i,
      /half\s*oz/i,
    ];
    let weight: string | undefined;
    for (const pattern of weightPatterns) {
      const match = text.match(pattern);
      if (match) {
        weight = match[0];
        break;
      }
    }
    
    // Get product name from modal header
    const nameEl = document.querySelector('h1, h2, [class*="product-name"], [class*="ProductName"], [class*="modal-title"]');
    const fullName = nameEl?.textContent?.trim();
    
    // Get brand
    const brandEl = document.querySelector('[class*="brand"], [class*="Brand"]');
    const brand = brandEl?.textContent?.trim();
    
    // Get category
    const categoryEl = document.querySelector('[class*="category"], [class*="Category"], [class*="type"]');
    const category = categoryEl?.textContent?.trim();
    
    // Get price from modal
    const priceMatch = text.match(/\$(\d+\.?\d*)/);
    const price = priceMatch ? parseFloat(priceMatch[1]) : undefined;
    
    return {
      inventoryCount,
      thcPercent,
      cbdPercent,
      weight,
      fullName,
      brand,
      category,
      price,
    };
  });
  
  return data;
}

/**
 * Close modal if open
 */
export async function closeModal(page: Page): Promise<boolean> {
  const closeSelectors = [
    'button[aria-label="Close"]',
    '[class*="close-button"]',
    '[class*="CloseButton"]',
    'button:has-text("Close")',
    '.modal-close',
    '[data-testid="modal-close"]',
    'button:has-text("×")',
    '[class*="modal"] button:first-child',
  ];
  
  for (const selector of closeSelectors) {
    try {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 500 })) {
        await btn.click();
        await page.waitForTimeout(500);
        return true;
      }
    } catch {
      continue;
    }
  }
  
  // Fallback: press Escape
  try {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if there's pagination and go to next page
 */
export async function hasNextPage(page: Page): Promise<boolean> {
  const nextSelectors = [
    'button:has-text("Next")',
    '[aria-label="Next page"]',
    '.pagination-next:not([disabled])',
    '[class*="next-page"]:not([disabled])',
    'a[rel="next"]',
  ];
  
  for (const selector of nextSelectors) {
    try {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 1000 }) && await btn.isEnabled()) {
        return true;
      }
    } catch {
      continue;
    }
  }
  
  return false;
}

/**
 * Go to next page
 */
export async function goToNextPage(page: Page): Promise<boolean> {
  const nextSelectors = [
    'button:has-text("Next")',
    '[aria-label="Next page"]',
    '.pagination-next:not([disabled])',
    '[class*="next-page"]:not([disabled])',
    'a[rel="next"]',
  ];
  
  for (const selector of nextSelectors) {
    try {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 1000 }) && await btn.isEnabled()) {
        await btn.click();
        await page.waitForTimeout(3000);
        return true;
      }
    } catch {
      continue;
    }
  }
  
  return false;
}

/**
 * Scroll to load more products (infinite scroll)
 */
export async function scrollToLoadMore(page: Page): Promise<number> {
  const initialCount = await page.locator('[data-testid="product-card"], [class*="ProductCard"], [class*="product-card"]').count();
  
  // Scroll to bottom
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  
  await page.waitForTimeout(2000);
  
  const newCount = await page.locator('[data-testid="product-card"], [class*="ProductCard"], [class*="product-card"]').count();
  
  return newCount - initialCount;
}
