#!/usr/bin/env node
// Fetches flight data from Duffel for all 5 demo cities across the next
// 3 months and writes one JSON file per city to src/lib/cache/.
//
// Run:
//   npm run seed-cache
//
// Requires DUFFEL_API_KEY in .env.local (loaded automatically via --env-file).
// Sandbox keys start with "duffel_test_"; get one at https://app.duffel.com.

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CACHE_DIR = join(ROOT, "src", "lib", "cache");

const DUFFEL_BASE_URL = process.env.DUFFEL_BASE_URL || "https://api.duffel.com";
const DUFFEL_VERSION = "v2";
const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY;
const ORIGIN = process.env.SEED_ORIGIN || "PHX";

if (!DUFFEL_API_KEY) {
  console.error(
    "Error: DUFFEL_API_KEY is not set.\n" +
    "Add it to .env.local and re-run. Sandbox keys start with duffel_test_"
  );
  process.exit(1);
}

const CITIES = [
  { name: "Tokyo",    slug: "tokyo",    iata: "NRT" },
  { name: "London",   slug: "london",   iata: "LHR" },
  { name: "Paris",    slug: "paris",    iata: "CDG" },
  { name: "Cancún",   slug: "cancun",   iata: "CUN" },
  { name: "New York", slug: "new-york", iata: "JFK" },
];

// ── Date helpers ─────────────────────────────────────────────────────────────

function getThreeMonthDepartureDates() {
  const dates = [];
  const start = new Date();
  start.setDate(start.getDate() + 1); // Duffel rejects today

  for (let offset = 0; offset < 90; offset += 14) {
    const d = new Date(start);
    d.setDate(d.getDate() + offset);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

// ── Normalization ─────────────────────────────────────────────────────────────

function parseDuration(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return iso;
  const h = parseInt(m[1] || "0");
  const min = parseInt(m[2] || "0");
  if (h === 0) return `${min}m`;
  return min > 0 ? `${h}h ${min}m` : `${h}h`;
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

function normalizeOffer(offer, departureDate) {
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

// ── Duffel API ────────────────────────────────────────────────────────────────

async function fetchOffersForDate(origin, destination, departureDate) {
  const res = await fetch(`${DUFFEL_BASE_URL}/air/offer_requests`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DUFFEL_API_KEY}`,
      "Content-Type": "application/json",
      "Duffel-Version": DUFFEL_VERSION,
    },
    body: JSON.stringify({
      data: {
        slices: [{ origin, destination, departure_date: departureDate }],
        passengers: [{ type: "adult" }],
        cabin_class: "economy",
        return_offers: true,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  // Top 5 cheapest per date keeps the file concise
  return (json.data?.offers ?? []).slice(0, 5).map((o) => normalizeOffer(o, departureDate));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });

  const dates = getThreeMonthDepartureDates();
  const from = dates[0];
  const to = dates[dates.length - 1];

  console.log(`\nSeeding Duffel flight data  ${ORIGIN} → [5 cities]`);
  console.log(`Date range: ${from} → ${to}  (${dates.length} sample dates)\n`);

  let successCount = 0;

  for (const city of CITIES) {
    console.log(`  ${city.name} (${ORIGIN} → ${city.iata})`);
    const allFlights = [];
    let datesFailed = 0;

    for (const date of dates) {
      process.stdout.write(`    ${date} ... `);
      try {
        const offers = await fetchOffersForDate(ORIGIN, city.iata, date);
        allFlights.push(...offers);
        console.log(`${offers.length} offers`);
      } catch (err) {
        console.error(`FAILED — ${err.message}`);
        datesFailed++;
      }
      // ~2 req/sec — safe for sandbox burst limits
      await new Promise((r) => setTimeout(r, 500));
    }

    const payload = {
      seededAt: new Date().toISOString(),
      dateRange: { from, to },
      flights: allFlights,
    };

    writeFileSync(
      join(CACHE_DIR, `${city.slug}.json`),
      JSON.stringify(payload, null, 2)
    );

    const status = datesFailed > 0 ? ` (${datesFailed} dates failed)` : "";
    console.log(
      `  → ${allFlights.length} flights written to src/lib/cache/${city.slug}.json${status}\n`
    );

    if (allFlights.length > 0) successCount++;
  }

  console.log(`${successCount}/${CITIES.length} cities seeded.\n`);

  if (successCount > 0) {
    console.log("Next steps:");
    console.log("  git add src/lib/cache/");
    console.log('  git commit -m "chore: seed Duffel flight cache"');
    console.log("  git push\n");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
