/**
 * OCM License Sync - DATA-004
 * 
 * Fetches NYS Office of Cannabis Management license data and cross-references
 * with our retailer database for validation and enrichment.
 * 
 * API: https://data.ny.gov/resource/jskf-tt3q.json
 * Dataset: Current OCM Licenses
 */

interface OCMLicense {
  license_number?: string;
  license_type: string;
  license_type_code: string;
  license_status: string;
  license_status_code: string;
  issued_date?: string;
  effective_date?: string;
  expiration_date?: string;
  application_number?: string;
  see_category?: string; // Social equity categories
  entity_name: string;
  dba?: string; // "Doing Business As" - the public-facing name
  location_id?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  county?: string;
  region?: string;
  business_website?: string;
  operational_status?: string;
  business_purpose?: string;
  retail_date_opened_to_public?: string;
  hours_of_operation?: string;
  primary_contact_name?: string;
}

interface ProcessedRetailer {
  licenseNumber: string;
  entityName: string;
  dba: string | null;
  publicName: string; // Either DBA or entity name
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  region: string;
  county: string;
  website: string | null;
  hoursOfOperation: string | null;
  issuedDate: string | null;
  expirationDate: string | null;
  openedDate: string | null;
  isActive: boolean;
  isOperational: boolean;
  socialEquityCategories: string[];
}

const OCM_API_BASE = "https://data.ny.gov/resource/jskf-tt3q.json";
const RETAIL_LICENSE_CODE = "OCMRETL";
const ACTIVE_STATUS_CODE = "LICACT";

/**
 * Parse hours of operation string into structured format
 * Input: "Sun: 11:00 AM - 09:00 PM; Mon: 10:00 AM - 10:00 PM; ..."
 */
