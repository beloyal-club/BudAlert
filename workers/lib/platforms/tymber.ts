/**
 * Tymber/Blaze Platform Scraper
 * 
 * Extracts products with inventory from Tymber SSR pages (e.g., Housing Works Cannabis)
 * Products are embedded in __NEXT_DATA__ JSON - no browser automation needed.
 * 
 * Key fields:
 * - pos_inventory: exact stock count
 * - in_stock: boolean availability
 * - unit_price.amount: price in cents
 */

// ============================================================================
// TYPES
// ============================================================================

export interface TymberRawProduct {
  attributes: {
    id: number;
    name: string;
    slug: string;
    store_url: string;
    main_image?: string;
    unit_price?: { amount: number; currency: string };
    discount_price?: number | null;
    on_sale?: boolean;
    pos_inventory: number;  // CRITICAL: exact stock count
    in_stock: boolean;
    flower_type?: string;
    thc?: { amount: string; units: string };
    cbd?: { amount: string; units: string };
    size?: { amount: number; type: string; units: string; display_text?: string };
    description?: string;
  };
  relationships?: {
    category?: { data?: { attributes?: { name: string; slug: string } } };
    brand?: { data?: { attributes?: { name: string } } };
    tags?: { data?: Array<{ attributes?: { name: string } }> };
  };
}

export interface TymberScrapedProduct {
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
// PLATFORM DETECTION
// ============================================================================

const TYMBER_URL_PATTERNS = [
  /hwcannabis\.co/i,
  /\.tymber\.me/i,
  /tymber\.io/i,
];

const TYMBER_HTML_SIGNATURES = [
  'ecom-api.blaze.me',
  'tymber-s3.imgix.net',
  'tymber-blaze-products.imgix.net',
  '"siteGroupName":"tymber-',
];

/**
 * Detect if a URL/HTML belongs to a Tymber/Blaze platform site
 */
export function isTymberSite(url: string, html?: string): boolean {
  // URL-based detection
  for (const pattern of TYMBER_URL_PATTERNS) {
    if (pattern.test(url)) return true;
  }
  
  // HTML-based detection
  if (html) {
    for (const sig of TYMBER_HTML_SIGNATURES) {
      if (html.includes(sig)) return true;
    }
  }
  
  return false;
}

// ============================================================================
// SSR JSON EXTRACTION
// ============================================================================

/**
 * Extract raw product data from __NEXT_DATA__ JSON
 */
export function extractTymberSSRData(html: string): TymberRawProduct[] {
  const products: TymberRawProduct[] = [];
  
  // Find __NEXT_DATA__ script tag
  const match = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
  if (!match) {
    console.log('[Tymber] No __NEXT_DATA__ found in HTML');
    return products;
  }
  
  try {
    const data = JSON.parse(match[1]);
    const pageProps = data?.props?.pageProps;
    
    if (!pageProps) {
      console.log('[Tymber] No pageProps in __NEXT_DATA__');
      return products;
    }
    
    // Extract from showcasedGroups (main product listings)
    const showcasedGroups = pageProps?.showcasedGroups?.data || 
                            pageProps?.homeData?.showcasedGroups || 
                            [];
    
    for (const group of showcasedGroups) {
      const groupProducts = group?.products?.data?.objects || [];
      products.push(...groupProducts);
    }
    
    // Extract from deals if present (can be array or object)
    const deals = pageProps?.deals;
    if (Array.isArray(deals)) {
      for (const deal of deals) {
        const dealProducts = deal?.products || [];
        products.push(...dealProducts);
      }
    }
    
    // Extract from search results if present
    const searchProducts = pageProps?.products?.data?.objects || [];
    products.push(...searchProducts);
    
    console.log(`[Tymber] Extracted ${products.length} products from SSR data`);
    
  } catch (error) {
    console.error('[Tymber] Failed to parse __NEXT_DATA__:', error);
  }
  
  return products;
}

// ============================================================================
// FIELD MAPPING
// ============================================================================

/**
 * Map Tymber product to our ScrapedProduct format
 */
export function mapTymberToScrapedProduct(
  raw: TymberRawProduct, 
  sourceUrl: string
): TymberScrapedProduct {
  const attrs = raw.attributes || {};
  const rels = raw.relationships || {};
  
  // Price is in cents, convert to dollars
  const priceInCents = attrs.unit_price?.amount || 0;
  const price = priceInCents / 100;
  
  // Get quantity - this is the key field!
  const quantity = typeof attrs.pos_inventory === 'number' ? attrs.pos_inventory : null;
  
  // Determine if low stock
  let quantityWarning: string | null = null;
  if (quantity !== null && quantity > 0 && quantity <= 5) {
    quantityWarning = `Only ${quantity} left`;
  } else if (quantity === 0 || !attrs.in_stock) {
    quantityWarning = 'Out of stock';
  }
  
  return {
    rawProductName: attrs.name || 'Unknown',
    rawBrandName: rels.brand?.data?.attributes?.name || 'Unknown',
    rawCategory: rels.category?.data?.attributes?.name,
    price,
    originalPrice: attrs.discount_price ? price : undefined,
    inStock: attrs.in_stock ?? (quantity !== null && quantity > 0),
    quantity,
    quantityWarning,
    quantitySource: 'tymber_ssr',
    imageUrl: attrs.main_image,
    thcFormatted: attrs.thc ? `${attrs.thc.amount}${attrs.thc.units}` : undefined,
    cbdFormatted: attrs.cbd ? `${attrs.cbd.amount}${attrs.cbd.units}` : undefined,
    sourceUrl,
    sourcePlatform: 'tymber',
    scrapedAt: Date.now(),
    productUrl: attrs.store_url,
  };
}

// ============================================================================
// MAIN SCRAPE FUNCTION
// ============================================================================

/**
 * Scrape products from a Tymber/Blaze site
 * 
 * @param html - Raw HTML from the page
 * @param sourceUrl - URL of the page being scraped
 * @returns Array of ScrapedProduct with inventory data
 */
export function scrapeTymberProducts(html: string, sourceUrl: string): TymberScrapedProduct[] {
  const rawProducts = extractTymberSSRData(html);
  return rawProducts.map(raw => mapTymberToScrapedProduct(raw, sourceUrl));
}

/**
 * Fetch and scrape a Tymber site (convenience function for Workers)
 */
export async function fetchAndScrapeTymber(url: string): Promise<TymberScrapedProduct[]> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; CannaSignal/1.0)',
      'Accept': 'text/html',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  
  const html = await response.text();
  return scrapeTymberProducts(html, url);
}
