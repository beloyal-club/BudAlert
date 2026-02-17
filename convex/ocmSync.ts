/**
 * OCM License Sync - Convex Integration (DATA-004)
 * 
 * Syncs NYS Office of Cannabis Management license data with our retailers table.
 * Validates existing retailers against official licenses.
 */

import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

const OCM_API_BASE = "https://data.ny.gov/resource/jskf-tt3q.json";
const RETAIL_LICENSE_CODE = "OCMRETL";
const ACTIVE_STATUS_CODE = "LICACT";

interface OCMLicense {
  license_number?: string;
  license_type: string;
  license_type_code: string;
  license_status: string;
  license_status_code: string;
  issued_date?: string;
  expiration_date?: string;
  entity_name: string;
  dba?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  county?: string;
  region?: string;
  business_website?: string;
  operational_status?: string;
  hours_of_operation?: string;
  retail_date_opened_to_public?: string;
  see_category?: string;
}

/**
 * Normalize name for matching (lowercase, remove special chars)
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^a-z0-9\s']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculate match score between two names (0-1)
 */
function calculateNameMatchScore(name1: string, name2: string): number {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);
  
  if (n1 === n2) return 1.0;
  
  // Check if one contains the other
  if (n1.includes(n2) || n2.includes(n1)) return 0.8;
  
  // Simple word overlap scoring
  const words1 = new Set(n1.split(" "));
  const words2 = new Set(n2.split(" "));
  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;
  
  return intersection / union;
}

/**
 * Fetch all retail licenses from OCM API
 */
export const fetchOCMLicenses = action({
  handler: async (): Promise<OCMLicense[]> => {
    const allLicenses: OCMLicense[] = [];
    const limit = 1000;
    let offset = 0;
    
    while (true) {
      const url = new URL(OCM_API_BASE);
      url.searchParams.set("$where", `license_type_code='${RETAIL_LICENSE_CODE}'`);
      url.searchParams.set("$limit", String(limit));
      url.searchParams.set("$offset", String(offset));
      
      const response = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
      });
      
      if (!response.ok) {
        throw new Error(`OCM API error: ${response.status}`);
      }
      
      const licenses: OCMLicense[] = await response.json();
      allLicenses.push(...licenses);
      
      if (licenses.length < limit) break;
      offset += limit;
    }
    
    return allLicenses;
  },
});

/**
 * Upsert retailers from OCM license data
 */
export const upsertFromOCM = mutation({
  args: {
    licenses: v.array(v.object({
      licenseNumber: v.string(),
      entityName: v.string(),
      dba: v.optional(v.string()),
      street: v.string(),
      city: v.string(),
      state: v.string(),
      zip: v.string(),
      region: v.string(),
      county: v.string(),
      website: v.optional(v.string()),
      hoursOfOperation: v.optional(v.string()),
      issuedDate: v.optional(v.string()),
      expirationDate: v.optional(v.string()),
      openedDate: v.optional(v.string()),
      isActive: v.boolean(),
      isOperational: v.boolean(),
      socialEquityCategories: v.array(v.string()),
    })),
  },
  handler: async (ctx, { licenses }) => {
    const now = Date.now();
    let created = 0;
    let updated = 0;
    let skipped = 0;
    
    for (const license of licenses) {
      // Try to find existing retailer by license number first
      let existing = await ctx.db
        .query("retailers")
        .withIndex("by_license", (q) => q.eq("licenseNumber", license.licenseNumber))
        .first();
      
      // If not found by license, try by name similarity
      if (!existing) {
        const publicName = license.dba || license.entityName;
        const allRetailers = await ctx.db.query("retailers").collect();
        
        for (const retailer of allRetailers) {
          const score = Math.max(
            calculateNameMatchScore(retailer.name, publicName),
            calculateNameMatchScore(retailer.name, license.entityName)
          );
          if (score >= 0.7) {
            existing = retailer;
            break;
          }
        }
      }
      
      const publicName = license.dba || license.entityName;
      const slug = publicName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      
      if (existing) {
        // Update existing retailer with license info
        await ctx.db.patch(existing._id, {
          licenseNumber: license.licenseNumber,
          licenseType: "Adult-Use Retail Dispensary",
          address: {
            street: license.street,
            city: license.city,
            state: license.state,
            zip: license.zip,
          },
          region: license.region,
          isActive: license.isActive && license.isOperational,
          operatingHours: license.hoursOfOperation,
          metadata: {
            ...((existing.metadata as any) || {}),
            ocmLastSync: now,
            ocmOpenedDate: license.openedDate,
            ocmExpirationDate: license.expirationDate,
            socialEquityCategories: license.socialEquityCategories,
            website: license.website,
            county: license.county,
          },
        });
        updated++;
      } else {
        // Create new retailer from OCM data
        await ctx.db.insert("retailers", {
          name: publicName,
          slug,
          licenseNumber: license.licenseNumber,
          licenseType: "Adult-Use Retail Dispensary",
          address: {
            street: license.street,
            city: license.city,
            state: license.state,
            zip: license.zip,
          },
          region: license.region,
          menuSources: [], // No menu sources yet
          operatingHours: license.hoursOfOperation,
          isActive: license.isActive && license.isOperational,
          firstSeenAt: now,
          metadata: {
            ocmLastSync: now,
            ocmEntityName: license.entityName,
            ocmDba: license.dba,
            ocmIssuedDate: license.issuedDate,
            ocmOpenedDate: license.openedDate,
            ocmExpirationDate: license.expirationDate,
            socialEquityCategories: license.socialEquityCategories,
            website: license.website,
            county: license.county,
          },
        });
        created++;
      }
    }
    
    return { created, updated, skipped, total: licenses.length };
  },
});