function parseHoursOfOperation(hoursStr: string | undefined): Record<string, { open: string; close: string }> | null {
  if (!hoursStr) return null;
  
  const result: Record<string, { open: string; close: string }> = {};
  const dayMappings: Record<string, string> = {
    'sun': 'sunday',
    'mon': 'monday',
    'tues': 'tuesday',
    'wed': 'wednesday',
    'thurs': 'thursday',
    'fri': 'friday',
    'sat': 'saturday',
  };
  
  const parts = hoursStr.split(';').map(s => s.trim());
  for (const part of parts) {
    const match = part.match(/^(\w+):\s*(\d{1,2}:\d{2}\s*(?:AM|PM))\s*-\s*(\d{1,2}:\d{2}\s*(?:AM|PM))$/i);
    if (match) {
      const dayKey = match[1].toLowerCase();
      const fullDay = dayMappings[dayKey] || dayKey;
      result[fullDay] = {
        open: match[2].toUpperCase(),
        close: match[3].toUpperCase(),
      };
    }
  }
  
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Parse social equity categories
 * Input: "Women-Owned Business, Minority-Owned Business"
 */
function parseSocialEquityCategories(seeCategory: string | undefined): string[] {
  if (!seeCategory) return [];
  return seeCategory.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Fetch all active retail dispensary licenses from OCM
 */
async function fetchOCMRetailLicenses(): Promise<OCMLicense[]> {
  const allLicenses: OCMLicense[] = [];
  const limit = 1000;
  let offset = 0;
  
  console.log("[OCM Sync] Fetching retail dispensary licenses from NYS OCM...");
  
  while (true) {
    const url = new URL(OCM_API_BASE);
    url.searchParams.set("$where", `license_type_code='${RETAIL_LICENSE_CODE}'`);
    url.searchParams.set("$limit", String(limit));
    url.searchParams.set("$offset", String(offset));
    url.searchParams.set("$order", "entity_name");
    
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    
    if (!response.ok) {
      throw new Error(`OCM API error: ${response.status} ${response.statusText}`);
    }
    
    const licenses: OCMLicense[] = await response.json();
    allLicenses.push(...licenses);
    
    console.log(`[OCM Sync] Fetched ${licenses.length} licenses (offset ${offset})`);
    
    if (licenses.length < limit) {
      break;
    }
    offset += limit;
  }
  
  return allLicenses;
}

/**
 * Process OCM licenses into normalized retailer records
 */
function processLicenses(licenses: OCMLicense[]): ProcessedRetailer[] {
  const retailers: ProcessedRetailer[] = [];
  
  for (const license of licenses) {
    // Skip if no address (pending licenses)
    if (!license.address_line_1 || !license.city) {
      continue;
    }
    
    const retailer: ProcessedRetailer = {
      licenseNumber: license.license_number || license.application_number || "UNKNOWN",
      entityName: license.entity_name,
      dba: license.dba || null,
      publicName: license.dba || license.entity_name,
      address: {
        street: [license.address_line_1, license.address_line_2].filter(Boolean).join(", "),
        city: license.city,
        state: license.state || "NY",
        zip: license.zip_code || "",
      },
      region: license.region || "Unknown",
      county: license.county || "Unknown",
      website: license.business_website || null,
      hoursOfOperation: license.hours_of_operation || null,
      issuedDate: license.issued_date || null,
      expirationDate: license.expiration_date || null,
      openedDate: license.retail_date_opened_to_public || null,
      isActive: license.license_status_code === ACTIVE_STATUS_CODE,
      isOperational: license.operational_status === "Active",
      socialEquityCategories: parseSocialEquityCategories(license.see_category),
    };
    
    retailers.push(retailer);
  }
  
  return retailers;
}

/**
 * Generate statistics from processed retailers
 */
function generateStats(retailers: ProcessedRetailer[]) {
  const total = retailers.length;
  const active = retailers.filter(r => r.isActive).length;
  const operational = retailers.filter(r => r.isOperational).length;
  const withHours = retailers.filter(r => r.hoursOfOperation).length;
  const withWebsite = retailers.filter(r => r.website).length;
  
  const byRegion = retailers.reduce((acc, r) => {
    acc[r.region] = (acc[r.region] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const socialEquity = retailers.filter(r => r.socialEquityCategories.length > 0).length;
  
  return {
    total,
    active,
    operational,
    withHours,
    withWebsite,
    socialEquity,
    byRegion,
  };
}

/**
 * Main sync function
 */
async function syncOCMLicenses() {
  console.log("[OCM Sync] Starting NYS OCM license sync...");
  const startTime = Date.now();
  
  // Fetch all retail licenses
  const rawLicenses = await fetchOCMRetailLicenses();
  console.log(`[OCM Sync] Total licenses fetched: ${rawLicenses.length}`);
  
  // Process into normalized records
  const retailers = processLicenses(rawLicenses);
  console.log(`[OCM Sync] Processed retailers: ${retailers.length}`);
  
  // Generate stats
  const stats = generateStats(retailers);
  
  console.log("\n[OCM Sync] ===== STATS =====");
  console.log(`Total Retail Licenses: ${stats.total}`);
  console.log(`Active Licenses: ${stats.active}`);
  console.log(`Operational (Open): ${stats.operational}`);
  console.log(`With Hours Listed: ${stats.withHours}`);
  console.log(`With Website: ${stats.withWebsite}`);
  console.log(`Social Equity Licensees: ${stats.socialEquity}`);
  console.log("\nBy Region:");
  for (const [region, count] of Object.entries(stats.byRegion).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${region}: ${count}`);
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n[OCM Sync] Completed in ${elapsed}s`);
  
  return { rawLicenses, retailers, stats };
}

/**
 * Export for Convex integration
 */
export async function fetchOCMData() {
  return syncOCMLicenses();
}

/**
 * Export types for use elsewhere
 */
export type { OCMLicense, ProcessedRetailer };
export { parseHoursOfOperation, parseSocialEquityCategories };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  syncOCMLicenses()
    .then(({ stats }) => {
      console.log("\n✅ OCM sync complete!");
      process.exit(0);
    })
    .catch((err) => {
      console.error("❌ OCM sync failed:", err);
      process.exit(1);
    });
}
