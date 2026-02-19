/**
 * Retailer Prioritization Logic
 * 
 * Determines scrape order based on:
 * 1. High-traffic NYC locations (Manhattan/Brooklyn first)
 * 2. Last successful scrape time
 * 3. Error rate history
 * 4. Platform reliability (embedded Dutchie > direct Dutchie)
 */

import fs from 'fs';
import path from 'path';

export interface RetailerConfig {
  name: string;
  slug: string;
  platform: string;
  embedType?: string;
  verified: boolean;
  priority: 'high' | 'medium' | 'low';
  ocmLicense?: string;
  locations: LocationConfig[];
  scrapable?: boolean;
  scraperType?: string;
  notes?: string;
}

export interface LocationConfig {
  name: string;
  menuUrl?: string;
  dutchieSlug?: string;
  dutchieEmbedId?: string;
  address: {
    street?: string;
    city: string;
    state: string;
    zip?: string;
  };
  region: string;
}

export interface ScrapeJob {
  retailerSlug: string;
  locationName: string;
  menuUrl: string;
  platform: string;
  priority: number;
  region: string;
  lastScrapedAt?: number;
  errorCount?: number;
}

// Region traffic weights (higher = more important)
const REGION_WEIGHTS: Record<string, number> = {
  manhattan: 10,
  brooklyn: 8,
  queens: 6,
  bronx: 4,
  staten_island: 3,
  long_island: 2,
  upstate: 1,
  hudson_valley: 1,
};

// Platform reliability scores (higher = more reliable/easier to scrape)
const PLATFORM_SCORES: Record<string, number> = {
  'dutchie-embedded': 10,
  'dutchie-plus': 9,
  'joint-dutchie-plugin': 8,
  'dutchie-backend': 7,
  'dutchie-direct': 5,  // Cloudflare blocks
  'woocommerce': 4,
  'alpine-iq': 2,
  'shopify': 1,
  'unknown': 0,
};

// Priority multipliers
const PRIORITY_MULTIPLIERS: Record<string, number> = {
  high: 1.5,
  medium: 1.0,
  low: 0.5,
};

/**
 * Load retailer config from JSON
 */
export function loadRetailerConfig(configPath?: string): {
  dutchieEmbedded: { retailers: RetailerConfig[] };
  dutchieDirect: { retailers: RetailerConfig[] };
  otherPlatforms: { retailers: RetailerConfig[] };
} {
  const defaultPath = path.join(__dirname, '../../data/nyc-retailers-expanded.json');
  const filePath = configPath || defaultPath;
  
  const data = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(data);
}

/**
 * Calculate priority score for a scrape job
 */
export function calculatePriorityScore(
  retailer: RetailerConfig,
  location: LocationConfig,
  scrapeHistory?: { lastScrapedAt?: number; errorCount?: number }
): number {
  let score = 0;
  
  // Base score from region weight
  const regionKey = location.region.toLowerCase().replace(/[\s-]/g, '_');
  score += (REGION_WEIGHTS[regionKey] || 1) * 10;
  
  // Platform reliability
  score += PLATFORM_SCORES[retailer.platform] || 0;
  
  // Priority multiplier
  score *= PRIORITY_MULTIPLIERS[retailer.priority] || 1.0;
  
  // Recency penalty (prefer retailers not scraped recently)
  if (scrapeHistory?.lastScrapedAt) {
    const hoursSinceLastScrape = (Date.now() - scrapeHistory.lastScrapedAt) / (1000 * 60 * 60);
    if (hoursSinceLastScrape < 1) {
      score *= 0.3;  // Recently scraped, deprioritize
    } else if (hoursSinceLastScrape < 6) {
      score *= 0.7;
    } else if (hoursSinceLastScrape > 24) {
      score *= 1.3;  // Stale data, prioritize
    }
  }
  
  // Error rate penalty
  if (scrapeHistory?.errorCount && scrapeHistory.errorCount > 3) {
    score *= 0.5;  // Unreliable, deprioritize
  }
  
  // Verified bonus
  if (retailer.verified) {
    score *= 1.2;
  }
  
  return Math.round(score * 100) / 100;
}

/**
 * Generate prioritized scrape queue
 */
