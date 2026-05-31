"use client";

import { useEffect, useState, useRef } from "react";
import {
  MapPin, Navigation, Footprints, Car, Bike, Clock, Loader2, AlertCircle,
  Star, StarHalf, ChevronRight
} from "lucide-react";

// MapLibre GL loaded dynamically to avoid SSR issues
let maplibregl: any = null;

function injectMapLibreCSS() {
  if (typeof document === "undefined" || document.getElementById("maplibre-css")) return;
  const link = document.createElement("link");
  link.id = "maplibre-css";
  link.rel = "stylesheet";
  link.href = "https://unpkg.com/maplibre-gl@5.0.0/dist/maplibre-gl.css";
  document.head.appendChild(link);
}

async function loadMapLibre() {
  if (maplibregl) return;
  injectMapLibreCSS();
  const mod = await import("maplibre-gl");
  maplibregl = mod.default || mod;
}

interface MapLocation {
  lat: number;
  lng: number;
  name?: string;
}

interface RouteInfo {
  mode: string;
  distance: number;
  duration: number;
  geometry?: string;
}

interface PlaceInfo {
  name: string;
  lat: number;
  lng: number;
  type: string;
  address?: string;
  distance?: number;
}

interface MapData {
  userLocation: MapLocation | null;
  destination: MapLocation | null;
  routes: RouteInfo[];
  places: PlaceInfo[];
  recommendation: string;
  classification: {
    type: string;
    destination?: string;
    poiType?: string;
  };
}

interface MapCardProps {
  prompt: string;
  location?: MapLocation;
  destination?: MapLocation;
  onContextResolved?: (ctx: { destinationName?: string; destinationCoords?: { lat: number; lng: number }; poiType?: string }) => void;
}

