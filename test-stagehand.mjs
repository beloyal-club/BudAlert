import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import fs from "fs";

const BROWSERBASE_API_KEY = "bb_live_9DOgx7Trvyon7_zMAvtVxrpugDI";
const BROWSERBASE_PROJECT_ID = "5838b775-9417-42f0-b272-c0142eec43b7";

const results = {
  timestamp: new Date().toISOString(),
  url: "https://conbud.com/stores/conbud-les/products/flower",
  status: "pending",
  steps: [],
  inventoryData: null,
  errors: [],
};

function log(step, data) {
  console.log(`\n=== ${step} ===`);
  console.log(JSON.stringify(data, null, 2));
  results.steps.push({ step, data, time: new Date().toISOString() });
}

async function main() {
  let stagehand;
  
  try {
    console.log("Initializing Stagehand with BrowserBase...");
    
    stagehand = new Stagehand({
      env: "BROWSERBASE",
      apiKey: BROWSERBASE_API_KEY,
      projectId: BROWSERBASE_PROJECT_ID,
      modelName: "gpt-4o",
      modelClientOptions: {
        apiKey: process.env.OPENAI_API_KEY,
      },
    });
    
    await stagehand.init();
    log("init", { success: true, message: "Stagehand initialized" });
    
    // Get the page from context
    const page = stagehand.context.pages()[0];
    
    // Navigate to the flower menu
    console.log("\nNavigating to ConBud flower menu...");
    await page.goto(results.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    
    // Wait longer for dynamic content to load
    console.log("\nWaiting for products to load...");
    await page.waitForTimeout(8000);
    log("navigate", { success: true, url: results.url });
    
    // Extract all products with inventory info using correct API
    console.log("\nExtracting product inventory data...");
    const productData = await stagehand.extract({
      instruction: "Extract all visible cannabis products from the menu grid. For each product, get: product name, brand, price, strain type (indica/sativa/hybrid), THC percentage if shown, and any inventory warnings like 'Only X left' or 'Low stock' or 'Limited quantity'. If no products are visible, describe what you see.",
      schema: z.object({
        products: z.array(z.object({
          name: z.string().describe("Product name"),
          brand: z.string().optional().describe("Brand name"),
          price: z.string().optional().describe("Price"),
          strainType: z.string().optional().describe("indica/sativa/hybrid"),
          thcPercent: z.string().optional().describe("THC percentage"),
          inventoryWarning: z.string().optional().describe("Any stock warnings"),
        })),
        totalProductsVisible: z.number().optional().describe("Number of products visible"),
        pageStatus: z.string().optional().describe("Any loading indicators or page status"),
      }),
    });
    log("extract_products", productData);
    results.inventoryData = productData;
    
    // Try clicking on first product - using correct API with 'instruction'
    console.log("\nClicking on first product...");
    try {
      await stagehand.act({ instruction: "click on the first product card in the product grid" });
      await page.waitForTimeout(3000);
      log("click_product", { success: true });
      
      // Extract product detail page info
      console.log("\nExtracting product detail info...");
      const detailData = await stagehand.extract({
        instruction: "Extract the product details including: product name, price, description, available quantities/weights, any quantity limits or max purchase amounts, inventory status, and the options shown for adding to cart",
        schema: z.object({
          productName: z.string(),
          price: z.string().optional(),
          description: z.string().optional(),
          availableWeights: z.array(z.string()).optional(),
          maxQuantity: z.number().optional(),
          inventoryStatus: z.string().optional(),
          addToCartOptions: z.string().optional(),
        }),
      });
      log("extract_detail", detailData);
      
      // Try to interact with quantity
      console.log("\nLooking for quantity controls...");
      try {
        await stagehand.act({ instruction: "increase the quantity to the maximum allowed or type 99 in the quantity field" });
        await page.waitForTimeout(2000);
        
        // Check for any error or limit message
        const limitCheck = await stagehand.extract({
          instruction: "Look for any error messages, quantity limits, or inventory warnings displayed on the page",
          schema: z.object({
            errorMessage: z.string().optional(),
            maxAllowed: z.number().optional(),
            inventoryLimit: z.string().optional(),
          }),
        });
        log("quantity_limit_check", limitCheck);
      } catch (qtyError) {
        log("quantity_error", { error: qtyError.message });
      }
      
    } catch (clickError) {
      log("click_error", { error: clickError.message });
    }
    
    results.status = "success";
    
  } catch (error) {
    console.error("Error:", error);
    results.status = "failed";
    results.errors.push({
      message: error.message,
      stack: error.stack,
    });
  } finally {
    if (stagehand) {
      try {
        await stagehand.close();
      } catch (e) {
        console.log("Close error:", e.message);
      }
    }
    
    // Write results
    fs.writeFileSync(
      "/root/clawd/cannasignal/test-results/stagehand-inventory.json",
      JSON.stringify(results, null, 2)
    );
    console.log("\n=== Results saved to stagehand-inventory.json ===");
  }
}

main();
