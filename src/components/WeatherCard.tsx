"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudRain, Sun, Wind, Droplets, Thermometer, Sunrise, Sunset, MapPin, Loader2, CloudSnow, CloudLightning, CloudFog } from "lucide-react";

interface WeatherLocation {
  lat: number;
  lng: number;
  name?: string;
}

interface CurrentWeather {
  temp: number;
  condition: string;
  icon: string;
  windSpeed: number;
  humidity: number;
  rainChance: number;
  high: number;
  low: number;
  sunrise: string;
  sunset: string;
}

interface HourlyForecast {
  time: string;
  temp: number;
  icon: string;
}

interface DailyForecast {
  day: string;
  high: number;
  low: number;
  icon: string;
  rainChance: number;
}

interface WeatherData {
  current: CurrentWeather;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
  recommendation: string;
  locationName: string;
}

interface WeatherCardProps {
  prompt: string;
  location?: WeatherLocation;
}

function getWeatherIcon(code: number) {
  // WMO Weather interpretation codes (WW)
  if (code === 0) return <Sun className="w-6 h-6" />;
  if (code >= 1 && code <= 3) return <Cloud className="w-6 h-6" />;
  if (code >= 45 && code <= 48) return <CloudFog className="w-6 h-6" />;
  if (code >= 51 && code <= 67) return <CloudRain className="w-6 h-6" />;
  if (code >= 71 && code <= 77) return <CloudSnow className="w-6 h-6" />;
  if (code >= 80 && code <= 82) return <CloudRain className="w-6 h-6" />;
  if (code >= 85 && code <= 86) return <CloudSnow className="w-6 h-6" />;
  if (code >= 95 && code <= 99) return <CloudLightning className="w-6 h-6" />;
  return <Sun className="w-6 h-6" />;
}

function getConditionLabel(code: number): string {
  if (code === 0) return "Clear sky";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code >= 45 && code <= 48) return "Foggy";
  if (code >= 51 && code <= 55) return "Drizzle";
  if (code >= 56 && code <= 57) return "Freezing drizzle";
  if (code >= 61 && code <= 65) return "Rain";
  if (code >= 66 && code <= 67) return "Freezing rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 85 && code <= 86) return "Snow showers";
  if (code >= 95 && code <= 99) return "Thunderstorm";
  return "Unknown";
}

export function WeatherCard({ prompt, location }: WeatherCardProps) {
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const body: any = { prompt };
        if (location) {
          body.lat = location.lat;
          body.lng = location.lng;
        }
        const response = await fetch("/api/assist/weather", {
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
      } catch (e: any) {
        setError(e.message || "Failed to fetch weather");
      } finally {
        setLoading(false);
      }
    };
    fetchWeather();
  }, [prompt, location]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-sky-500/20 bg-gradient-to-b from-sky-950/20 to-black overflow-hidden">
        <div className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-sky-500/20 flex items-center justify-center animate-pulse">
              <Cloud className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-sky-300">Weather</p>
              <p className="text-xs text-zinc-500">Fetching forecast...</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="h-20 rounded-xl bg-white/5 animate-pulse" />
            <div className="grid grid-cols-3 gap-2">
              <div className="h-10 rounded-lg bg-white/5 animate-pulse" />
              <div className="h-10 rounded-lg bg-white/5 animate-pulse" />
              <div className="h-10 rounded-lg bg-white/5 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-950/10 p-4">
        <div className="flex items-center gap-3">
          <Cloud className="w-5 h-5 text-red-400" />
          <p className="text-sm text-red-300">{error || "Weather data unavailable"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-sky-500/20 bg-gradient-to-b from-sky-950/20 to-black overflow-hidden">
      {/* Header */}
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-xs text-zinc-400">{data.locationName || "Current Location"}</span>
          </div>
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Live</span>
        </div>
        <div className="flex items-center gap-4 mt-3">
          <div className="text-sky-400">
            {getWeatherIcon(data.current.icon as any)}
          </div>
          <div>
            <div className="text-3xl font-bold text-white">{Math.round(data.current.temp)}°</div>
            <div className="text-xs text-zinc-400">{data.current.condition}</div>
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="px-4 py-2">
        <div className="grid grid-cols-4 gap-2">
          <div className="flex flex-col items-center p-2 rounded-lg bg-white/5">
            <Thermometer className="w-3.5 h-3.5 text-zinc-500 mb-1" />
            <span className="text-[10px] text-zinc-500">High/Low</span>
            <span className="text-xs font-medium text-zinc-300">{Math.round(data.current.high)}°/{Math.round(data.current.low)}°</span>
          </div>
          <div className="flex flex-col items-center p-2 rounded-lg bg-white/5">
            <Droplets className="w-3.5 h-3.5 text-zinc-500 mb-1" />
            <span className="text-[10px] text-zinc-500">Humidity</span>
            <span className="text-xs font-medium text-zinc-300">{data.current.humidity}%</span>
          </div>
          <div className="flex flex-col items-center p-2 rounded-lg bg-white/5">
            <Wind className="w-3.5 h-3.5 text-zinc-500 mb-1" />
            <span className="text-[10px] text-zinc-500">Wind</span>
            <span className="text-xs font-medium text-zinc-300">{data.current.windSpeed} km/h</span>
          </div>
          <div className="flex flex-col items-center p-2 rounded-lg bg-white/5">
            <CloudRain className="w-3.5 h-3.5 text-zinc-500 mb-1" />
            <span className="text-[10px] text-zinc-500">Rain</span>
            <span className="text-xs font-medium text-zinc-300">{data.current.rainChance}%</span>
          </div>
        </div>
      </div>

      {/* Sunrise/Sunset */}
      <div className="px-4 py-2 flex items-center justify-center gap-6">
        <div className="flex items-center gap-1.5">
          <Sunrise className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-xs text-zinc-400">{data.current.sunrise}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Sunset className="w-3.5 h-3.5 text-orange-400" />
          <span className="text-xs text-zinc-400">{data.current.sunset}</span>
        </div>
      </div>

      {/* Hourly Forecast */}
      {data.hourly.length > 0 && (
        <div className="px-4 py-2">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Hourly</p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {data.hourly.map((h, i) => (
              <div key={i} className="flex flex-col items-center gap-1 min-w-[40px]">
                <span className="text-[10px] text-zinc-500">{h.time}</span>
                <span className="text-sky-400 scale-75">{getWeatherIcon(h.icon as any)}</span>
                <span className="text-xs font-medium text-zinc-300">{Math.round(h.temp)}°</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily Forecast */}
      {data.daily.length > 0 && (
        <div className="px-4 py-2">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Next 3 Days</p>
          <div className="space-y-1.5">
            {data.daily.map((d, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400 w-8">{d.day}</span>
                  <span className="text-sky-400 scale-75">{getWeatherIcon(d.icon as any)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500">{d.rainChance > 0 ? `${d.rainChance}%` : ""}</span>
                  <span className="text-xs font-medium text-zinc-300">{Math.round(d.high)}° / {Math.round(d.low)}°</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Recommendation */}
      {data.recommendation && (
        <div className="p-4 pt-2">
          <div className="rounded-xl border border-sky-500/10 bg-sky-500/5 p-3">
            <p className="text-xs text-sky-300 leading-relaxed">{data.recommendation}</p>
          </div>
        </div>
      )}
    </div>
  );
}
