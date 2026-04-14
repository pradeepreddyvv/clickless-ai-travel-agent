import type { ActivityOption, CulturalNorm, WeatherForecast } from "@/lib/types";

export interface CacheEntry {
  city: string;
  seededAt: string;           // ISO timestamp
  weather90Days: WeatherForecast[]; // ~90 actual dated forecasts
  activities: ActivityOption[];
  cultural: CulturalNorm[];
}
