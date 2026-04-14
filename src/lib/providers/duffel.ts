// Duffel Flight Search adapter
// API docs: https://duffel.com/docs/api/v2/overview
//
// Duffel takes a specific departure date per request, so we sample
// every 2 weeks across the 3-month window (~7 calls per destination).
// The seed script batches all of these; at runtime only the static
// JSON files are read — no API calls needed.

import type { FlightOption } from "@/lib/types";

const DUFFEL_BASE_URL =
  process.env.DUFFEL_BASE_URL || "https://api.duffel.com";
const DUFFEL_VERSION = "v2";

// ── IATA airport codes for the 5 supported demo cities ──
export const CITY_TO_IATA: Record<string, string> = {
  Tokyo: "NRT",
  London: "LHR",
  Paris: "CDG",
  Cancún: "CUN",
  Cancun: "CUN",
  "New York": "JFK",
};

// ── Date helpers ──

/**
 * Returns ~7 departure dates (YYYY-MM-DD) sampled every 2 weeks
 * from tomorrow through the next 90 days.
 */
export function getThreeMonthDepartureDates(): string[] {
  const dates: string[] = [];
  const start = new Date();
  start.setDate(start.getDate() + 1); // Duffel rejects today

  for (let offset = 0; offset < 90; offset += 14) {
    const d = new Date(start);
    d.setDate(d.getDate() + offset);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

// ── Normalization helpers ──

/** "PT13H15M" → "13h 15m" */
function parseDuration(iso: string): string {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return iso;
  const h = parseInt(m[1] || "0");
  const min = parseInt(m[2] || "0");
  if (h === 0) return `${min}m`;
  return min > 0 ? `${h}h ${min}m` : `${h}h`;
}

/** "2026-04-20T10:30:00" → "Apr 20 · 10:30" */
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

// ── Raw Duffel response types (minimal) ──
interface DuffelPlace {
  iata_code: string;
}
interface DuffelCarrier {
  iata_code: string;
  name: string;
}
interface DuffelSegment {
  departing_at: string;
  arriving_at: string;
  origin: DuffelPlace;
  destination: DuffelPlace;
  marketing_carrier: DuffelCarrier;
  duration: string; // ISO 8601 e.g. "PT13H15M"
}
interface DuffelSlice {
  segments: DuffelSegment[];
  duration: string;
}
interface DuffelOffer {
  id: string;
  slices: DuffelSlice[];
  total_amount: string;
  total_currency: string;
}
interface DuffelOfferRequestResponse {
  data: { id: string; offers: DuffelOffer[] };
}

function normalizeOffer(
  offer: DuffelOffer,
  departureDate: string
): FlightOption {
  const slice = offer.slices[0];
  const firstSeg = slice.segments[0];
  const lastSeg = slice.segments[slice.segments.length - 1];

  return {
    id: `duffel-${departureDate}-${offer.id}`,
    airline: firstSeg.marketing_carrier.name,
    origin: firstSeg.origin.iata_code,
    destination: lastSeg.destination.iata_code,
    departureTime: formatDateTime(firstSeg.departing_at),
    arrivalTime: formatDateTime(lastSeg.arriving_at),
    duration: parseDuration(slice.duration),
    stops: slice.segments.length - 1,
    price: Math.round(parseFloat(offer.total_amount)),
    currency: offer.total_currency || "USD",
    source: "Duffel",
  };
}

// ── Per-date fetch ──

async function fetchOffersForDate(
  apiKey: string,
  origin: string,
  destination: string,
  departureDate: string,
  adults: number
): Promise<FlightOption[]> {
  const res = await fetch(`${DUFFEL_BASE_URL}/air/offer_requests`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Duffel-Version": DUFFEL_VERSION,
    },
    body: JSON.stringify({
      data: {
        slices: [{ origin, destination, departure_date: departureDate }],
        passengers: Array.from({ length: adults }, () => ({ type: "adult" })),
        cabin_class: "economy",
        return_offers: true,
      },
    }),
  });

  if (!res.ok) {
    console.warn(
      `Duffel offer_request failed: ${res.status} for ` +
        `${origin}→${destination} on ${departureDate}`
    );
    return [];
  }

  const json: DuffelOfferRequestResponse = await res.json();
  // Limit to top 5 cheapest per date to keep the seed file concise
  return (json.data?.offers ?? [])
    .slice(0, 5)
    .map((o) => normalizeOffer(o, departureDate));
}

// ── Main fetch (used at runtime as live fallback) ──

/**
 * Fetches offers across the next 3 months (~7 calls, one per 2-week interval).
 * Returns an empty array on any non-fatal error.
 */
export async function fetchDuffelFlights(
  destinationCity: string,
  origin = "PHX",
  adults = 1
): Promise<FlightOption[]> {
  const apiKey = process.env.DUFFEL_API_KEY;
  if (!apiKey) throw new Error("DUFFEL_API_KEY is not set");

  const destinationCode = CITY_TO_IATA[destinationCity];
  if (!destinationCode) {
    console.warn(
      `No IATA code mapped for "${destinationCity}" — skipping Duffel fetch`
    );
    return [];
  }

  const dates = getThreeMonthDepartureDates();
  const results: FlightOption[] = [];

  for (const date of dates) {
    const offers = await fetchOffersForDate(
      apiKey,
      origin,
      destinationCode,
      date,
      adults
    );
    results.push(...offers);
    // Stay within sandbox burst limits (~2 req/sec)
    await new Promise((r) => setTimeout(r, 500));
  }

  return results;
}

export function isDuffelConfigured(): boolean {
  return !!process.env.DUFFEL_API_KEY;
}
