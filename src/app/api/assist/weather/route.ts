/**
 * HireMindX Weather API
 * Uses Open-Meteo (free, no API key required)
 */

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

interface WeatherParams {
  lat?: number;
  lng?: number;
  prompt: string;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatDay(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

function generateRecommendation(
  temp: number,
  rainChance: number,
  windSpeed: number,
  condition: string,
  prompt: string
): string {
  const lowerPrompt = prompt.toLowerCase();

  // Answer implicit questions directly
  if (/umbrella/i.test(lowerPrompt)) {
    if (rainChance > 60) return `Yes, take an umbrella. There's a ${rainChance}% chance of rain right now.`;
    if (rainChance > 30) return `Maybe bring one — ${rainChance}% chance of rain today.`;
    return `You probably won't need an umbrella. Only ${rainChance}% chance of rain.`;
  }

  if (/jacket/i.test(lowerPrompt)) {
    if (temp < 10) return `Yes, you'll need a heavy jacket. It's ${Math.round(temp)}°C outside.`;
    if (temp < 18) return `A light jacket would be good. It's ${Math.round(temp)}°C.`;
    return `No jacket needed. It's ${Math.round(temp)}°C and comfortable.`;
  }

  if (/jogging|running|walk/i.test(lowerPrompt)) {
    if (rainChance > 50) return `Not ideal — ${rainChance}% chance of rain. Maybe wait it out or go to a gym.`;
    if (temp > 30) return `It's hot (${Math.round(temp)}°C). Go early morning or evening, and stay hydrated.`;
    if (temp < 5) return `It's cold (${Math.round(temp)}°C). Dress in layers if you go.`;
    return `Great conditions for a run! ${Math.round(temp)}°C with ${condition.toLowerCase()} skies.`;
  }

  if (/rain/i.test(lowerPrompt)) {
    if (rainChance > 60) return `Yes, it's likely to rain — ${rainChance}% chance.`;
    if (rainChance > 30) return `There's a ${rainChance}% chance. Keep an eye on the sky.`;
    return `Unlikely to rain. Only ${rainChance}% chance.`;
  }

  if (/safe|outside/i.test(lowerPrompt)) {
    if (rainChance > 60) return `I'd wait — ${rainChance}% chance of rain and ${windSpeed} km/h winds.`;
    if (windSpeed > 40) return `It's windy (${windSpeed} km/h). Be cautious if you're heading out.`;
    return `Yes, it's safe to go outside. ${Math.round(temp)}°C and ${condition.toLowerCase()}.`;
  }

  // Generic recommendation
  if (rainChance > 60) return `It's ${Math.round(temp)}°C with a ${rainChance}% chance of rain. Bring an umbrella if heading out.`;
  if (temp > 30) return `Hot day at ${Math.round(temp)}°C. Stay hydrated and avoid prolonged sun exposure.`;
  if (temp < 5) return `Cold at ${Math.round(temp)}°C. Bundle up if you're going outside.`;
  return `Nice weather at ${Math.round(temp)}°C with ${condition.toLowerCase()} skies. Good conditions for most outdoor activities.`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as WeatherParams;
    const { lat, lng, prompt } = body;

    let latitude = lat;
    let longitude = lng;

    // Default to Dhaka if no location provided
    const hasProvidedLocation = !!(lat && lng);
    if (!hasProvidedLocation) {
      latitude = 23.8103;
      longitude = 90.4125;
    }

    // Fetch from Open-Meteo
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&hourly=temperature_2m,relativehumidity_2m,precipitation_probability,weathercode&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,weathercode&timezone=auto`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Open-Meteo error: ${res.status}`);
    }

    const forecast = await res.json();

    const current = forecast.current_weather;
    const hourly = forecast.hourly;
    const daily = forecast.daily;

    // Build hourly forecast (next 12 hours)
    const now = new Date();
    const currentHour = now.getHours();
    const hourlyForecast = [];
    for (let i = 0; i < 12; i++) {
      const idx = currentHour + i;
      if (idx >= hourly.time.length) break;
      hourlyForecast.push({
        time: new Date(hourly.time[idx]).toLocaleTimeString("en-US", { hour: "numeric", hour12: true }),
        temp: hourly.temperature_2m[idx],
        icon: hourly.weathercode[idx],
      });
    }

    // Build daily forecast (next 3 days)
    const dailyForecast = [];
    for (let i = 1; i <= 3; i++) {
      if (i >= daily.time.length) break;
      dailyForecast.push({
        day: formatDay(daily.time[i]),
        high: daily.temperature_2m_max[i],
        low: daily.temperature_2m_min[i],
        icon: daily.weathercode[i],
        rainChance: daily.precipitation_probability_max[i] || 0,
      });
    }

    // Get current hour index for humidity
    const currentHourIndex = currentHour;
    const humidity = hourly.relativehumidity_2m[currentHourIndex] || 60;
    const rainChance = hourly.precipitation_probability[currentHourIndex] || 0;

    const recommendation = generateRecommendation(
      current.temperature,
      rainChance,
      current.windspeed,
      getConditionLabel(current.weathercode),
      prompt
    );

    return NextResponse.json({
      current: {
        temp: current.temperature,
        condition: getConditionLabel(current.weathercode),
        icon: current.weathercode,
        windSpeed: current.windspeed,
        humidity,
        rainChance,
        high: daily.temperature_2m_max[0],
        low: daily.temperature_2m_min[0],
        sunrise: formatTime(daily.sunrise[0]),
        sunset: formatTime(daily.sunset[0]),
      },
      hourly: hourlyForecast,
      daily: dailyForecast,
      recommendation,
      locationName: hasProvidedLocation ? "Current Location" : "Default: Dhaka",
    });
  } catch (e: any) {
    console.error("Weather API error:", e);
    return NextResponse.json({ error: e.message || "Failed to fetch weather" }, { status: 500 });
  }
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
