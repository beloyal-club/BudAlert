# Browser Service Comparison: BrowserUse vs BrowserBase

**Date:** 2026-02-18  
**Use Case:** Stealth scraping for CannaSignal - cannabis dispensary menu data from Dutchie, Weedmaps, etc. (Cloudflare-protected sites)

---

## Executive Summary

| Criteria | BrowserUse Cloud | BrowserBase |
|----------|------------------|-------------|
| **Best For** | AI-driven automation tasks | Playwright/Puppeteer integration |
| **Cloudflare Bypass** | ✅ Stealth by default + proxies | ✅ Basic/Advanced Stealth + Signed Agents |
| **CAPTCHA Solving** | ✅ Automatic | ✅ Automatic |
| **Cost (scraping)** | 💰 $0.06/hr browser + $10/GB proxy | 💰 $0.12/hr + $12/GB proxy |
| **Integration** | Python SDK, CDP access | Playwright/Puppeteer/Selenium native |
| **Recommendation** | **Primary choice** - simpler, cheaper | Fallback for complex cases |

---

## Service Overview

### BrowserUse Cloud
- **Website:** https://cloud.browser-use.com
- **What it is:** AI-first browser automation platform with stealth browsers
- **Key value:** Combines AI agent tasks with low-level CDP browser access
- **SDK:** Python-first with TypeScript support

### BrowserBase + Stagehand
- **Website:** https://browserbase.com
- **What it is:** Enterprise headless browser infrastructure
- **Key value:** Native Playwright/Puppeteer integration with stealth features
- **Stagehand:** AI-native automation SDK built on top of BrowserBase
- **SDK:** Node.js and Python

---

## Detailed Comparison

### 1. Cloudflare Bypass Capabilities

#### BrowserUse Cloud
- **Stealth by default** - All browsers come pre-configured with anti-detection
- Cookie blockers and CAPTCHA solvers built-in
- Residential proxies available (200+ countries)
- No special configuration needed - just works

#### BrowserBase
- **Basic Stealth Mode** (Developer/Startup plans):
  - Auto CAPTCHA solving
  - Random fingerprints per session
  - Surface-level challenge bypass
  
- **Advanced Stealth Mode** (Scale plan only - custom pricing):
  - Custom Chromium build by "Stealth Team"
  - Human-like environmental signals
  - Much higher success rate on protected sites

- **Browserbase Identity** (Beta, Scale plan):
  - **Official Cloudflare partnership** via "Signed Agents" program
  - Cryptographic authentication bypasses CF entirely
  - Websites can explicitly allow Browserbase sessions
  - **This is the most reliable CF bypass option if available**

**Winner:** BrowserBase (Scale plan with Signed Agents) > BrowserUse > BrowserBase (Basic)

For CannaSignal without Scale plan access, BrowserUse's default stealth is simpler to use.

---

### 2. Stealth Features Deep Dive

| Feature | BrowserUse | BrowserBase |
|---------|------------|-------------|
| Fingerprint randomization | ✅ Automatic | ✅ Automatic |
| Residential proxies | ✅ 200+ countries | ✅ 201 countries |
| CAPTCHA solving | ✅ Included | ✅ Included |
| Custom browser build | ❓ Unknown | ✅ (Scale only) |
| Cloudflare Signed Agents | ❌ | ✅ (Scale beta) |
| Cookie persistence | ✅ Via profiles | ✅ Via contexts |
| Human-like behavior | ✅ Implied | ✅ (Advanced only) |

---

### 3. Pricing Comparison

#### BrowserUse Cloud

| Item | Pay As You Go | Business ($500/mo) |
|------|---------------|-------------------|
| Browser sessions | $0.06/hour | $0.03/hour |
| Proxy data | $10/GB | $5/GB |
| AI task init | $0.01/task | $0.01/task |
| AI task step (browser-use-llm) | $0.002/step | $0.0015/step |

**For pure scraping (no AI agent):**
- Browser session: $0.06/hour = **$0.001/minute**
- Proxy: $10/GB

#### BrowserBase

| Plan | Monthly | Browser Hours | Proxy | Concurrency |
|------|---------|---------------|-------|-------------|
| Free | $0 | 1 hour | 0 GB | 1 |
| Developer | $20 | 100 hrs ($0.12/hr after) | 1 GB | 25 |
| Startup | $99 | 500 hrs ($0.10/hr after) | 5 GB | 100 |
| Scale | Custom | Usage-based | Usage-based | 250+ |

**Proxy costs:** $10-12/GB depending on plan

#### Cost Comparison: 100 Scrape Sessions

Assumptions: 5 min avg session, 50MB data per session

| Service | Browser Time | Proxy Cost | Total |
|---------|-------------|------------|-------|
| BrowserUse (PAYG) | $0.50 | $5.00 | **$5.50** |
| BrowserBase (Dev) | $0 (included) | $4.90 (included) | **$0** (within limits) |
| BrowserBase (after limits) | $1.00 | $6.00 | **$7.00** |

