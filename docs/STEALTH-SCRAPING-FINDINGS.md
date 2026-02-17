# Dutchie Stealth Scraping - Findings & Recommendations

**Date:** 2026-02-17  
**Status:** ✅ WORKING (with caveats)

## Summary

Playwright with `puppeteer-extra-plugin-stealth` **successfully bypasses Cloudflare Bot Management** on Dutchie-powered dispensary menus.

## What Works

### ✅ Dutchie Embedded Menus (Recommended)
- **Example:** `https://conbud.com/stores/conbud-les/products/flower`
- **Result:** 54 products extracted with full details
- **Data captured:**
  - Product name
  - Brand
  - Price
  - THC/CBD percentages
  - Stock status
  - Product URL
  - Image URL

### ⚠️ Dutchie Direct URLs (Partial)
- **Example:** `https://dutchie.com/dispensary/housing-works-cannabis-co`
- **Result:** Age gate handled, but SPA content doesn't render in time
- **Issue:** Heavy React app requires longer waits and specific element detection
- **Workaround:** Use the dispensary's embedded menu URL instead

## Technical Details

### Stealth Techniques Applied
1. **puppeteer-extra-plugin-stealth** - Patches common headless detection
2. **Random user agent rotation** - Chrome 120-121 on various OSes
3. **Realistic browser headers** - sec-ch-ua, Accept-Language, etc.
4. **Human-like behavior** - Random delays, mouse movements
5. **Geolocation spoofing** - NYC coordinates
6. **Age gate handling** - Auto-clicks "YES" on age verification

### Detection Status
- **Cloudflare JS Challenge:** BYPASSED ✅
- **Cloudflare Turnstile:** Not encountered (would likely fail)
- **Headless detection:** BYPASSED ✅
- **Bot fingerprinting:** BYPASSED ✅

## Recommended Approach

### For Production Scraping

1. **Target embedded menus, not dutchie.com directly**
   ```
   ❌ https://dutchie.com/dispensary/housing-works-cannabis-co
   ✅ https://conbud.com/stores/conbud-les/products/flower
   ```

2. **Rate limiting is essential**
   - Minimum 5-10 second delays between requests
   - Rotate user agents between sessions
   - Consider IP rotation for high volume

3. **Best extraction strategy**
   - Wait for `domcontentloaded` (not `networkidle`)
   - Allow 2-3 seconds for React to hydrate
   - Scroll page to trigger lazy loading
   - Use flexible CSS selectors

## Data Quality

### Sample Extracted Product
```json
{
  "name": "Grocery | 28g Flower - Sativa | Black Diesel",
  "brand": "Grocery",
  "price": "$160.00",
  "thc": "29.21%",
  "url": "/stores/conbud-les/product/grocery-28g-flower-sativa-black-diesel",
  "imageUrl": "https://images.dutchie.com/..."
}
```

### Known Issues
1. Product names sometimes include concatenated metadata (strain type, THC%)
2. Category information not consistently available
3. Original prices (before sale) not captured

## Cost & Complexity Tradeoffs

| Approach | Cost | Complexity | Reliability |
|----------|------|------------|-------------|
| Playwright Stealth (current) | Free | Medium | Good for embedded menus |
| Residential Proxies | $15-50/GB | Low | Excellent |
| Browser Farm (BrowserBase) | $0.01-0.05/session | Low | Excellent |
| Manual data entry | Time cost | Low | Guaranteed |

### Recommendations by Volume

- **<100 products/day:** Playwright Stealth is sufficient
- **100-1000 products/day:** Add residential proxy rotation
- **>1000 products/day:** Use BrowserBase or similar managed service

## If Stealth Fails in Future

Cloudflare continuously updates detection. If stealth stops working:

1. **First:** Check for Turnstile CAPTCHA (unbeatable without human)
2. **Second:** Try residential proxies (Bright Data, Oxylabs, IPRoyal)
3. **Third:** Use BrowserBase or similar headless browser service
4. **Fourth:** Consider Dutchie API partnership (legitimate data access)

## Files

- **Scraper:** `/root/clawd/cannasignal/scripts/playwright-stealth-scraper.ts`
- **Run script:** `/root/clawd/cannasignal/scripts/run-stealth-scrape.sh`
- **Test results:** `/root/clawd/cannasignal/data/stealth-test/results-*.json`
- **Screenshots:** `/root/clawd/cannasignal/data/stealth-test/*.png`

## Dependencies

```bash
npm install playwright playwright-extra puppeteer-extra-plugin-stealth tsx
npx playwright install chromium
npx playwright install-deps chromium  # For system libraries
```
