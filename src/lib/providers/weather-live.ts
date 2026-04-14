import type { WeatherForecast } from "@/lib/types";
import { getWeather } from "@/lib/providers/demo-data";
import { loadCityCache } from "@/lib/cache";

// In-memory cache for live OWM fallback
const memCache = new Map<string, { data: WeatherForecast[]; fetchedAt: number }>();
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

export async function getWeatherLive(city: string, nights: number, startDate?: string): Promise<WeatherForecast[]> {
  // 1. Static git-committed cache (90 days of real dated forecasts)
  const staticCache = loadCityCache(city);
  if (staticCache?.weather90Days?.length) {
    const today = new Date().toISOString().split("T")[0];
    // Use requested start date if it's in the future, otherwise default to today
    const from = startDate && startDate > today ? startDate : today;
    const fromDate = staticCache.weather90Days.filter((w) => w.date >= from);
    if (fromDate.length >= nights) {
      console.log(`[weather] Serving "${city}" from static cache starting ${from} (${fromDate.length} days available)`);
      return fromDate.slice(0, nights + 1);
    }
    // If cache has some but not enough days, serve what's available
    if (fromDate.length > 0) {
      console.log(`[weather] Partial static cache for "${city}" — ${fromDate.length} days from ${from}`);
      return fromDate;
    }
  }

  // 2. Live OWM fallback (5-day forecast)
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    console.warn(`[weather] No API key and no static cache for "${city}" — using demo`);
    return getWeather(city, nights);
  }

  const cached = memCache.get(city);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data.slice(0, nights + 1);
  }

  try {
    const url = new URL("https://api.openweathermap.org/data/2.5/forecast");
    url.searchParams.set("q", city);
    url.searchParams.set("appid", apiKey);
    url.searchParams.set("units", "imperial");
    url.searchParams.set("cnt", "40");

    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) {
      console.warn(`[weather] OWM ${res.status} for "${city}" — using demo`);
      return getWeather(city, nights);
    }

    const json = await res.json() as {
      list: { dt_txt: string; main: { temp_max: number; temp_min: number; humidity: number }; weather: { description: string }[]; pop: number }[];
    };

    const byDate = new Map<string, typeof json.list[0][]>();
    for (const item of json.list) {
      const date = item.dt_txt.split(" ")[0];
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(item);
    }

    const forecasts: WeatherForecast[] = Array.from(byDate.entries()).map(([date, items]) => ({
      date,
      tempHighF: Math.round(Math.max(...items.map((e) => e.main.temp_max))),
      tempLowF:  Math.round(Math.min(...items.map((e) => e.main.temp_min))),
      condition: capitalize((items.find((e) => e.dt_txt.includes("12:00")) ?? items[0]).weather[0]?.description ?? "Clear"),
      humidity:  Math.round(items.reduce((s, e) => s + e.main.humidity, 0) / items.length),
      rainChance: Math.round(Math.max(...items.map((e) => e.pop ?? 0)) * 100),
    }));

    memCache.set(city, { data: forecasts, fetchedAt: Date.now() });
    console.log(`[weather] OWM live for "${city}" — ${forecasts.length} days`);
    return forecasts.slice(0, nights + 1);
  } catch (err) {
    console.warn(`[weather] Fetch error for "${city}":`, err);
    return getWeather(city, nights);
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
