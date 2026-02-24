# BudAlert Retailer Inventory

## Summary

| Category | Count |
|----------|-------|
| Total Locations | 18 |
| Active (Enabled) | 8 |
| Disabled | 10 |
| Platforms | 4 |

---

## Scraping Method by Platform

| Platform | Scraping Method | Browser Required | Cost |
|----------|-----------------|------------------|------|
| **Dutchie GraphQL** | Direct API (POST to `/graphql`) | ❌ No | 💚 Free |
| **Dutchie Embedded** | Browser DOM extraction | ✅ Yes (BrowserBase) | 🔴 Expensive |
| **Tymber/Blaze** | SSR HTML parsing (`__NEXT_DATA__`) | ❌ No | 💚 Free |
| **LeafBridge** | Browser DOM extraction | ✅ Yes (BrowserBase) | 🔴 Expensive |

---

## All Retailers by Status

### ✅ Active Locations (8)

#### Dutchie Embedded (Verified Working)

| Retailer | Location | Menu URL | Region |
|----------|----------|----------|--------|
| Dagmar Cannabis | SoHo | https://dagmarcannabis.com/menu/ | NYC |
| Strain Stars | Farmingdale | https://strainstarsny.com/menu/ | Long Island |
| The Travel Agency | Union Square | https://www.thetravelagency.co/menu/ | NYC |

#### LeafBridge Platform

| Retailer | Location | Menu URL | Region |
|----------|----------|----------|--------|
| Alta Dispensary | Lower Manhattan | https://altadispensary.nyc/ | NYC |

#### Tymber/Blaze SSR (Pending Custom Selectors)

| Retailer | Location | Menu URL | Region |
|----------|----------|----------|--------|
| Housing Works Cannabis | Broadway | https://hwcannabis.co/menu/broadway/ | NYC |

#### Re-Enabled with Residential Proxies (Testing)

| Retailer | Location | Menu URL | Region |
|----------|----------|----------|--------|
| CONBUD | LES | https://conbud.com/stores/conbud-les/products | NYC |
| Gotham | Bowery | https://gotham.nyc/menu/ | NYC |
| Get Smacked | Village | https://getsmacked.online/menu/ | NYC |

---

### ❌ Disabled Locations (10)

#### Shared URL / No Location Selector

| Retailer | Location | Menu URL | Region | Reason |
|----------|----------|----------|--------|--------|
| Strain Stars | Riverhead | https://strainstarsny.com/menu/ | Long Island | Shared URL, no selector to pick location |
| Gotham | Hudson | https://gotham.nyc/menu/ | Hudson Valley | Shared URL, no selector |
| Gotham | Williamsburg | https://gotham.nyc/menu/ | NYC | Shared URL, no selector |
| Gotham | Chelsea | https://gotham.nyc/menu/ | NYC | Shared URL, no selector |

#### Broken URLs (404 / Offline)

| Retailer | Location | Menu URL | Region | Reason |
|----------|----------|----------|--------|--------|
| Just Breathe | Syracuse | https://justbreathelife.org/menu/ | Upstate | URL returns 404 |
| Just Breathe | Binghamton | https://justbreathelife.org/menu/ | Upstate | URL returns 404 |
| Just Breathe | Finger Lakes | https://justbreatheflx.com/ | Upstate | Needs verification |

#### IP Blocked (Re-Enabled with Proxies)

These were previously disabled but have been re-enabled to test with residential proxies:

| Retailer | Location | Status |
|----------|----------|--------|
| CONBUD | Bronx | Now active (testing) |
| CONBUD | Yankee Stadium | Now active (testing) |

---

## Detailed Retailer Information

### Dagmar Cannabis ✅
- **Platform:** Dutchie Embedded (WordPress Joint-Dutchie plugin)
- **Status:** Verified Working
- **Location:** 412 W Broadway, New York, NY (SoHo)
- **Menu URL:** https://dagmarcannabis.com/menu/
- **Scraping Method:** Browser → DOM extraction
- **Notes:** WordPress site with Dutchie embed

### Strain Stars ⚠️
- **Platform:** Dutchie Embedded (Custom)
- **Status:** 1 of 2 locations active
- **Locations:**
  - ✅ Farmingdale: 1815 Broadhollow Rd, Farmingdale, NY
  - ❌ Riverhead: 1871 Old Country Rd, Riverhead, NY (shared URL)
- **Menu URL:** https://strainstarsny.com/menu/
- **Issue:** Single URL serves multiple locations, no selector

### The Travel Agency ✅
- **Platform:** Dutchie Embedded (SSR custom frontend)
- **Status:** Verified Working
- **Location:** 835 Broadway, New York, NY (Union Square)
- **Menu URL:** https://www.thetravelagency.co/menu/
- **Notes:** Custom SSR frontend, not standard Dutchie embed

