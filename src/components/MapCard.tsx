"use client";

import { useEffect, useState, useRef } from "react";
import { MapPin, Navigation, Footprints, Car, Bike, Clock, Loader2, AlertCircle } from "lucide-react";

// Leaflet CSS
import "leaflet/dist/leaflet.css";

// Dynamically import react-leaflet to avoid SSR issues
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
}

// Lazy load leaflet modules on client
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

  // Fix default marker icon paths (webpack/Next.js issue)
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
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

export function MapCard({ prompt, location, destination }: MapCardProps) {
  const [data, setData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
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
      } catch (e: any) {
        setError(e.message || "Failed to fetch location data");
      } finally {
        setLoading(false);
        setMapReady(true);
      }
    };
    fetchMaps();
  }, [prompt, location, destination]);

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
      <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-950/20 to-black overflow-hidden">
        <div className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center animate-pulse">
              <MapPin className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-300">Location</p>
              <p className="text-xs text-zinc-500">Fetching map data...</p>
            </div>
          </div>
          <div className="h-48 rounded-xl bg-white/5 animate-pulse" />
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

  const userIcon = L
    ? new L.DivIcon({
        className: "custom-div-icon",
        html: `<div style="background:#3b82f6;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 8px rgba(59,130,246,0.6);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      })
    : undefined;

  const destIcon = L
    ? new L.DivIcon({
        className: "custom-div-icon",
        html: `<div style="background:#ef4444;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 8px rgba(239,68,68,0.6);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      })
    : undefined;

  const poiIcon = L
    ? new L.DivIcon({
        className: "custom-div-icon",
        html: `<div style="background:#a855f7;width:10px;height:10px;border-radius:50%;border:2px solid white;box-shadow:0 0 6px rgba(168,85,247,0.5);"></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      })
    : undefined;

  const defaultCenter: [number, number] = data.userLocation
    ? [data.userLocation.lat, data.userLocation.lng]
    : data.destination
    ? [data.destination.lat, data.destination.lng]
    : [23.8103, 90.4125]; // Dhaka fallback

  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-950/20 to-black overflow-hidden">
      {/* Header */}
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs text-zinc-400">{data.userLocation?.name || data.destination?.name || "Location"}</span>
          </div>
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Live</span>
        </div>
      </div>

      {/* Map */}
      {hasMap && mapReady && MapContainer && (
        <div className="px-4">
          <div className="rounded-xl overflow-hidden border border-white/5 h-56 sm:h-64 relative">
            <MapContainer
              center={defaultCenter}
              zoom={13}
              scrollWheelZoom={true}
              style={{ height: "100%", width: "100%", background: "#0f0f0f" }}
              ref={mapRef}
            >
              <TileLayer
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
              {data.userLocation && (
                <Marker position={[data.userLocation.lat, data.userLocation.lng]} icon={userIcon}>
                  <Popup className="dark-popup">
                    <span className="text-xs font-medium">You are here</span>
                  </Popup>
                </Marker>
              )}
              {data.destination && (
                <Marker position={[data.destination.lat, data.destination.lng]} icon={destIcon}>
                  <Popup className="dark-popup">
                    <span className="text-xs font-medium">{data.destination.name}</span>
                  </Popup>
                </Marker>
              )}
              {data.places.map((p, i) => (
                <Marker key={i} position={[p.lat, p.lng]} icon={poiIcon}>
                  <Popup className="dark-popup">
                    <div className="text-xs">
                      <p className="font-medium">{p.name}</p>
                      {p.distance && <p className="text-zinc-400">{p.distance}m away</p>}
                    </div>
                  </Popup>
                </Marker>
              ))}
              {routeCoords.length > 1 && (
                <Polyline positions={routeCoords} pathOptions={{ color: "#10b981", weight: 4, opacity: 0.8 }} />
              )}
            </MapContainer>
          </div>
        </div>
      )}

      {/* Route modes */}
      {data.routes.length > 0 && (
        <div className="px-4 py-3">
          <div className="flex gap-2 flex-wrap">
            {data.routes.map((route) => (
              <button
                key={route.mode}
                onClick={() => setSelectedMode(route.mode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selectedMode === route.mode
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "bg-white/5 text-zinc-400 border border-white/5 hover:bg-white/10"
                }`}
              >
                {getRouteIcon(route.mode)}
                <span>{route.mode}</span>
                <span className="text-zinc-500">·</span>
                <span>{formatDistance(route.distance)}</span>
                <span className="text-zinc-500">·</span>
                <Clock className="w-3 h-3 text-zinc-500" />
                <span>{formatDuration(route.duration)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Nearby places */}
      {data.places.length > 0 && (
        <div className="px-4 py-2">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Nearby</p>
          <div className="space-y-1.5">
            {data.places.map((p, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-300 truncate">{p.name}</p>
                    {p.address && <p className="text-[10px] text-zinc-500 truncate">{p.address}</p>}
                  </div>
                </div>
                {p.distance !== undefined && (
                  <span className="text-[10px] text-zinc-500 shrink-0 ml-2">{p.distance}m</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Recommendation */}
      {data.recommendation && (
        <div className="p-4 pt-2">
          <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-3">
            <p className="text-xs text-emerald-300 leading-relaxed">{data.recommendation}</p>
          </div>
        </div>
      )}
    </div>
  );
}
