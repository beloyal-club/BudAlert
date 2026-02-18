// Stagehand v3 + BrowserBase - Simpler test with longer waits
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

const BROWSERBASE_API_KEY = 'bb_live_9DOgx7Trvyon7_zMAvtVxrpugDI';
const BROWSERBASE_PROJECT_ID = '5838b775-9417-42f0-b272-c0142eec43b7';

// Use a direct Dutchie URL instead of embedded
const TEST_URL = 'https://dutchie.com/dispensary/conbud-les/products/flower';

async function testStagehand() {
  console.log('🚀 Stagehand v3 Test - Simpler approach');
  console.log(`📍 Target: ${TEST_URL}\n`);

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    apiKey: BROWSERBASE_API_KEY,
    projectId: BROWSERBASE_PROJECT_ID,
    model: "openai/gpt-4o-mini",  // Faster model
    verbose: 1,
  });

  try {
    await stagehand.init();
    console.log(`✅ Session: https://browserbase.com/sessions/${stagehand.browserbaseSessionID}\n`);

    const page = stagehand.context.pages()[0];

    // Navigate
    console.log('📄 Navigating...');
    await page.goto(TEST_URL, { waitUntil: 'load', timeout: 45000 });
    
    // Wait longer for hydration
    console.log('⏳ Waiting 8s for React hydration...');
    await new Promise(r => setTimeout(r, 8000));

    // Check page title
    const title = await page.title();
    console.log(`📌 Page title: ${title}`);

    // Take a screenshot for debugging
    const screenshot = await page.screenshot();
    console.log('📸 Screenshot taken');

    // Look for age gate first
    console.log('\n🔞 Checking for age gate...');
    try {
      const pageContent = await stagehand.extract(
        "What is currently visible on this page? Is there an age verification popup or age gate asking if user is 21+? Is there a menu of products visible?",
        z.object({
          hasAgeGate: z.boolean().describe("Is there an age verification modal asking if user is 21+?"),
          hasProductMenu: z.boolean().describe("Is there a product menu/listing visible?"),
          pageDescription: z.string().describe("Brief description of what's on the page"),
        }),
        { timeout: 15000 }
      );
      console.log('Page state:', JSON.stringify(pageContent, null, 2));

      // If age gate exists, click YES
      if (pageContent.hasAgeGate) {
        console.log('\n🖱️ Attempting to dismiss age gate...');
        await stagehand.act("click the YES button or 'I am 21+' button to confirm age");
        await new Promise(r => setTimeout(r, 3000));
        console.log('✅ Age gate dismissed');
      }
    } catch (err) {
      console.log(`⚠️ Page check failed: ${err.message}`);
    }

    // Now try to extract products
    console.log('\n📦 Extracting products...');
    const ProductSchema = z.array(z.object({
      name: z.string(),
      brand: z.string().optional(),
      price: z.string().optional(),
    }));

    try {
      const products = await stagehand.extract(
        "Extract the first 5 cannabis products shown on this dispensary menu. Get product names, brands, and prices.",
        ProductSchema,
        { timeout: 20000 }
      );
      console.log(`Found ${products.length} products:`, JSON.stringify(products, null, 2));
    } catch (err) {
      console.log(`⚠️ Extract failed: ${err.message}`);
    }

    await stagehand.close();
    console.log('\n✅ Done');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    try { await stagehand.close(); } catch {}
  }
}

testStagehand();