### Alta Dispensary ✅
- **Platform:** LeafBridge (WordPress plugin)
- **Status:** Verified Working
- **Location:** 52 Kenmare St A, New York, NY 10012
- **Menu URL:** https://altadispensary.nyc/
- **Scraping Method:** Browser → AJAX wait → DOM extraction
- **Inventory:** Available via `input[max]` attribute
- **Notes:** LeafBridge uses AJAX loading, needs 5s wait

### Housing Works Cannabis ⚠️
- **Platform:** Tymber/Blaze (SSR)
- **Status:** Pending - needs custom selectors
- **Location:** 750 Broadway, New York, NY
- **Menu URL:** https://hwcannabis.co/menu/broadway/
- **Scraping Method:** Can use SSR extraction (no browser needed!)
- **Inventory:** Available via `pos_inventory` in `__NEXT_DATA__`
- **Notes:** First NYS dispensary. Tymber platform detected. **HIGH PRIORITY for browser-free extraction.**

### CONBUD 🧪
- **Platform:** Custom (likely Dutchie-based)
- **Status:** Testing with residential proxies
- **Locations:**
  - LES: 88 E Houston St, New York, NY
  - Bronx: (address TBD)
  - Yankee Stadium: (address TBD)
- **Menu URLs:** https://conbud.com/stores/conbud-{location}/products
- **Issue:** Previously blocked datacenter IPs
- **Current Status:** Re-enabled with `proxies: true`

### Gotham ⚠️
- **Platform:** Dutchie Embedded
- **Status:** 1 of 4 locations active
- **Locations:**
  - ✅ Bowery: 3 E 3rd St, New York, NY
  - ❌ Hudson: 260 Warren St, Hudson, NY (shared URL)
  - ❌ Williamsburg: 300 Kent Ave, Brooklyn, NY (shared URL)
  - ❌ Chelsea: 146 10th Ave, New York, NY (shared URL)
- **Menu URL:** https://gotham.nyc/menu/
- **Issue:** Single URL, no location selector. Intermittent bot detection.

### Get Smacked 🧪
- **Platform:** Dutchie Embedded
- **Status:** Testing with residential proxies
- **Location:** 144 Bleecker St, New York, NY (Village)
- **Menu URL:** https://getsmacked.online/menu/
- **Notes:** Re-enabled to test proxy bypass

### Just Breathe ❌
- **Platform:** Unknown (sites offline)
- **Status:** All locations disabled
- **Locations:**
  - Syracuse: 185 W Seneca St, Manlius, NY
  - Binghamton: 75 Court St, Binghamton, NY
  - Finger Lakes: 2988 US Route 20, Seneca Falls, NY
- **Issue:** All URLs return 404 or are offline

---

## Migration Priority

### Phase 1: No Browser Required (Immediate Savings)

| Retailer | Platform | Action |
|----------|----------|--------|
| Housing Works | Tymber SSR | Use `fetchAndScrapeTymber()` - already implemented! |

### Phase 2: Direct API (If Available)

| Retailer | Platform | Action |
|----------|----------|--------|
| Any with direct Dutchie | Dutchie GraphQL | Use `/graphql` endpoint |

### Phase 3: CF Browser Rendering

| Retailer | Platform | Action |
|----------|----------|--------|
| Dagmar, Strain Stars, Travel Agency | Dutchie Embedded | Migrate to CF Browser |
| Alta | LeafBridge | Migrate to CF Browser |
| CONBUD, Gotham, Smacked | Custom | Migrate to CF Browser + investigate direct API |

---

## Known Issues

1. **Shared URLs:** Strain Stars, Gotham have multiple locations on one URL
   - Need to investigate location selector or URL parameters

2. **Bot Detection:** CONBUD historically blocks datacenter IPs
   - Currently testing with residential proxies
   - May need fingerprint persistence

3. **Broken Sites:** Just Breathe appears to be offline
   - Should verify and potentially remove from rotation

4. **Tymber Selectors:** Housing Works needs Tymber-specific extraction
   - SSR method is implemented in `workers/lib/platforms/tymber.ts`
   - Just need to verify selectors match current site

---

## Platform Detection Logic

```typescript
// Tymber/Blaze
isTymberSite(url): /hwcannabis\.co|\.tymber\.me|tymber\.io/

// LeafBridge
isLeafBridgeSite(url): /altadispensary\.nyc/

// Dutchie (default)
// Everything else assumed Dutchie embedded
```

---

## Data Quality Notes

- **Best Inventory Data:** Dutchie GraphQL (exact counts), Tymber SSR (exact counts)
- **Good Inventory Data:** LeafBridge (`input[max]`)
- **Variable Inventory Data:** Dutchie Embedded (text patterns + cart hack)
- **No Inventory Data:** Some embedded sites only show "In Stock" boolean
