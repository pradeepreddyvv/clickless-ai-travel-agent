// Flight provider with three-tier fallback:
//   1. Static JSON file in src/lib/cache/ (committed to Git, bundled by Vercel)
//   2. Live Duffel API (if DUFFEL_API_KEY is set and static file is absent)
//   3. Hardcoded demo data (always available)

import { readFileSync } from "fs";
import { join } from "path";
import type { FlightOption } from "@/lib/types";
import { getFlights as getDemoFlights } from "./demo-data";
import { fetchDuffelFlights, isDuffelConfigured } from "./duffel";

const CITY_SLUG: Record<string, string> = {
  Tokyo: "tokyo",
  London: "london",
  Paris: "paris",
  Cancún: "cancun",
  Cancun: "cancun",
  "New York": "new-york",
};

interface CacheFile {
  seededAt: string;
  dateRange: { from: string; to: string };
  flights: FlightOption[];
}

function loadStaticCache(city: string): FlightOption[] | null {
  const slug = CITY_SLUG[city];
  if (!slug) return null;
  try {
    const filePath = join(
      process.cwd(),
      "src",
      "lib",
      "cache",
      `${slug}.json`
    );
    const cache = JSON.parse(readFileSync(filePath, "utf-8")) as CacheFile;
    return cache.flights?.length ? cache.flights : null;
  } catch {
    return null; // file not yet seeded — fall through to next tier
  }
}

export type FlightSource = "static" | "duffel" | "demo";

/**
 * Returns flights for a destination.
 *
 * Priority:
 *   static JSON (git) → live Duffel → demo data
 */
export async function getFlights(
  destination: string,
  origin = "PHX"
): Promise<{ flights: FlightOption[]; source: FlightSource }> {
  // 1. Static seed file (git-committed, zero API calls at runtime)
  const staticFlights = loadStaticCache(destination);
  if (staticFlights) {
    return { flights: staticFlights, source: "static" };
  }

  // 2. Live Duffel (covers cities not yet seeded, or local dev without a seed file)
  if (isDuffelConfigured()) {
    try {
      const live = await fetchDuffelFlights(destination, origin);
      if (live.length > 0) {
        return { flights: live, source: "duffel" };
      }
    } catch (err) {
      console.warn("Duffel fetch failed, falling back to demo data:", err);
    }
  }

  // 3. Demo fallback
  return { flights: getDemoFlights(destination), source: "demo" };
}
