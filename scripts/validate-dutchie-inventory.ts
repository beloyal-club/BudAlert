/**
 * Dutchie Inventory Validation Script
 * 
 * Tests the Dutchie GraphQL API to verify quantity field extraction.
 * Reports data quality metrics for inventory coverage.
 * 
 * Usage:
 *   npx tsx scripts/validate-dutchie-inventory.ts [dispensary-slug]
 *   npx tsx scripts/validate-dutchie-inventory.ts dagmar-cannabis
 *   npx tsx scripts/validate-dutchie-inventory.ts --all
 * 
 * Data Quality Score:
 *   - Excellent (90%+): Nearly all products have quantity data
 *   - Good (70-89%): Most products have quantity data
 *   - Fair (50-69%): Some products missing quantity
 *   - Poor (<50%): Significant data gaps
 * 
 * NOTE: Dutchie may block direct GraphQL requests from server environments
 * (HTTP 403). The production scraper (workers/scrapers/dutchie.ts) runs on
 * Cloudflare Workers which is not blocked. For local testing:
 *   1. Use the Cloudflare Worker /test/:slug endpoint
 *   2. Or test from a browser/local environment with proper cookies
 *   3. Or deploy and test via: https://cannasignal-browser.prtl.workers.dev/test/conbud-les
 * 
 * Created: 2026-02-24 (DUTCHIE-005)
 */

// ============================================================
// GRAPHQL QUERY
// ============================================================

/**
 * Dutchie FilteredProducts GraphQL Query
 * 
 * Key fields for inventory:
 * - variants[].quantity: Exact inventory count (integer or null)
 * - variants[].price: Current price
 * - variants[].specialPrice: Sale price (when isSpecial=true)
 * - variants[].isSpecial: Boolean indicating sale
 * - variants[].option: Weight/size variant (e.g., "1g", "3.5g")
 */
const DUTCHIE_MENU_QUERY = `
query FilteredProducts(
  $dispensarySlug: String!
  $byCategory: ProductFilter
  $offset: Int
  $limit: Int
) {
  filteredProducts(
    dispensarySlug: $dispensarySlug
    byCategory: $byCategory
    offset: $offset
    limit: $limit
  ) {
    products {
      id
      name
      brand {
        name
      }
      category
      subcategory
      strainType
      potencyCbd {
        formatted
      }
      potencyThc {
        formatted
      }
      variants {
        option
        price
        specialPrice
        isSpecial
        quantity
      }
      image
    }
    totalCount
  }
}
`;

// ============================================================
// TYPES
// ============================================================

interface Variant {
  option: string;
  price: number;
  specialPrice: number | null;
  isSpecial: boolean;
  quantity: number | null;
}

interface Product {
  id: string;
  name: string;
  brand: { name: string } | null;
  category: string;
  subcategory: string | null;
  strainType: string | null;
  potencyThc: { formatted: string } | null;
  potencyCbd: { formatted: string } | null;
  variants: Variant[];
  image: string | null;
}

interface GraphQLResponse {
  data?: {
    filteredProducts?: {
      products: Product[];
      totalCount: number;
    };
  };
  errors?: Array<{ message: string }>;
}

interface ValidationResult {
  dispensarySlug: string;
  timestamp: string;
  success: boolean;
  error?: string;
  metrics?: {
    totalProducts: number;
    totalVariants: number;
    variantsWithQuantity: number;
    variantsWithNullQuantity: number;
    variantsWithZeroQuantity: number;
    quantityCoverage: number;
    inStockVariants: number;
    outOfStockVariants: number;
    lowStockVariants: number;
    dataQualityScore: number;
    dataQualityGrade: string;
  };
  samples?: {
    withQuantity: Array<{ product: string; variant: string; quantity: number }>;
    withoutQuantity: Array<{ product: string; variant: string }>;
    lowStock: Array<{ product: string; variant: string; quantity: number }>;
  };
}

// ============================================================
// TEST DISPENSARIES
// ============================================================

const TEST_DISPENSARIES = [
  { slug: 'dagmar-cannabis', name: 'Dagmar Cannabis' },
  { slug: 'conbud-les', name: 'CONBUD LES' },
  { slug: 'conbud-bronx', name: 'CONBUD Bronx' },
  { slug: 'gotham-cannabis', name: 'Gotham' },
  { slug: 'housing-works-cannabis', name: 'Housing Works Cannabis' },
  { slug: 'smacked-nyc', name: 'Smacked' },
  { slug: 'strain-stars-nyc', name: 'Strain Stars' },
];

// ============================================================
// FETCH AND VALIDATE
// ============================================================

