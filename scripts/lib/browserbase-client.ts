/**
 * BrowserBase Client - Reusable connection module
 * Provides Playwright browser sessions via BrowserBase cloud
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';

export interface BrowserBaseConfig {
  apiKey: string;
  projectId: string;
  timeout?: number;
}

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

const DEFAULT_CONFIG: BrowserBaseConfig = {
  apiKey: process.env.BROWSERBASE_API_KEY || 'bb_live_9DOgx7Trvyon7_zMAvtVxrpugDI',
  projectId: process.env.BROWSERBASE_PROJECT_ID || '5838b775-9417-42f0-b272-c0142eec43b7',
  timeout: 30000,
};

/**
 * Connect to BrowserBase and return a ready-to-use page
 */
export async function createBrowserSession(
  config: Partial<BrowserBaseConfig> = {}
): Promise<BrowserSession> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  const wsEndpoint = `wss://connect.browserbase.com?apiKey=${cfg.apiKey}&projectId=${cfg.projectId}`;
  
  console.log('[BB] Connecting to BrowserBase...');
  
  const browser = await chromium.connectOverCDP(wsEndpoint, {
    timeout: cfg.timeout,
  });
  
  // Get existing context or create new one
  const context = browser.contexts()[0] || await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  
  const page = await context.newPage();
  
  console.log('[BB] Connected successfully');
  
  return {
    browser,
    context,
    page,
    close: async () => {
      try {
        await page.close().catch(() => {});
        await context.close().catch(() => {});
        await browser.close().catch(() => {});
        console.log('[BB] Session closed');
      } catch (e) {
        // Ignore close errors
      }
    },
  };
}

/**
 * Navigate to a URL with retry logic
 */
export async function navigateWithRetry(
  page: Page,
  url: string,
  options: { maxRetries?: number; waitFor?: number } = {}
): Promise<void> {
  const { maxRetries = 3, waitFor = 5000 } = options;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[BB] Loading ${url} (attempt ${attempt}/${maxRetries})`);
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(waitFor);
      return;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.log(`[BB] Retry ${attempt} after error: ${(err as Error).message}`);
      await page.waitForTimeout(2000);
    }
  }
}

/**
 * Handle age verification modal if present
 */
export async function handleAgeVerification(page: Page): Promise<boolean> {
  const ageSelectors = [
    'button:has-text("Yes")',
    'button:has-text("I am 21")',
    'button:has-text("Enter")',
    '[data-testid="age-gate-yes"]',
    '.age-gate-yes',
    'button:has-text("21+")',
  ];
  
  for (const selector of ageSelectors) {
    try {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 1000 })) {
        console.log('[BB] Clicking age verification');
        await btn.click();
        await page.waitForTimeout(2000);
        return true;
      }
    } catch {
      // Continue trying
    }
  }
  
  return false;
}
