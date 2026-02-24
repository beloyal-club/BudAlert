var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// lib/cdp.ts
var CDPClient = class {
  static {
    __name(this, "CDPClient");
  }
  ws = null;
  messageId = 0;
  pending = /* @__PURE__ */ new Map();
  options;
  connected = false;
  eventListeners = /* @__PURE__ */ new Map();
  constructor(options) {
    this.options = {
      wsUrl: options.wsUrl,
      timeout: options.timeout ?? 3e4,
      debug: options.debug ?? false
    };
  }
  log(...args) {
    if (this.options.debug) {
      console.log("[CDP]", ...args);
    }
  }
  /**
   * Connect to the CDP WebSocket endpoint
   */
  async connect() {
    if (this.connected) return;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`CDP connection timeout after ${this.options.timeout}ms`));
      }, this.options.timeout);
      this.log("Connecting to", this.options.wsUrl.replace(/apiKey=[^&]+/, "apiKey=***"));
      this.ws = new WebSocket(this.options.wsUrl);
      this.ws.addEventListener("open", () => {
        clearTimeout(timeout);
        this.connected = true;
        this.log("Connected");
        resolve();
      });
      this.ws.addEventListener("error", (event) => {
        clearTimeout(timeout);
        const error = new Error("CDP WebSocket error");
        this.log("WebSocket error:", event);
        reject(error);
      });
      this.ws.addEventListener("close", (event) => {
        this.connected = false;
        this.log("WebSocket closed:", event.code, event.reason);
        for (const [id, { reject: reject2 }] of this.pending) {
          reject2(new Error(`WebSocket closed (${event.code}): ${event.reason}`));
          this.pending.delete(id);
        }
      });
      this.ws.addEventListener("message", (event) => {
        this.handleMessage(event.data);
      });
    });
  }
  handleMessage(data) {
    try {
      const message = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data));
      if ("id" in message) {
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
      if ("method" in message && !("id" in message)) {
        this.log("Event:", message.method);
        const listeners = this.eventListeners.get(message.method);
        if (listeners) {
          for (const listener of listeners) {
            try {
              listener(message.params);
            } catch (e) {
              this.log("Event listener error:", e);
            }
          }
        }
      }
    } catch (e) {
      this.log("Failed to parse message:", e);
    }
  }
  /**
   * Send a CDP command and wait for response
   */
  async send(command) {
    if (!this.ws || !this.connected) {
      throw new Error("CDP not connected");
    }
    const id = ++this.messageId;
    const message = {
      id,
      method: command.method,
      params: command.params ?? {},
      ...command.sessionId ? { sessionId: command.sessionId } : {}
    };
    this.log("Send:", command.method, command.params);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timeout: ${command.method}`));
      }, this.options.timeout);
      this.pending.set(id, {
        resolve: /* @__PURE__ */ __name((value) => {
          clearTimeout(timeout);
          resolve(value);
        }, "resolve"),
        reject: /* @__PURE__ */ __name((error) => {
          clearTimeout(timeout);
          reject(error);
        }, "reject")
      });
      this.ws.send(JSON.stringify(message));
    });
  }
  /**
   * Subscribe to CDP events
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, /* @__PURE__ */ new Set());
    }
    this.eventListeners.get(event).add(callback);
  }
  /**
   * Unsubscribe from CDP events
   */
  off(event, callback) {
    this.eventListeners.get(event)?.delete(callback);
  }
  /**
   * Get list of available targets (pages/tabs)
   */
  async getTargets() {
    return this.send({ method: "Target.getTargets" });
  }
  /**
   * Create a new page/tab and return a CDPPage instance
   */
  async createPage(url = "about:blank") {
    const { targetId } = await this.send({
      method: "Target.createTarget",
      params: { url }
    });
    this.log("Created target:", targetId);
    const { sessionId } = await this.send({
      method: "Target.attachToTarget",
      params: { targetId, flatten: true }
    });
    this.log("Attached to target, sessionId:", sessionId);
    await this.send({ method: "Page.enable", sessionId });
    await this.send({ method: "Runtime.enable", sessionId });
    return new CDPPage(this, targetId, sessionId);
  }
  /**
   * Attach to an existing page target
   */
  async attachToPage(targetId) {
    const { sessionId } = await this.send({
      method: "Target.attachToTarget",
      params: { targetId, flatten: true }
    });
    await this.send({ method: "Page.enable", sessionId });
    await this.send({ method: "Runtime.enable", sessionId });
    return new CDPPage(this, targetId, sessionId);
  }
  /**
   * Get the first page target (usually the default tab)
   */
  async getFirstPage() {
    const { targetInfos } = await this.getTargets();
    const pageTarget = targetInfos.find((t) => t.type === "page");
    if (!pageTarget) return null;
    return this.attachToPage(pageTarget.targetId);
  }
  /**
   * Disconnect from CDP
   */
  async disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }
  get isConnected() {
    return this.connected;
  }
};
var CDPPage = class {
  constructor(client, targetId, sessionId) {
    this.client = client;
    this.targetId = targetId;
    this.sessionId = sessionId;
  }
  static {
    __name(this, "CDPPage");
  }
  /**
   * Navigate to a URL
   */
  async navigate(url, options) {
    const result = await this.client.send({
      method: "Page.navigate",
      params: { url },
      sessionId: this.sessionId
    });
    if (result.errorText) {
      throw new Error(`Navigation failed: ${result.errorText}`);
    }
    if (options?.waitUntil === "load") {
      await this.waitForLoadEvent(options.timeout);
    }
    return result;
  }
  /**
   * Wait for page load event
   */
  async waitForLoadEvent(timeout = 3e4) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.client.off("Page.loadEventFired", handler);
        reject(new Error("Timeout waiting for page load"));
      }, timeout);
      const handler = /* @__PURE__ */ __name(() => {
        clearTimeout(timeoutId);
        this.client.off("Page.loadEventFired", handler);
        resolve();
      }, "handler");
      this.client.on("Page.loadEventFired", handler);
    });
  }
  /**
   * Wait for a specified time (simple delay)
   */
  async waitForTimeout(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  /**
   * Evaluate JavaScript in the page context
   */
  async evaluate(expression) {
    const result = await this.client.send({
      method: "Runtime.evaluate",
      params: {
        expression,
        returnByValue: true,
        awaitPromise: true
      },
      sessionId: this.sessionId
    });
    if (result.exceptionDetails) {
      const errorMsg = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
      throw new Error(`Evaluation failed: ${errorMsg}`);
    }
    return result.result.value;
  }
  /**
   * Evaluate a function with serialized arguments
   */
  async evaluateFunction(fn, ...args) {
    const serializedArgs = JSON.stringify(args);
    const expression = `(${fn.toString()}).apply(null, ${serializedArgs})`;
    return this.evaluate(expression);
  }
  /**
   * Get page content (HTML)
   */
  async content() {
    return this.evaluate("document.documentElement.outerHTML");
  }
  /**
   * Get page title
   */
  async title() {
    return this.evaluate("document.title");
  }
  /**
   * Get current URL
   */
  async url() {
    return this.evaluate("window.location.href");
  }
  /**
   * Take a screenshot
   */
  async screenshot(options) {
    const params = {
      format: options?.format ?? "png"
    };
    if (options?.quality !== void 0) {
      params.quality = options.quality;
    }
    if (options?.fullPage) {
      const metrics = await this.client.send({
        method: "Page.getLayoutMetrics",
        sessionId: this.sessionId
      });
      params.clip = {
        x: 0,
        y: 0,
        width: metrics.cssContentSize.width,
        height: metrics.cssContentSize.height,
        scale: 1
      };
      params.captureBeyondViewport = true;
    }
    const result = await this.client.send({
      method: "Page.captureScreenshot",
      params,
      sessionId: this.sessionId
    });
    return result.data;
  }
  /**
   * Set viewport size
   */
  async setViewport(width, height) {
    await this.client.send({
      method: "Emulation.setDeviceMetricsOverride",
      params: {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false
      },
      sessionId: this.sessionId
    });
  }
  /**
   * Click an element by selector
   */
  async click(selector) {
    await this.evaluate(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('Element not found: ${selector}');
      el.click();
    `);
  }
  /**
   * Type text into an input
   */
  async type(selector, text) {
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
  async waitForSelector(selector, options) {
    const timeout = options?.timeout ?? 3e4;
    const startTime = Date.now();
    const checkVisible = options?.visible ?? false;
    while (Date.now() - startTime < timeout) {
      const found = await this.evaluate(`
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
  async close() {
    await this.client.send({
      method: "Target.closeTarget",
      params: { targetId: this.targetId }
    });
  }
  /**
   * Get the target ID
   */
  getTargetId() {
    return this.targetId;
  }
  /**
   * Get the session ID
   */
  getSessionId() {
    return this.sessionId;
  }
};
async function createBrowserBaseSession(apiKey, projectId, options) {
  const body = { projectId };
  if (options?.proxies) {
    body.proxies = true;
    console.log("[CDP] Residential proxies ENABLED");
  }
  if (options?.proxyGeolocation) {
    body.browserSettings = {
      ...body.browserSettings || {},
      proxy: {
        geolocation: options.proxyGeolocation
      }
    };
    console.log(`[CDP] Proxy geolocation: ${options.proxyGeolocation}`);
  }
  if (options?.stealth !== false && options?.proxies) {
    console.log("[CDP] Stealth mode: auto-enabled with proxies");
  }
  if (options?.fingerprintId) {
    body.fingerprint = { id: options.fingerprintId };
    console.log(`[CDP] Using fingerprint: ${options.fingerprintId}`);
  }
  const response = await fetch("https://www.browserbase.com/v1/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bb-api-key": apiKey
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`BrowserBase session creation failed: ${response.status} ${text}`);
  }
  const session = await response.json();
  if (!session.connectUrl) {
    throw new Error("BrowserBase session missing connectUrl");
  }
  console.log(`[CDP] BrowserBase session created: ${session.id}${options?.proxies ? " (with residential proxy)" : ""}`);
  return session.connectUrl;
}
__name(createBrowserBaseSession, "createBrowserBaseSession");
var BrowserSession = class {
  static {
    __name(this, "BrowserSession");
  }
  client = null;
  page = null;
  apiKey;
  projectId;
  options;
  constructor(apiKey, projectId, options = false) {
    this.apiKey = apiKey;
    this.projectId = projectId;
    this.options = typeof options === "boolean" ? { debug: options } : options;
  }
  async init() {
    const connectUrl = await createBrowserBaseSession(this.apiKey, this.projectId, {
      proxies: this.options.proxies,
      proxyGeolocation: this.options.proxyGeolocation,
      fingerprintId: this.options.fingerprintId
    });
    this.client = new CDPClient({ wsUrl: connectUrl, debug: this.options.debug ?? false });
    await this.client.connect();
    this.page = await this.client.getFirstPage() || await this.client.createPage();
    await this.page.setViewport(1280, 800);
  }
  async goto(url) {
    if (!this.page || !this.client) throw new Error("Session not initialized");
    await this.page.navigate(url);
  }
  async waitForTimeout(ms) {
    if (!this.page || !this.client) throw new Error("Session not initialized");
    await this.page.waitForTimeout(ms);
  }
  async evaluate(expression) {
    if (!this.page || !this.client) throw new Error("Session not initialized");
    return this.page.evaluate(expression);
  }
  async evaluateFunction(fn, ...args) {
    if (!this.page || !this.client) throw new Error("Session not initialized");
    return this.page.evaluateFunction(fn, ...args);
  }
  async screenshot(options) {
    if (!this.page || !this.client) throw new Error("Session not initialized");
    return this.page.screenshot(options);
  }
  async close() {
    if (this.page) {
      try {
        await this.page.close();
      } catch (e) {
      }
    }
    if (this.client) {
      await this.client.disconnect();
    }
  }
  getPage() {
    return this.page;
  }
  /**
   * Get the underlying CDP client for advanced operations (e.g., creating multiple pages)
   */
  getClient() {
    return this.client;
  }
  /**
   * Create additional pages for parallel operations
   */
  async createPage(url = "about:blank") {
    if (!this.client) throw new Error("Session not initialized");
    const page = await this.client.createPage(url);
    await page.setViewport(1280, 800);
    return page;
  }
};

// lib/retry.ts
var DEFAULT_OPTIONS = {
  maxRetries: 3,
  baseDelayMs: 1e3,
  maxDelayMs: 3e4,
  backoffMultiplier: 2,
  retryableErrors: ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "fetch failed", "timeout"]
};
function calculateDelay(attempt, options) {
  const exponentialDelay = options.baseDelayMs * Math.pow(options.backoffMultiplier, attempt - 1);
  const jitter = Math.random() * 0.3 * exponentialDelay;
  return Math.min(exponentialDelay + jitter, options.maxDelayMs);
}
__name(calculateDelay, "calculateDelay");
function isRetryable(error, options) {
  const errorStr = error.message.toLowerCase();
  if (errorStr.includes("429") || errorStr.includes("503") || errorStr.includes("502")) {
    return true;
  }
  return options.retryableErrors?.some(
    (pattern) => errorStr.includes(pattern.toLowerCase())
  ) ?? false;
}
__name(isRetryable, "isRetryable");
async function withRetry(fn, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError = null;
  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt > opts.maxRetries;
      const canRetry = !isLastAttempt && isRetryable(lastError, opts);
      if (!canRetry) throw lastError;
      const delay = calculateDelay(attempt, opts);
      opts.onRetry?.(attempt, lastError, delay);
      await sleep(delay);
    }
  }
  throw lastError;
}
__name(withRetry, "withRetry");
async function fetchWithRetry(url, init, options = {}) {
  const { timeoutMs = 3e4, ...fetchInit } = init || {};
  return withRetry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...fetchInit, signal: controller.signal });
      if (response.status >= 500 || response.status === 429) {
        const text = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
      }
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }, options);
}
__name(fetchWithRetry, "fetchWithRetry");
var circuits = /* @__PURE__ */ new Map();
function withCircuitBreaker(key, fn, options = {
  failureThreshold: 5,
  resetTimeMs: 6e4,
  halfOpenRequests: 1
}) {
  let circuit = circuits.get(key);
  if (!circuit) {
    circuit = { failures: 0, lastFailure: 0, state: "closed" };
    circuits.set(key, circuit);
  }
  const now = Date.now();
  if (circuit.state === "open" && now - circuit.lastFailure > options.resetTimeMs) {
    circuit.state = "half-open";
    circuit.failures = 0;
  }
  if (circuit.state === "open") {
    throw new Error(`Circuit breaker open for ${key}. Will retry after ${Math.round((options.resetTimeMs - (now - circuit.lastFailure)) / 1e3)}s`);
  }
  return fn().then((result) => {
    circuit.failures = 0;
    circuit.state = "closed";
    return result;
  }).catch((error) => {
    circuit.failures++;
    circuit.lastFailure = now;
    if (circuit.failures >= options.failureThreshold) {
      circuit.state = "open";
      console.error(`[CircuitBreaker] ${key} opened after ${circuit.failures} failures`);
    }
    throw error;
  });
}
__name(withCircuitBreaker, "withCircuitBreaker");
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
__name(sleep, "sleep");

// lib/platforms/tymber.ts
var TYMBER_URL_PATTERNS = [
  /hwcannabis\.co/i,
  /\.tymber\.me/i,
  /tymber\.io/i
];
var TYMBER_HTML_SIGNATURES = [
  "ecom-api.blaze.me",
  "tymber-s3.imgix.net",
  "tymber-blaze-products.imgix.net",
  '"siteGroupName":"tymber-'
];
function isTymberSite(url, html) {
  for (const pattern of TYMBER_URL_PATTERNS) {
    if (pattern.test(url)) return true;
  }
  if (html) {
    for (const sig of TYMBER_HTML_SIGNATURES) {
      if (html.includes(sig)) return true;
    }
  }
  return false;
}
__name(isTymberSite, "isTymberSite");
function extractTymberSSRData(html) {
  const products = [];
  const match = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
  if (!match) {
    console.log("[Tymber] No __NEXT_DATA__ found in HTML");
    return products;
  }
  try {
    const data = JSON.parse(match[1]);
    const pageProps = data?.props?.pageProps;
    if (!pageProps) {
      console.log("[Tymber] No pageProps in __NEXT_DATA__");
      return products;
    }
    const showcasedGroups = pageProps?.showcasedGroups?.data || pageProps?.homeData?.showcasedGroups || [];
    for (const group of showcasedGroups) {
      const groupProducts = group?.products?.data?.objects || [];
      products.push(...groupProducts);
    }
    const deals = pageProps?.deals;
    if (Array.isArray(deals)) {
      for (const deal of deals) {
        const dealProducts = deal?.products || [];
        products.push(...dealProducts);
      }
    }
    const searchProducts = pageProps?.products?.data?.objects || [];
    products.push(...searchProducts);
    console.log(`[Tymber] Extracted ${products.length} products from SSR data`);
  } catch (error) {
    console.error("[Tymber] Failed to parse __NEXT_DATA__:", error);
  }
  return products;
}
__name(extractTymberSSRData, "extractTymberSSRData");
function mapTymberToScrapedProduct(raw, sourceUrl) {
  const attrs = raw.attributes || {};
  const rels = raw.relationships || {};
  const priceInCents = attrs.unit_price?.amount || 0;
  const price = priceInCents / 100;
  const quantity = typeof attrs.pos_inventory === "number" ? attrs.pos_inventory : null;
  let quantityWarning = null;
  if (quantity !== null && quantity > 0 && quantity <= 5) {
    quantityWarning = `Only ${quantity} left`;
  } else if (quantity === 0 || !attrs.in_stock) {
    quantityWarning = "Out of stock";
  }
  return {
    rawProductName: attrs.name || "Unknown",
    rawBrandName: rels.brand?.data?.attributes?.name || "Unknown",
    rawCategory: rels.category?.data?.attributes?.name,
    price,
    originalPrice: attrs.discount_price ? price : void 0,
    inStock: attrs.in_stock ?? (quantity !== null && quantity > 0),
    quantity,
    quantityWarning,
    quantitySource: "tymber_ssr",
    imageUrl: attrs.main_image,
    thcFormatted: attrs.thc ? `${attrs.thc.amount}${attrs.thc.units}` : void 0,
    cbdFormatted: attrs.cbd ? `${attrs.cbd.amount}${attrs.cbd.units}` : void 0,
    sourceUrl,
    sourcePlatform: "tymber",
    scrapedAt: Date.now(),
    productUrl: attrs.store_url
  };
}
__name(mapTymberToScrapedProduct, "mapTymberToScrapedProduct");
function scrapeTymberProducts(html, sourceUrl) {
  const rawProducts = extractTymberSSRData(html);
  return rawProducts.map((raw) => mapTymberToScrapedProduct(raw, sourceUrl));
}
__name(scrapeTymberProducts, "scrapeTymberProducts");
async function fetchAndScrapeTymber(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; CannaSignal/1.0)",
      "Accept": "text/html"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  const html = await response.text();
  return scrapeTymberProducts(html, url);
}
__name(fetchAndScrapeTymber, "fetchAndScrapeTymber");

// lib/platforms/leafbridge.ts
var LEAFBRIDGE_URL_PATTERNS = [
  /altadispensary\.nyc/i
];
var LEAFBRIDGE_HTML_SIGNATURES = [
  "leafbridge_product_card",
  "/plugins/leafbridge/",
  "leafbridge_public_ajax_obj"
];
function isLeafBridgeSite(url, html) {
  for (const pattern of LEAFBRIDGE_URL_PATTERNS) {
    if (pattern.test(url)) return true;
  }
  if (html) {
    for (const sig of LEAFBRIDGE_HTML_SIGNATURES) {
      if (html.includes(sig)) return true;
    }
  }
  return false;
}
__name(isLeafBridgeSite, "isLeafBridgeSite");
var LEAFBRIDGE_WAIT_SELECTOR = ".leafbridge_product_card";
var LEAFBRIDGE_AJAX_WAIT_MS = 5e3;
function extractLeafBridgeProductsFromDOM(sourceUrl, timestamp) {
  const products = [];
  let cards = document.querySelectorAll(".leafbridge_product_card");
  if (cards.length === 0) {
    cards = document.querySelectorAll('[class*="leafbridge"][class*="product"]');
  }
  console.log(`[LeafBridge] Found ${cards.length} product cards`);
  cards.forEach((card) => {
    try {
      const nameEl = card.querySelector('.leafbridge_product_name, [class*="product_name"]');
      const name = nameEl?.textContent?.trim();
      if (!name || name.length < 2) return;
      const brandEl = card.querySelector('.leafbridge_brand_name, [class*="brand_name"]');
      const brand = brandEl?.textContent?.trim() || "Unknown";
      const priceEl = card.querySelector('.leafbridge_product_price, [class*="price"]');
      const priceText = priceEl?.textContent || "";
      const priceMatch = priceText.match(/\$?(\d+(?:\.\d{1,2})?)/);
      const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
      if (price <= 0) return;
      const soldOut = !!card.querySelector('.add_to_cart_soldout, [class*="soldout"], [class*="sold-out"]');
      const qtyInput = card.querySelector('input[type="number"]');
      let quantity = null;
      let quantityWarning = null;
      let quantitySource = "none";
      if (qtyInput && qtyInput.max) {
        const maxVal = parseInt(qtyInput.max, 10);
        if (maxVal > 0 && maxVal < 100) {
          quantity = maxVal;
          quantitySource = "leafbridge_input_max";
          if (maxVal <= 5) {
            quantityWarning = `Only ${maxVal} left`;
          }
        }
      }
      const lowStockEl = card.querySelector('.add_to_cart_warning, [class*="low-stock"], [class*="warning"]');
      if (lowStockEl && !quantityWarning) {
        const warningText = lowStockEl.textContent?.trim() || "";
        if (warningText) {
          quantityWarning = warningText;
          const numMatch = warningText.match(/(\d+)/);
          if (numMatch && quantity === null) {
            quantity = parseInt(numMatch[1], 10);
            quantitySource = "warning_text";
          }
        }
      }
      if (soldOut) {
        quantity = 0;
        quantityWarning = "Sold out";
        quantitySource = "sold_out_class";
      }
      const categoryEl = card.querySelector('[class*="category"]');
      const rawCategory = categoryEl?.textContent?.trim();
      products.push({
        rawProductName: name,
        rawBrandName: brand,
        rawCategory,
        price,
        inStock: !soldOut,
        quantity,
        quantityWarning,
        quantitySource,
        sourceUrl,
        sourcePlatform: "leafbridge",
        scrapedAt: timestamp
      });
    } catch (e) {
      console.log("[LeafBridge] Error parsing card:", e);
    }
  });
  return products;
}
__name(extractLeafBridgeProductsFromDOM, "extractLeafBridgeProductsFromDOM");

// cron/index.ts
async function createPagePool(session, count) {
  const pages = [];
  const mainPage = session.getPage();
  if (mainPage) {
    pages.push(mainPage);
  }
  for (let i = pages.length; i < count; i++) {
    try {
      const page = await session.createPage();
      pages.push(page);
      console.log(`[Cron] Created parallel page ${i + 1}/${count}`);
    } catch (error) {
      console.log(`[Cron] Failed to create page ${i + 1}/${count}: ${error instanceof Error ? error.message : "Unknown"}`);
      break;
    }
  }
  console.log(`[Cron] Page pool ready: ${pages.length} concurrent pages`);
  return { pages, session };
}
__name(createPagePool, "createPagePool");
async function closePagePool(pool) {
  for (let i = 1; i < pool.pages.length; i++) {
    try {
      await pool.pages[i].close();
    } catch {
    }
  }
}
__name(closePagePool, "closePagePool");
async function processProductsInParallel(products, pool, extractFn, cartHackFn, enableCartHack, maxCartHackAttempts, inventoryStats) {
  const batchSize = pool.pages.length;
  let cartHackAttempts = 0;
  for (let batchStart = 0; batchStart < products.length; batchStart += batchSize) {
    const batch = products.slice(batchStart, batchStart + batchSize);
    const batchPromises = batch.map(async (product, batchIdx) => {
      if (!product.productUrl) return;
      const page = pool.pages[batchIdx];
      if (!page) return;
      try {
        inventoryStats.checked++;
        await page.navigate(product.productUrl);
        await page.waitForTimeout(PAGE_RENDER_WAIT_MS);
        const detailData = await page.evaluateFunction(extractFn);
        if (detailData.quantity !== null) {
          product.quantity = detailData.quantity;
          product.quantityWarning = detailData.quantityWarning;
          product.quantitySource = detailData.quantitySource;
          product.inStock = detailData.inStock;
          inventoryStats.found++;
          console.log(`[Cron] \u2713 ${product.rawProductName.slice(0, 30)}: ${detailData.quantity} left`);
        } else if (enableCartHack && cartHackAttempts < maxCartHackAttempts) {
          cartHackAttempts++;
          await page.waitForTimeout(500);
          const cartResult = await page.evaluateFunction(cartHackFn);
          if (cartResult.success && cartResult.quantity !== null) {
            product.quantity = cartResult.quantity;
            product.quantityWarning = cartResult.quantityWarning;
            product.quantitySource = "cart_hack";
            inventoryStats.found++;
            console.log(`[Cron] \u2713 ${product.rawProductName.slice(0, 30)}: ${cartResult.quantity} via cart`);
          }
        }
      } catch (detailError) {
        console.log(`[Cron] \u2717 ${product.rawProductName.slice(0, 25)}: ${detailError instanceof Error ? detailError.message.slice(0, 40) : "Error"}`);
      }
    });
    await Promise.all(batchPromises);
    if (batchStart + batchSize < products.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }
}
__name(processProductsInParallel, "processProductsInParallel");
var MAX_DETAIL_PAGE_VISITS_PER_LOCATION = 40;
var PARALLEL_PAGE_COUNT = 4;
var DETAIL_PAGE_TIMEOUT_MS = 4e3;
var PAGE_RENDER_WAIT_MS = 1500;
var BATCH_DELAY_MS = 500;
var ENABLE_CART_HACK_FALLBACK = true;
var MAX_CART_HACK_ATTEMPTS = 3;
var EMBEDDED_LOCATIONS = [
  // ============================================================
  // VERIFIED WORKING (4 sites, ~156 products)
  // ============================================================
  // Dagmar (1 location) ✅ VERIFIED - WordPress Joint-Dutchie plugin
  { name: "Dagmar Cannabis SoHo", menuUrl: "https://dagmarcannabis.com/menu/", retailerSlug: "dagmar-cannabis-soho", retailerName: "Dagmar Cannabis", address: { street: "412 W Broadway", city: "New York", state: "NY" }, region: "nyc" },
  // Strain Stars (1 active location) ✅ VERIFIED - Custom embedded
  { name: "Strain Stars Farmingdale", menuUrl: "https://strainstarsny.com/menu/", retailerSlug: "strain-stars-farmingdale", retailerName: "Strain Stars", address: { street: "1815 Broadhollow Rd", city: "Farmingdale", state: "NY" }, region: "long_island" },
  { name: "Strain Stars Riverhead", menuUrl: "https://strainstarsny.com/menu/", retailerSlug: "strain-stars-riverhead", retailerName: "Strain Stars", address: { street: "1871 Old Country Rd", city: "Riverhead", state: "NY" }, region: "long_island", disabled: true, disabledReason: "shared-url-no-selector" },
  // Travel Agency (1 location) ✅ VERIFIED - SSR custom frontend
  { name: "Travel Agency Union Square", menuUrl: "https://www.thetravelagency.co/menu/", retailerSlug: "travel-agency-union-square", retailerName: "The Travel Agency", address: { street: "835 Broadway", city: "New York", state: "NY" }, region: "nyc" },
  // Alta (1 location) ✅ VERIFIED - LeafBridge platform (not Dutchie!)
  // Added by scraper loop SCRAPE-006
  { name: "Alta Lower Manhattan", menuUrl: "https://altadispensary.nyc/", retailerSlug: "alta-lower-manhattan", retailerName: "Alta Dispensary", address: { street: "52 Kenmare St A", city: "New York", state: "NY", zip: "10012" }, region: "nyc" },
  // ============================================================
  // PENDING - Needs custom selectors
  // ============================================================
  // Housing Works - Tymber platform (SSR, products in HTML)
  // Uses different selectors than Dutchie: [class*='product-card__name'], [class*='product-card__brand-name']
  // Re-enabled to test with residential proxies - may need custom scraper
  { name: "Housing Works Cannabis", menuUrl: "https://hwcannabis.co/menu/broadway/", retailerSlug: "housing-works-cannabis", retailerName: "Housing Works Cannabis", address: { street: "750 Broadway", city: "New York", state: "NY" }, region: "nyc" },
  // Smacked - Re-enabled to test with residential proxies
  { name: "Smacked Village", menuUrl: "https://getsmacked.online/menu/", retailerSlug: "smacked-village", retailerName: "Get Smacked", address: { street: "144 Bleecker St", city: "New York", state: "NY" }, region: "nyc" },
  // ============================================================
  // RE-ENABLED WITH RESIDENTIAL PROXIES (2026-02-24)
  // BrowserBase proxies=true bypasses datacenter IP detection
  // ============================================================
  // CONBUD (3 locations) - Major NYC retailer, re-enabled with residential proxies
  { name: "CONBUD LES", menuUrl: "https://conbud.com/stores/conbud-les/products", retailerSlug: "conbud-les", retailerName: "CONBUD", address: { street: "88 E Houston St", city: "New York", state: "NY" }, region: "nyc" },
  { name: "CONBUD Bronx", menuUrl: "https://conbud.com/stores/conbud-bronx/products", retailerSlug: "conbud-bronx", retailerName: "CONBUD", address: { city: "Bronx", state: "NY" }, region: "nyc" },
  { name: "CONBUD Yankee Stadium", menuUrl: "https://conbud.com/stores/conbud-yankee-stadium/products", retailerSlug: "conbud-yankee-stadium", retailerName: "CONBUD", address: { city: "Bronx", state: "NY" }, region: "nyc" },
  // Gotham (1 active + 3 shared-URL) - Major NYC retailer, re-enabled with residential proxies
  { name: "Gotham Bowery", menuUrl: "https://gotham.nyc/menu/", retailerSlug: "gotham-bowery", retailerName: "Gotham", address: { street: "3 E 3rd St", city: "New York", state: "NY" }, region: "nyc" },
  { name: "Gotham Hudson", menuUrl: "https://gotham.nyc/menu/", retailerSlug: "gotham-hudson", retailerName: "Gotham", address: { street: "260 Warren St", city: "Hudson", state: "NY" }, region: "hudson_valley", disabled: true, disabledReason: "shared-url-no-selector" },
  { name: "Gotham Williamsburg", menuUrl: "https://gotham.nyc/menu/", retailerSlug: "gotham-williamsburg", retailerName: "Gotham", address: { street: "300 Kent Ave", city: "Brooklyn", state: "NY" }, region: "nyc", disabled: true, disabledReason: "shared-url-no-selector" },
  { name: "Gotham Chelsea", menuUrl: "https://gotham.nyc/menu/", retailerSlug: "gotham-chelsea", retailerName: "Gotham", address: { street: "146 10th Ave", city: "New York", state: "NY" }, region: "nyc", disabled: true, disabledReason: "shared-url-no-selector" },
  // ============================================================
  // BROKEN URLs (404 / offline)
  // ============================================================
  // Just Breathe - Syracuse & Binghamton return 404
  { name: "Just Breathe Syracuse", menuUrl: "https://justbreathelife.org/menu/", retailerSlug: "just-breathe-syracuse", retailerName: "Just Breathe", address: { street: "185 W Seneca St", city: "Manlius", state: "NY" }, region: "upstate", disabled: true, disabledReason: "url-404" },
  { name: "Just Breathe Binghamton", menuUrl: "https://justbreathelife.org/menu/", retailerSlug: "just-breathe-binghamton", retailerName: "Just Breathe", address: { street: "75 Court St", city: "Binghamton", state: "NY" }, region: "upstate", disabled: true, disabledReason: "url-404" },
  { name: "Just Breathe Finger Lakes", menuUrl: "https://justbreatheflx.com/", retailerSlug: "just-breathe-finger-lakes", retailerName: "Just Breathe", address: { street: "2988 US Route 20", city: "Seneca Falls", state: "NY" }, region: "upstate", disabled: true, disabledReason: "needs-verification" }
];
function getActiveLocations() {
  return EMBEDDED_LOCATIONS.filter((l) => !l.disabled);
}
__name(getActiveLocations, "getActiveLocations");
var USE_RESIDENTIAL_PROXIES = true;
async function createBrowserSession(env) {
  return withCircuitBreaker("browserbase", async () => {
    return withRetry(
      async () => {
        console.log(`[Cron] Connecting to BrowserBase via CDP... (proxies: ${USE_RESIDENTIAL_PROXIES ? "RESIDENTIAL" : "datacenter"})`);
        const session = new BrowserSession(
          env.BROWSERBASE_API_KEY,
          env.BROWSERBASE_PROJECT_ID,
          {
            debug: false,
            proxies: USE_RESIDENTIAL_PROXIES,
            proxyGeolocation: "US-NY"
            // New York for NYC dispensaries
          }
        );
        await session.init();
        console.log("[Cron] Connected to BrowserBase");
        return session;
      },
      {
        maxRetries: 3,
        baseDelayMs: 2e3,
        onRetry: /* @__PURE__ */ __name((attempt, error, delay) => {
          console.log(`[Cron] BrowserBase retry ${attempt}: ${error.message}, waiting ${delay}ms`);
        }, "onRetry")
      }
    );
  }, {
    failureThreshold: 3,
    resetTimeMs: 12e4,
    // 2 minutes before retry after circuit opens
    halfOpenRequests: 1
  });
}
__name(createBrowserSession, "createBrowserSession");
function extractProductUrls() {
  const productLinks = [];
  const seen = /* @__PURE__ */ new Set();
  const productLinkEls = document.querySelectorAll('a[href*="/product/"]');
  productLinkEls.forEach((link) => {
    const href = link.href;
    if (href && !seen.has(href) && href.includes("/product/") && !href.includes("/products/")) {
      seen.add(href);
      const text = link.textContent?.trim() || link.closest("div")?.querySelector('h2, h3, [class*="name"], [class*="Name"]')?.textContent?.trim() || "";
      if (text.length > 2 || href.length > 50) {
        productLinks.push({ name: text || "Unknown", url: href });
      }
    }
  });
  if (productLinks.length === 0) {
    const cards = document.querySelectorAll('[data-testid="product-card"], [class*="ProductCard"], [class*="product-card"]');
    cards.forEach((card) => {
      const link = card.querySelector('a[href*="/product/"]');
      if (link && link.href && !seen.has(link.href) && !link.href.includes("/products/")) {
        seen.add(link.href);
        const name = card.querySelector('h2, h3, [class*="productName"]')?.textContent?.trim() || "";
        productLinks.push({ name: name || "Unknown", url: link.href });
      }
    });
  }
  return productLinks;
}
__name(extractProductUrls, "extractProductUrls");
function extractInventoryFromDetailPage() {
  const bodyText = document.body.innerText || "";
  const stockPatterns = [
    /(\d+)\s*left/i,
    /only\s*(\d+)\s*left/i,
    /(\d+)\s*left\s*in\s*stock/i,
    /(\d+)\s*remaining/i,
    /(\d+)\s*available/i,
    /(\d+)\s*in\s*stock/i,
    /hurry[,!]?\s*only\s*(\d+)/i,
    /limited[:\s]*(\d+)/i,
    /low\s*stock[:\s]*(\d+)/i
  ];
  let quantity = null;
  let quantityWarning = null;
  let quantitySource = "none";
  for (const pattern of stockPatterns) {
    const match = bodyText.match(pattern);
    if (match) {
      quantity = parseInt(match[1], 10);
      quantityWarning = match[0].trim();
      quantitySource = "text_pattern";
      break;
    }
  }
  const outOfStockPatterns = [
    /out\s*of\s*stock/i,
    /sold\s*out/i,
    /unavailable/i,
    /not\s*available/i
  ];
  let inStock = true;
  for (const pattern of outOfStockPatterns) {
    if (pattern.test(bodyText)) {
      inStock = false;
      quantity = 0;
      quantityWarning = "Out of stock";
      quantitySource = "text_pattern";
      break;
    }
  }
  const nameEl = document.querySelector('h1, [class*="ProductName"], [class*="product-name"], [class*="productTitle"]');
  const productName = nameEl?.textContent?.trim() || null;
  let price = null;
  const priceMatch = bodyText.match(/\$(\d+(?:\.\d{1,2})?)/);
  if (priceMatch) {
    price = parseFloat(priceMatch[1]);
  }
  let thcFormatted = null;
  const thcMatch = bodyText.match(/THC[:\s]*(\d+(?:\.\d+)?)\s*%/i);
  if (thcMatch) {
    thcFormatted = `${thcMatch[1]}%`;
  }
  return {
    quantity,
    quantityWarning,
    quantitySource,
    productName,
    price,
    thcFormatted,
    inStock
  };
}
__name(extractInventoryFromDetailPage, "extractInventoryFromDetailPage");
function attemptCartHack() {
  const addButtons = document.querySelectorAll(
    "button:not([disabled])"
  );
  let addButton = null;
  addButtons.forEach((btn) => {
    const text = btn.textContent?.toLowerCase() || "";
    if (text.includes("add") && (text.includes("cart") || text.includes("bag") || btn.textContent?.length < 20)) {
      addButton = btn;
    }
  });
  if (!addButton) {
    return { quantity: null, quantityWarning: null, success: false };
  }
  const qtyInput = document.querySelector('input[type="number"], input[name*="qty"], input[name*="quantity"]');
  if (qtyInput) {
    const originalValue = qtyInput.value;
    qtyInput.value = "999";
    qtyInput.dispatchEvent(new Event("input", { bubbles: true }));
    qtyInput.dispatchEvent(new Event("change", { bubbles: true }));
    const pageText = document.body.innerText || "";
    const limitPatterns = [
      /max(?:imum)?\s*(?:of\s*)?(\d+)/i,
      /limit(?:ed)?\s*(?:to\s*)?(\d+)/i,
      /only\s*(\d+)\s*(?:available|remaining|left)/i,
      /cannot\s*add\s*more\s*than\s*(\d+)/i,
      /(\d+)\s*(?:items?\s*)?(?:maximum|max|limit)/i
    ];
    for (const pattern of limitPatterns) {
      const match = pageText.match(pattern);
      if (match) {
        qtyInput.value = originalValue;
        return {
          quantity: parseInt(match[1], 10),
          quantityWarning: match[0].trim(),
          success: true
        };
      }
    }
    const correctedValue = parseInt(qtyInput.value, 10);
    if (correctedValue > 0 && correctedValue < 999) {
      qtyInput.value = originalValue;
      return {
        quantity: correctedValue,
        quantityWarning: `Max quantity: ${correctedValue}`,
        success: true
      };
    }
    qtyInput.value = originalValue;
  }
  const maxAttr = qtyInput?.max;
  if (maxAttr) {
    const maxVal = parseInt(maxAttr, 10);
    if (maxVal > 0 && maxVal < 100) {
      return {
        quantity: maxVal,
        quantityWarning: `Max: ${maxVal}`,
        success: true
      };
    }
  }
  const qtySelect = document.querySelector('select[name*="qty"], select[name*="quantity"]');
  if (qtySelect && qtySelect.options.length > 0) {
    const options = Array.from(qtySelect.options).map((o) => parseInt(o.value, 10)).filter((n) => !isNaN(n) && n > 0);
    if (options.length > 0) {
      const maxOption = Math.max(...options);
      if (maxOption < 50) {
        return {
          quantity: maxOption,
          quantityWarning: `Max qty: ${maxOption}`,
          success: true
        };
      }
    }
  }
  return { quantity: null, quantityWarning: null, success: false };
}
__name(attemptCartHack, "attemptCartHack");
function extractProducts(sourceUrl, timestamp) {
  const items = [];
  const selectors = [
    '[data-testid="product-card"]',
    ".product-card",
    '[class*="ProductCard"]',
    '[class*="product-card"]',
    'div[class*="styles_productCard"]'
  ];
  let productCards = [];
  for (const selector of selectors) {
    const found = document.querySelectorAll(selector);
    if (found.length > 0) {
      productCards = Array.from(found);
      break;
    }
  }
  if (productCards.length === 0) {
    const priceEls = document.querySelectorAll('[class*="price"], [class*="Price"]');
    const seen = /* @__PURE__ */ new Set();
    priceEls.forEach((priceEl) => {
      const card = priceEl.closest("a") || priceEl.closest('div[class*="product"]') || priceEl.parentElement?.parentElement;
      if (card && !seen.has(card)) {
        seen.add(card);
        productCards.push(card);
      }
    });
  }
  productCards.forEach((card) => {
    try {
      const nameEl = card.querySelector('h2, h3, [class*="productName"], [class*="ProductName"], [class*="name"]');
      const name = nameEl?.textContent?.trim();
      if (!name || name.length < 3) return;
      const brandEl = card.querySelector('[class*="brandName"], [class*="BrandName"], [class*="brand"]');
      const brand = brandEl?.textContent?.trim() || "Unknown";
      const currentPriceSelectors = [
        '[class*="DiscountedPrice"]',
        '[class*="SalePrice"]',
        '[class*="CurrentPrice"]',
        '[class*="FinalPrice"]'
      ];
      const genericPriceSelectors = [
        '[class*="price"]:not([class*="original"]):not([class*="strikethrough"])',
        '[class*="Price"]:not([class*="Original"]):not([class*="Strikethrough"])',
        ".price",
        '[data-testid*="price"]'
      ];
      let price = 0;
      for (const sel of [...currentPriceSelectors, ...genericPriceSelectors]) {
        const el = card.querySelector(sel);
        if (el && el.textContent) {
          const match = el.textContent.match(/\$(\d+(?:\.\d{1,2})?)/);
          if (match) {
            price = parseFloat(match[1]);
            if (price > 0) break;
          }
        }
      }
      if (!price) {
        const cardText = card.textContent || "";
        const allPrices = [...cardText.matchAll(/\$(\d+(?:\.\d{1,2})?)/g)].map((m) => parseFloat(m[1])).filter((p) => p > 0);
        if (allPrices.length > 0) {
          price = Math.min(...allPrices);
        }
      }
      const origPriceEl = card.querySelector('[class*="original"], [class*="strikethrough"], [class*="Original"], del, s');
      let originalPrice;
      if (origPriceEl) {
        const origMatch = origPriceEl.textContent?.match(/\$?(\d+(?:\.\d{1,2})?)/);
        if (origMatch) {
          const parsedOrig = parseFloat(origMatch[1]);
          if (parsedOrig > price) {
            originalPrice = parsedOrig;
          }
        }
      }
      const categoryEl = card.querySelector('[class*="category"]');
      const category = categoryEl?.textContent?.trim();
      const imgEl = card.querySelector("img");
      const imageUrl = imgEl?.src;
      const stockEl = card.querySelector('[class*="outOfStock"], [class*="soldOut"], [class*="OutOfStock"], [class*="SoldOut"], [class*="unavailable"]');
      let inStock = !stockEl;
      let quantity = null;
      let quantityWarning = null;
      let quantitySource = "none";
      if (stockEl) {
        inStock = false;
        quantity = 0;
        quantityWarning = stockEl.textContent?.trim() || "Out of stock";
        quantitySource = "text_pattern";
      }
      if (inStock) {
        const cardText = card.textContent || "";
        const quantityPatterns = [
          /only\s*(\d+)\s*left/i,
          /(\d+)\s*left\s*(?:in\s*stock)?/i,
          /(\d+)\s*remaining/i,
          /limited[:\s]*(\d+)/i,
          /low\s*stock[:\s]*(\d+)/i,
          /(\d+)\s*available/i,
          /hurry[,!]?\s*only\s*(\d+)/i
        ];
        for (const pattern of quantityPatterns) {
          const match = cardText.match(pattern);
          if (match) {
            quantity = parseInt(match[1], 10);
            quantityWarning = match[0].trim();
            quantitySource = "text_pattern";
            break;
          }
        }
        if (!quantityWarning) {
          const lowStockEl = card.querySelector('[class*="LowStock"], [class*="low-stock"], [class*="StockWarning"], [class*="stock-warning"]');
          if (lowStockEl) {
            quantityWarning = lowStockEl.textContent?.trim() || "Low stock";
            const numMatch = quantityWarning.match(/(\d+)/);
            if (numMatch) {
              quantity = parseInt(numMatch[1], 10);
              quantitySource = "text_pattern";
            }
          } else if (/low\s*stock/i.test(cardText)) {
            quantityWarning = "Low stock";
          }
        }
      }
      const productLinkEl = card.querySelector('a[href*="/product/"]') || card.querySelector("a") || card.closest("a");
      let productUrl = void 0;
      if (productLinkEl) {
        const href = productLinkEl.href;
        if (href && href.includes("/product/") && !href.includes("/products/")) {
          productUrl = href;
        }
      }
      const thcEl = card.querySelector('[class*="thc"], [class*="THC"]');
      const cbdEl = card.querySelector('[class*="cbd"], [class*="CBD"]');
      const thcFormatted = thcEl?.textContent?.trim();
      const cbdFormatted = cbdEl?.textContent?.trim();
      if (price > 0) {
        items.push({
          rawProductName: name,
          rawBrandName: brand,
          rawCategory: category,
          price,
          originalPrice,
          inStock,
          quantity,
          quantityWarning,
          quantitySource,
          imageUrl,
          thcFormatted,
          cbdFormatted,
          sourceUrl,
          productUrl,
          sourcePlatform: "dutchie-embedded",
          scrapedAt: timestamp
        });
      }
    } catch (e) {
    }
  });
  return items;
}
__name(extractProducts, "extractProducts");
async function scrapeLocation(session, location) {
  const scrapedAt = Date.now();
  const inventoryStats = { checked: 0, found: 0 };
  try {
    await withRetry(
      async () => {
        await session.goto(location.menuUrl);
      },
      {
        maxRetries: 2,
        baseDelayMs: 2e3,
        onRetry: /* @__PURE__ */ __name((attempt, error) => {
          console.log(`[Cron] Navigation retry ${attempt} for ${location.name}: ${error.message}`);
        }, "onRetry")
      }
    );
    await session.waitForTimeout(3e3);
    await session.evaluate(`
      const buttons = document.querySelectorAll('button');
      buttons.forEach(btn => {
        const text = btn.textContent?.trim().toLowerCase() || '';
        if (text === 'yes' || text === 'i am 21' || text.includes('21+') || text.includes('enter') || text === 'i agree') {
          btn.click();
        }
      });
    `);
    await session.waitForTimeout(2e3);
    if (isLeafBridgeSite(location.menuUrl)) {
      console.log(`[Cron] \u{1F33F} Using LeafBridge extraction for ${location.name}`);
      await session.waitForTimeout(LEAFBRIDGE_AJAX_WAIT_MS);
      try {
        await session.evaluate(`
          // Check if LeafBridge products have loaded
          const cards = document.querySelectorAll('${LEAFBRIDGE_WAIT_SELECTOR}');
          if (cards.length === 0) {
            // Try fallback selectors
            const fallback = document.querySelectorAll('[class*="leafbridge"][class*="product"]');
            console.log('[LeafBridge] Fallback found:', fallback.length);
          }
        `);
      } catch (e) {
        console.log(`[Cron] LeafBridge wait check failed, continuing...`);
      }
      const products2 = await session.evaluateFunction(
        extractLeafBridgeProductsFromDOM,
        location.menuUrl,
        scrapedAt
      );
      console.log(`[Cron] ${location.name}: Found ${products2.length} products via LeafBridge extraction`);
      const withQty = products2.filter((p) => p.quantity !== null).length;
      inventoryStats.checked = products2.length;
      inventoryStats.found = withQty;
      console.log(`[Cron] ${location.name}: Inventory found for ${withQty}/${products2.length} products (LeafBridge listing)`);
      return { products: products2, inventoryStats };
    }
    const products = await session.evaluateFunction(
      extractProducts,
      location.menuUrl,
      scrapedAt
    );
    console.log(`[Cron] ${location.name}: Found ${products.length} products on listing page`);
    const productsWithoutUrls = products.filter((p) => p.inStock && p.quantity === null && !p.productUrl);
    if (productsWithoutUrls.length > 0) {
      const allProductUrls = await session.evaluateFunction(
        extractProductUrls
      );
      console.log(`[Cron] ${location.name}: Found ${allProductUrls.length} product URLs on page`);
      for (const product of productsWithoutUrls) {
        const productNameLower = product.rawProductName.toLowerCase();
        const matchedUrl = allProductUrls.find((pu) => {
          const urlNameLower = pu.name.toLowerCase();
          return urlNameLower.includes(productNameLower.slice(0, 20)) || productNameLower.includes(urlNameLower.slice(0, 20)) || // Also check URL slug
          pu.url.toLowerCase().includes(productNameLower.replace(/[^a-z0-9]/g, "-").slice(0, 20));
        });
        if (matchedUrl) {
          product.productUrl = matchedUrl.url;
        }
      }
    }
    const productsNeedingInventory = products.filter(
      (p) => p.inStock && p.quantity === null && p.productUrl
    );
    const productsToCheck = productsNeedingInventory.slice(0, MAX_DETAIL_PAGE_VISITS_PER_LOCATION);
    console.log(`[Cron] ${location.name}: Checking ${productsToCheck.length} product detail pages for inventory (parallel=${PARALLEL_PAGE_COUNT})`);
    if (productsToCheck.length > 0) {
      const pagePool = await createPagePool(session, PARALLEL_PAGE_COUNT);
      try {
        await processProductsInParallel(
          productsToCheck,
          pagePool,
          extractInventoryFromDetailPage,
          attemptCartHack,
          ENABLE_CART_HACK_FALLBACK,
          MAX_CART_HACK_ATTEMPTS,
          inventoryStats
        );
      } finally {
        await closePagePool(pagePool);
      }
    }
    console.log(`[Cron] ${location.name}: Inventory found for ${inventoryStats.found}/${inventoryStats.checked} products checked`);
    return { products, inventoryStats };
  } catch (error) {
    return {
      products: [],
      error: error instanceof Error ? error.message : "Unknown scraping error",
      inventoryStats
    };
  }
}
__name(scrapeLocation, "scrapeLocation");
async function postToConvex(convexUrl, batchId, results) {
  const cleanedResults = results.map(({ attempts, ...rest }) => rest);
  const response = await fetchWithRetry(
    `${convexUrl}/ingest/scraped-batch`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId, results: cleanedResults }),
      timeoutMs: 6e4
    },
    {
      maxRetries: 3,
      baseDelayMs: 2e3,
      onRetry: /* @__PURE__ */ __name((attempt, error, delay) => {
        console.log(`[Cron] Convex retry ${attempt}: ${error.message}, waiting ${delay}ms`);
      }, "onRetry")
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Convex ingestion failed: ${response.status} - ${text}`);
  }
  return response.json();
}
__name(postToConvex, "postToConvex");
async function triggerDiscordNotifications(convexUrl, webhookUrl) {
  const response = await fetchWithRetry(
    `${convexUrl}/events/notify`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhookUrl, maxEvents: 25 }),
      timeoutMs: 3e4
    },
    {
      maxRetries: 2,
      baseDelayMs: 1e3
    }
  );
  if (!response.ok) {
    console.error(`Discord notification trigger failed: ${response.status}`);
    return null;
  }
  return response.json();
}
__name(triggerDiscordNotifications, "triggerDiscordNotifications");
async function sendDiscordSummary(webhookUrl, embed) {
  try {
    const response = await fetchWithRetry(
      webhookUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] }),
        timeoutMs: 1e4
      },
      {
        maxRetries: 3,
        baseDelayMs: 1e3
      }
    );
    return response.ok;
  } catch (error) {
    console.error("[Cron] Discord summary failed after retries:", error);
    return false;
  }
}
__name(sendDiscordSummary, "sendDiscordSummary");
var index_default = {
  // Scheduled handler - runs every 15 minutes
  async scheduled(event, env, ctx) {
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();
    const activeLocations = getActiveLocations();
    const disabledCount = EMBEDDED_LOCATIONS.length - activeLocations.length;
    console.log(`[Cron] Starting scrape batch ${batchId}`);
    console.log(`[Cron] Scraping ${activeLocations.length} locations (${disabledCount} disabled)`);
    let session = null;
    const results = [];
    const errors = [];
    let totalProducts = 0;
    let totalInventoryChecked = 0;
    let totalInventoryFound = 0;
    try {
      session = await createBrowserSession(env);
      for (const location of activeLocations) {
        let attempts = 0;
        let success = false;
        let lastError;
        if (isTymberSite(location.menuUrl)) {
          console.log(`[Cron] \u{1F680} Using Tymber SSR extraction for ${location.name}`);
          try {
            const products = await fetchAndScrapeTymber(location.menuUrl);
            const withQty = products.filter((p) => p.quantity !== null).length;
            console.log(`[Cron] \u2713 ${location.name}: ${products.length} products (inventory: ${withQty}/${products.length} via Tymber SSR)`);
            totalProducts += products.length;
            totalInventoryChecked += products.length;
            totalInventoryFound += withQty;
            results.push({
              retailerSlug: location.retailerSlug,
              items: products,
              status: "ok",
              attempts: 1
            });
            await sleep(2e3);
            continue;
          } catch (tymberError) {
            console.error(`[Cron] Tymber extraction failed for ${location.name}, falling back to browser:`, tymberError);
          }
        }
        for (let attempt = 1; attempt <= 3 && !success; attempt++) {
          attempts = attempt;
          console.log(`[Cron] Scraping ${location.name} (attempt ${attempt}/3)...`);
          const { products, error, inventoryStats } = await scrapeLocation(session, location);
          if (error) {
            lastError = error;
            console.error(`[Cron] \u2717 ${location.name} attempt ${attempt}: ${error}`);
            if (attempt < 3) {
              const delay = 2e3 * attempt;
              await sleep(delay);
            }
          } else {
            console.log(`[Cron] \u2713 ${location.name}: ${products.length} products (inventory: ${inventoryStats.found}/${inventoryStats.checked})`);
            totalProducts += products.length;
            totalInventoryChecked += inventoryStats.checked;
            totalInventoryFound += inventoryStats.found;
            results.push({
              retailerSlug: location.retailerSlug,
              items: products,
              status: "ok",
              attempts
            });
            success = true;
          }
        }
        if (!success && lastError) {
          errors.push(`${location.name}: ${lastError}`);
          results.push({
            retailerSlug: location.retailerSlug,
            items: [],
            status: "error",
            error: lastError,
            attempts
          });
        }
        await sleep(2e3);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Cron] Browser connection failed:`, errorMsg);
      errors.push(`BrowserBase: ${errorMsg}`);
    } finally {
      if (session) {
        try {
          await session.close();
        } catch (e) {
        }
      }
    }
    const duration = Math.round((Date.now() - startTime) / 1e3);
    let ingestionResult = null;
    try {
      ingestionResult = await postToConvex(env.CONVEX_URL, batchId, results);
      console.log(`[Cron] Posted ${results.length} results to Convex:`, ingestionResult);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Cron] Convex ingestion failed after retries:`, errorMsg);
      errors.push(`Convex ingestion: ${errorMsg}`);
    }
    try {
      const notifyResult = await triggerDiscordNotifications(env.CONVEX_URL, env.DISCORD_WEBHOOK_URL);
      if (notifyResult) {
        console.log(`[Cron] Discord notifications:`, notifyResult);
      }
    } catch (e) {
      console.error(`[Cron] Discord notification trigger failed:`, e);
    }
    const successCount = results.filter((r) => r.status === "ok").length;
    const failCount = results.filter((r) => r.status === "error").length;
    const summaryEmbed = {
      title: "\u{1F33F} CannaSignal Scrape Complete",
      color: failCount === 0 ? 65280 : failCount < successCount ? 16755200 : 16711680,
      fields: [
        { name: "Batch ID", value: batchId, inline: true },
        { name: "Duration", value: `${duration}s`, inline: true },
        { name: "Locations", value: `${successCount}/${activeLocations.length} (${disabledCount} disabled)`, inline: true },
        { name: "Products", value: totalProducts.toString(), inline: true },
        { name: "Inventory", value: `${totalInventoryFound}/${totalInventoryChecked} checked`, inline: true },
        { name: "Events", value: ingestionResult?.totalEventsDetected?.toString() || "N/A", inline: true }
      ],
      footer: { text: "v3.4.0 - parallel page visits" },
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (errors.length > 0) {
      summaryEmbed.fields.push({
        name: "Error Details",
        value: errors.slice(0, 5).join("\n").slice(0, 1e3),
        inline: false
      });
    }
    const summarySuccess = await sendDiscordSummary(env.DISCORD_WEBHOOK_URL, summaryEmbed);
    if (!summarySuccess) {
      console.error("[Cron] Failed to send Discord summary after all retries");
    }
    console.log(`[Cron] Batch ${batchId} complete: ${successCount}/${activeLocations.length} active locations, ${totalProducts} products, ${totalInventoryFound} inventory counts, ${duration}s`);
  },
  // HTTP handler for manual triggers and status
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      const activeLocations = getActiveLocations();
      return Response.json({
        status: "ok",
        service: "cannasignal-cron",
        version: "3.4.0-parallel-pages",
        locations: {
          total: EMBEDDED_LOCATIONS.length,
          active: activeLocations.length,
          disabled: EMBEDDED_LOCATIONS.length - activeLocations.length
        },
        schedule: "*/15 * * * *",
        convexUrl: env.CONVEX_URL,
        features: [
          "cdp-native-client",
          "per-location-retry",
          "circuit-breaker",
          "exponential-backoff",
          "webhook-retry",
          "disabled-location-support",
          "product-detail-page-inventory",
          "cart-hack-fallback",
          "optimized-wait-times",
          "parallel-page-pool",
          "concurrent-product-visits"
        ],
        config: {
          maxDetailPageVisits: MAX_DETAIL_PAGE_VISITS_PER_LOCATION,
          parallelPageCount: PARALLEL_PAGE_COUNT,
          pageRenderWaitMs: PAGE_RENDER_WAIT_MS,
          detailPageTimeoutMs: DETAIL_PAGE_TIMEOUT_MS,
          cartHackEnabled: ENABLE_CART_HACK_FALLBACK,
          maxCartHackAttempts: MAX_CART_HACK_ATTEMPTS
        }
      });
    }
    if (url.pathname === "/trigger" && request.method === "POST") {
      const event = { cron: "manual", scheduledTime: Date.now() };
      this.scheduled(event, env, {
        waitUntil: /* @__PURE__ */ __name((p) => p, "waitUntil"),
        passThroughOnException: /* @__PURE__ */ __name(() => {
        }, "passThroughOnException")
      });
      return Response.json({
        triggered: true,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        message: "Scrape triggered, check Discord for results"
      });
    }
    if (url.pathname === "/locations") {
      const activeLocations = getActiveLocations();
      return Response.json({
        total: EMBEDDED_LOCATIONS.length,
        active: activeLocations.length,
        disabled: EMBEDDED_LOCATIONS.length - activeLocations.length,
        locations: EMBEDDED_LOCATIONS.map((l) => ({
          name: l.name,
          retailer: l.retailerName,
          url: l.menuUrl,
          region: l.region,
          status: l.disabled ? "disabled" : "active",
          disabledReason: l.disabledReason
        }))
      });
    }
    return Response.json({
      service: "cannasignal-cron",
      version: "3.4.0-parallel-pages",
      endpoints: [
        "GET /health - Service health with location stats",
        "POST /trigger - Manual scrape trigger",
        "GET /locations - All locations with status"
      ]
    });
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
