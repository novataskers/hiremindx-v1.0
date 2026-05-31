"use client";

import { useEffect, useState, useRef } from "react";
import {
  MapPin, Navigation, Footprints, Car, Bike, Clock, Loader2, AlertCircle,
  Star, StarHalf, ArrowRight, ChevronRight
} from "lucide-react";

const LEAFLET_HIDE_CSS = `
  .leaflet-control-attribution { display: none !important; }
  .leaflet-control-zoom { border-radius: 10px !important; overflow: hidden !important; }
  .leaflet-control-zoom a { background: rgba(0,0,0,0.6) !important; color: #fff !important; border: 1px solid rgba(255,255,255,0.1) !important; }
  .leaflet-popup-content-wrapper { background: rgba(15,15,15,0.95) !important; color: #fff !important; border: 1px solid rgba(255,255,255,0.08) !important; border-radius: 10px !important; }
  .leaflet-popup-tip { background: rgba(15,15,15,0.95) !important; }
  .custom-marker { background: transparent !important; border: none !important; }
`;

let L: any = null;
let MapContainer: any = null;
let TileLayer: any = null;
let Marker: any = null;
let Popup: any = null;
let Polyline: any = null;

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

async function loadLeaflet() {
  if (L && MapContainer) return;
  const leaflet = await import("leaflet");
  const reactLeaflet = await import("react-leaflet");
  L = leaflet.default || leaflet;
  MapContainer = reactLeaflet.MapContainer;
  TileLayer = reactLeaflet.TileLayer;
  Marker = reactLeaflet.Marker;
  Popup = reactLeaflet.Popup;
  Polyline = reactLeaflet.Polyline;
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

function createMarkerIcon(type: "user" | "destination" | "poi") {
  if (!L) return undefined;
  const colors = {
    user: { bg: "#3b82f6", ring: "rgba(59,130,246,0.35)", size: 18 },
    destination: { bg: "#ef4444", ring: "rgba(239,68,68,0.35)", size: 18 },
    poi: { bg: "#a855f7", ring: "rgba(168,85,247,0.35)", size: 14 },
  };
  const c = colors[type];
  const html = `
    <div style="position:relative;width:${c.size + 8}px;height:${c.size + 8}px;display:flex;align-items:center;justify-content:center;">
      <div style="width:${c.size}px;height:${c.size}px;border-radius:50%;background:${c.bg};border:2.5px solid white;box-shadow:0 0 0 3px ${c.ring},0 4px 12px rgba(0,0,0,0.4);animation:markerPop 0.5s cubic-bezier(0.34,1.56,0.64,1);"></div>
      ${type === "user" ? `<div style="position:absolute;width:5px;height:5px;background:white;border-radius:50%;"></div>` : ""}
    </div>
    <style>@keyframes markerPop{0%{transform:scale(0)}70%{transform:scale(1.15)}100%{transform:scale(1)}}</style>
  `;
  return new L.DivIcon({ className: "custom-marker", html, iconSize: [c.size + 8, c.size + 8], iconAnchor: [(c.size + 8) / 2, (c.size + 8) / 2] });
}

export function MapCard({ prompt, location, destination, onContextResolved }: MapCardProps) {
  const [data, setData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [activePlace, setActivePlace] = useState<number | null>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    const fetchMaps = async () => {
      try {
        await loadLeaflet();
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
        // Report context back to parent for follow-up queries
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
        setMapReady(true);
      }
    };
    fetchMaps();
  }, [prompt, location, destination, onContextResolved]);

  // Fit map bounds when data loads
  useEffect(() => {
    if (!mapReady || !data || !mapRef.current || !L) return;
    const bounds: any[] = [];
    if (data.userLocation) bounds.push([data.userLocation.lat, data.userLocation.lng]);
    if (data.destination) bounds.push([data.destination.lat, data.destination.lng]);
    data.places.forEach((p) => bounds.push([p.lat, p.lng]));
    if (bounds.length > 0) {
      setTimeout(() => {
        mapRef.current?.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 16 });
      }, 100);
    }
  }, [mapReady, data]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ perspective: "1200px", background: "linear-gradient(180deg, rgba(6,30,20,0.6) 0%, rgba(0,0,0,0.85) 100%)", backdropFilter: "blur(20px)" }}>
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
          <div className="h-64 rounded-xl bg-white/5 animate-pulse" />
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

  const hasMap = data.userLocation || data.destination || data.places.length > 0;
  const activeRoute = data.routes.find((r) => r.mode === selectedMode);

  // Build route coordinates if geometry exists
  const routeCoords: [number, number][] = [];
  if (activeRoute?.geometry) {
    try {
      // OSRM returns GeoJSON LineString coordinates as [lng, lat] pairs
      const parsed = JSON.parse(activeRoute.geometry);
      if (Array.isArray(parsed)) {
        routeCoords.push(...parsed.map((c: any) => [c[1], c[0]] as [number, number]));
      }
    } catch {
      // If geometry isn't valid JSON, skip polyline
    }
  }

  const userIcon = createMarkerIcon("user");
  const destIcon = createMarkerIcon("destination");
  const poiIcon = createMarkerIcon("poi");

  const defaultCenter: [number, number] = data.userLocation
    ? [data.userLocation.lat, data.userLocation.lng]
    : data.destination
    ? [data.destination.lat, data.destination.lng]
    : [23.8103, 90.4125];

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
      <style>{LEAFLET_HIDE_CSS}</style>
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

      {/* 3D Map */}
      {hasMap && mapReady && MapContainer && (
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
            <MapContainer
              center={defaultCenter}
              zoom={14}
              scrollWheelZoom={true}
              attributionControl={false}
              zoomControl={true}
              style={{ height: "100%", width: "100%", background: "#050708" }}
              ref={mapRef}
            >
              <TileLayer
                url="https://stamen-tiles.a.ssl.fastly.net/toner/{z}/{x}/{y}.png"
              />
              {data.userLocation && (
                <Marker position={[data.userLocation.lat, data.userLocation.lng]} icon={userIcon}>
                  <Popup><span className="text-xs font-medium text-white">You are here</span></Popup>
                </Marker>
              )}
              {data.destination && (
                <Marker position={[data.destination.lat, data.destination.lng]} icon={destIcon}>
                  <Popup><span className="text-xs font-medium text-white">{data.destination.name}</span></Popup>
                </Marker>
              )}
              {data.places.map((p, i) => (
                <Marker key={i} position={[p.lat, p.lng]} icon={poiIcon}>
                  <Popup>
                    <div className="text-xs">
                      <p className="font-medium text-white">{p.name}</p>
                      {p.distance && <p className="text-zinc-400">{p.distance}m away</p>}
                    </div>
                  </Popup>
                </Marker>
              ))}
              {routeCoords.length > 1 && (
                <Polyline positions={routeCoords} pathOptions={{ color: "#10b981", weight: 5, opacity: 0.85, lineCap: "round", lineJoin: "round" }} />
              )}
            </MapContainer>
          </div>
        </div>
      )}

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