**Winner:** BrowserBase Developer plan for low-volume (free up to 100 hours + 1GB). BrowserUse PAYG cheaper at scale.

---

### 4. Integration with Existing Scraper

#### BrowserUse Cloud

```python
# Direct CDP access for Playwright-like control
from browser_use import Browser

browser = Browser(use_cloud=True)  # Stealth enabled by default
# Returns CDP WebSocket endpoint for Playwright connection
```

Or via sessions API:
```python
session = client.sessions.create_session(
    proxy_country_code="us"
)
# Get CDP endpoint, connect with Playwright
```

#### BrowserBase

```python
# Native Playwright integration
from playwright.sync_api import sync_playwright
from browserbase import Browserbase

bb = Browserbase(api_key="...")
session = bb.sessions.create(
    project_id="...",
    proxies=True,
    browser_settings={"advancedStealth": True}  # Scale only
)

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(session.connect_url)
    # Use exactly like regular Playwright
```

**Integration Effort:** Both similar - swap CDP endpoint. BrowserBase has cleaner Playwright docs.

---

### 5. Reliability & Rate Limits

#### BrowserUse Cloud
- Concurrent sessions: Limited (PAYG), 250-500 (Business/Scaleup)
- Session duration: Up to 4 hours
- Active support via Discord

#### BrowserBase
- Concurrent sessions: 1 (Free) to 250+ (Scale)
- Session duration: 15 min (Free), 6 hours (paid)
- Browser creation rate limit: 5-150/min depending on plan
- SOC-2 Type 1 and HIPAA compliant

---

## Recommendation for CannaSignal

### Primary: BrowserUse Cloud (PAYG)
**Why:**
1. **Stealth by default** - No configuration needed, works out of the box
2. **Simpler pricing** - Pay for what you use, no monthly commitment
3. **Good enough for Dutchie/Weedmaps** - Residential proxies + auto fingerprinting should handle these sites
4. **Python-native** - If your scraper is Python-based

**API Key ready:** `bu_4yfKgYi_xB2jDWqf7MzUO-D0eXqkfWYK143orWI-q9c`

### Fallback: BrowserBase (Developer Plan)
**When to use:**
1. If BrowserUse gets blocked on specific dispensary sites
2. If you need better observability (session replay, logging)
3. For testing - 100 hours free is great for development

**API Key ready:** `bb_live_9DOgx7Trvyon7_zMAvtVxrpugDI`
**Project ID:** `5838b775-9417-42f0-b272-c0142eec43b7`

### If All Else Fails: BrowserBase Scale
Request access to **Browserbase Identity / Signed Agents** for official Cloudflare bypass. This is the nuclear option if dispensary sites start using aggressive bot protection.

---

## Quick Start Code

### BrowserUse Cloud with Playwright

```python
import asyncio
from browser_use import Browser

async def scrape_dispensary(url: str):
    browser = Browser(use_cloud=True)
    
    # Get CDP endpoint
    cdp_url = await browser.get_cdp_url()
    
    # Connect with Playwright
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(cdp_url)
        page = browser.contexts[0].pages[0]
        
        await page.goto(url)
        # ... scrape logic
        
    await browser.close()

asyncio.run(scrape_dispensary("https://dutchie.com/dispensary/example"))
```

### BrowserBase with Playwright

```python
import os
from playwright.sync_api import sync_playwright
from browserbase import Browserbase

bb = Browserbase(api_key=os.environ["BROWSERBASE_API_KEY"])

session = bb.sessions.create(
    project_id=os.environ["BROWSERBASE_PROJECT_ID"],
    proxies=True
)

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(session.connect_url)
    context = browser.contexts[0]
    page = context.pages[0]
    
    page.goto("https://dutchie.com/dispensary/example")
    # ... scrape logic
    
    browser.close()
```

---

## Testing Notes

⚠️ **Unable to run live tests** - This subagent session doesn't have access to install Python packages or run browser automation code. 

**Recommended manual tests:**
1. Hit `https://dutchie.com` with both services
2. Check if you can load a menu page without CAPTCHA
3. Try 10 sequential requests to test rate limiting
4. Measure response times

---

## Summary

**For CannaSignal MVP: Start with BrowserUse Cloud PAYG**
- Cheapest to start
- Stealth works out of the box
- Easy Python integration
- Upgrade to BrowserBase Scale if needed for Signed Agents

**Estimated monthly cost for 10k dispensary scrapes:**
- 10k scrapes × 3 min avg × $0.001/min = $30 browser time
- 10k scrapes × 20MB = 200GB × $10/GB = $2,000 proxy (ouch!)

💡 **Tip:** Consider using proxy only for initial page loads, then switch to direct connection for subsequent API calls if the site has a JSON API endpoint.