async function fetchDutchieMenu(dispensarySlug: string): Promise<GraphQLResponse> {
  const response = await fetch('https://dutchie.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; CannaSignal-Validator/1.0)',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      operationName: 'FilteredProducts',
      variables: {
        dispensarySlug,
        byCategory: null,
        offset: 0,
        limit: 500,
      },
      query: DUTCHIE_MENU_QUERY,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

function getDataQualityGrade(score: number): string {
  if (score >= 90) return 'Excellent ⭐';
  if (score >= 70) return 'Good ✅';
  if (score >= 50) return 'Fair ⚠️';
  return 'Poor ❌';
}

async function validateDispensary(dispensarySlug: string): Promise<ValidationResult> {
  const timestamp = new Date().toISOString();

  try {
    console.log(`\n📡 Fetching ${dispensarySlug}...`);
    const data = await fetchDutchieMenu(dispensarySlug);

    // Check for GraphQL errors
    if (data.errors) {
      return {
        dispensarySlug,
        timestamp,
        success: false,
        error: `GraphQL errors: ${data.errors.map(e => e.message).join(', ')}`,
      };
    }

    const products = data.data?.filteredProducts?.products || [];

    if (products.length === 0) {
      return {
        dispensarySlug,
        timestamp,
        success: false,
        error: 'No products returned (empty menu or invalid slug)',
      };
    }

    // Analyze variants
    let totalVariants = 0;
    let variantsWithQuantity = 0;
    let variantsWithNullQuantity = 0;
    let variantsWithZeroQuantity = 0;
    let inStockVariants = 0;
    let outOfStockVariants = 0;
    let lowStockVariants = 0;

    const samplesWithQuantity: Array<{ product: string; variant: string; quantity: number }> = [];
    const samplesWithoutQuantity: Array<{ product: string; variant: string }> = [];
    const samplesLowStock: Array<{ product: string; variant: string; quantity: number }> = [];

    for (const product of products) {
      for (const variant of product.variants || []) {
        totalVariants++;

        const qty = variant.quantity;

        if (qty === null || qty === undefined) {
          variantsWithNullQuantity++;
          if (samplesWithoutQuantity.length < 5) {
            samplesWithoutQuantity.push({
              product: product.name,
              variant: variant.option || 'default',
            });
          }
        } else if (qty === 0) {
          variantsWithZeroQuantity++;
          variantsWithQuantity++;
          outOfStockVariants++;
        } else {
          variantsWithQuantity++;
          inStockVariants++;

          if (qty <= 5) {
            lowStockVariants++;
            if (samplesLowStock.length < 5) {
              samplesLowStock.push({
                product: product.name,
                variant: variant.option || 'default',
                quantity: qty,
              });
            }
          }

          if (samplesWithQuantity.length < 5) {
            samplesWithQuantity.push({
              product: product.name,
              variant: variant.option || 'default',
              quantity: qty,
            });
          }
        }
      }
    }

    // Calculate metrics
    const quantityCoverage = totalVariants > 0
      ? Math.round((variantsWithQuantity / totalVariants) * 100)
      : 0;

    const dataQualityScore = quantityCoverage;
    const dataQualityGrade = getDataQualityGrade(dataQualityScore);

    return {
      dispensarySlug,
      timestamp,
      success: true,
      metrics: {
        totalProducts: products.length,
        totalVariants,
        variantsWithQuantity,
        variantsWithNullQuantity,
        variantsWithZeroQuantity,
        quantityCoverage,
        inStockVariants,
        outOfStockVariants,
        lowStockVariants,
        dataQualityScore,
        dataQualityGrade,
      },
      samples: {
        withQuantity: samplesWithQuantity,
        withoutQuantity: samplesWithoutQuantity,
        lowStock: samplesLowStock,
      },
    };
  } catch (error) {
    return {
      dispensarySlug,
      timestamp,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================
// REPORTING
// ============================================================

function printResult(result: ValidationResult): void {
  console.log('\n' + '='.repeat(60));
  console.log(`📊 Validation Report: ${result.dispensarySlug}`);
  console.log('='.repeat(60));
  console.log(`Timestamp: ${result.timestamp}`);

  if (!result.success) {
    console.log(`\n❌ FAILED: ${result.error}`);
    return;
  }

  const m = result.metrics!;
  console.log(`\n📦 Products: ${m.totalProducts} | Variants: ${m.totalVariants}`);
  console.log(`\n📈 Data Quality Score: ${m.dataQualityScore}% (${m.dataQualityGrade})`);

  console.log('\n┌─────────────────────────────────────────┐');
  console.log('│           Quantity Coverage             │');
  console.log('├─────────────────────────────────────────┤');
  console.log(`│ With quantity:    ${String(m.variantsWithQuantity).padStart(5)} (${String(m.quantityCoverage).padStart(3)}%)        │`);
  console.log(`│ Null quantity:    ${String(m.variantsWithNullQuantity).padStart(5)}               │`);
  console.log('└─────────────────────────────────────────┘');

  console.log('\n┌─────────────────────────────────────────┐');
  console.log('│             Stock Status                │');
  console.log('├─────────────────────────────────────────┤');
  console.log(`│ In stock (qty>0): ${String(m.inStockVariants).padStart(5)}               │`);
  console.log(`│ Out of stock:     ${String(m.outOfStockVariants).padStart(5)}               │`);
  console.log(`│ Low stock (≤5):   ${String(m.lowStockVariants).padStart(5)}               │`);
  console.log('└─────────────────────────────────────────┘');

  if (result.samples?.withQuantity.length) {
    console.log('\n🔢 Sample Products WITH Quantity:');
    for (const s of result.samples.withQuantity) {
      console.log(`   • ${s.product} (${s.variant}): ${s.quantity} in stock`);
    }
  }

  if (result.samples?.lowStock.length) {
    console.log('\n⚠️  Low Stock Alerts (≤5):');
    for (const s of result.samples.lowStock) {
      console.log(`   • ${s.product} (${s.variant}): Only ${s.quantity} left!`);
    }
  }

  if (result.samples?.withoutQuantity.length) {
    console.log('\n❓ Sample Products WITHOUT Quantity:');
    for (const s of result.samples.withoutQuantity) {
      console.log(`   • ${s.product} (${s.variant}): quantity=null`);
    }
  }
}

function printSummary(results: ValidationResult[]): void {
  console.log('\n' + '═'.repeat(60));
  console.log('📊 SUMMARY: All Dispensaries');
  console.log('═'.repeat(60));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ Successful: ${successful.length} | ❌ Failed: ${failed.length}`);

  if (successful.length > 0) {
    console.log('\n┌────────────────────────────┬────────┬─────────┬────────────┐');
    console.log('│ Dispensary                 │ Prods  │ Qty Cov │ Grade      │');
    console.log('├────────────────────────────┼────────┼─────────┼────────────┤');

    for (const r of successful) {
      const m = r.metrics!;
      const name = r.dispensarySlug.slice(0, 26).padEnd(26);
      const prods = String(m.totalProducts).padStart(5);
      const cov = `${m.quantityCoverage}%`.padStart(7);
      const grade = m.dataQualityGrade.padEnd(10);
      console.log(`│ ${name} │ ${prods} │ ${cov} │ ${grade} │`);
    }

    console.log('└────────────────────────────┴────────┴─────────┴────────────┘');

    // Aggregate stats
    const totalProducts = successful.reduce((sum, r) => sum + r.metrics!.totalProducts, 0);
    const totalVariants = successful.reduce((sum, r) => sum + r.metrics!.totalVariants, 0);
    const totalWithQty = successful.reduce((sum, r) => sum + r.metrics!.variantsWithQuantity, 0);
    const avgCoverage = Math.round((totalWithQty / totalVariants) * 100);

    console.log('\n📈 Aggregate Statistics:');
    console.log(`   • Total products: ${totalProducts}`);
    console.log(`   • Total variants: ${totalVariants}`);
    console.log(`   • Variants with quantity: ${totalWithQty} (${avgCoverage}%)`);
    console.log(`   • Overall grade: ${getDataQualityGrade(avgCoverage)}`);
  }

  if (failed.length > 0) {
    console.log('\n❌ Failed Dispensaries:');
    for (const r of failed) {
      console.log(`   • ${r.dispensarySlug}: ${r.error}`);
    }
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const args = process.argv.slice(2);

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       Dutchie GraphQL Inventory Validation Tool           ║');
  console.log('║               CannaSignal Data Quality Check              ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage:
  npx tsx scripts/validate-dutchie-inventory.ts [options] [dispensary-slug]

Options:
  --all     Test all known dispensaries
  --help    Show this help message

Examples:
  npx tsx scripts/validate-dutchie-inventory.ts dagmar-cannabis
  npx tsx scripts/validate-dutchie-inventory.ts --all

Known Dispensaries:
${TEST_DISPENSARIES.map(d => `  • ${d.slug} (${d.name})`).join('\n')}
`);
    return;
  }

  if (args.includes('--all')) {
    // Test all known dispensaries
    const results: ValidationResult[] = [];

    for (const disp of TEST_DISPENSARIES) {
      const result = await validateDispensary(disp.slug);
      results.push(result);
      printResult(result);

      // Rate limiting
      await new Promise(r => setTimeout(r, 500));
    }

    printSummary(results);
  } else if (args.length > 0 && !args[0].startsWith('-')) {
    // Test single dispensary
    const slug = args[0];
    const result = await validateDispensary(slug);
    printResult(result);
  } else {
    // Default: test one dispensary
    console.log('\nNo dispensary specified. Testing with: dagmar-cannabis');
    console.log('Use --all to test all dispensaries, or specify a slug.\n');

    const result = await validateDispensary('dagmar-cannabis');
    printResult(result);
  }

  console.log('\n✨ Validation complete!');
}

main().catch(console.error);
