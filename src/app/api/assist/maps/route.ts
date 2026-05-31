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

// ─── Nearby places via Overpass API ──────────────────────────────────────────
async function searchNearby(
  lat: number, lng: number, queryType: string
): Promise<{ name: string; lat: number; lng: number; type: string; address?: string; distance?: number }[]> {
  const radius = 1000; // meters
  let amenity = "";
  const lower = queryType.toLowerCase();
  if (lower.includes("coffee") || lower.includes("cafe")) amenity = "cafe";
  else if (lower.includes("restaurant") || lower.includes("food")) amenity = "restaurant";
  else if (lower.includes("hospital") || lower.includes("clinic") || lower.includes("medical")) amenity = "hospital";
  else if (lower.includes("pharmacy")) amenity = "pharmacy";
  else if (lower.includes("train") || lower.includes("metro") || lower.includes("subway")) amenity = "subway_entrance";
  else if (lower.includes("bus")) amenity = "bus_station";
  else if (lower.includes("gas") || lower.includes("petrol")) amenity = "fuel";
  else if (lower.includes("atm")) amenity = "atm";
  else if (lower.includes("hotel")) amenity = "hotel";
  else if (lower.includes("store") || lower.includes("shop")) amenity = "shop";
  else if (lower.includes("park")) amenity = "park";
  else amenity = "restaurant"; // default fallback

  const overpassQuery = `[out:json];node(around:${radius},${lat},${lng})[amenity=${amenity}];out body;`;
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(overpassQuery)}`,
    });
    if (!res.ok) return [];
    const data = await res.json();
    const elements = (data?.elements || [])
      .filter((e: any) => e.lat && e.lon && e.tags?.name)
      .map((e: any) => ({
        name: e.tags.name,
        lat: e.lat,
        lng: e.lon,
        type: e.tags.amenity || e.tags.shop || "place",
        address: [e.tags["addr:street"], e.tags["addr:housenumber"], e.tags["addr:city"]].filter(Boolean).join(", ") || undefined,
        distance: Math.round(haversineKm(lat, lng, e.lat, e.lon) * 1000),
      }))
      .sort((a: any, b: any) => (a.distance || 0) - (b.distance || 0))
      .slice(0, 6);
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

// ─── Detect what the user wants ──────────────────────────────────────────────
function classifyQuery(prompt: string): { type: "current-location" | "nearby" | "directions" | "distance"; destination?: string; poiType?: string } {
  const lower = prompt.toLowerCase();

  if (/\bwhere\s+(am\s+i|is\s+my\s+location|am\s+i\s+now)\b/.test(lower) || /\bshow\s+(me\s+)?my\s+location\b/.test(lower)) {
    return { type: "current-location" };
  }

  // Directions / route
  const dirMatch = lower.match(/(?:directions?\s+(?:to\s+)?|route\s+(?:to\s+)?|navigate\s+(?:to\s+)?|how\s+(?:do\s+i|to)\s+(?:get|go)\s+(?:to\s+)?)(.+?)(?:\?|$)/i);
  if (dirMatch) return { type: "directions", destination: dirMatch[1].trim() };

  // Distance / how far
  const distMatch = lower.match(/(?:how\s+far\s+(?:is|am\s+i)\s+(?:from\s+)?|distance\s+(?:to|from)\s+)(.+?)(?:\?|$)/i);
  if (distMatch) return { type: "distance", destination: distMatch[1].trim() };

  // Nearby / nearest / find
  const nearbyMatch = lower.match(/(?:nearest|closest|find\s+nearby|find\s+near\s+me|what['\s]+(?:s|is)\s+near(?:by|by\s+me)?)\s*(.+?)?(?:\?|$)/i);
  if (nearbyMatch) return { type: "nearby", poiType: nearbyMatch[1]?.trim() || "places" };

  // Generic location query
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