export function generateScrapeQueue(
  scrapeHistory?: Map<string, { lastScrapedAt?: number; errorCount?: number }>
): ScrapeJob[] {
  const config = loadRetailerConfig();
  const jobs: ScrapeJob[] = [];
  
  // Process embedded Dutchie (primary)
  for (const retailer of config.dutchieEmbedded.retailers) {
    for (const location of retailer.locations) {
      if (!location.menuUrl) continue;
      
      const historyKey = `${retailer.slug}:${location.name}`;
      const history = scrapeHistory?.get(historyKey);
      
      jobs.push({
        retailerSlug: retailer.slug,
        locationName: location.name,
        menuUrl: location.menuUrl,
        platform: retailer.platform,
        priority: calculatePriorityScore(retailer, location, history),
        region: location.region,
        lastScrapedAt: history?.lastScrapedAt,
        errorCount: history?.errorCount,
      });
    }
  }
  
  // Process direct Dutchie (secondary - requires proxy/stealth)
  for (const retailer of config.dutchieDirect.retailers) {
    for (const location of retailer.locations) {
      const dutchieUrl = (retailer as any).dutchieUrl;
      if (!dutchieUrl) continue;
      
      const historyKey = `${retailer.slug}:${location.name}`;
      const history = scrapeHistory?.get(historyKey);
      
      jobs.push({
        retailerSlug: retailer.slug,
        locationName: location.name,
        menuUrl: dutchieUrl,
        platform: 'dutchie-direct',
        priority: calculatePriorityScore(retailer, location, history),
        region: location.region,
        lastScrapedAt: history?.lastScrapedAt,
        errorCount: history?.errorCount,
      });
    }
  }
  
  // Sort by priority descending
  jobs.sort((a, b) => b.priority - a.priority);
  
  return jobs;
}

/**
 * Get scrapable retailers only (excluding Shopify, unknown, etc.)
 */
export function getScrapableRetailers(): RetailerConfig[] {
  const config = loadRetailerConfig();
  const scrapable: RetailerConfig[] = [];
  
  // All embedded Dutchie are scrapable
  scrapable.push(...config.dutchieEmbedded.retailers);
  
  // Direct Dutchie requires special handling but is technically scrapable
  scrapable.push(...config.dutchieDirect.retailers);
  
  // Other platforms - only if marked scrapable
  for (const retailer of config.otherPlatforms.retailers) {
    if ((retailer as any).scrapable === true) {
      scrapable.push(retailer);
    }
  }
  
  return scrapable;
}

/**
 * Get NYC-only retailers for coverage calculation
 */
export function getNYCRetailers(): RetailerConfig[] {
  const allRetailers = getScrapableRetailers();
  const nycRegions = ['manhattan', 'brooklyn', 'queens', 'bronx', 'staten_island'];
  
  return allRetailers.filter(r => 
    r.locations.some(loc => nycRegions.includes(loc.region.toLowerCase()))
  );
}

/**
 * Get retailer by slug
 */
export function getRetailerBySlug(slug: string): RetailerConfig | undefined {
  const config = loadRetailerConfig();
  
  const allRetailers = [
    ...config.dutchieEmbedded.retailers,
    ...config.dutchieDirect.retailers,
    ...config.otherPlatforms.retailers,
  ];
  
  return allRetailers.find(r => r.slug === slug);
}

/**
 * Summary stats for coverage reporting
 */
export function getCoverageStats(): {
  totalRetailers: number;
  totalLocations: number;
  byRegion: Record<string, number>;
  byPlatform: Record<string, number>;
  scrapableCount: number;
} {
  const config = loadRetailerConfig();
  const allRetailers = [
    ...config.dutchieEmbedded.retailers,
    ...config.dutchieDirect.retailers,
    ...config.otherPlatforms.retailers,
  ];
  
  const byRegion: Record<string, number> = {};
  const byPlatform: Record<string, number> = {};
  let totalLocations = 0;
  
  for (const retailer of allRetailers) {
    // Count by platform
    byPlatform[retailer.platform] = (byPlatform[retailer.platform] || 0) + 1;
    
    // Count locations by region
    for (const loc of retailer.locations) {
      totalLocations++;
      const region = loc.region.toLowerCase();
      byRegion[region] = (byRegion[region] || 0) + 1;
    }
  }
  
  const scrapable = getScrapableRetailers();
  
  return {
    totalRetailers: allRetailers.length,
    totalLocations,
    byRegion,
    byPlatform,
    scrapableCount: scrapable.length,
  };
}

// CLI usage - run with: node --loader ts-node/esm scripts/lib/retailer-prioritizer.ts
// Or import as module
