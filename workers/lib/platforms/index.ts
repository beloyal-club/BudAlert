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
