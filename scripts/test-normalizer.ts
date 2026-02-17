/**
 * Test script for Product Normalizer (DATA-005)
 * 
 * Run: npx ts-node scripts/test-normalizer.ts
 */

import { normalizeProductName, extractStrainName } from '../convex/lib/productNormalizer';

// Sample scraped data from actual ConBud scrape
const testCases = [
  {
    name: "Grocery | 28g Flower - Sativa | Black DieselGrocerySativaTHC: 29.21%",
    brand: "Grocery",
    thc: "29.21%",
    expected: { name: "Black Diesel", strain: "sativa", thc: 29.21, weight: { amount: 28, unit: "g" } }
  },
  {
    name: "Revert Cannabis | Homie Pack + Rolling Accessories 14g Infused Ground Flower | King LouisRevert CannabisIndicaTHC: 27.8%",
    brand: "Revert Cannabis",
    thc: "27.8%",
    expected: { name: "King Louis", strain: "indica", thc: 27.8, weight: { amount: 14, unit: "g" } }
  },
  {
    name: "FLWR City | 5g Millies Pre-Ground | SativaFLWR CITYSativaTHC: 34%",
    brand: "FLWR CITY",
    thc: "34%",
    expected: { name: "Millies Pre-Ground", strain: "sativa", thc: 34, weight: { amount: 5, unit: "g" } }
  },
  {
    name: "Splash | 3.5g Flower | Chem 91SplashHybridTAC: 33.23%THC: 25.9%",
    brand: "Splash",
    thc: "33.23%",
    expected: { name: "Chem 91", strain: "hybrid", thc: 25.9, tac: 33.23, weight: { amount: 3.5, unit: "g" } }
  },
  {
    name: "GELATO SKITTLEZDank By Definition.IndicaTHC: 26.34%",
    brand: "Dank By Definition.",
    thc: "26.34%",
    expected: { name: "GELATO SKITTLEZ", strain: "indica", thc: 26.34 }
  },
  {
    name: "Zizzle | Flower Jar 3.5g | Silver HazeZizzleSativaTHC: 21.2%Staff Pick",
    brand: "Zizzle",
    thc: "21.2%",
    expected: { name: "Silver Haze", strain: "sativa", thc: 21.2, tags: ["Staff Pick"] }
  },
  {
    name: "La Bomba | Quarter OunceFlorist FarmsHybridTHC: 28%",
    brand: "Florist Farms",
    thc: "28%",
    expected: { name: "La Bomba", strain: "hybrid", thc: 28, weight: { amount: 7, unit: "g" } }
  },
  {
    name: "Banzzy 1305 | 3.5 | Flower Jar | Purple PrinceBanzzy 1305Indica-HybridTAC: 27.8%THC: 24.7%CBD: 0.1%",
    brand: "Banzzy 1305",
    thc: "27.8%",
    cbd: "24.7%",  // Note: scraped wrong - CBD shows as 24.7% but it's actually THC
    expected: { name: "Purple Prince", strain: "indica", thc: 24.7, tac: 27.8, cbd: 0.1 }
  },
  {
    name: "RUNTZ | 3.5g Flower | Trump RuntzRuntzIndica-HybridTHC: 25%",
    brand: "Runtz",
    thc: "25%",
    expected: { name: "Trump Runtz", strain: "indica", thc: 25, weight: { amount: 3.5, unit: "g" } }
  },
  {
    name: "Permanent Marker - Premium Smalls - 1gTo The MoonHybridTHC: 29.22%",
    brand: "To The Moon",
    thc: "29.22%",
    expected: { name: "Permanent Marker", strain: "hybrid", thc: 29.22, weight: { amount: 1, unit: "g" } }
  }
];

console.log("🧪 Testing Product Normalizer (DATA-005)\n");
console.log("=".repeat(80));

let passed = 0;
let failed = 0;

for (const test of testCases) {
  const result = normalizeProductName(test.name, test.brand, undefined, test.thc, test.cbd);
  const strainName = extractStrainName(result);
  
  // Check expectations
  const issues: string[] = [];
  
  if (test.expected.strain && result.strain !== test.expected.strain) {
    issues.push(`strain: got "${result.strain}", expected "${test.expected.strain}"`);
  }
  
  if (test.expected.thc && result.thc !== test.expected.thc) {
    issues.push(`thc: got ${result.thc}, expected ${test.expected.thc}`);
  }
  
  if (test.expected.tac && result.tac !== test.expected.tac) {
    issues.push(`tac: got ${result.tac}, expected ${test.expected.tac}`);
  }
  
  if (test.expected.weight) {
    if (!result.weight) {
      issues.push(`weight: got null, expected ${JSON.stringify(test.expected.weight)}`);
    } else if (result.weight.amount !== test.expected.weight.amount) {
      issues.push(`weight: got ${result.weight.amount}${result.weight.unit}, expected ${test.expected.weight.amount}${test.expected.weight.unit}`);
    }
  }
  
  if (test.expected.tags) {
    for (const tag of test.expected.tags) {
      if (!result.tags.includes(tag)) {
        issues.push(`missing tag: "${tag}"`);
      }
    }
  }
  
  // Print result
  console.log(`\n📦 Input: "${test.name.slice(0, 60)}..."`);
  console.log(`   Brand: ${test.brand}`);
  console.log(`\n   ➡️  Parsed:`);
  console.log(`       Name:     "${result.name}"`);
  console.log(`       Strain:   "${strainName}"`);
  console.log(`       Brand:    "${result.brand}"`);
  console.log(`       Category: ${result.category}`);
  console.log(`       Strain:   ${result.strain || 'unknown'}`);
  console.log(`       THC:      ${result.thc ? result.thc + '%' : 'n/a'}`);
  console.log(`       CBD:      ${result.cbd ? result.cbd + '%' : 'n/a'}`);
  console.log(`       TAC:      ${result.tac ? result.tac + '%' : 'n/a'}`);
  console.log(`       Weight:   ${result.weight ? `${result.weight.amount}${result.weight.unit}` : 'n/a'}`);
  console.log(`       Tags:     ${result.tags.length ? result.tags.join(', ') : 'none'}`);
  console.log(`       Confidence: ${(result.confidence * 100).toFixed(0)}%`);
  
  if (issues.length > 0) {
    console.log(`   ⚠️  Issues: ${issues.join(', ')}`);
    failed++;
  } else {
    console.log(`   ✅ PASS`);
    passed++;
  }
}

console.log("\n" + "=".repeat(80));
console.log(`\n📊 Results: ${passed}/${testCases.length} passed, ${failed} with issues\n`);

// Export for programmatic use
export { testCases };
