/**
 * Playwright Stealth Scraper for Dutchie-powered dispensaries
 * Uses playwright-extra with stealth plugin to bypass Cloudflare detection
 * 
 * FINDINGS:
 * - Stealth mode WORKS - bypasses Cloudflare on both dutchie.com and embedded menus
 * - Age verification modals need to be auto-clicked
 * - Use 'domcontentloaded' instead of 'networkidle' (SPAs never truly idle)
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Page, Browser, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// Add stealth plugin
chromium.use(StealthPlugin());

// User agent rotation pool (recent Chrome on various OSes)
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

interface Product {
  name: string;
  brand: string | null;
  price: string | null;
  originalPrice: string | null;
  stockStatus: string | null;
  thc: string | null;
  cbd: string | null;
  category: string | null;
  url: string | null;
  imageUrl: string | null;
  // Inventory tracking fields
  inventoryCount: number | null;      // actual count if shown (e.g., "6 left")
  inventoryText: string | null;       // raw text like "6 left in stock – order soon!"
  isLowStock: boolean;                // true if < 10 remaining
  stockConfidence: 'exact' | 'low_signal' | 'unknown';  // how confident are we
}

interface ScrapeResult {
  url: string;
  timestamp: string;
  success: boolean;
  blocked: boolean;
  blockReason: string | null;
  products: Product[];
  pageTitle: string | null;
  error: string | null;
  screenshotPath: string | null;
}

export class DutchieStealthScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private outputDir: string;

  constructor(outputDir: string = '/root/clawd/cannasignal/data/stealth-test') {
    this.outputDir = outputDir;
  }

  private getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  private async randomDelay(min: number = 500, max: number = 2000): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min) + min);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  private async humanLikeMouseMove(page: Page): Promise<void> {
    const viewport = page.viewportSize();
    if (!viewport) return;

    for (let i = 0; i < 3; i++) {
      const x = Math.floor(Math.random() * viewport.width);
      const y = Math.floor(Math.random() * viewport.height);
      await page.mouse.move(x, y, { steps: 10 });
      await this.randomDelay(100, 300);
    }
  }

  async launch(): Promise<void> {
    const userAgent = this.getRandomUserAgent();
    console.log(`Launching browser with user agent: ${userAgent.substring(0, 50)}...`);

    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-web-security',
        '--disable-infobars',
        '--window-size=1920,1080',
        '--start-maximized',
      ],
    });

    this.context = await this.browser.newContext({
      userAgent,
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      geolocation: { latitude: 40.7128, longitude: -74.0060 },
      permissions: ['geolocation'],
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
      },
    });
  }

  async close(): Promise<void> {
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
  }

  private async detectCloudflareBlock(page: Page): Promise<{ blocked: boolean; reason: string | null }> {
    const content = await page.content();
    const title = await page.title();

    if (content.includes('cf-browser-verification') || content.includes('cf_chl_opt')) {
      return { blocked: true, reason: 'Cloudflare JS Challenge' };
    }
    if (content.includes('cf-turnstile') || content.includes('challenges.cloudflare.com')) {
      return { blocked: true, reason: 'Cloudflare Turnstile CAPTCHA' };
    }
    if (title.includes('Just a moment') || title.includes('Attention Required')) {
      return { blocked: true, reason: 'Cloudflare Interstitial Page' };
    }
    if (content.includes('Checking your browser') || content.includes('Verifying you are human')) {
      return { blocked: true, reason: 'Cloudflare Human Verification' };
    }
    if (content.includes('Access denied') || content.includes('Error 1015') || content.includes('Error 1020')) {
      return { blocked: true, reason: 'Cloudflare Access Denied / Rate Limited' };
    }
    if (content.includes('Ray ID:') && content.length < 5000) {
      return { blocked: true, reason: 'Cloudflare Error Page' };
    }

    return { blocked: false, reason: null };
  }

  private async handleAgeVerification(page: Page): Promise<boolean> {
    console.log('Checking for age verification modal...');
    
    // Common age verification selectors
    const ageVerifySelectors = [
      // Dutchie specific
      'button:has-text("YES")',
      'button:has-text("Yes")',
      'button:has-text("I am 21+")',
      'button:has-text("I\'m 21")',
      'button:has-text("Enter")',
      '[data-testid="age-gate-submit"]',
      '.age-gate-submit',
      // Generic
      'button[class*="age"][class*="yes"]',
      'button[class*="confirm"][class*="age"]',
      '[class*="age-verification"] button:first-child',
      '[class*="ageGate"] button:first-child',
    ];

    for (const selector of ageVerifySelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          console.log(`Found age verification button: ${selector}`);
          await button.click();
          await this.randomDelay(1000, 2000);
          return true;
        }
      } catch (e) {
        // Continue trying other selectors
      }
    }

    // Try text-based approach
    try {
      const yesButton = await page.locator('button', { hasText: /^(YES|Yes|I am 21|I\'m 21|Enter|Confirm)$/i }).first();
      if (await yesButton.isVisible({ timeout: 1000 })) {
        console.log('Found age verification via text matching');
        await yesButton.click();
        await this.randomDelay(1000, 2000);
        return true;
      }
    } catch (e) {
      // No age verification found
    }

    return false;
  }

  async scrapeDutchie(url: string): Promise<ScrapeResult> {
    if (!this.context) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    const result: ScrapeResult = {
      url,
      timestamp: new Date().toISOString(),
      success: false,
      blocked: false,
      blockReason: null,
      products: [],
      pageTitle: null,
      error: null,
      screenshotPath: null,
    };

    const page = await this.context.newPage();

    try {
      console.log(`\nNavigating to: ${url}`);
      
      await this.randomDelay(1000, 2000);

      // Use domcontentloaded instead of networkidle (SPAs never become idle)
      const response = await page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });

      console.log(`Response status: ${response?.status()}`);

      // Wait for initial page render
      await this.randomDelay(2000, 3000);

      // Check for Cloudflare block
      const blockCheck = await this.detectCloudflareBlock(page);
      if (blockCheck.blocked) {
        console.log(`BLOCKED: ${blockCheck.reason}`);
        result.blocked = true;
        result.blockReason = blockCheck.reason;
        
        const screenshotName = `blocked-${Date.now()}.png`;
        const screenshotPath = path.join(this.outputDir, screenshotName);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        result.screenshotPath = screenshotPath;
        
        const htmlPath = path.join(this.outputDir, `blocked-${Date.now()}.html`);
        fs.writeFileSync(htmlPath, await page.content());
        
        return result;
      }

      // Handle age verification modal
      const handledAge = await this.handleAgeVerification(page);
      if (handledAge) {
        console.log('Age verification handled, waiting for page to update...');
        await this.randomDelay(2000, 3000);
      }

      // Simulate human behavior
      await this.humanLikeMouseMove(page);

      result.pageTitle = await page.title();
      console.log(`Page title: ${result.pageTitle}`);

      // Wait for product elements to load (try multiple strategies)
      console.log('Waiting for products to load...');
      try {
        await page.waitForSelector('[data-testid="product-card"], .product-card, [class*="ProductCard"], [class*="product-tile"], [class*="menu-product"], article', { 
          timeout: 15000 
        });
      } catch {
        console.log('No product cards found with standard selectors');
      }

      // Scroll to load lazy content
      await this.scrollPage(page);

      // Extract products
      const products = await this.extractDutchieProducts(page);
      result.products = products;
      result.success = products.length > 0;

      // Take a success screenshot
      const screenshotName = `success-${Date.now()}.png`;
      const screenshotPath = path.join(this.outputDir, screenshotName);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      result.screenshotPath = screenshotPath;

      console.log(`Extracted ${products.length} products`);
      if (products.length > 0) {
        console.log(`Sample products:`);
        products.slice(0, 3).forEach(p => {
          console.log(`  - ${p.name} | ${p.price} | THC: ${p.thc || 'N/A'}`);
        });
      }

    } catch (error: any) {
      console.error(`Error scraping ${url}:`, error.message);
      result.error = error.message;
      
      try {
        const screenshotName = `error-${Date.now()}.png`;
        const screenshotPath = path.join(this.outputDir, screenshotName);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        result.screenshotPath = screenshotPath;
      } catch {}
    } finally {
      await page.close();
    }

    return result;
  }

  private async scrollPage(page: Page): Promise<void> {
    console.log('Scrolling to load lazy content...');
    // Scroll incrementally
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await this.randomDelay(400, 600);
    }
    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await this.randomDelay(500, 1000);
  }

  private async extractDutchieProducts(page: Page): Promise<Product[]> {
    // Use a serialized function string to avoid tsx transformation issues
    const extractedProducts = await page.evaluate(`
      (function() {
        var products = [];
        var seen = {};

        function clean(text) {
          if (!text) return null;
          return text.replace(/\\s+/g, ' ').trim() || null;
        }

        function extractPrice(text) {
          var match = text.match(/\\$[\\d,]+\\.?\\d*/);
          return match ? match[0] : null;
        }

        function extractCannabinoid(text, type) {
          var pattern1 = new RegExp('(\\\\d+\\\\.?\\\\d*)\\\\s*%?\\\\s*' + type, 'i');
          var pattern2 = new RegExp(type + '[:\\\\s]*(\\\\d+\\\\.?\\\\d*)\\\\s*%?', 'i');
          var match = text.match(pattern1) || text.match(pattern2);
          return match ? match[1] + '%' : null;
        }

        var selectors = '[data-testid="product-card"], .product-card, [class*="ProductCard"], ' +
          '[class*="product-tile"], [class*="menu-product"], [class*="ProductItem"], ' +
          '[class*="product-item"], article[class*="product"], [role="listitem"]';
        
        var containers = document.querySelectorAll(selectors);

        containers.forEach(function(container) {
          var text = container.textContent || '';
          if (text.length < 10 || text.length > 2000) return;

          var nameEl = container.querySelector(
            'h1, h2, h3, h4, [class*="name"], [class*="title"], [class*="Name"], [class*="Title"], a[href*="product"]'
          );
          var name = clean(nameEl ? nameEl.textContent : null) || clean(text.substring(0, 100));
          if (!name || name.length < 3) return;

          var key = name.toLowerCase().substring(0, 30);
          if (seen[key]) return;
          seen[key] = true;

          var brandEl = container.querySelector('[class*="brand"], [class*="Brand"]');
          var brand = clean(brandEl ? brandEl.textContent : null);

          var priceEl = container.querySelector('[class*="price"], [class*="Price"]');
          var price = extractPrice(priceEl ? priceEl.textContent : text);

          var thc = extractCannabinoid(text, 'THC');
          var cbd = extractCannabinoid(text, 'CBD');

          var img = container.querySelector('img');
          var imageUrl = img ? (img.src || img.getAttribute('data-src')) : null;

          var link = container.querySelector('a[href*="product"]');
          var productUrl = link ? link.getAttribute('href') : null;

          // Inventory extraction - look for low stock messages
          var inventoryEl = container.querySelector(
            '[data-testid="product-low-inventory-message"], ' +
            '[class*="low-inventory"], [class*="lowInventory"], [class*="LowInventory"], ' +
            '[class*="stock-level"], [class*="stockLevel"], [class*="StockLevel"], ' +
            '[class*="inventory"], [class*="Inventory"], ' +
            '[class*="quantity-left"], [class*="remaining"]'
          );
          var inventoryText = inventoryEl ? clean(inventoryEl.textContent) : null;
          
          // Also check for inventory patterns in full text
          if (!inventoryText) {
            var invMatch = text.match(/(\d+)\s*(left|remaining|in stock|available)/i);
            if (invMatch) {
              inventoryText = invMatch[0];
            }
          }
          
          // Parse numeric inventory count
          var inventoryCount = null;
          var stockConfidence = 'unknown';
          if (inventoryText) {
            var countMatch = inventoryText.match(/(\d+)\s*(left|remaining|in stock|available)/i);
            if (countMatch) {
              inventoryCount = parseInt(countMatch[1], 10);
              stockConfidence = 'exact';
            } else {
              // Has inventory text but couldn't parse number - it's a low stock signal
              stockConfidence = 'low_signal';
            }
          }
          
          var isLowStock = inventoryCount !== null && inventoryCount < 10;
          // Also flag as low stock if we found a low inventory message element
          if (inventoryEl && inventoryText) {
            isLowStock = true;
          }

          products.push({
            name: name,
            brand: brand,
            price: price,
            originalPrice: null,
            stockStatus: text.toLowerCase().indexOf('out of stock') >= 0 ? 'Out of Stock' : 'In Stock',
            thc: thc,
            cbd: cbd,
            category: null,
            url: productUrl,
            imageUrl: imageUrl,
            inventoryCount: inventoryCount,
            inventoryText: inventoryText,
            isLowStock: isLowStock,
            stockConfidence: stockConfidence
          });
        });

        // Strategy 2: Generic link-based extraction
        if (products.length < 5) {
          var allLinks = document.querySelectorAll('a');
          allLinks.forEach(function(link) {
            var href = link.getAttribute('href') || '';
            if (href.indexOf('product') < 0 && href.indexOf('menu') < 0) return;
            
            var text = link.textContent || '';
            var price = extractPrice(text);
            if (!price) return;

            var name = clean(text.replace(price, '').substring(0, 80));
            if (!name || name.length < 3) return;

            var key = name.toLowerCase().substring(0, 30);
            if (seen[key]) return;
            seen[key] = true;

            // Check for inventory in link text
            var linkInvMatch = text.match(/(\d+)\s*(left|remaining|in stock|available)/i);
            var linkInventoryText = linkInvMatch ? linkInvMatch[0] : null;
            var linkInventoryCount = linkInvMatch ? parseInt(linkInvMatch[1], 10) : null;

            products.push({
              name: name,
              brand: null,
              price: price,
              originalPrice: null,
              stockStatus: 'Unknown',
              thc: extractCannabinoid(text, 'THC'),
              cbd: extractCannabinoid(text, 'CBD'),
              category: null,
              url: href,
              imageUrl: null,
              inventoryCount: linkInventoryCount,
              inventoryText: linkInventoryText,
              isLowStock: linkInventoryCount !== null && linkInventoryCount < 10,
              stockConfidence: linkInventoryCount !== null ? 'exact' : 'unknown'
            });
          });
        }

        return products;
      })()
    `);

    return extractedProducts as Product[];
  }

  /**
   * Scrape a single product detail page for more inventory info
   * Use this for products without visible inventory on listing pages
   */
  async scrapeProductDetail(productUrl: string): Promise<{
    inventoryCount: number | null;
    inventoryText: string | null;
    stockConfidence: 'exact' | 'low_signal' | 'unknown';
    nextDataInventory: any;
    error: string | null;
  }> {
    if (!this.context) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    const page = await this.context.newPage();
    const result = {
      inventoryCount: null as number | null,
      inventoryText: null as string | null,
      stockConfidence: 'unknown' as 'exact' | 'low_signal' | 'unknown',
      nextDataInventory: null as any,
      error: null as string | null,
    };

    try {
      console.log(`  → Scraping product detail: ${productUrl}`);
      await this.randomDelay(500, 1000);

      await page.goto(productUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 20000 
      });
      
      await this.randomDelay(1500, 2500);
      
      // Handle age verification if needed
      await this.handleAgeVerification(page);

      // Strategy 1: Look for low inventory message on detail page
      const inventoryMessage = await page.evaluate(`
        (function() {
          var selectors = [
            '[data-testid="product-low-inventory-message"]',
            '[class*="low-inventory"]',
            '[class*="lowInventory"]',
            '[class*="LowInventory"]',
            '[class*="stock-level"]',
            '[class*="inventory-message"]',
            '[class*="InventoryMessage"]',
            '[class*="quantity-warning"]'
          ];
          
          for (var i = 0; i < selectors.length; i++) {
            var el = document.querySelector(selectors[i]);
            if (el && el.textContent) {
              return el.textContent.trim();
            }
          }
          
          // Also search all elements for inventory patterns
          var allText = document.body.textContent || '';
          var match = allText.match(/(\\d+)\\s*(left|remaining|in stock).*?(order soon|hurry)?/i);
          return match ? match[0] : null;
        })()
      `);

      if (inventoryMessage) {
        result.inventoryText = inventoryMessage as string;
        const countMatch = (inventoryMessage as string).match(/(\d+)\s*(left|remaining|in stock)/i);
        if (countMatch) {
          result.inventoryCount = parseInt(countMatch[1], 10);
          result.stockConfidence = 'exact';
        } else {
          result.stockConfidence = 'low_signal';
        }
      }

      // Strategy 2: Extract __NEXT_DATA__ for SSR inventory data
      const nextData = await page.evaluate(`
        (function() {
          var script = document.querySelector('script#__NEXT_DATA__');
          if (!script) return null;
          try {
            var data = JSON.parse(script.textContent);
            // Look for inventory info in various paths
            var props = data.props?.pageProps || {};
            return {
              product: props.product || null,
              menu: props.menu || null,
              inventory: props.inventory || props.product?.inventory || null,
              // Dutchie sometimes uses these
              stockLevel: props.product?.stockLevel || null,
              quantityAvailable: props.product?.quantityAvailable || null,
              availableQuantity: props.product?.availableQuantity || null,
              stock: props.product?.stock || null,
            };
          } catch (e) {
            return { error: e.message };
          }
        })()
      `);

      if (nextData) {
        result.nextDataInventory = nextData;
        
        // Try to extract inventory from SSR data
        const ssr = nextData as any;
        const qty = ssr.quantityAvailable || ssr.availableQuantity || 
                    ssr.inventory?.available || ssr.stock?.quantity ||
                    ssr.product?.inventoryCount || ssr.product?.quantity;
        
        if (typeof qty === 'number' && result.inventoryCount === null) {
          result.inventoryCount = qty;
          result.stockConfidence = 'exact';
        }
      }

    } catch (error: any) {
      console.error(`  Error scraping product detail: ${error.message}`);
      result.error = error.message;
    } finally {
      await page.close();
    }

    return result;
  }

  /**
   * Scrape listing page and optionally visit product detail pages for inventory
   */
  async scrapeWithDetailPages(
    listingUrl: string, 
    options: { maxDetailPages?: number; skipDetailIfInventory?: boolean } = {}
  ): Promise<ScrapeResult & { detailResults?: Record<string, any> }> {
    const { maxDetailPages = 5, skipDetailIfInventory = true } = options;
    
    // First scrape the listing page
    const result = await this.scrapeDutchie(listingUrl);
    
    if (!result.success || result.products.length === 0) {
      return result;
    }

    // Find products that need detail page scraping
    const needsDetail = result.products.filter(p => {
      if (!p.url) return false;
      if (skipDetailIfInventory && p.inventoryCount !== null) return false;
      return true;
    }).slice(0, maxDetailPages);

    if (needsDetail.length === 0) {
      console.log('All products have inventory data, skipping detail pages');
      return result;
    }

    console.log(`\nScraping ${needsDetail.length} product detail pages for inventory...`);
    
    const detailResults: Record<string, any> = {};
    
    for (const product of needsDetail) {
      let fullUrl = product.url!;
      if (fullUrl.startsWith('/')) {
        // Relative URL - construct full URL from listing URL
        const baseUrl = new URL(listingUrl);
        fullUrl = `${baseUrl.origin}${fullUrl}`;
      }
      
      const detailResult = await this.scrapeProductDetail(fullUrl);
      detailResults[product.name] = detailResult;
      
      // Update product with detail page data
      if (detailResult.inventoryCount !== null) {
        product.inventoryCount = detailResult.inventoryCount;
        product.stockConfidence = detailResult.stockConfidence;
      }
      if (detailResult.inventoryText) {
        product.inventoryText = detailResult.inventoryText;
        product.isLowStock = true;
      }
      
      await this.randomDelay(1500, 3000);
    }

    return { ...result, detailResults };
  }

  async scrapeMultiple(urls: string[]): Promise<ScrapeResult[]> {
    const results: ScrapeResult[] = [];
    
    for (const url of urls) {
      const result = await this.scrapeDutchie(url);
      results.push(result);
      
      if (urls.indexOf(url) < urls.length - 1) {
        console.log('Waiting before next request...');
        await this.randomDelay(3000, 6000);
      }
    }
    
    return results;
  }
}

// Main execution - Inventory Extraction Test
async function main() {
  const outputDir = '/root/clawd/cannasignal/data/inventory-test';
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const scraper = new DutchieStealthScraper(outputDir);
  
  // Focus on CONBUD for inventory testing
  const testUrl = 'https://conbud.com/stores/conbud-les/products/flower';

  console.log('='.repeat(70));
  console.log('Playwright Stealth Scraper - INVENTORY EXTRACTION TEST');
  console.log('='.repeat(70));
  console.log(`Target: ${testUrl}`);
  console.log(`Output: ${outputDir}`);
  console.log('Focus: Extracting inventory counts for sell-through velocity');
  console.log('='.repeat(70));

  try {
    await scraper.launch();
    
    // Use the new detail-page-aware scraper
    const result = await scraper.scrapeWithDetailPages(testUrl, {
      maxDetailPages: 5,  // Scrape up to 5 detail pages
      skipDetailIfInventory: true  // Skip if listing already has inventory
    });
    
    // Save full results
    const resultsPath = path.join(outputDir, `inventory-results-${Date.now()}.json`);
    fs.writeFileSync(resultsPath, JSON.stringify(result, null, 2));
    console.log(`\nFull results saved to: ${resultsPath}`);

    // Create inventory summary
    const inventorySummary = {
      timestamp: result.timestamp,
      url: result.url,
      totalProducts: result.products.length,
      withExactInventory: result.products.filter(p => p.stockConfidence === 'exact').length,
      withLowStockSignal: result.products.filter(p => p.stockConfidence === 'low_signal').length,
      unknownInventory: result.products.filter(p => p.stockConfidence === 'unknown').length,
      lowStockProducts: result.products
        .filter(p => p.isLowStock)
        .map(p => ({
          name: p.name,
          brand: p.brand,
          price: p.price,
          inventoryCount: p.inventoryCount,
          inventoryText: p.inventoryText,
        })),
      products: result.products.map(p => ({
        name: p.name,
        brand: p.brand,
        price: p.price,
        inventoryCount: p.inventoryCount,
        inventoryText: p.inventoryText,
        isLowStock: p.isLowStock,
        stockConfidence: p.stockConfidence,
      })),
    };

    const summaryPath = path.join(outputDir, `inventory-summary-${Date.now()}.json`);
    fs.writeFileSync(summaryPath, JSON.stringify(inventorySummary, null, 2));

    console.log('\n' + '='.repeat(70));
    console.log('INVENTORY EXTRACTION SUMMARY');
    console.log('='.repeat(70));
    
    console.log(`\nSuccess: ${result.success}`);
    console.log(`Blocked: ${result.blocked}`);
    console.log(`\nTotal Products: ${result.products.length}`);
    console.log(`  ├─ With exact inventory count: ${inventorySummary.withExactInventory}`);
    console.log(`  ├─ With low-stock signal: ${inventorySummary.withLowStockSignal}`);
    console.log(`  └─ Unknown inventory: ${inventorySummary.unknownInventory}`);

    if (inventorySummary.lowStockProducts.length > 0) {
      console.log('\n🔴 LOW STOCK PRODUCTS:');
      console.log('-'.repeat(50));
      for (const p of inventorySummary.lowStockProducts) {
        console.log(`  ${p.name}`);
        console.log(`    └─ Count: ${p.inventoryCount ?? 'signal only'} | "${p.inventoryText}"`);
      }
    } else {
      console.log('\n✅ No low-stock products detected on listing page');
      console.log('   (Inventory may be visible on product detail pages only)');
    }

    console.log('\n📊 ALL PRODUCTS WITH INVENTORY DATA:');
    console.log('-'.repeat(50));
    for (const p of result.products.slice(0, 10)) {
      const inv = p.inventoryCount !== null 
        ? `${p.inventoryCount} units`
        : (p.stockConfidence === 'low_signal' ? '⚠️ low signal' : '—');
      console.log(`  ${p.name.substring(0, 40).padEnd(40)} | ${inv}`);
    }
    if (result.products.length > 10) {
      console.log(`  ... and ${result.products.length - 10} more`);
    }

    console.log('\n' + '='.repeat(70));
    console.log(`Summary saved to: ${summaryPath}`);

  } catch (error: any) {
    console.error('Fatal error:', error);
  } finally {
    await scraper.close();
  }
}

main().catch(console.error);
