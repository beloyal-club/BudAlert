/**
 * Lightweight CDP (Chrome DevTools Protocol) Client for Cloudflare Workers
 * 
 * This is a minimal CDP implementation that works in Workers (no Node.js dependencies).
 * It connects to BrowserBase (or any CDP-compatible service) via WebSocket and
 * provides basic page automation: navigation, evaluation, screenshots.
 * 
 * CDP Protocol Reference: https://chromedevtools.github.io/devtools-protocol/
 */

export interface CDPClientOptions {
  /** WebSocket URL for CDP connection */
  wsUrl: string;
  /** Connection timeout in ms (default: 30000) */
  timeout?: number;
  /** Debug logging */
  debug?: boolean;
}

export interface CDPCommand {
  method: string;
  params?: Record<string, unknown>;
  sessionId?: string;
}

export interface CDPResponse<T = unknown> {
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: string };
}

export interface TargetInfo {
  targetId: string;
  type: string;
  title: string;
  url: string;
  attached: boolean;
  browserContextId?: string;
}

export interface PageNavigateResult {
  frameId: string;
  loaderId?: string;
  errorText?: string;
}

export interface RuntimeEvaluateResult {
  result: {
    type: string;
    value?: unknown;
    description?: string;
    objectId?: string;
  };
  exceptionDetails?: {
    text: string;
    exception?: { description: string };
  };
}

/**
 * Minimal CDP client for Cloudflare Workers
 * 
 * Usage:
 * ```ts
 * const client = new CDPClient({ wsUrl: 'wss://connect.browserbase.com?apiKey=...' });
 * await client.connect();
 * 
 * const page = await client.createPage();
 * await page.navigate('https://example.com');
 * const result = await page.evaluate('document.title');
 * await page.close();
 * 
 * await client.disconnect();
 * ```
 */
export class CDPClient {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pending = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private options: Required<CDPClientOptions>;
  private connected = false;
  private eventListeners = new Map<string, Set<(params: unknown) => void>>();

  constructor(options: CDPClientOptions) {
    this.options = {
      wsUrl: options.wsUrl,
      timeout: options.timeout ?? 30000,
      debug: options.debug ?? false,
    };
  }

  private log(...args: unknown[]) {
    if (this.options.debug) {
      console.log('[CDP]', ...args);
    }
  }

