/**
 * Platform Detection & Extraction Registry
 */

export { 
  isTymberSite, 
  scrapeTymberProducts, 
  fetchAndScrapeTymber,
  extractTymberSSRData,
  mapTymberToScrapedProduct,
} from './tymber';

export type { TymberRawProduct, TymberScrapedProduct } from './tymber';

export {
  isLeafBridgeSite,
  extractLeafBridgeProductsFromDOM,
  LEAFBRIDGE_SELECTORS,
  LEAFBRIDGE_WAIT_SELECTOR,
  LEAFBRIDGE_AJAX_WAIT_MS,
} from './leafbridge';

export type { LeafBridgeScrapedProduct } from './leafbridge';
