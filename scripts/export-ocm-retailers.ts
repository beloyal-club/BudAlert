/**
 * Export OCM retailers to JSON for analysis
 */

import { fetchOCMData } from "./ocm-license-sync.js";
import * as fs from "fs";

async function main() {
  const { retailers, stats } = await fetchOCMData();
  
  // Write full data
  fs.writeFileSync(
    "data/ocm-retailers.json",
    JSON.stringify(retailers, null, 2)
  );
  console.log(`Wrote ${retailers.length} retailers to data/ocm-retailers.json`);
  
  // Write operational only
  const operational = retailers.filter(r => r.isOperational);
  fs.writeFileSync(
    "data/ocm-retailers-operational.json",
    JSON.stringify(operational, null, 2)
  );
  console.log(`Wrote ${operational.length} operational retailers to data/ocm-retailers-operational.json`);
  
  // Write summary
  fs.writeFileSync(
    "data/ocm-sync-stats.json",
    JSON.stringify({
      syncedAt: new Date().toISOString(),
      ...stats,
    }, null, 2)
  );
  console.log(`Wrote stats to data/ocm-sync-stats.json`);
}

main().catch(console.error);
