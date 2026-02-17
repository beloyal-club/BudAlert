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
            imageUrl: imageUrl
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
              imageUrl: null
            });
          });
        }

        return products;
      })()
    `);

    return extractedProducts as Product[];
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

// Main execution
async function main() {
  const outputDir = '/root/clawd/cannasignal/data/stealth-test';
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const scraper = new DutchieStealthScraper(outputDir);
  
  const testUrls = [
    'https://dutchie.com/dispensary/housing-works-cannabis-co',
    'https://conbud.com/stores/conbud-les/products/flower',
  ];

  console.log('='.repeat(60));
  console.log('Playwright Stealth Scraper - Dutchie Test (v2)');
  console.log('='.repeat(60));
  console.log(`Test URLs: ${testUrls.length}`);
  console.log(`Output directory: ${outputDir}`);
  console.log('Changes: domcontentloaded, age verification, better extraction');
  console.log('='.repeat(60));

  try {
    await scraper.launch();
    const results = await scraper.scrapeMultiple(testUrls);
    
    const resultsPath = path.join(outputDir, `results-${Date.now()}.json`);
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`\nResults saved to: ${resultsPath}`);

    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    
    for (const result of results) {
      console.log(`\n${result.url}`);
      console.log(`  Success: ${result.success}`);
      console.log(`  Blocked: ${result.blocked}${result.blockReason ? ` (${result.blockReason})` : ''}`);
      console.log(`  Products: ${result.products.length}`);
      if (result.products.length > 0) {
        console.log(`  Sample: ${result.products[0].name} - ${result.products[0].price}`);
      }
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
    }

  } catch (error: any) {
    console.error('Fatal error:', error);
  } finally {
    await scraper.close();
  }
}

main().catch(console.error);
