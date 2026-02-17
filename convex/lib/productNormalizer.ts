/**
 * Product Name Normalizer - DATA-005
 * 
 * Parses concatenated scraped product names into structured fields.
 * Handles messy DOM-scraped strings like:
 *   "Grocery | 28g Flower - Sativa | Black DieselGrocerySativaTHC: 29.21%"
 * 
 * Output: { name, brand, category, strain, thc, cbd, weight, tags }
 */

export interface NormalizedProduct {
  name: string;                    // Clean product name (strain name)
  brand: string;                   // Brand name
  category: string;                // flower, pre_roll, vape, edible, concentrate, tincture, topical, other
  strain: string | null;           // sativa, indica, hybrid, or null
  thc: number | null;              // THC percentage as number (29.21)
  cbd: number | null;              // CBD percentage as number
  tac: number | null;              // Total Active Cannabinoids percentage
  weight: { amount: number; unit: string } | null;
  tags: string[];                  // Staff Pick, promo text, etc.
  confidence: number;              // 0-1 confidence score for parsing quality
}

// Strain type variations
const STRAIN_PATTERNS: Record<string, string> = {
  'sativa': 'sativa',
  'indica': 'indica',
  'hybrid': 'hybrid',
  'sativa-hybrid': 'sativa',
  'indica-hybrid': 'indica',
  'sativa dominant': 'sativa',
  'indica dominant': 'indica',
};

// Category keywords
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'flower': ['flower', 'bud', 'nug', 'whole flower', 'smalls', 'ground', 'preground', 'pre-ground'],
  'pre_roll': ['pre-roll', 'preroll', 'joint', 'blunt', 'cone'],
  'vape': ['vape', 'cartridge', 'cart', 'pod', '510'],
  'edible': ['edible', 'gummy', 'gummies', 'chocolate', 'brownie', 'cookie', 'candy', 'lozenge', 'mint'],
  'concentrate': ['concentrate', 'wax', 'shatter', 'rosin', 'resin', 'badder', 'budder', 'sauce', 'diamonds', 'crumble', 'hash'],
  'tincture': ['tincture', 'oil', 'drops', 'sublingual'],
  'topical': ['topical', 'cream', 'balm', 'lotion', 'salve'],
};

// Tags to extract and remove from product name
const TAG_PATTERNS = [
  /staff pick/i,
  /best seller/i,
  /new arrival/i,
  /limited edition/i,
  /on sale/i,
  /popular/i,
  /featured/i,
];

/**
 * Normalize a raw scraped product name into structured fields
 */
