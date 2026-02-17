/**
 * Discover iHeartJane-powered retailers in NYS
 * DATA-002 - iHeartJane Menu Coverage
 * 
 * Strategy:
 * 1. Parse all operational retailers from OCM data
 * 2. Check websites for Jane integration markers
 * 3. Attempt to find Jane store IDs
 * 4. Test the Jane API
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface OCMRetailer {
  licenseNumber: string;
  entityName: string;
  dba: string | null;
  publicName: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  region: string;
  county: string;
  website: string | null;
  hoursOfOperation: string;
  isActive: boolean;
  isOperational: boolean;
}

interface JaneRetailer {
  licenseNumber: string;
  name: string;
  publicName: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  region: string;
  website: string;
  janeStoreId: string | null;
  janeUrl: string | null;
  detectedVia: string;
  verifiedAt: string | null;
  productCount: number | null;
  notes: string;
}

// Known Jane integration patterns
const JANE_PATTERNS = [
  /jane\.co/i,
  /iheartjane/i,
  /jane-menu/i,
  /janeembedded/i,
  /jane_menu_embed/i,
  /api\.iheartjane/i,
];

// Common Jane store URL patterns
const JANE_STORE_URL_PATTERNS = [
  /iheartjane\.com\/stores\/(\d+)/,
  /jane\.co\/stores\/(\d+)/,
  /menu\.iheartjane\.com\/stores\/(\d+)/,
];

async function main() {
  // Load OCM retailers
  const dataPath = resolve(__dirname, '../data/ocm-retailers-operational.json');
  const retailers: OCMRetailer[] = JSON.parse(readFileSync(dataPath, 'utf-8'));
  
  console.log(`\n📊 OCM Retailers Analysis`);
  console.log(`═══════════════════════════════════════`);
  console.log(`Total operational retailers: ${retailers.length}`);
  
  // Filter to those with websites
  const withWebsites = retailers.filter(r => r.website && r.website.trim() !== '');
  console.log(`Retailers with websites: ${withWebsites.length}`);
  console.log(`Retailers without websites: ${retailers.length - withWebsites.length}`);
  
  // Show sample websites
  console.log(`\n📋 Sample Websites (first 20):`);
  withWebsites.slice(0, 20).forEach(r => {
    console.log(`  - ${r.publicName}: ${r.website}`);
  });
  
  // Group by region
  const byRegion: Record<string, number> = {};
  retailers.forEach(r => {
    byRegion[r.region] = (byRegion[r.region] || 0) + 1;
  });
  
  console.log(`\n📍 Retailers by Region:`);
  Object.entries(byRegion)
    .sort((a, b) => b[1] - a[1])
    .forEach(([region, count]) => {
      console.log(`  ${region}: ${count}`);
    });
  
  // Output list of websites to check
  const websiteList = withWebsites.map(r => ({
    name: r.publicName,
    website: r.website,
    region: r.region,
    city: r.address.city,
  }));
  
  console.log(`\n💾 Writing website list to check...`);
  writeFileSync(
    resolve(__dirname, '../data/retailers-with-websites.json'),
    JSON.stringify(websiteList, null, 2)
  );
  
  console.log(`\n✅ Done! Check retailers-with-websites.json for websites to scan.`);
}

main().catch(console.error);
