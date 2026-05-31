/**
 * HireMindX Maps & Location API
 * Uses free, no-key services: Nominatim (geocoding), OpenRouteService (routing), Overpass (nearby)
 */

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

interface MapsParams {
  prompt: string;
  lat?: number;
  lng?: number;
  destinationText?: string;
}

// Lightweight in-memory cache (60s TTL)
const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 60000;

function getCacheKey(params: MapsParams): string {
  return JSON.stringify({ p: params.prompt.toLowerCase().trim(), lat: params.lat, lng: params.lng, d: params.destinationText });
}

async function fetchCached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = cache.get(key);
  if (entry && now - entry.ts < CACHE_TTL) return entry.data as T;
  const data = await fetcher();
  cache.set(key, { data, ts: now });
  return data;
}

// ─── Geocode a place name ────────────────────────────────────────────────────
async function geocodePlace(query: string): Promise<{ lat: number; lng: number; name: string; displayName: string } | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&limit=1&addressdetails=1`;
    const res = await fetch(url, { headers: { "User-Agent": "HireMindX/1.0" } });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.length > 0) {
      const r = data[0];
      return { lat: parseFloat(r.lat), lng: parseFloat(r.lon), name: r.name || r.display_name.split(",")[0], displayName: r.display_name };
    }
  } catch (err) { console.error("Geocoding error:", err); }
  return null;
}

// ─── Reverse geocode coordinates ────────────────────────────────────────────
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const res = await fetch(url, { headers: { "User-Agent": "HireMindX/1.0" } });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.display_name || null;
  } catch (err) { console.error("Reverse geocoding error:", err); }
  return null;
}

// ─── Routing / distance / ETA via OSRM (free demo server, no key) ────────────
async function getRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<{ mode: string; distance: number; duration: number; geometry: string }[]> {
  const results: { mode: string; distance: number; duration: number; geometry: string }[] = [];
  const modes: [string, string][] = [
    ["foot", "Walking"],
    ["driving", "Driving"],
    ["cycling", "Cycling"],
  ];
  for (const [profile, label] of modes) {
    try {
      const url = `https://router.project-osrm.org/route/v1/${profile}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
      const res = await fetch(url, { headers: { "Accept": "application/json" } });
      if (res.ok) {
        const data = await res.json();
        const route = data?.routes?.[0];
        if (route) {
          results.push({
            mode: label,
            distance: route.distance,
            duration: route.duration,
            geometry: JSON.stringify(route.geometry?.coordinates || []),
          });
        }
      }
    } catch (err) { /* ignore single mode failure */ }
  }
  if (results.length === 0) {
    // Fallback: haversine distance + rough ETA estimates
    const dist = haversineKm(from.lat, from.lng, to.lat, to.lng);
    results.push({ mode: "Walking", distance: dist * 1000, duration: dist * 12 * 60, geometry: "" });
    results.push({ mode: "Driving", distance: dist * 1000, duration: dist * 1.5 * 60, geometry: "" });
    results.push({ mode: "Cycling", distance: dist * 1000, duration: dist * 4 * 60, geometry: "" });
  }
  return results;
}

// ─── POI Type Map → Overpass tag queries ─────────────────────────────────────
const POI_MAP: Record<string, string[]> = {
  cafe: ["amenity=cafe"],
  coffee: ["amenity=cafe"],
  restaurant: ["amenity=restaurant", "amenity=fast_food"],
  food: ["amenity=restaurant", "amenity=fast_food"],
  hospital: ["amenity=hospital"],
  clinic: ["amenity=clinic", "amenity=doctors"],
  medical: ["amenity=hospital", "amenity=clinic", "amenity=doctors"],
  pharmacy: ["amenity=pharmacy"],
  "swimming pool": ["leisure=swimming_pool", "sport=swimming"],
  pool: ["leisure=swimming_pool", "sport=swimming"],
  gym: ["leisure=fitness_centre"],
  fitness: ["leisure=fitness_centre"],
  hotel: ["tourism=hotel", "tourism=guest_house", "tourism=hostel"],
  atm: ["amenity=atm"],
  bank: ["amenity=bank"],
  "gas station": ["amenity=fuel"],
  petrol: ["amenity=fuel"],
  fuel: ["amenity=fuel"],
  gas: ["amenity=fuel"],
  park: ["leisure=park", "amenity=park"],
  "bus stop": ["highway=bus_stop", "amenity=bus_station"],
  bus: ["highway=bus_stop", "amenity=bus_station"],
  "train station": ["railway=station"],
  train: ["railway=station"],
  metro: ["railway=station", "station=subway"],
  subway: ["railway=station", "station=subway"],
  mosque: ["amenity=place_of_worship", "religion=muslim"],
  church: ["amenity=place_of_worship", "religion=christian"],
  temple: ["amenity=place_of_worship"],
  school: ["amenity=school"],
  university: ["amenity=university"],
  college: ["amenity=college"],
  library: ["amenity=library"],
  cinema: ["amenity=cinema"],
  theater: ["amenity=theatre"],
  mall: ["shop=mall"],
  supermarket: ["shop=supermarket"],
  grocery: ["shop=supermarket", "shop=convenience"],
  bakery: ["shop=bakery"],
  police: ["amenity=police"],
  "post office": ["amenity=post_office"],
  store: ["shop=*"],
  shop: ["shop=*"],
  places: ["amenity=*"],
};

