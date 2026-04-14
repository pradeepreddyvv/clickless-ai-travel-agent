import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { CacheEntry } from "./types";

export type { CacheEntry } from "./types";

/** "New York" → "new-york", "Cancún" → "cancun" */
export function cityToSlug(city: string): string {
  return city
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Load a city's static JSON cache from src/lib/cache/{slug}.json.
 * Returns null if the file doesn't exist yet (run `npm run seed-cache`).
 */
export function loadCityCache(city: string): CacheEntry | null {
  const slug = cityToSlug(city);
  const filePath = join(process.cwd(), "src", "lib", "cache", `${slug}.json`);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as CacheEntry;
  } catch {
    return null;
  }
}
