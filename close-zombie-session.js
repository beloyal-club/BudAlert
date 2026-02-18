// Connect to zombie session and close it
import { chromium } from 'playwright';

const connectUrl = 'wss://connect.usw2.browserbase.com/?signingKey=eyJhbGciOiJBMjU2S1ciLCJlbmMiOiJBMjU2R0NNIn0.FBvzuhRTDlBu8VHUFeqIeW1jzCHAM0DL8TGuJS4S7HQqsqzhqBvgEQ.Ls4GEh25HbcJdKNP.lFq7tJadukFvXepadKJWBme2ta-tn8c4AXHU3LsVixs9nLZNWHiysROaxM3HxRVr8E_v-QcTPlPqCiHTjEYWhYCC064yt3XiJT56j4CeW3yKtMlJlJrOLGhzI_rNrDm_F_fKLVu4EptF5WxEnU1B4xiQIjCUKxh9kDidbtmMLEi_Dyg-8r7_bPyEFUwhEkKMmq385nJlPHmPFL_HWn9WkiK9cbLuNJw4ntS88dhx0TAzAoLCCgIh_gDlXCLpt4uEULvAQRT5J64qV3VE6JM_d1djAkEIM6OOF6GfJgyx_Gu-u2crAMuTOhB1nDJc0HBwVumVjQYgi3GENejLObFA84hW0ITTwxQOa8A.tr0tmEliN6-s6GRKR3L9yw';

async function closeSession() {
  console.log('Connecting to zombie session...');
  try {
    const browser = await chromium.connectOverCDP(connectUrl);
    console.log('Connected! Closing browser...');
    await browser.close();
    console.log('Session closed.');
  } catch (err) {
    console.error('Failed:', err.message);
  }
}

closeSession();
