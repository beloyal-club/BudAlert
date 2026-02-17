/**
 * DATA-001 Validation: Scraper Output vs Expected
 * 
 * Test cases from actual stealth scraper output, manually verified
 */

import { normalizeProductName, NormalizedProduct } from '../convex/lib/productNormalizer';

interface TestCase {
  input: {
    rawName: string;
    rawBrand?: string;
    rawCategory?: string;
    rawThc?: string;
    rawCbd?: string;
    price?: string;
  };
  expected: Partial<NormalizedProduct> & {
    priceNumeric?: number;
    actualLiveName?: string; // What the product is actually called on the site
  };
}

const TEST_CASES: TestCase[] = [
  // Case 1: Standard pipe-delimited format
  {
    input: {
      rawName: "Grocery | 28g Flower - Sativa | Black DieselGrocerySativaTHC: 29.21%",
      rawBrand: "Grocery",
      price: "$160.00",
    },
    expected: {
      name: "Black Diesel",
      brand: "Grocery",
      category: "flower",
      strain: "sativa",
      thc: 29.21,
      weight: { amount: 28, unit: "g" },
      actualLiveName: "Black Diesel - 28g Sativa Flower",
      priceNumeric: 160,
    }
  },
  
  // Case 2: TAC + THC both present
  {
    input: {
      rawName: "Splash | 3.5g Flower | Chem 91SplashHybridTAC: 33.23%THC: 25.9%",
      rawBrand: "Splash",
      price: "$24.00",
    },
    expected: {
      name: "Chem 91",
      brand: "Splash",
      category: "flower",
      strain: "hybrid",
      thc: 25.9,
      tac: 33.23,
      weight: { amount: 3.5, unit: "g" },
      priceNumeric: 24,
    }
  },
  
  // Case 3: Complex brand name
  {
    input: {
      rawName: "Cheevo | Whole Flower 28g | RS11CheevoHybridTAC: 28.79%THC: 24.3%",
      rawBrand: "Cheevo",
      price: "$160.00",
    },
    expected: {
      name: "RS11",
      brand: "Cheevo",
      category: "flower",
      strain: "hybrid",
      thc: 24.3,
      tac: 28.79,
      weight: { amount: 28, unit: "g" },
      priceNumeric: 160,
    }
  },
  
  // Case 4: Staff Pick tag
  {
    input: {
      rawName: "Zizzle | Flower Jar 3.5g | Silver HazeZizzleSativaTHC: 21.2%Staff Pick",
      rawBrand: "Zizzle",
      price: "$50.00",
    },
    expected: {
      name: "Silver Haze",
      brand: "Zizzle",
      category: "flower",
      strain: "sativa",
      thc: 21.2,
      weight: { amount: 3.5, unit: "g" },
      tags: ["Staff Pick"],
      priceNumeric: 50,
    }
  },
  
  // Case 5: CBD present
  {
    input: {
      rawName: "Banzzy 1305 | 3.5 | Flower Jar | Purple PrinceBanzzy 1305Indica-HybridTAC: 27.8%THC: 24.7%CBD: 0.1%",
      rawBrand: "Banzzy 1305",
      price: "$44.00",
    },
    expected: {
      name: "Purple Prince",
      brand: "Banzzy 1305",
      category: "flower",
      strain: "indica", // indica-hybrid should normalize to indica
      thc: 24.7,
      tac: 27.8,
      cbd: 0.1,
      priceNumeric: 44,
    }
  },
  
  // Case 6: Infused ground flower (complex product)
  {
    input: {
      rawName: "Revert Cannabis | Homie Pack + Rolling Accessories 14g Infused Ground Flower | King LouisRevert CannabisIndicaTHC: 27.8%",
      rawBrand: "Revert Cannabis",
      price: "$85.00",
    },
    expected: {
      name: "King Louis",
      brand: "Revert Cannabis",
      category: "flower",
      strain: "indica",
      thc: 27.8,
      weight: { amount: 14, unit: "g" },
      priceNumeric: 85,
    }
  },
  
  // Case 7: Millies Pre-Ground
  {
    input: {
      rawName: "FLWR City | 5g Millies Pre-Ground | SativaFLWR CITYSativaTHC: 34%",
      rawBrand: "FLWR CITY",
      price: "$35.00",
    },
    expected: {
      name: "Sativa", // This is tricky - strain type is the product name
      brand: "FLWR CITY",
      category: "flower",
      strain: "sativa",
      thc: 34,
      weight: { amount: 5, unit: "g" },
      priceNumeric: 35,
    }
  },
  
  // Case 8: No pipe separators - dash format
  {
    input: {
      rawName: "Permanent Marker - Premium Smalls - 1gTo The MoonHybridTHC: 29.22%",
      rawBrand: "To The Moon",
      price: "$13.00",
    },
    expected: {
      name: "Permanent Marker",
      brand: "To The Moon",
      category: "flower",
      strain: "hybrid",
      thc: 29.22,
      weight: { amount: 1, unit: "g" },
      priceNumeric: 13,
    }
  },
  
  // Case 9: THC as mg (misformatted)
  {
    input: {
      rawName: "Cheech & Chong | 3.5g Flower | LowriderCheech & ChongIndicaTHC: 28.7 mg",
      rawBrand: "Cheech & Chong",
      price: "$35.00",
    },
    expected: {
      name: "Lowrider",
      brand: "Cheech & Chong",
      category: "flower",
      strain: "indica",
      thc: 28.7, // Should parse despite "mg" suffix
      weight: { amount: 3.5, unit: "g" },
      priceNumeric: 35,
    }
  },
  
  // Case 10: Quarter ounce format
  {
    input: {
      rawName: "La Bomba | Quarter OunceFlorist FarmsHybridTHC: 28%",
      rawBrand: "Florist Farms",
      price: "$65.00",
    },
    expected: {
      name: "La Bomba",
      brand: "Florist Farms",
      category: "flower", // Should infer from weight
      strain: "hybrid",
      thc: 28,
      weight: { amount: 7, unit: "g" }, // Quarter = 7g
      priceNumeric: 65,
    }
  },
];

