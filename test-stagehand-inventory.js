// Stagehand v3 + BrowserBase test for inventory extraction
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

const BROWSERBASE_API_KEY = 'bb_live_9DOgx7Trvyon7_zMAvtVxrpugDI';
const BROWSERBASE_PROJECT_ID = '5838b775-9417-42f0-b272-c0142eec43b7';

// Test URL - embedded Dutchie menu
const TEST_URL = 'https://conbud.com/stores/conbud-les/products/flower';

async function testInventoryExtraction() {
  console.log('🚀 Starting Stagehand inventory test...');
  console.log(`📍 Target URL: ${TEST_URL}\n`);

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    apiKey: BROWSERBASE_API_KEY,
    projectId: BROWSERBASE_PROJECT_ID,
    model: "anthropic/claude-sonnet-4-5",  // Good balance of capability and cost
    verbose: 1,
  });

  try {
    await stagehand.init();
    console.log(`✅ Stagehand initialized`);
    console.log(`🔗 Live session: https://browserbase.com/sessions/${stagehand.browserbaseSessionID}\n`);

    const page = stagehand.context.pages()[0];

    // Navigate to the menu page
    console.log('📄 Navigating to menu page...');
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000)); // Wait for React to hydrate

    // Step 1: Extract initial product listing
    console.log('\n📦 STEP 1: Extracting product listing...');
    
    const ProductListSchema = z.array(z.object({
      name: z.string().describe("Product name"),
      brand: z.string().optional().describe("Brand name if visible"),
      price: z.string().optional().describe("Price as shown (e.g. '$35.00')"),
      weight: z.string().optional().describe("Weight/size (e.g. '3.5g', '1oz')"),
      category: z.string().optional().describe("Category like flower, preroll, etc"),
      lowInventoryWarning: z.string().optional().describe("Any 'only X left' or low stock warning"),
      thcContent: z.string().optional().describe("THC percentage if shown"),
    }));

    let products = [];
    try {
      products = await stagehand.extract(
        "Extract all visible cannabis products from this dispensary menu page. Include product names, brands, prices, weights, and any low inventory warnings like 'Only X left' or 'Low stock'.",
        ProductListSchema,
        { timeout: 30000 }
      );
      console.log(`✅ Found ${products.length} products`);
      console.log('Sample products:', JSON.stringify(products.slice(0, 3), null, 2));
    } catch (err) {
      console.log(`⚠️ Extract failed: ${err.message}`);
    }

    // Step 2: Try to click on a product to get detail view
    console.log('\n🖱️ STEP 2: Clicking on first product for detail view...');
    
    try {
      // First observe what actions are available
      const actions = await stagehand.observe("find product cards or product links I can click on");
      console.log(`Found ${actions.length} clickable elements`);
      
      if (actions.length > 0) {
        console.log('First action:', JSON.stringify(actions[0], null, 2));
        
        // Click the first product
        await stagehand.act("click on the first product card or product listing to view its details");
        await new Promise(r => setTimeout(r, 2000)); // Wait for modal/page
        
        // Extract product detail including inventory
        console.log('\n📋 STEP 3: Extracting product detail...');
        
        const ProductDetailSchema = z.object({
          name: z.string().describe("Product name"),
          brand: z.string().optional(),
          price: z.string().optional(),
          description: z.string().optional(),
          thc: z.string().optional(),
          cbd: z.string().optional(),
          weight: z.string().optional(),
          inventoryWarning: z.string().optional().describe("Any inventory warning like 'Only X left'"),
          quantitySelector: z.boolean().describe("Is there a quantity selector visible?"),
          maxQuantity: z.number().optional().describe("Maximum quantity shown in dropdown if visible"),
          addToCartButton: z.boolean().describe("Is add to cart button visible?"),
        });

        const detail = await stagehand.extract(
          "Extract product details including any inventory warnings, quantity limits, or 'only X left' messages. Look for any indicators of stock levels.",
          ProductDetailSchema,
          { timeout: 20000 }
        );
        console.log('Product detail:', JSON.stringify(detail, null, 2));

        // Step 4: Try the add-to-cart trick
        console.log('\n🛒 STEP 4: Attempting add-to-cart inventory check...');
        
        // Check if there's a quantity field we can manipulate
        const quantityActions = await stagehand.observe("find quantity input field, quantity selector, or number input near add to cart");
        
        if (quantityActions.length > 0) {
          console.log('Found quantity controls:', quantityActions.length);
          
          try {
            // Try to set quantity to 999
            await stagehand.act("if there is a quantity input field, clear it and type 999");
            await new Promise(r => setTimeout(r, 500));
            
            // Try to add to cart
            await stagehand.act("click the add to cart button");
            await new Promise(r => setTimeout(r, 2000));
            
            // Look for error messages
            const ErrorSchema = z.object({
              errorMessage: z.string().optional().describe("Any error message about quantity limits"),
              maxAvailable: z.number().optional().describe("If the error says 'only X available', what is X?"),
              cartQuantityAdjusted: z.boolean().describe("Did the system adjust the quantity automatically?"),
              finalQuantity: z.number().optional().describe("What quantity ended up in cart?"),
            });

            const errorResult = await stagehand.extract(
              "Look for any error messages, notifications, or alerts about inventory limits. Find text like 'only X available', 'maximum quantity is X', 'out of stock', or similar inventory-related messages.",
              ErrorSchema,
              { timeout: 10000 }
            );
            console.log('Inventory check result:', JSON.stringify(errorResult, null, 2));
            
          } catch (err) {
            console.log(`⚠️ Add to cart attempt: ${err.message}`);
          }
        } else {
          console.log('No quantity controls found - trying direct add to cart');
          
          try {
            await stagehand.act("click the add to cart button");
            await new Promise(r => setTimeout(r, 2000));
            
            // Check cart for quantity info
            await stagehand.act("click on the cart icon or view cart");
            await new Promise(r => setTimeout(r, 1500));
            
            const CartSchema = z.object({
              items: z.array(z.object({
                name: z.string(),
                quantity: z.number().optional(),
                maxQuantity: z.number().optional().describe("Maximum allowed quantity if shown"),
              })),
            });

            const cartInfo = await stagehand.extract(
              "Extract cart information including quantities and any maximum quantity limits shown",
              CartSchema,
              { timeout: 10000 }
            );
            console.log('Cart info:', JSON.stringify(cartInfo, null, 2));
            
          } catch (err) {
            console.log(`⚠️ Cart check: ${err.message}`);
          }
        }
      }
    } catch (err) {
      console.log(`⚠️ Product interaction failed: ${err.message}`);
    }

    // Final summary
    console.log('\n========== SUMMARY ==========');
    console.log(`Products found: ${products.length}`);
    console.log(`Session URL: https://browserbase.com/sessions/${stagehand.browserbaseSessionID}`);
    
    await stagehand.close();
    console.log('\n✅ Session closed');

    return { success: true, products };
    
  } catch (err) {
    console.error('❌ Fatal error:', err);
    try { await stagehand.close(); } catch {}
    return { success: false, error: err.message };
  }
}

testInventoryExtraction()
  .then(result => {
    console.log('\n========== FINAL RESULT ==========');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
