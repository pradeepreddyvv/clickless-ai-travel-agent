/**
 * Supabase Dynamic Data Provider
 *
 * Fetches flights, hotels, and activities from Supabase cached tables.
 * Dynamically filters based on user intent: destination, budget, duration,
 * interests, and cabin class.
 *
 * Data merge strategy (highest priority first):
 *   1. Supabase DB (cached_flights / cached_hotels / cached_activities)
 *   2. Static JSON cache files (src/lib/cache/{city}.json)
 *   3. Demo data (src/lib/providers/demo-data.ts)
 *
 * When teammates push new data to cache files, this provider automatically
 * picks it up and merges it with Supabase results (deduplicated by name).
 */

import { getSupabase } from "@/lib/supabase/client";
import { loadCityCache } from "@/lib/cache";
import type { FlightOption, HotelOption, ActivityOption, TravelIntent } from "@/lib/types";
import {
  getFlights as getDemoFlights,
  getHotels as getDemoHotels,
  getActivities as getDemoActivities,
} from "./demo-data";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize city name for case-insensitive matching */
function normalizeCity(city: string): string {
  return city
    .trim()
    .replace(/['']/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Determine what cabin classes to query based on budget per-person per-leg.
 * With a $40k budget, business/first class makes sense.
 * With a $5k budget, only economy.
 */
function cabinClassesForBudget(budgetPerLeg: number): string[] {
  if (budgetPerLeg >= 4000) return ["economy", "premium_economy", "business", "first"];
  if (budgetPerLeg >= 1500) return ["economy", "premium_economy", "business"];
  if (budgetPerLeg >= 800) return ["economy", "premium_economy"];
  return ["economy"];
}

/**
 * Determine hotel star class tiers based on nightly budget.
 */
function hotelTiersForBudget(nightlyBudget: number): string[] {
  if (nightlyBudget >= 600) return ["budget", "mid-range", "luxury", "ultra-luxury"];
  if (nightlyBudget >= 250) return ["budget", "mid-range", "luxury"];
  if (nightlyBudget >= 100) return ["budget", "mid-range"];
  return ["budget"];
}

/** Deduplicate items by lowercase name, keeping first occurrence */
function deduplicateByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Flights ──────────────────────────────────────────────────────────────────

export async function getSupabaseFlights(intent: TravelIntent): Promise<FlightOption[]> {
  const supabase = getSupabase();
  const dest = normalizeCity(intent.destination);
  const totalBudget = intent.budget || 5000;
  const flightBudgetPerLeg = Math.round((totalBudget * 0.30) / 2);
  const allowedCabins = cabinClassesForBudget(flightBudgetPerLeg);

  let dbFlights: FlightOption[] = [];

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("cached_flights")
        .select("*")
        .ilike("destination", `%${dest}%`)
        .in("cabin_class", allowedCabins)
        .lte("price", flightBudgetPerLeg)
        .order("price", { ascending: true })
        .limit(10);

      if (!error && data && data.length > 0) {
        dbFlights = data.map((row) => ({
          id: row.id,
          airline: row.airline,
          origin: row.origin || intent.origin || "Phoenix",
          destination: row.destination_code || row.destination,
          departureTime: row.departure_time || "",
          arrivalTime: row.arrival_time || "",
          duration: row.duration || "",
          stops: row.stops || 0,
          price: Number(row.price),
          currency: row.currency || "USD",
          bookingUrl: row.booking_url,
          source: `Supabase/${row.source || "cache"}`,
        }));
      }
    } catch (err) {
      console.warn("Supabase flights query error:", err);
    }
  }

  // Merge with demo data as fallback
  if (dbFlights.length === 0) {
    const demoFlights = getDemoFlights(intent.destination);
    // Filter demo flights by budget
    const affordable = demoFlights.filter((f) => f.price <= flightBudgetPerLeg);
    return affordable.length > 0 ? affordable : demoFlights.slice(0, 3);
  }

  return dbFlights;
}

// ── Hotels ───────────────────────────────────────────────────────────────────