function resolvePOITags(queryType: string): string[] {
  const lower = queryType.toLowerCase().trim();
  // Try exact match first
  if (POI_MAP[lower]) return POI_MAP[lower];
  // Try partial match
  for (const [key, tags] of Object.entries(POI_MAP)) {
    if (lower.includes(key)) return tags;
  }
  return ["amenity=restaurant"]; // default
}

// ─── Nearby places via Overpass API ──────────────────────────────────────────
async function searchNearby(
  lat: number, lng: number, queryType: string
): Promise<{ name: string; lat: number; lng: number; type: string; address?: string; distance?: number }[]> {
  const radius = 5000; // meters — wider for suburban coverage
  const tags = resolvePOITags(queryType);

  // Search nodes, ways, and relations; use `out center` to get center coords for ways/relations
  const tagQueries = tags
    .map((t) => `node(around:${radius},${lat},${lng})[${t}];way(around:${radius},${lat},${lng})[${t}];relation(around:${radius},${lat},${lng})[${t}];`)
    .join("");
  const overpassQuery = `[out:json][timeout:25];(${tagQueries});out body center;`;

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(overpassQuery)}`,
    });
    if (!res.ok) return [];
    const data = await res.json();
    const elements = (data?.elements || [])
      .filter((e: any) => {
        const elLat = e.lat ?? e.center?.lat;
        const elLon = e.lon ?? e.center?.lon;
        return elLat && elLon && e.tags?.name;
      })
      .map((e: any) => {
        const elLat = e.lat ?? e.center?.lat;
        const elLon = e.lon ?? e.center?.lon;
        return {
          name: e.tags.name,
          lat: elLat,
          lng: elLon,
          type: e.tags.amenity || e.tags.leisure || e.tags.shop || e.tags.tourism || e.tags.railway || e.tags.highway || "place",
          address: [e.tags["addr:street"], e.tags["addr:housenumber"], e.tags["addr:city"]].filter(Boolean).join(", ") || undefined,
          distance: Math.round(haversineKm(lat, lng, elLat, elLon) * 1000),
        };
      })
      .sort((a: any, b: any) => (a.distance || 0) - (b.distance || 0))
      .slice(0, 8);
    return elements;
  } catch (err) { console.error("Overpass error:", err); }
  return [];
}

// ─── Haversine distance ──────────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Text cleanup helpers ────────────────────────────────────────────────────
const TRAILING_JUNK = [
  /\s+from\s+me\b/gi, /\s+to\s+me\b/gi, /\s+beside\s+me\b/gi,
  /\s+near\s+me\b/gi, /\s+around\s+me\b/gi, /\s+close\s+to\s+me\b/gi,
  /\s+via\s+\w+/gi, /\s+by\s+(?:car|bus|walk|walking|bike|cycle|train|metro)/gi,
  /\s+to\s+reach\s+me\b/gi, /\s+to\s+get\s+to\s+me\b/gi,
  /\?/g,
];

function cleanText(text: string): string {
  let t = text.trim();
  TRAILING_JUNK.forEach((rx) => { t = t.replace(rx, ""); });
  return t.trim();
}

function hasKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

function extractAfterPrefix(text: string, prefixes: string[]): string | null {
  const lower = text.toLowerCase();
  for (const prefix of prefixes) {
    const idx = lower.indexOf(prefix.toLowerCase());
    if (idx !== -1) {
      const extracted = text.slice(idx + prefix.length).trim();
      if (extracted) return extracted;
    }
  }
  return null;
}

function extractPOI(text: string): string | null {
  const lower = text.toLowerCase();
  // Patterns that precede a POI noun
  const poiPrefixes = [
    "nearest ", "closest ", "find me a ", "find me an ", "find me the ",
    "find a ", "find an ", "find the ", "is there a ", "is there an ",
    "where is the nearest ", "where's the nearest ", "where is the closest ", "where's the closest ",
    "show me the nearest ", "show me the closest ",
    "look for a ", "look for an ", "look for the ",
    "search for a ", "search for an ", "search for the ",
    "find nearby ", "find near me ",
  ];
  for (const prefix of poiPrefixes) {
    const idx = lower.indexOf(prefix);
    if (idx !== -1) {
      let rest = text.slice(idx + prefix.length).trim();
      rest = cleanText(rest);
      // Stop at first conjunction/preposition that isn't part of the noun
      const stopWords = /\s+(?:near|beside|around|close to|from|to|and|or)\s+/i;
      const match = rest.match(stopWords);
      if (match && match.index !== undefined) {
        rest = rest.slice(0, match.index).trim();
      }
      if (rest) return rest;
    }
  }
  // Fallback: if text contains "nearest" or "closest" but no clear prefix matched,
  // grab the word right after it
  const fallback = lower.match(/(?:nearest|closest)\s+(.+?)(?:\s+near|\s+beside|\s+around|\?|$)/);
  if (fallback) return cleanText(fallback[1]);
  return null;
}

// ─── Detect what the user wants ──────────────────────────────────────────────
function classifyQuery(prompt: string): { type: "current-location" | "nearby" | "directions" | "distance"; destination?: string; poiType?: string } {
  const lower = prompt.toLowerCase();

  // 1. Pure "where am I" queries
  if (hasKeyword(lower, ["where am i", "my location", "where am i now", "show my location", "show me my location", "what's my location", "what is my location"])) {
    return { type: "current-location" };
  }

  // 2. Directions / route / best way to reach
  const dirPrefixes = [
    "directions to", "how to get to", "how do i get to", "how do i go to",
    "route to", "navigate to", "show me the way to", "best way to reach",
    "best way to get to", "best way to go to", "how can i reach",
    "how can i get to", "how can i go to",
  ];
  if (hasKeyword(lower, dirPrefixes)) {
    const dest = extractAfterPrefix(prompt, dirPrefixes);
    if (dest) return { type: "directions", destination: cleanText(dest) };
  }

  // 3. Distance / how far
  const distPrefixes = [
    "how far is", "how far am i from", "how far from me is", "distance to", "distance from",
  ];
  if (hasKeyword(lower, distPrefixes)) {
    const dest = extractAfterPrefix(prompt, distPrefixes);
    if (dest) return { type: "distance", destination: cleanText(dest) };
  }

  // 4. Travel time / how long / how much time
  const timePrefixes = [
    "how long will it take to reach", "how long will it take to get to", "how long will it take to go to",
    "how much time to reach", "how much time to get to", "how much time to go to",
    "how long to reach", "how long to get to", "how long to go to",
    "how much time will it take for", "how long will it take for",
    "time to reach", "time to get to", "time to go to",
  ];
  if (hasKeyword(lower, timePrefixes)) {
    const dest = extractAfterPrefix(prompt, timePrefixes);
    if (dest) {
      // Sometimes the structure is "how much time will it take for Dhaka to reach me"
      // We want "Dhaka" not "Dhaka to reach me"
      let cleaned = cleanText(dest);
      // Remove trailing "to reach me", "to get to me", etc.
      cleaned = cleaned.replace(/\s+to\s+(?:reach|get\s+to|go\s+to)\s+me\b/gi, "").trim();
      if (cleaned) return { type: "directions", destination: cleaned };
    }
  }

  // 5. Nearby / nearest / find POI
  const nearbyTriggers = [
    "nearest", "closest", "nearby", "near me", "around me", "beside me", "close to me",
    "find nearby", "find near me", "is there a", "is there an",
    "where is the nearest", "where's the nearest", "where is the closest", "where's the closest",
    "show me the nearest", "show me the closest",
    "look for", "search for",
  ];
  if (hasKeyword(lower, nearbyTriggers)) {
    const poi = extractPOI(prompt);
    if (poi) return { type: "nearby", poiType: poi };
    return { type: "nearby", poiType: "places" };
  }

  // 6. Fallback: if the message contains a known place name but none of the above matched,
  // try to geocode the whole prompt as a destination (last resort)
  if (lower.length < 60 && !lower.match(/\b(what|how|where|when|why|who|is|are|can|do|does|will|would|should|could)\b/)) {
    return { type: "directions", destination: cleanText(prompt) };
  }

  return { type: "current-location" };
}

// ─── Generate AI recommendation ─────────────────────────────────────────────
function generateRecommendation(
  queryType: string,
  userName: string | null,
  destinationName: string | null,
  routes: any[],
  places: any[]
): string {
  const lower = queryType.toLowerCase();
  if (lower === "current-location") {
    if (userName) return `You're currently near ${userName}.`;
    return "Here's your current location.";
  }
  if (lower === "directions" && routes.length > 0 && destinationName) {
    const best = routes.find(r => r.mode === "Walking") || routes[0];
    const distKm = (best.distance / 1000).toFixed(1);
    const min = Math.round(best.duration / 60);
    return `It's about ${distKm} km to ${destinationName}. Walking takes roughly ${min} minute${min !== 1 ? "s" : ""}. Choose a mode above to see more details.`;
  }
  if (lower === "distance" && routes.length > 0 && destinationName) {
    const best = routes[0];
    const distKm = (best.distance / 1000).toFixed(1);
    return `The distance to ${destinationName} is about ${distKm} km.`;
  }
  if (lower === "nearby" && places.length > 0) {
    return `I found ${places.length} place${places.length !== 1 ? "s" : ""} nearby. The closest is ${places[0].name} (${places[0].distance}m away).`;
  }
  if (places.length > 0) {
    return `I found ${places.length} place${places.length !== 1 ? "s" : ""} nearby.`;
  }
  return "Here's what I found for your location query.";
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as MapsParams;
    const { prompt, lat, lng, destinationText } = body;

    const cacheKey = getCacheKey(body);
    const result = await fetchCached(cacheKey, async () => {
      const classification = classifyQuery(prompt);
      let userLocation = lat && lng ? { lat, lng } : null;
      let userLocationName: string | null = null;

      if (userLocation) {
        userLocationName = await reverseGeocode(userLocation.lat, userLocation.lng);
      }

      let destination: { lat: number; lng: number; name: string; displayName: string } | null = null;
      let routes: any[] = [];
      let places: any[] = [];

      // Resolve destination if provided or inferred
      if (destinationText) {
        destination = await geocodePlace(destinationText);
      } else if (classification.destination) {
        destination = await geocodePlace(classification.destination);
      }

      // Directions / distance: need both origin and destination
      if ((classification.type === "directions" || classification.type === "distance") && userLocation && destination) {
        routes = await getRoute(userLocation, destination);
      }

      // Nearby search: need user location and a POI type
      if (classification.type === "nearby" && userLocation) {
        places = await searchNearby(userLocation.lat, userLocation.lng, classification.poiType || prompt);
      }

      // If just "current location" and we have coords, also fetch a few nearby interesting spots
      if (classification.type === "current-location" && userLocation && places.length === 0) {
        places = await searchNearby(userLocation.lat, userLocation.lng, "restaurant");
      }

      const recommendation = generateRecommendation(
        classification.type,
        userLocationName,
        destination?.name || null,
        routes,
        places
      );

      return {
        userLocation: userLocation ? { lat: userLocation.lat, lng: userLocation.lng, name: userLocationName || "Current Location" } : null,
        destination: destination ? { lat: destination.lat, lng: destination.lng, name: destination.name, displayName: destination.displayName } : null,
        classification,
        routes,
        places,
        recommendation,
      };
    });

    return NextResponse.json(result);
  } catch (e: any) {
    console.error("Maps API error:", e);
    return NextResponse.json({ error: e.message || "Failed to process location request" }, { status: 500 });
  }
}
