# CDP Migration: Playwright-Core → Native CDP Client

**Date:** 2026-02-20  
**Version:** 3.0.0

## Root Cause Analysis

### The Problem
`workers/cron/index.ts` imported `playwright-core` which caused **161 bundling errors** when deploying to Cloudflare Workers:

```
✘ Could not resolve "crypto" (node_modules/chromium-bidi/lib/cjs/utils/uuid.js)
✘ Could not resolve "fs" (node_modules/node-gyp-build/node-gyp-build.js)
✘ Could not resolve "path" (node_modules/playwright-core/lib/mcpBundleImpl/index.js)
✘ Could not resolve "child_process" (node_modules/playwright-core/lib/mcpBundleImpl/index.js)
✘ Could not resolve "http2" (node_modules/playwright-core/lib/mcpBundleImpl/index.js)
... 156 more errors
```

### Root Cause
`playwright-core` is designed for Node.js environments and imports:
- `fs` - File system operations
- `path` - Path manipulation
- `child_process` - Process spawning
- `crypto` - Cryptographic operations
- `http2` - HTTP/2 protocol
- `os` - Operating system info
- `net`, `tls` - Network sockets

These modules are **Node.js built-ins** not available in Cloudflare Workers' V8 isolate runtime.

---

## Solutions Evaluated

| Priority | Solution | Effort | Worker Compatible | Pros | Cons |
|----------|----------|--------|-------------------|------|------|
| **P0** | Direct CDP over WebSocket | 4-6h | ✅ Yes | Zero deps, Workers-native, full control | Need to implement CDP commands |
| P1 | BrowserBase REST + Raw WS | 3-4h | ✅ Yes | Clean separation | Two-step connection |
| P1 | Cloudflare Browser Rendering | 2-3h | ✅ Yes | Native binding, no auth | Different service, CF-only |
| P2 | puppeteer-core + custom transport | 6-8h | ❌ Same issues | Familiar API | Same Node.js deps |
| P2 | External Node.js proxy service | 8-12h | ⚠️ Partial | Keeps Playwright | Infrastructure overhead |
| P2 | WASM-compiled browser | N/A | ❌ No | Theoretical | Not practical |

**Winner: P0 - Direct CDP over WebSocket**

---

## Solution Implemented

### New File: `workers/lib/cdp.ts`

A lightweight CDP (Chrome DevTools Protocol) client that:
- Uses native WebSocket (Workers-compatible)
- Implements only needed commands:
  - `Target.createTarget` / `Target.attachToTarget` / `Target.closeTarget`
  - `Page.navigate` / `Page.enable` / `Page.captureScreenshot`
  - `Runtime.enable` / `Runtime.evaluate`
  - `Emulation.setDeviceMetricsOverride`
- Zero external dependencies
- ~17KB uncompressed

### API Surface

```typescript
// Low-level client
const client = new CDPClient({ wsUrl: 'wss://connect.browserbase.com?...' });
await client.connect();
const page = await client.createPage();
await page.navigate('https://example.com');
const title = await page.evaluate('document.title');
await page.close();
await client.disconnect();

// High-level session (matches previous usage pattern)
const session = new BrowserSession(apiKey, projectId);
await session.init();
await session.goto('https://example.com');
const products = await session.evaluateFunction(extractProducts, url, timestamp);
await session.close();
```

### Updated: `workers/cron/index.ts`

- Removed: `import { chromium, Browser, Page } from 'playwright-core'`
- Added: `import { BrowserSession, CDPPage } from '../lib/cdp'`
- Preserved all existing functionality:
  - Per-location retry with exponential backoff
  - Circuit breaker for BrowserBase connection
  - Product extraction logic (moved to `evaluateFunction`)
  - Convex ingestion with retry
  - Discord webhook notifications

---

## Deployment Results

### Before (playwright-core)
```
✘ Build failed with 161 errors
```

### After (native CDP client)
```
Total Upload: 35.20 KiB / gzip: 9.12 KiB
--dry-run: exiting now.
```

**Bundle size:** 35.20 KiB (9.12 KiB gzipped)  
**Bundling errors:** 0  
**Dependencies removed:** playwright-core, chromium-bidi, node-gyp-build

---

## CDP Protocol Reference

Commands implemented based on:
- https://chromedevtools.github.io/devtools-protocol/tot/Target/
- https://chromedevtools.github.io/devtools-protocol/tot/Page/
- https://chromedevtools.github.io/devtools-protocol/tot/Runtime/

BrowserBase CDP endpoint:
```
wss://connect.browserbase.com?apiKey={API_KEY}&projectId={PROJECT_ID}
```

---

## Migration Notes

1. **Function serialization**: `page.evaluate()` now requires the function to be serializable. Complex closures won't work - use `evaluateFunction(fn, ...args)` instead.

2. **No automatic page management**: Unlike Playwright, you must explicitly create/attach to pages.

3. **Event handling**: CDP events are available via `client.on('Event.name', handler)` but not all Playwright conveniences exist.

4. **Error handling**: CDP errors are wrapped in standard Error objects with the CDP error message.

---

## Future Improvements

1. **Add more CDP commands** as needed (Network.enable, Input.dispatchKeyEvent, etc.)
2. **Connection pooling** for high-throughput scenarios
3. **Automatic reconnection** on WebSocket disconnect
4. **Screenshot optimization** with clip regions