export async function getSupabaseHotels(intent: TravelIntent): Promise<HotelOption[]> {
  const supabase = getSupabase();
  const dest = normalizeCity(intent.destination);
  const nights = Math.max((intent.duration || 5) - 1, 1);
  const totalBudget = intent.budget || 5000;
  const maxNightly = Math.round((totalBudget * 0.35) / nights);
  const allowedTiers = hotelTiersForBudget(maxNightly);

  let dbHotels: HotelOption[] = [];

  if (supabase) {
    try {
      // Query with budget filter
      const { data, error } = await supabase
        .from("cached_hotels")
        .select("*")
        .ilike("destination", `%${dest}%`)
        .in("star_class", allowedTiers)
        .lte("price_per_night", maxNightly)
        .order("rating", { ascending: false })
        .limit(15);

      if (!error && data && data.length > 0) {
        dbHotels = data.map(mapHotelRow);
      } else if (totalBudget > 10000) {
        // High budget: fetch all, don't limit by price
        const { data: all } = await supabase
          .from("cached_hotels")
          .select("*")
          .ilike("destination", `%${dest}%`)
          .order("rating", { ascending: false })
          .limit(15);
        if (all && all.length > 0) dbHotels = all.map(mapHotelRow);
      }
    } catch (err) {
      console.warn("Supabase hotels query error:", err);
    }
  }

  // Merge with local cache file hotels (from teammates' commits)
  const cache = loadCityCache(intent.destination);
  const cacheHotels: HotelOption[] = cache?.hotels || [];

  // Filter cache hotels by budget
  const affordableCache = cacheHotels.filter((h) => h.pricePerNight <= maxNightly);

  // Combine: Supabase first, then cache, then demo - deduplicated
  const merged = deduplicateByName([
    ...dbHotels,
    ...affordableCache,
    ...(dbHotels.length === 0 && affordableCache.length === 0
      ? getDemoHotels(intent.destination)
      : []),
  ]);

  return merged.length > 0 ? merged : getDemoHotels(intent.destination);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapHotelRow(row: any): HotelOption {
  return {
    id: row.id,
    name: row.name,
    rating: Number(row.rating),
    pricePerNight: Number(row.price_per_night),
    currency: row.currency || "USD",
    neighborhood: row.neighborhood,
    amenities: Array.isArray(row.amenities) ? row.amenities : [],
    imageUrl: row.image_url,
    bookingUrl: row.booking_url,
    source: `Supabase/${row.source || "cache"}`,
  };
}

// ── Activities ───────────────────────────────────────────────────────────────

export async function getSupabaseActivities(intent: TravelIntent): Promise<ActivityOption[]> {
  const supabase = getSupabase();
  const dest = normalizeCity(intent.destination);
  const totalBudget = intent.budget || 5000;
  const totalDays = intent.duration || 5;
  const activityBudget = Math.round(totalBudget * 0.15);
  const maxPerActivity = Math.max(Math.round(activityBudget / (totalDays * 2)), 50);

  let dbActivities: ActivityOption[] = [];

  if (supabase) {
    try {
      // First: fetch interest-matched activities
      if (intent.activities.length > 0) {
        const promises = intent.activities.map((interest) =>
          supabase
            .from("cached_activities")
            .select("*")
            .ilike("destination", `%${dest}%`)
            .ilike("category", `%${interest.toLowerCase()}%`)
            .lte("estimated_cost", maxPerActivity)
            .order("rating", { ascending: false })
            .limit(8)
        );
        const results = await Promise.all(promises);
        const matched = results.flatMap((r) => r.data || []);
        dbActivities = deduplicateByName(matched.map(mapActivityRow));
      }

      // Then: general activities for the destination
      const { data: generalData } = await supabase
        .from("cached_activities")
        .select("*")
        .ilike("destination", `%${dest}%`)
        .lte("estimated_cost", maxPerActivity)
        .order("rating", { ascending: false })
        .limit(30);

      if (generalData && generalData.length > 0) {
        const general = generalData.map(mapActivityRow);
        dbActivities = deduplicateByName([...dbActivities, ...general]);
      }
    } catch (err) {
      console.warn("Supabase activities query error:", err);
    }
  }

  // Merge with local cache file activities (from teammates' commits)
  const cache = loadCityCache(intent.destination);
  const cacheActivities: ActivityOption[] = cache?.activities || [];

  // Filter cache activities by budget
  const affordableCache = cacheActivities.filter(
    (a) => !a.estimatedCost || a.estimatedCost <= maxPerActivity
  );

  // Combine: Supabase first, then cache, then demo - deduplicated
  const merged = deduplicateByName([
    ...dbActivities,
    ...affordableCache,
    ...(dbActivities.length === 0 && affordableCache.length === 0
      ? getDemoActivities(intent.destination, intent.activities)
      : []),
  ]);

  return merged.length > 0 ? merged : getDemoActivities(intent.destination, intent.activities);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapActivityRow(row: any): ActivityOption {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description || "",
    estimatedCost: Number(row.estimated_cost) || 0,
    duration: row.duration,
    location: row.location,
    rating: Number(row.rating) || 0,
  };
}

// ── Combined Fetch ───────────────────────────────────────────────────────────

/**
 * Fetch all data from Supabase + cache in parallel, dynamically filtered by user intent.
 *
 * Budget drives cabin class, hotel tier, and activity cost filtering:
 * - $40k budget -> first class flights, ultra-luxury hotels, premium activities
 * - $5k budget  -> economy flights, budget/mid-range hotels, affordable activities
 *
 * Data from teammates' cache file commits is automatically merged.
 */
export async function getSupabaseData(intent: TravelIntent): Promise<{
  flights: FlightOption[];
  hotels: HotelOption[];
  activities: ActivityOption[];
}> {
  const [flights, hotels, activities] = await Promise.all([
    getSupabaseFlights(intent),
    getSupabaseHotels(intent),
    getSupabaseActivities(intent),
  ]);

  return { flights, hotels, activities };
}