export function normalizeProductName(
  rawName: string,
  rawBrand?: string,
  rawCategory?: string,
  rawThc?: string,
  rawCbd?: string
): NormalizedProduct {
  let confidence = 1.0;
  const tags: string[] = [];
  
  // Start with the raw name
  let workingName = rawName.trim();
  
  // === STEP 1: Extract and remove tags ===
  for (const pattern of TAG_PATTERNS) {
    const match = workingName.match(pattern);
    if (match) {
      tags.push(match[0].trim());
      workingName = workingName.replace(pattern, '').trim();
    }
  }
  
  // === STEP 2: Extract THC/CBD/TAC percentages from the name ===
  let thc: number | null = null;
  let cbd: number | null = null;
  let tac: number | null = null;
  
  // THC patterns: "THC: 29.21%", "THC: 28.7 mg" (actually %)
  const thcMatch = workingName.match(/THC:\s*(\d+\.?\d*)\s*(%|mg)?/i);
  if (thcMatch) {
    thc = parseFloat(thcMatch[1]);
    workingName = workingName.replace(thcMatch[0], '').trim();
  }
  
  // TAC patterns: "TAC: 33.23%"
  const tacMatch = workingName.match(/TAC:\s*(\d+\.?\d*)\s*%?/i);
  if (tacMatch) {
    tac = parseFloat(tacMatch[1]);
    workingName = workingName.replace(tacMatch[0], '').trim();
  }
  
  // CBD patterns: "CBD: 0.1%"
  const cbdMatch = workingName.match(/CBD:\s*(\d+\.?\d*)\s*%?/i);
  if (cbdMatch) {
    cbd = parseFloat(cbdMatch[1]);
    workingName = workingName.replace(cbdMatch[0], '').trim();
  }
  
  // Also check rawThc/rawCbd parameters (e.g., "29.21%")
  if (!thc && rawThc) {
    const pct = rawThc.match(/(\d+\.?\d*)/);
    if (pct) thc = parseFloat(pct[1]);
  }
  if (!cbd && rawCbd) {
    const pct = rawCbd.match(/(\d+\.?\d*)/);
    if (pct) cbd = parseFloat(pct[1]);
  }
  
  // === STEP 3: Extract strain type ===
  let strain: string | null = null;
  
  // Look for strain markers that got concatenated (e.g., "GrocerySativa" or "CheeevoHybrid")
  for (const [pattern, normalized] of Object.entries(STRAIN_PATTERNS)) {
    // Check for concatenated strain (word boundary issues)
    const strainRegex = new RegExp(`(?:^|\\s|[a-z])(?:${pattern})(?:$|[^a-z])`, 'i');
    if (strainRegex.test(workingName)) {
      strain = normalized;
      // Remove standalone strain mentions but be careful with concatenated ones
      workingName = workingName.replace(new RegExp(`\\b${pattern}\\b`, 'gi'), ' ').trim();
      break;
    }
  }
  
  // Check explicit strain type at end of string (from DOM concatenation)
  const explicitStrainMatch = workingName.match(/(Sativa|Indica|Hybrid|Sativa-Hybrid|Indica-Hybrid)$/i);
  if (explicitStrainMatch) {
    strain = STRAIN_PATTERNS[explicitStrainMatch[1].toLowerCase()] || explicitStrainMatch[1].toLowerCase();
    workingName = workingName.slice(0, -explicitStrainMatch[1].length).trim();
  }
  
  // === STEP 4: Detect and clean brand name duplication ===
  let brand = (rawBrand || '').trim();
  
  if (brand) {
    // Remove duplicated brand from end (common DOM scrape artifact)
    // e.g., "Black DieselGrocery" where "Grocery" is the brand
    const brandVariants = [
      brand,
      brand.toUpperCase(),
      brand.toLowerCase(),
      brand.replace(/\s+/g, ''),
      brand.replace(/\s+/g, '-'),
    ];
    
    for (const variant of brandVariants) {
      // Check if brand appears at the end (concatenated)
      if (workingName.endsWith(variant)) {
        workingName = workingName.slice(0, -variant.length).trim();
        break;
      }
      // Check if brand is duplicated somewhere mid-string
      const lastIndex = workingName.lastIndexOf(variant);
      if (lastIndex > workingName.length / 2) {
        // Brand appears in second half - likely duplication
        workingName = workingName.slice(0, lastIndex).trim();
        break;
      }
    }
    
    // Also remove brand from the start if duplicated
    if (workingName.toLowerCase().startsWith(brand.toLowerCase())) {
      const afterBrand = workingName.slice(brand.length).trim();
      if (afterBrand.startsWith('|') || afterBrand.startsWith('-') || afterBrand.startsWith('–')) {
        workingName = afterBrand.slice(1).trim();
      } else if (afterBrand.length > 3) {
        workingName = afterBrand;
      }
    }
  }
  
  // === STEP 5: Extract weight ===
  let weight: { amount: number; unit: string } | null = null;
  
  // Common weight patterns
  const weightPatterns = [
    { regex: /(\d+\.?\d*)\s*g\b/i, unit: 'g' },
    { regex: /(\d+\.?\d*)\s*gram/i, unit: 'g' },
    { regex: /(\d+\.?\d*)\s*oz\b/i, mult: 28, unit: 'g' },
    { regex: /1\/8\s*oz|eighth/i, amount: 3.5, unit: 'g' },
    { regex: /1\/4\s*oz|quarter(?:\s*ounce)?/i, amount: 7, unit: 'g' },
    { regex: /1\/2\s*oz|half(?:\s*ounce)?/i, amount: 14, unit: 'g' },
    { regex: /(\d+)\s*pack/i, unit: 'pack' },
    { regex: /(\d+)\s*(?:pc|piece)/i, unit: 'piece' },
    { regex: /(\d+)\s*mg\b(?!\s*THC)/i, unit: 'mg' }, // mg for edibles, but not "THC: 29 mg"
  ];
  
  for (const { regex, unit, mult, amount } of weightPatterns) {
    const match = workingName.match(regex);
    if (match) {
      if (amount !== undefined) {
        weight = { amount, unit };
      } else if (mult) {
        weight = { amount: parseFloat(match[1]) * mult, unit };
      } else {
        weight = { amount: parseFloat(match[1]), unit };
      }
      // Don't remove weight from name - it's often part of product identity
      break;
    }
  }
  
  // === STEP 6: Detect category ===
  let category = 'other';
  
  // First check explicit category param
  if (rawCategory) {
    const lowerCat = rawCategory.toLowerCase();
    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some(k => lowerCat.includes(k))) {
        category = cat;
        break;
      }
    }
  }
  
  // If not found, check the product name
  if (category === 'other') {
    const lowerName = workingName.toLowerCase();
    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some(k => lowerName.includes(k))) {
        category = cat;
        break;
      }
    }
  }
  
  // === STEP 7: Parse structured format "Brand | Description | Name" ===
  const pipeSegments = workingName.split('|').map(s => s.trim()).filter(Boolean);
  let cleanName = workingName;
  
  if (pipeSegments.length >= 2) {
    // Format: "Brand | Description | ProductName" or "Brand | ProductName"
    // The last segment is usually the strain/product name
    cleanName = pipeSegments[pipeSegments.length - 1];
    
    // If brand wasn't provided, first segment might be brand
    if (!brand && pipeSegments.length >= 2) {
      brand = pipeSegments[0];
    }
    
    // Middle segment often has weight/category info
    // e.g., "28g Flower - Sativa"
    if (pipeSegments.length >= 3) {
      const midSegment = pipeSegments.slice(1, -1).join(' ');
      
      // Extract strain from middle segment
      if (!strain) {
        for (const [pattern, normalized] of Object.entries(STRAIN_PATTERNS)) {
          if (new RegExp(`\\b${pattern}\\b`, 'i').test(midSegment)) {
            strain = normalized;
            break;
          }
        }
      }
      
      // Extract weight from middle if we don't have it
      if (!weight) {
        for (const { regex, unit, mult, amount } of weightPatterns) {
          const match = midSegment.match(regex);
          if (match) {
            if (amount !== undefined) {
              weight = { amount, unit };
            } else if (mult) {
              weight = { amount: parseFloat(match[1]) * mult, unit };
            } else {
              weight = { amount: parseFloat(match[1]), unit };
            }
            break;
          }
        }
      }
    }
    
    // If cleanName is just a weight/descriptor, try first segment
    // e.g., "La Bomba | Quarter Ounce" should use "La Bomba"
    if (/^(quarter|half|eighth|1\/[248]|\d+g|\d+\s*oz)/i.test(cleanName.toLowerCase())) {
      // Check if first segment looks like a product name (not just a brand)
      const firstSeg = pipeSegments[0];
      if (firstSeg.length > 2 && !firstSeg.match(/^(FLWR|THC|CBD|TAC)/i)) {
        cleanName = firstSeg;
      }
    }
  } else {
    // No pipe separators - try dash separator "Brand - Product - Size"
    // e.g., "Permanent Marker - Premium Smalls - 1g"
    const dashParts = workingName.split(/\s*[-–]\s*/);
    if (dashParts.length >= 2) {
      // Find the part that looks most like a strain name
      // (not a weight, not a descriptor like "Premium Smalls")
      let bestCandidate = dashParts[dashParts.length - 1].trim();
      
      for (const part of dashParts) {
        const partLower = part.toLowerCase().trim();
        // Skip parts that are just weights or descriptors
        if (/^\d/.test(partLower)) continue;
        if (/^(premium|smalls|small|whole|ground|infused|indoor|outdoor)$/i.test(partLower)) continue;
        if (partLower.length < 3) continue;
        
        // This looks like a strain name
        bestCandidate = part.trim();
        break;
      }
      
      cleanName = bestCandidate;
    }
  }
  
  // === STEP 8: Final cleanup ===
  // Remove any remaining concatenated strain/brand artifacts
  cleanName = cleanName
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .replace(/^\W+|\W+$/g, '')      // Trim non-word characters
    .trim();
  
  // If the name is very long, it might still have artifacts
  // Try to extract the actual strain name (usually the last meaningful part)
  if (cleanName.length > 40) {
    confidence -= 0.2;
  }
  
  // Calculate confidence based on what we extracted
  if (!thc && !weight) confidence -= 0.1;
  if (!strain) confidence -= 0.1;
  if (cleanName.length < 3) confidence -= 0.3;
  if (cleanName.match(/\d{3,}/)) confidence -= 0.2; // Random numbers suggest parse failure
  
  return {
    name: cleanName,
    brand,
    category,
    strain,
    thc,
    cbd,
    tac,
    weight,
    tags,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

/**
 * Extract strain name from a parsed product
 * Returns the cleanest version of just the strain/cultivar name
 */
export function extractStrainName(normalized: NormalizedProduct): string {
  let name = normalized.name;
  
  // Remove weight mentions
  name = name.replace(/\b\d+\.?\d*\s*g(?:ram)?s?\b/gi, '').trim();
  name = name.replace(/\b(?:1\/[248]|eighth|quarter|half|ounce)\b/gi, '').trim();
  
  // Remove category words
  name = name.replace(/\b(?:flower|pre-?roll|joint|vape|cart(?:ridge)?|jar|bag|pack)\b/gi, '').trim();
  
  // Remove brand-related descriptors
  name = name.replace(/\b(?:premium|indoor|outdoor|smalls|whole|ground|infused)\b/gi, '').trim();
  
  // Final cleanup
  name = name.replace(/\s+/g, ' ').replace(/^\W+|\W+$/g, '').trim();
  
  return name || normalized.name;
}

/**
 * Batch normalize an array of products
 */
export function normalizeProductBatch(
  products: Array<{
    name: string;
    brand?: string;
    category?: string;
    thc?: string;
    cbd?: string;
  }>
): NormalizedProduct[] {
  return products.map(p => 
    normalizeProductName(p.name, p.brand, p.category, p.thc, p.cbd)
  );
}