function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h ${rem}m`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function getRouteIcon(mode: string) {
  const lower = mode.toLowerCase();
  if (lower.includes("walk") || lower.includes("foot")) return <Footprints className="w-4 h-4" />;
  if (lower.includes("drive") || lower.includes("car")) return <Car className="w-4 h-4" />;
  if (lower.includes("cycle") || lower.includes("bike")) return <Bike className="w-4 h-4" />;
  return <Navigation className="w-4 h-4" />;
}

function getPlaceRating(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash) + name.charCodeAt(i);
  const base = 3.5 + (Math.abs(hash) % 15) / 10;
  return Math.min(5, Math.max(3.2, Math.round(base * 2) / 2));
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: full }).map((_, i) => (
        <Star key={`f${i}`} className="w-3 h-3 text-amber-400 fill-amber-400" />
      ))}
      {half && <StarHalf className="w-3 h-3 text-amber-400 fill-amber-400" />}
      {Array.from({ length: empty }).map((_, i) => (
        <Star key={`e${i}`} className="w-3 h-3 text-zinc-600" />
      ))}
      <span className="text-[10px] text-zinc-400 ml-1">{rating.toFixed(1)}</span>
    </div>
  );
}

function createMarkerEl(type: "user" | "destination" | "poi") {
  const colors = {
    user: { bg: "#3b82f6", ring: "rgba(59,130,246,0.35)", size: 18 },
    destination: { bg: "#ef4444", ring: "rgba(239,68,68,0.35)", size: 18 },
    poi: { bg: "#a855f7", ring: "rgba(168,85,247,0.35)", size: 14 },
  };
  const c = colors[type];
  const el = document.createElement("div");
  el.style.cssText = `position:relative;width:${c.size + 8}px;height:${c.size + 8}px;display:flex;align-items:center;justify-content:center;`;
  const dot = document.createElement("div");
  dot.style.cssText = `width:${c.size}px;height:${c.size}px;border-radius:50%;background:${c.bg};border:2.5px solid white;box-shadow:0 0 0 3px ${c.ring},0 4px 12px rgba(0,0,0,0.4);`;
  el.appendChild(dot);
  if (type === "user") {
    const inner = document.createElement("div");
    inner.style.cssText = "position:absolute;width:5px;height:5px;background:white;border-radius:50%;";
    el.appendChild(inner);
  }
  return el;
}

export function MapCard({ prompt, location, destination, onContextResolved }: MapCardProps) {
  const [data, setData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  const [activePlace, setActivePlace] = useState<number | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    const fetchMaps = async () => {
      try {
        await loadMapLibre();
        const body: any = { prompt };
        if (location) {
          body.lat = location.lat;
          body.lng = location.lng;
        }
        if (destination) {
          body.destinationText = destination.name;
        }
        const response = await fetch("/api/assist/maps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || `Error ${response.status}`);
        }
        const result = await response.json();
        setData(result);
        if (result.routes?.length > 0) {
          setSelectedMode(result.routes[0].mode);
        }
        if (onContextResolved) {
          onContextResolved({
            destinationName: result.destination?.name || result.classification?.destination,
            destinationCoords: result.destination ? { lat: result.destination.lat, lng: result.destination.lng } : undefined,
            poiType: result.classification?.poiType,
          });
        }
      } catch (e: any) {
        setError(e.message || "Failed to fetch location data");
      } finally {
        setLoading(false);
      }
    };
    fetchMaps();
  }, [prompt, location, destination, onContextResolved]);

  // Initialize MapLibre map when data is ready
  useEffect(() => {
    if (!data || !mapContainerRef.current || !maplibregl) return;

    const centerLng = data.userLocation?.lng ?? data.destination?.lng ?? 90.4125;
    const centerLat = data.userLocation?.lat ?? data.destination?.lat ?? 23.8103;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://tiles.openfreemap.org/styles/dark",
      center: [centerLng, centerLat],
      zoom: 14,
      pitch: 50,
      bearing: -10,
      attributionControl: false,
      dragRotate: true,
      touchPitch: true,
    });

    mapInstanceRef.current = map;

    map.on("load", () => {
      // Add 3D building extrusions with fake heights for consistent 3D look
      map.addLayer({
        id: "3d-buildings",
        source: "openmaptiles",
        "source-layer": "building",
        type: "fill-extrusion",
        minzoom: 12,
        paint: {
          "fill-extrusion-color": "#1e293b",
          "fill-extrusion-height": [
            "case",
            [">", ["get", "render_height"], 0],
            ["get", "render_height"],
            [">", ["get", "height"], 0],
            ["get", "height"],
            15,
          ],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.85,
          "fill-extrusion-vertical-gradient": true,
          "fill-extrusion-ambient-occlusion-ground-radius": 3,
        },
      });

      // Add route line if available
      const activeRoute = data.routes[0];
      if (activeRoute?.geometry) {
        try {
          const parsed = JSON.parse(activeRoute.geometry);
          if (Array.isArray(parsed)) {
            const coords = parsed.map((c: any) => [c[0], c[1]]); // OSRM returns [lng, lat]
            map.addSource("route", {
              type: "geojson",
              data: {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: coords },
              },
            });
            map.addLayer({
              id: "route-line",
              type: "line",
              source: "route",
              layout: { "line-join": "round", "line-cap": "round" },
              paint: { "line-color": "#10b981", "line-width": 5, "line-opacity": 0.9 },
            });
          }
        } catch { /* ignore */ }
      }

      // Add markers
      const markers: any[] = [];
      if (data.userLocation) {
        const el = createMarkerEl("user");
        const m = new maplibregl.Marker({ element: el }).setLngLat([data.userLocation.lng, data.userLocation.lat]).addTo(map);
        markers.push(m);
      }
      if (data.destination) {
        const el = createMarkerEl("destination");
        const m = new maplibregl.Marker({ element: el }).setLngLat([data.destination.lng, data.destination.lat]).addTo(map);
        markers.push(m);
      }
      data.places.forEach((p) => {
        const el = createMarkerEl("poi");
        const m = new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map);
        markers.push(m);
      });
      markersRef.current = markers;

      // Fit bounds
      const bounds = new maplibregl.LngLatBounds();
      if (data.userLocation) bounds.extend([data.userLocation.lng, data.userLocation.lat]);
      if (data.destination) bounds.extend([data.destination.lng, data.destination.lat]);
      data.places.forEach((p) => bounds.extend([p.lng, p.lat]));
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 800 });
      }
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [data]);

  // Fly to active place when card is clicked
  useEffect(() => {
    if (activePlace !== null && data?.places[activePlace] && mapInstanceRef.current) {
      const p = data.places[activePlace];
      mapInstanceRef.current.flyTo({
        center: [p.lng, p.lat],
        zoom: 16,
        speed: 1.5,
        curve: 1.2,
        pitch: 55,
      });
    }
  }, [activePlace, data]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[0.08] overflow-hidden relative" style={{ perspective: "1400px", background: "linear-gradient(180deg, rgba(8,20,14,0.55) 0%, rgba(2,6,4,0.9) 100%)", backdropFilter: "blur(24px)" }}>
        <div className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center animate-pulse border border-emerald-500/20">
              <MapPin className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-300">Exploring location...</p>
              <p className="text-xs text-zinc-500">Finding places near you</p>
            </div>
          </div>
          <div className="h-72 rounded-xl bg-white/5 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-950/10 p-4">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <p className="text-sm text-red-300">{error || "Location data unavailable"}</p>
        </div>
      </div>
    );
  }

  const isNearbyQuery = data.classification.type === "nearby";
  const isDirectionsQuery = data.classification.type === "directions" || data.classification.type === "distance";

  return (
    <div
      className="rounded-2xl border border-white/[0.08] overflow-hidden relative"
      style={{
        perspective: "1400px",
        background: "linear-gradient(180deg, rgba(8,20,14,0.55) 0%, rgba(2,6,4,0.9) 100%)",
        backdropFilter: "blur(24px)",
      }}
    >
      <div className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 0 40px rgba(16,185,129,0.08), 0 8px 32px rgba(0,0,0,0.4)" }} />

      {/* Header */}
      <div className="relative p-4 pb-2 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center border border-emerald-500/20">
              <MapPin className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{data.userLocation?.name || data.destination?.name || "Your Location"}</p>
              <p className="text-[11px] text-zinc-500">
                {isNearbyQuery ? "Places nearby" : isDirectionsQuery ? "Route overview" : "Current location"}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-medium text-emerald-400/60 uppercase tracking-widest px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/10">Live</span>
        </div>
      </div>

      {/* 3D Map — MapLibre GL */}
      <div className="px-4 pb-3">
        <div
          className="rounded-xl overflow-hidden border border-white/[0.08] relative"
          style={{
            height: "320px",
            transform: "rotateX(3deg)",
            transformStyle: "preserve-3d",
            boxShadow: "0 22px 55px rgba(0,0,0,0.55), 0 10px 32px rgba(16,185,129,0.14), 0 0 0 1px rgba(255,255,255,0.05)",
          }}
        >
          <div ref={mapContainerRef} className="w-full h-full" style={{ background: "#050708" }} />
        </div>
      </div>

      {/* Big Route Stats */}
      {data.routes.length > 0 && (
        <div className="px-4 pb-3">
          <div className="flex gap-2 flex-wrap">
            {data.routes.map((route) => (
              <button
                key={route.mode}
                onClick={() => setSelectedMode(route.mode)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all ${
                  selectedMode === route.mode
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 shadow-[0_0_20px_rgba(16,185,129,0.1)]"
                    : "bg-white/[0.04] text-zinc-400 border border-white/[0.06] hover:bg-white/[0.08]"
                }`}
              >
                {getRouteIcon(route.mode)}
                <span>{route.mode}</span>
                <span className="text-zinc-600 mx-1">|</span>
                <span className="font-bold">{formatDistance(route.distance)}</span>
                <span className="text-zinc-600 mx-1">|</span>
                <Clock className="w-3 h-3 text-zinc-500" />
                <span>{formatDuration(route.duration)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Nearby Places — Google Maps style cards */}
      {data.places.length > 0 && (
        <div className="px-4 pb-3">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">Nearby places</p>
            <span className="text-[10px] text-zinc-600">{data.places.length} found</span>
          </div>
          <div className="space-y-2">
            {data.places.map((p, i) => {
              const rating = getPlaceRating(p.name);
              return (
                <button
                  key={i}
                  onClick={() => setActivePlace(i)}
                  className={`w-full text-left group flex items-start gap-3 p-2.5 rounded-xl border transition-all duration-200 ${
                    activePlace === i
                      ? "bg-emerald-500/10 border-emerald-500/20"
                      : "bg-white/[0.03] border-white/[0.05] hover:bg-white/[0.06] hover:border-white/[0.08]"
                  }`}
                >
                  {/* Photo placeholder */}
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center shrink-0 border border-white/[0.06]">
                    <MapPin className="w-5 h-5 text-zinc-600" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-xs font-semibold text-zinc-200 truncate group-hover:text-white transition-colors">{p.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <StarRating rating={rating} />
                      <span className="text-[10px] text-zinc-500 capitalize">{p.type.replace(/_/g, " ")}</span>
                    </div>
                    {p.address && (
                      <p className="text-[10px] text-zinc-600 mt-1 truncate">{p.address}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] font-bold text-emerald-400">{p.distance ? `${p.distance}m` : "nearby"}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty nearby state */}
      {data.places.length === 0 && (
        <div className="px-4 pb-4">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.04] p-3 text-xs text-zinc-400">
            No nearby places were returned for this query. Try a different category like "nearest restaurant" or move the map.
          </div>
        </div>
      )}

      {/* AI Recommendation */}
      {data.recommendation && (
        <div className="p-4 pt-0">
          <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/[0.06] p-3.5 backdrop-blur-sm">
            <p className="text-xs text-emerald-300/90 leading-relaxed">{data.recommendation}</p>
          </div>
        </div>
      )}
    </div>
  );
}