/**
 * Get OCM sync status and statistics
 */
export const getOCMSyncStatus = query({
  handler: async (ctx) => {
    const retailers = await ctx.db.query("retailers").collect();
    
    const withLicense = retailers.filter(r => r.licenseNumber);
    const withoutLicense = retailers.filter(r => !r.licenseNumber);
    const active = retailers.filter(r => r.isActive);
    const withMenu = retailers.filter(r => r.menuSources.length > 0);
    
    const byRegion = retailers.reduce((acc, r) => {
      acc[r.region] = (acc[r.region] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      total: retailers.length,
      withLicense: withLicense.length,
      withoutLicense: withoutLicense.length,
      active: active.length,
      withMenu: withMenu.length,
      byRegion,
      lastSynced: Math.max(...retailers
        .map(r => (r.metadata as any)?.ocmLastSync || 0)
        .filter(t => t > 0)) || null,
    };
  },
});

/**
 * Main sync action - fetches from OCM and updates database
 */
export const runOCMSync = action({
  handler: async (ctx): Promise<{
    fetched: number;
    created: number;
    updated: number;
    skipped: number;
  }> => {
    // Fetch all licenses from OCM
    const rawLicenses = await ctx.runAction(fetchOCMLicenses as any, {});
    
    // Filter and process
    const processed = rawLicenses
      .filter((l: OCMLicense) => l.address_line_1 && l.city)
      .map((l: OCMLicense) => ({
        licenseNumber: l.license_number || l.entity_name.substring(0, 20),
        entityName: l.entity_name,
        dba: l.dba,
        street: [l.address_line_1, l.address_line_2].filter(Boolean).join(", "),
        city: l.city!,
        state: l.state || "NY",
        zip: l.zip_code || "",
        region: l.region || "Unknown",
        county: l.county || "Unknown",
        website: l.business_website,
        hoursOfOperation: l.hours_of_operation,
        issuedDate: l.issued_date,
        expirationDate: l.expiration_date,
        openedDate: l.retail_date_opened_to_public,
        isActive: l.license_status_code === ACTIVE_STATUS_CODE,
        isOperational: l.operational_status === "Active",
        socialEquityCategories: (l.see_category || "")
          .split(",")
          .map(s => s.trim())
          .filter(Boolean),
      }));
    
    // Batch upsert (Convex has limits, so we chunk)
    const BATCH_SIZE = 50;
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    
    for (let i = 0; i < processed.length; i += BATCH_SIZE) {
      const batch = processed.slice(i, i + BATCH_SIZE);
      const result = await ctx.runMutation(upsertFromOCM as any, { licenses: batch });
      totalCreated += result.created;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
    }
    
    return {
      fetched: rawLicenses.length,
      created: totalCreated,
      updated: totalUpdated,
      skipped: totalSkipped,
    };
  },
});