// Run validation
function validateNormalizer(): {
  passed: number;
  failed: number;
  results: Array<{
    input: string;
    expected: any;
    actual: NormalizedProduct;
    passed: boolean;
    issues: string[];
  }>;
} {
  let passed = 0;
  let failed = 0;
  const results: any[] = [];

  for (const testCase of TEST_CASES) {
    const { input, expected } = testCase;
    const actual = normalizeProductName(
      input.rawName,
      input.rawBrand,
      input.rawCategory,
      input.rawThc,
      input.rawCbd
    );

    const issues: string[] = [];

    // Check each expected field
    if (expected.name && actual.name !== expected.name) {
      issues.push(`name: expected "${expected.name}", got "${actual.name}"`);
    }
    if (expected.brand && actual.brand !== expected.brand) {
      issues.push(`brand: expected "${expected.brand}", got "${actual.brand}"`);
    }
    if (expected.category && actual.category !== expected.category) {
      issues.push(`category: expected "${expected.category}", got "${actual.category}"`);
    }
    if (expected.strain && actual.strain !== expected.strain) {
      issues.push(`strain: expected "${expected.strain}", got "${actual.strain}"`);
    }
    if (expected.thc !== undefined && actual.thc !== expected.thc) {
      issues.push(`thc: expected ${expected.thc}, got ${actual.thc}`);
    }
    if (expected.cbd !== undefined && actual.cbd !== expected.cbd) {
      issues.push(`cbd: expected ${expected.cbd}, got ${actual.cbd}`);
    }
    if (expected.tac !== undefined && actual.tac !== expected.tac) {
      issues.push(`tac: expected ${expected.tac}, got ${actual.tac}`);
    }
    if (expected.weight) {
      if (!actual.weight) {
        issues.push(`weight: expected ${JSON.stringify(expected.weight)}, got null`);
      } else if (actual.weight.amount !== expected.weight.amount || actual.weight.unit !== expected.weight.unit) {
        issues.push(`weight: expected ${JSON.stringify(expected.weight)}, got ${JSON.stringify(actual.weight)}`);
      }
    }
    if (expected.tags && expected.tags.length > 0) {
      const missingTags = expected.tags.filter(t => !actual.tags.includes(t));
      if (missingTags.length > 0) {
        issues.push(`tags: missing ${JSON.stringify(missingTags)}`);
      }
    }

    const isPassed = issues.length === 0;
    if (isPassed) passed++;
    else failed++;

    results.push({
      input: input.rawName.substring(0, 60) + "...",
      expected,
      actual,
      passed: isPassed,
      issues,
    });
  }

  return { passed, failed, results };
}

// Main execution
const { passed, failed, results } = validateNormalizer();

console.log("=".repeat(70));
console.log("DATA-001: Product Normalizer Validation");
console.log("=".repeat(70));
console.log(`\nResults: ${passed} passed, ${failed} failed out of ${results.length} test cases\n`);

for (const result of results) {
  const status = result.passed ? "✅ PASS" : "❌ FAIL";
  console.log(`${status}: ${result.input}`);
  if (!result.passed) {
    for (const issue of result.issues) {
      console.log(`       → ${issue}`);
    }
  }
}

console.log("\n" + "=".repeat(70));
console.log("SUMMARY");
console.log("=".repeat(70));
console.log(`Passed: ${passed}/${results.length} (${Math.round(100 * passed / results.length)}%)`);
console.log(`Failed: ${failed}/${results.length}`);

if (failed > 0) {
  console.log("\n⚠️  Some normalizer tests failed - see issues above");
  process.exit(1);
} else {
  console.log("\n✅ All normalizer tests passed!");
}