  /**
   * Connect to the CDP WebSocket endpoint
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`CDP connection timeout after ${this.options.timeout}ms`));
      }, this.options.timeout);

      this.log('Connecting to', this.options.wsUrl.replace(/apiKey=[^&]+/, 'apiKey=***'));

      // Use Cloudflare Workers WebSocket (via fetch upgrade)
      // For standard WebSocket environments:
      this.ws = new WebSocket(this.options.wsUrl);

      this.ws.addEventListener('open', () => {
        clearTimeout(timeout);
        this.connected = true;
        this.log('Connected');
        resolve();
      });

      this.ws.addEventListener('error', (event) => {
        clearTimeout(timeout);
        const error = new Error('CDP WebSocket error');
        this.log('WebSocket error:', event);
        reject(error);
      });

      this.ws.addEventListener('close', (event) => {
        this.connected = false;
        this.log('WebSocket closed:', event.code, event.reason);
        // Reject all pending requests
        for (const [id, { reject }] of this.pending) {
          reject(new Error(`WebSocket closed (${event.code}): ${event.reason}`));
          this.pending.delete(id);
        }
      });

      this.ws.addEventListener('message', (event) => {
        this.handleMessage(event.data);
      });
    });
  }

  private handleMessage(data: string | ArrayBuffer) {
    try {
      const message = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
      
      // Handle response to a command
      if ('id' in message) {
        const pending = this.pending.get(message.id);
        if (pending) {
          this.pending.delete(message.id);
          if (message.error) {
            pending.reject(new Error(`CDP Error ${message.error.code}: ${message.error.message}`));
          } else {
            pending.resolve(message.result);
          }
        }
      }
      
      // Handle events
      if ('method' in message && !('id' in message)) {
        this.log('Event:', message.method);
        const listeners = this.eventListeners.get(message.method);
        if (listeners) {
          for (const listener of listeners) {
            try {
              listener(message.params);
            } catch (e) {
              this.log('Event listener error:', e);
            }
          }
        }
      }
    } catch (e) {
      this.log('Failed to parse message:', e);
    }
  }

  /**
   * Send a CDP command and wait for response
   */
  async send<T = unknown>(command: CDPCommand): Promise<T> {
    if (!this.ws || !this.connected) {
      throw new Error('CDP not connected');
    }

    const id = ++this.messageId;
    const message = {
      id,
      method: command.method,
      params: command.params ?? {},
      ...(command.sessionId ? { sessionId: command.sessionId } : {}),
    };

    this.log('Send:', command.method, command.params);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timeout: ${command.method}`));
      }, this.options.timeout);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value as T);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.ws!.send(JSON.stringify(message));
    });
  }

  /**
   * Subscribe to CDP events
   */
  on(event: string, callback: (params: unknown) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * Unsubscribe from CDP events
   */
  off(event: string, callback: (params: unknown) => void): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  /**
   * Get list of available targets (pages/tabs)
   */
  async getTargets(): Promise<{ targetInfos: TargetInfo[] }> {
    return this.send({ method: 'Target.getTargets' });
  }

  /**
   * Create a new page/tab and return a CDPPage instance
   */
  async createPage(url = 'about:blank'): Promise<CDPPage> {
    // Create a new target (page)
    const { targetId } = await this.send<{ targetId: string }>({
      method: 'Target.createTarget',
      params: { url },
    });

    this.log('Created target:', targetId);

    // Attach to the target to get a session
    const { sessionId } = await this.send<{ sessionId: string }>({
      method: 'Target.attachToTarget',
      params: { targetId, flatten: true },
    });

    this.log('Attached to target, sessionId:', sessionId);

    // Enable necessary domains
    await this.send({ method: 'Page.enable', sessionId });
    await this.send({ method: 'Runtime.enable', sessionId });

    return new CDPPage(this, targetId, sessionId);
  }

  /**
   * Attach to an existing page target
   */
  async attachToPage(targetId: string): Promise<CDPPage> {
    const { sessionId } = await this.send<{ sessionId: string }>({
      method: 'Target.attachToTarget',
      params: { targetId, flatten: true },
    });

    await this.send({ method: 'Page.enable', sessionId });
    await this.send({ method: 'Runtime.enable', sessionId });

    return new CDPPage(this, targetId, sessionId);
  }

  /**
   * Get the first page target (usually the default tab)
   */
  async getFirstPage(): Promise<CDPPage | null> {
    const { targetInfos } = await this.getTargets();
    const pageTarget = targetInfos.find(t => t.type === 'page');
    if (!pageTarget) return null;
    return this.attachToPage(pageTarget.targetId);
  }

  /**
   * Disconnect from CDP
   */
  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }

  get isConnected(): boolean {
    return this.connected;
  }
}

/**
 * Represents a browser page/tab connected via CDP
 */
export class CDPPage {
  constructor(
    private client: CDPClient,
    private targetId: string,
    private sessionId: string
  ) {}

  /**
   * Navigate to a URL
   */
  async navigate(url: string, options?: { 
    waitUntil?: 'load' | 'domcontentloaded';
    timeout?: number;
  }): Promise<PageNavigateResult> {
    const result = await this.client.send<PageNavigateResult>({
      method: 'Page.navigate',
      params: { url },
      sessionId: this.sessionId,
    });

    if (result.errorText) {
      throw new Error(`Navigation failed: ${result.errorText}`);
    }

    // Wait for load event if requested
    if (options?.waitUntil === 'load') {
      await this.waitForLoadEvent(options.timeout);
    }

    return result;
  }

  /**
   * Wait for page load event
   */
  private async waitForLoadEvent(timeout = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.client.off('Page.loadEventFired', handler);
        reject(new Error('Timeout waiting for page load'));
      }, timeout);

      const handler = () => {
        clearTimeout(timeoutId);
        this.client.off('Page.loadEventFired', handler);
        resolve();
      };

      this.client.on('Page.loadEventFired', handler);
    });
  }

  /**
   * Wait for a specified time (simple delay)
   */
  async waitForTimeout(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Evaluate JavaScript in the page context
   */
  async evaluate<T = unknown>(expression: string): Promise<T> {
    const result = await this.client.send<RuntimeEvaluateResult>({
      method: 'Runtime.evaluate',
      params: {
        expression,
        returnByValue: true,
        awaitPromise: true,
      },
      sessionId: this.sessionId,
    });

    if (result.exceptionDetails) {
      const errorMsg = result.exceptionDetails.exception?.description || 
                       result.exceptionDetails.text;
      throw new Error(`Evaluation failed: ${errorMsg}`);
    }

    return result.result.value as T;
  }

  /**
   * Evaluate a function with serialized arguments
   */
  async evaluateFunction<T = unknown>(
    fn: (...args: unknown[]) => T,
    ...args: unknown[]
  ): Promise<T> {
    // Serialize the function and call it with args
    const serializedArgs = JSON.stringify(args);
    const expression = `(${fn.toString()}).apply(null, ${serializedArgs})`;
    return this.evaluate<T>(expression);
  }

  /**
   * Get page content (HTML)
   */
  async content(): Promise<string> {
    return this.evaluate<string>('document.documentElement.outerHTML');
  }

  /**
   * Get page title
   */
  async title(): Promise<string> {
    return this.evaluate<string>('document.title');
  }

  /**
   * Get current URL
   */
  async url(): Promise<string> {
    return this.evaluate<string>('window.location.href');
  }

  /**
   * Take a screenshot
   */
  async screenshot(options?: {
    format?: 'png' | 'jpeg' | 'webp';
    quality?: number;
    fullPage?: boolean;
  }): Promise<string> {
    const params: Record<string, unknown> = {
      format: options?.format ?? 'png',
    };

    if (options?.quality !== undefined) {
      params.quality = options.quality;
    }

    if (options?.fullPage) {
      // Get full page dimensions
      const metrics = await this.client.send<{
        cssContentSize: { width: number; height: number };
      }>({
        method: 'Page.getLayoutMetrics',
        sessionId: this.sessionId,
      });

      params.clip = {
        x: 0,
        y: 0,
        width: metrics.cssContentSize.width,
        height: metrics.cssContentSize.height,
        scale: 1,
      };
      params.captureBeyondViewport = true;
    }

    const result = await this.client.send<{ data: string }>({
      method: 'Page.captureScreenshot',
      params,
      sessionId: this.sessionId,
    });

    return result.data; // Base64-encoded image
  }

  /**
   * Set viewport size
   */
  async setViewport(width: number, height: number): Promise<void> {
    await this.client.send({
      method: 'Emulation.setDeviceMetricsOverride',
      params: {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      },
      sessionId: this.sessionId,
    });
  }

  /**
   * Click an element by selector
   */
  async click(selector: string): Promise<void> {
    // Use Runtime.evaluate to click the element
    await this.evaluate(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('Element not found: ${selector}');
      el.click();
    `);
  }

  /**
   * Type text into an input
   */
  async type(selector: string, text: string): Promise<void> {
    await this.evaluate(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('Element not found: ${selector}');
      el.focus();
      el.value = ${JSON.stringify(text)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    `);
  }

  /**
   * Wait for a selector to appear
   */
  async waitForSelector(
    selector: string, 
    options?: { timeout?: number; visible?: boolean }
  ): Promise<void> {
    const timeout = options?.timeout ?? 30000;
    const startTime = Date.now();
    const checkVisible = options?.visible ?? false;

    while (Date.now() - startTime < timeout) {
      const found = await this.evaluate<boolean>(`
        (() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return false;
          if (${checkVisible}) {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
          }
          return true;
        })()
      `);

      if (found) return;
      await this.waitForTimeout(100);
    }

    throw new Error(`Timeout waiting for selector: ${selector}`);
  }

  /**
   * Close the page
   */
  async close(): Promise<void> {
    await this.client.send({
      method: 'Target.closeTarget',
      params: { targetId: this.targetId },
    });
  }

  /**
   * Get the target ID
   */
  getTargetId(): string {
    return this.targetId;
  }

  /**
   * Get the session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }
}

/**
 * Create a BrowserBase session and get CDP connection URL
 * BrowserBase requires: 1) Create session via REST, 2) Connect to returned connectUrl
 */
async function createBrowserBaseSession(
  apiKey: string,
  projectId: string
): Promise<string> {
  const response = await fetch('https://www.browserbase.com/v1/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bb-api-key': apiKey,
    },
    body: JSON.stringify({ projectId }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`BrowserBase session creation failed: ${response.status} ${text}`);
  }

  const session = await response.json() as { connectUrl: string; id: string };
  if (!session.connectUrl) {
    throw new Error('BrowserBase session missing connectUrl');
  }

  console.log(`[CDP] BrowserBase session created: ${session.id}`);
  return session.connectUrl;
}

/**
 * Create a BrowserBase CDP client (legacy - use BrowserSession instead)
 */
export function createBrowserBaseClient(
  apiKey: string,
  projectId: string,
  options?: Omit<CDPClientOptions, 'wsUrl'>
): CDPClient {
  // This is now just a placeholder - actual connection happens in BrowserSession.init()
  const wsUrl = `wss://placeholder.browserbase.com`;
  return new CDPClient({ wsUrl, ...options });
}

/**
 * Higher-level browser abstraction for simple scraping tasks
 */
export class BrowserSession {
  private client: CDPClient | null = null;
  private page: CDPPage | null = null;
  private apiKey: string;
  private projectId: string;
  private debug: boolean;

  constructor(apiKey: string, projectId: string, debug = false) {
    this.apiKey = apiKey;
    this.projectId = projectId;
    this.debug = debug;
  }

  async init(): Promise<void> {
    // Step 1: Create BrowserBase session and get connectUrl
    const connectUrl = await createBrowserBaseSession(this.apiKey, this.projectId);
    
    // Step 2: Create CDP client with the actual connectUrl
    this.client = new CDPClient({ wsUrl: connectUrl, debug: this.debug });
    
    // Step 3: Connect via WebSocket
    await this.client.connect();
    
    // Step 4: Get the default page or create one
    this.page = await this.client.getFirstPage() || await this.client.createPage();
    await this.page.setViewport(1280, 800);
  }

  async goto(url: string): Promise<void> {
    if (!this.page || !this.client) throw new Error('Session not initialized');
    await this.page.navigate(url);
  }

  async waitForTimeout(ms: number): Promise<void> {
    if (!this.page || !this.client) throw new Error('Session not initialized');
    await this.page.waitForTimeout(ms);
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    if (!this.page || !this.client) throw new Error('Session not initialized');
    return this.page.evaluate<T>(expression);
  }

  async evaluateFunction<T = unknown>(
    fn: (...args: unknown[]) => T,
    ...args: unknown[]
  ): Promise<T> {
    if (!this.page || !this.client) throw new Error('Session not initialized');
    return this.page.evaluateFunction(fn, ...args);
  }

  async screenshot(options?: Parameters<CDPPage['screenshot']>[0]): Promise<string> {
    if (!this.page || !this.client) throw new Error('Session not initialized');
    return this.page.screenshot(options);
  }

  async close(): Promise<void> {
    if (this.page) {
      try {
        await this.page.close();
      } catch (e) {
        // Ignore close errors
      }
    }
    if (this.client) {
      await this.client.disconnect();
    }
  }

  getPage(): CDPPage | null {
    return this.page;
  }
}
