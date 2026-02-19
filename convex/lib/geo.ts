/**
 * Geo Utilities for CannaSignal
 * 
 * Haversine formula for calculating distances between coordinates.
 * Used for radius-based competitor filtering.
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Calculate distance between two points using Haversine formula
 * @param coord1 First coordinate
 * @param coord2 Second coordinate
 * @returns Distance in miles
 */
export function haversineDistance(coord1: Coordinates, coord2: Coordinates): number {
  const R = 3959; // Earth's radius in miles
  
  const lat1Rad = toRadians(coord1.lat);
  const lat2Rad = toRadians(coord2.lat);
  const deltaLat = toRadians(coord2.lat - coord1.lat);
  const deltaLng = toRadians(coord2.lng - coord1.lng);
  
  const a = 
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Filter locations within a given radius from an anchor point
 * @param anchor The center point
 * @param locations Array of locations with coordinates
 * @param radiusMiles Maximum distance in miles
 * @returns Locations within radius, sorted by distance
 */
export function filterByRadius<T extends { coordinates?: Coordinates }>(
  anchor: Coordinates,
  locations: T[],
  radiusMiles: number
): Array<T & { distanceMiles: number }> {
  return locations
    .filter((loc): loc is T & { coordinates: Coordinates } => 
      loc.coordinates !== undefined &&
      loc.coordinates.lat !== undefined &&
      loc.coordinates.lng !== undefined
    )
    .map((loc) => ({
      ...loc,
      distanceMiles: haversineDistance(anchor, loc.coordinates),
    }))
    .filter((loc) => loc.distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
}

/**
 * Format distance for display
 * @param miles Distance in miles
 * @returns Human-readable string
 */
export function formatDistance(miles: number): string {
  if (miles < 0.1) {
    const feet = Math.round(miles * 5280);
    return `${feet} ft`;
  }
  if (miles < 1) {
    return `${miles.toFixed(1)} mi`;
  }
  return `${miles.toFixed(1)} mi`;
}

// NYC Retailer Coordinates Database
// Geocoded addresses for known dispensaries
export const NYC_RETAILER_COORDINATES: Record<string, Coordinates> = {
  // CONBUD Locations
  "conbud-les": { lat: 40.7246, lng: -73.9927 },           // 88 E Houston St
  "conbud-bronx": { lat: 40.8448, lng: -73.8648 },         // Bronx (approx)
  "conbud-yankee-stadium": { lat: 40.8296, lng: -73.9262 }, // Near Yankee Stadium
  
  // Gotham Locations
  "gotham-bowery": { lat: 40.7255, lng: -73.9920 },        // 3 E 3rd St
  "gotham-williamsburg": { lat: 40.7186, lng: -73.9618 },  // 300 Kent Ave, Brooklyn
  "gotham-chelsea": { lat: 40.7455, lng: -74.0063 },       // 146 10th Ave
  
  // Housing Works
  "housing-works-cannabis": { lat: 40.7308, lng: -73.9917 }, // 750 Broadway
  
  // Travel Agency
  "travel-agency-union-square": { lat: 40.7340, lng: -73.9904 }, // 835 Broadway
  
  // Dagmar Cannabis
  "dagmar-soho": { lat: 40.7246, lng: -74.0002 },          // 412 W Broadway
  
  // Get Smacked
  "smacked-village": { lat: 40.7283, lng: -73.9994 },      // 144 Bleecker St
  
  // Alta Dispensary
  "alta-nolita": { lat: 40.7221, lng: -73.9960 },          // 52 Kenmare St A
  
  // Daily Green
  "daily-green-times-square": { lat: 40.7612, lng: -73.9847 }, // 719 7th Ave
  
  // Maison Canal
  "maison-canal": { lat: 40.7189, lng: -74.0015 },         // 386 Canal St
  
  // Liberty Buds
  "liberty-buds-manhattan": { lat: 40.7654, lng: -73.9580 }, // 1115 1st Ave
  "liberty-buds-queens": { lat: 40.7626, lng: -73.7304 },    // Douglaston
  
  // Easy Times
  "easy-times-brooklyn": { lat: 40.5890, lng: -73.9621 },  // 2668 Coney Island Ave
  
  // The Vault
  "the-vault-staten-island": { lat: 40.5856, lng: -74.0861 }, // 1151 Hylan Blvd
  
  // Dazed Cannabis
  "dazed-union-square": { lat: 40.7359, lng: -73.9911 },   // Union Square area
  
  // Culture House
  "culture-house-nyc": { lat: 40.7128, lng: -74.0060 },    // Manhattan (approx)
  
  // The Emerald
  "emerald-manhattan": { lat: 40.7282, lng: -73.9942 },    // Manhattan
  
  // Superfly
  "superfly-nyc": { lat: 40.7195, lng: -73.9973 },         // Manhattan
  
  // NY Elite
  "ny-elite-bayside": { lat: 40.7689, lng: -73.7694 },     // Bayside, Queens
  
  // Be. (Citiva)
  "be-brooklyn": { lat: 40.6712, lng: -73.9772 },          // Park Slope
  
  // Kaya Bliss
  "kaya-bliss-brooklyn-heights": { lat: 40.6962, lng: -73.9919 }, // 64 Henry St
  
  // Brooklyn Bourne
  "brooklyn-bourne-flatbush": { lat: 40.6501, lng: -73.9496 }, // Flatbush
  
  // Grow Together
  "grow-together-brooklyn": { lat: 40.5979, lng: -73.9658 }, // Gravesend
  
  // Greene Street
  "greene-street-brooklyn": { lat: 40.6782, lng: -73.9442 }, // Brooklyn
  
  // The Cannabist
  "the-cannabist-brooklyn": { lat: 40.6849, lng: -73.9772 }, // 680 Atlantic Ave
  
  // New Amsterdam
  "new-amsterdam": { lat: 40.7397, lng: -74.0007 },        // 245 W 14th St
  
  // Verdi Cannabis
  "verdi-chelsea": { lat: 40.7436, lng: -73.9930 },        // 158 W 23rd St
  "verdi-park-slope": { lat: 40.6694, lng: -73.9803 },     // 360 7th Ave, Brooklyn
  
  // Q Cannabis
  "q-flatbush": { lat: 40.6566, lng: -73.9621 },           // 733 Flatbush Ave
  
  // Blue Forest Farms
  "blue-forest-farms-manhattan": { lat: 40.7406, lng: -73.9871 }, // 122 E 25th St
  
  // Carnegie Hill Cannabis
  "carnegie-hill-cannabis": { lat: 40.7826, lng: -73.9502 }, // 1720 2nd Ave
  
  // Happy Buds Brooklyn
  "happy-buds-brooklyn": { lat: 40.6915, lng: -73.9326 },  // 225 Malcolm X Blvd
  
  // Sanctuary Garden
  "sanctuary-garden-uws": { lat: 40.7928, lng: -73.9702 }, // 2610 Broadway Ave
};

// Default anchor store (Conbud LES)
export const CONBUD_LES_COORDINATES: Coordinates = {
  lat: 40.7246,
  lng: -73.9927,
};
