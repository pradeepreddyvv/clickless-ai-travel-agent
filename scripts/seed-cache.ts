/**
 * seed-cache.ts — Fetch 90-day weather + all activities + cultural tips
 * and write to src/lib/cache/{slug}.json for each city.
 *
 * Usage:
 *   npm run seed-cache                        # Tokyo, London, Paris
 *   npm run seed-cache Berlin Amsterdam Rome  # custom cities
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { WeatherForecast, ActivityOption, CulturalNorm } from "@/lib/types";
import { DEMO_ACTIVITIES, DEMO_CULTURAL } from "@/lib/providers/demo-data";

// ── Load .env.local ────────────────────────────────────────────────────────
const envPath = join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (k && !(k in process.env)) process.env[k] = v;
  }
  console.log("✓ Loaded .env.local");
}

// ── Config ─────────────────────────────────────────────────────────────────
const DEFAULT_CITIES = ["Tokyo", "London", "Paris"];
const CITIES = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_CITIES;
const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, "..", "src", "lib", "cache");

// City coordinates for Open-Meteo
const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  "tokyo":    { lat: 35.6762, lon: 139.6503 },
  "london":   { lat: 51.5074, lon: -0.1278  },
  "paris":    { lat: 48.8566, lon: 2.3522   },
  "cancun":   { lat: 21.1619, lon: -86.8515 },
  "cancún":   { lat: 21.1619, lon: -86.8515 },
  "new-york": { lat: 40.7128, lon: -74.0060 },
  "berlin":   { lat: 52.5200, lon: 13.4050  },
  "amsterdam":{ lat: 52.3676, lon: 4.9041   },
  "rome":     { lat: 41.9028, lon: 12.4964  },
  "barcelona":{ lat: 41.3851, lon: 2.1734   },
  "bangkok":  { lat: 13.7563, lon: 100.5018 },
  "bali":     { lat: -8.3405, lon: 115.0920 },
};

function cityToSlug(city: string): string {
  return city.toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ── WMO weather code → human string ────────────────────────────────────────
function wmoToCondition(code: number): string {
  if (code === 0)              return "Clear sky";
  if (code <= 3)               return "Partly cloudy";
  if (code <= 48)              return "Foggy";
  if (code <= 55)              return "Drizzle";
  if (code <= 67)              return "Rain";
  if (code <= 77)              return "Snow";
  if (code <= 82)              return "Rain showers";
  if (code <= 86)              return "Snow showers";
  if (code >= 95)              return "Thunderstorm";
  return "Cloudy";
}

// ── Open-Meteo: fetch from a given endpoint ────────────────────────────────
async function openMeteoFetch(
  baseUrl: string,
  lat: number,
  lon: number,
  extraParams: Record<string, string>
): Promise<WeatherForecast[]> {
  const url = new URL(baseUrl);
  url.searchParams.set("latitude",  String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("daily",     "temperature_2m_max,temperature_2m_min,precipitation_probability_mean,weathercode,relative_humidity_2m_mean");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("timezone",  "auto");
  for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${await res.text()}`);
  const json = await res.json() as {
    daily: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_probability_mean: (number | null)[];
      weathercode: number[];
      relative_humidity_2m_mean: (number | null)[];
    };
  };

  const d = json.daily;
  return d.time.map((date, i) => ({
    date,
    tempHighF:  Math.round(d.temperature_2m_max[i] ?? 70),
    tempLowF:   Math.round(d.temperature_2m_min[i] ?? 55),
    condition:  wmoToCondition(d.weathercode[i] ?? 0),
    humidity:   Math.round(d.relative_humidity_2m_mean[i] ?? 60),
    rainChance: Math.round(d.precipitation_probability_mean[i] ?? 20),
  }));
}

// ── Fetch 90 days: 16-day forecast + historical months ────────────────────
async function fetch90DayWeather(city: string): Promise<WeatherForecast[]> {
  const slug = cityToSlug(city);
  const coords = CITY_COORDS[slug];
  if (!coords) {
    console.warn(`  [weather] No coordinates for "${city}" — skipping weather`);
    return [];
  }

  const today = new Date();
  const allDays: WeatherForecast[] = [];

  // Part 1: 16-day forecast from Open-Meteo (free, no key)
  console.log(`  [weather] Fetching 16-day forecast for ${city}...`);
  const forecast = await openMeteoFetch(
    "https://api.open-meteo.com/v1/forecast",
    coords.lat, coords.lon,
    { forecast_days: "16" }
  );
  allDays.push(...forecast);

  // Part 2: Historical data for months 2–3 (shift last year's data by 365 days)
  // Month 2: day 17 → day 60
  // Month 3: day 61 → day 92
  const month2Start = new Date(today); month2Start.setDate(today.getDate() + 16);
  const month3End   = new Date(today); month3End.setDate(today.getDate() + 92);

  // Shift back 1 year for archive
  const archiveStart = new Date(month2Start); archiveStart.setFullYear(archiveStart.getFullYear() - 1);
  const archiveEnd   = new Date(month3End);   archiveEnd.setFullYear(archiveEnd.getFullYear() - 1);

  const fmt = (d: Date) => d.toISOString().split("T")[0];

  console.log(`  [weather] Fetching historical ${fmt(archiveStart)} → ${fmt(archiveEnd)}...`);
  await new Promise((r) => setTimeout(r, 500)); // rate limit

  const historical = await openMeteoFetch(
    "https://archive-api.open-meteo.com/v1/archive",
    coords.lat, coords.lon,
    { start_date: fmt(archiveStart), end_date: fmt(archiveEnd) }
  );

  // Shift historical dates forward by 1 year
  const shifted = historical.map((w) => {
    const d = new Date(w.date); d.setFullYear(d.getFullYear() + 1);
    return { ...w, date: fmt(d) };
  });
  allDays.push(...shifted);

  // Deduplicate by date (forecast takes priority over historical)
  const seen = new Set<string>();
  const deduped = allDays.filter((w) => {
    if (seen.has(w.date)) return false;
    seen.add(w.date); return true;
  });

  deduped.sort((a, b) => a.date.localeCompare(b.date));
  console.log(`  [weather] ${deduped.length} days total (${fmt(new Date(deduped[0]?.date ?? ""))} → ${fmt(new Date(deduped[deduped.length-1]?.date ?? ""))})`);
  return deduped;
}

// ── Wikivoyage helpers ─────────────────────────────────────────────────────
function cleanWiki(text: string): string {
  return text
    .replace(/\[\[(?:File|Image):[^\]]+\]\]/gi, "")   // remove file/image links
    .replace(/\[\[[^\]]*#Q\d+[^\]]*\]\]/g, "")         // remove Wikidata Q-ID links
    .replace(/\[\[[^\]]+\]\]/g, "")                     // remove any remaining [[...]] links
    .replace(/#Q\d+/g, "")                              // bare Q-IDs
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/'{2,3}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isGoodLine(line: string): boolean {
  if (line.length < 30 || line.length > 350) return false;
  if (/thumb\|/i.test(line)) return false;
  if (/<!--/.test(line)) return false;
  if (/^\[\[(?:File|Image):/i.test(line)) return false;
  if ((line.match(/\|/g) || []).length > 3) return false;
  if (/^[|{}\[\]<>]/.test(line)) return false;
  return true;
}

async function wvFetch(params: Record<string, string>, retries = 3): Promise<unknown> {
  const url = new URL("https://en.wikivoyage.org/w/api.php");
  for (const [k, v] of Object.entries({ format: "json", origin: "*", ...params })) {
    url.searchParams.set(k, v);
  }
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url.toString());
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < retries) {
      const wait = attempt * 15000; // 15s, 30s back-off
      console.log(`  [wikivoyage] Rate limited — waiting ${wait / 1000}s...`);
      await delay(wait);
      continue;
    }
    throw new Error(`Wikivoyage ${res.status}`);
  }
}

async function getSections(page: string): Promise<{ index: string; line: string }[]> {
  const json = await wvFetch({ action: "parse", page, prop: "sections" }) as {
    parse?: { sections: { index: string; line: string }[] };
    error?: { code: string };
  };
  if (json.error) return [];
  return json.parse?.sections ?? [];
}

async function getSectionText(page: string, section: string): Promise<string> {
  const json = await wvFetch({ action: "parse", page, prop: "wikitext", section }) as {
    parse?: { wikitext: { "*": string } };
  };
  return json.parse?.wikitext?.["*"] ?? "";
}

function extractTemplateBody(wikitext: string, templateName: string): string[] {
  // Match both single-line {{listing|...}} and multi-line {{see\n|...\n}}
  const pattern = new RegExp(
    `\\{\\{${templateName}[\\s\\S]*?\\}\\}`,
    "gi"
  );
  const matches: string[] = [];
  let m;
  while ((m = pattern.exec(wikitext)) !== null) {
    matches.push(m[0]);
  }
  return matches;
}

function parseProps(body: string): Record<string, string> {
  const props: Record<string, string> = {};
  // Split on pipe chars that start a new key=value pair
  const parts = body.replace(/^\{\{[^|{}\n]+/, "").replace(/\}\}$/, "").split(/\n?\|/);
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim().toLowerCase();
    const v = part.slice(eq + 1).trim();
    if (k) props[k] = v;
  }
  return props;
}

function parseListings(wikitext: string, category: string, city: string, startId: number): ActivityOption[] {
  const results: ActivityOption[] = [];
  let id = startId;

  // Match all Wikivoyage listing-style templates: {{listing}}, {{see}}, {{do}}, {{eat}}, {{buy}}, {{drink}}, {{sleep}}
  const templateNames = ["listing", "see", "do", "eat", "buy", "drink"];
  const allBodies: string[] = [];
  for (const name of templateNames) {
    allBodies.push(...extractTemplateBody(wikitext, name));
  }

  for (const body of allBodies) {
    const props = parseProps(body);
    const name = cleanWiki(props["name"] || props["alt"] || "");
    const desc = cleanWiki(props["content"] || props["description"] || "");
    if (name.length < 3 || /\[\[|#Q\d+|^\//i.test(name)) continue;
    results.push({
      id:            `wv-${id++}`,
      name,
      category,
      description:   desc.slice(0, 220) || `${category} in ${city}`,
      estimatedCost: parseCost(props["price"] || ""),
      duration:      "2h",
      location:      cleanWiki(props["address"] || props["directions"] || city),
    });
  }
  return results;
}

function parseCulturalLines(wikitext: string, section: string): CulturalNorm[] {
  const catMap: Record<string, string> = {
    understand: "Culture", culture: "Culture", "stay safe": "Safety",
    cope: "Etiquette", talk: "Language", respect: "Etiquette",
  };
  const impMap: Record<string, "high" | "medium" | "low"> = {
    "stay safe": "high", understand: "medium", culture: "medium",
    cope: "low", talk: "medium", respect: "medium",
  };
  const lines = wikitext.split("\n").map((l) =>
    cleanWiki(l.replace(/^[*#:;=]+\s*/, ""))
  ).filter(isGoodLine);

  return lines.slice(0, 8).map((tip) => ({
    category:   catMap[section]  || "Etiquette",
    tip,
    importance: impMap[section] || ("medium" as "high" | "medium" | "low"),
  }));
}

function parseCost(price: string): number | undefined {
  const m = price.match(/[\d,]+/);
  if (!m) return undefined;
  const v = parseInt(m[0].replace(",", ""), 10);
  return isNaN(v) ? undefined : v;
}

// ── Scrape a single Wikivoyage page for activities + cultural tips ─────────
const ACT_SECTIONS = ["see", "do", "buy", "eat"];
const CUL_SECTIONS = ["understand", "culture", "stay safe", "cope", "talk", "respect"];

async function scrapePage(page: string, city: string, startId: number): Promise<{
  activities: ActivityOption[];
  cultural:   CulturalNorm[];
  nextId:     number;
}> {
  const sections = await getSections(page);
  const activities: ActivityOption[] = [];
  const cultural:   CulturalNorm[]   = [];
  let id = startId;

  for (const sec of sections) {
    const name = sec.line.toLowerCase().replace(/<[^>]+>/g, "").trim();
    if (ACT_SECTIONS.includes(name)) {
      const text = await getSectionText(page, sec.index);
      const parsed = parseListings(text, name, city, id);
      id += parsed.length;
      activities.push(...parsed);
      await delay(300);
    }
    if (CUL_SECTIONS.includes(name)) {
      const text = await getSectionText(page, sec.index);
      cultural.push(...parseCulturalLines(text, name));
      await delay(300);
    }
  }
  return { activities, cultural, nextId: id };
}

// ── Find district sub-article links from a city page ──────────────────────
async function findSubArticles(city: string): Promise<string[]> {
  const sections = await getSections(city);
  // Only look in See + Do sections for sub-article links
  const subPages = new Set<string>();

  for (const sec of sections) {
    const name = sec.line.toLowerCase().replace(/<[^>]+>/g, "").trim();
    if (!ACT_SECTIONS.includes(name)) continue;
    const text = await getSectionText(city, sec.index);
    // Match [[City/District]] or [[City/District#Section]]
    const re = new RegExp(`\\[\\[${city}/([^\\]|#]+)`, "gi");
    let m;
    while ((m = re.exec(text)) !== null) {
      subPages.add(`${city}/${m[1].trim()}`);
    }
    await delay(200);
  }
  return [...subPages].slice(0, 12); // cap at 12 sub-articles
}

function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function dedupeActivities(activities: ActivityOption[]): ActivityOption[] {
  const seen = new Set<string>();
  return activities.filter((a) => {
    const key = a.name.toLowerCase().slice(0, 30);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

// ── Fetch all activities for a city ───────────────────────────────────────
async function fetchAllActivities(city: string): Promise<{
  activities: ActivityOption[];
  cultural:   CulturalNorm[];
}> {
  // Start with curated demo data (best quality for known cities)
  const demoActs = DEMO_ACTIVITIES[city] ?? [];
  const demoCult = DEMO_CULTURAL[city]   ?? [];

  // Scrape main Wikivoyage page
  console.log(`  [wikivoyage] Scraping main page: ${city}`);
  let { activities, cultural, nextId } = await scrapePage(city, city, demoActs.length + 1);

  // Scrape sub-district articles
  console.log(`  [wikivoyage] Finding sub-articles...`);
  const subArticles = await findSubArticles(city);
  console.log(`  [wikivoyage] Found ${subArticles.length} sub-articles: ${subArticles.slice(0, 5).join(", ")}...`);

  for (const sub of subArticles) {
    console.log(`    → scraping ${sub}`);
    try {
      const result = await scrapePage(sub, city, nextId);
      activities.push(...result.activities);
      nextId = result.nextId;
      await delay(400);
    } catch {
      console.warn(`    ✗ failed: ${sub}`);
    }
  }

  // Merge: demo (curated) + scraped, deduplicated
  const merged = dedupeActivities([...demoActs, ...activities]);
  const mergedCult: CulturalNorm[] = demoCult.length > 0
    ? demoCult   // prefer curated cultural tips
    : cultural;

  return { activities: merged, cultural: mergedCult };
}

// ── Main seed function ─────────────────────────────────────────────────────
async function seedCity(city: string) {
  console.log(`\n📍 Seeding ${city}...`);

  // Run sequentially to avoid hammering Wikivoyage when doing multiple cities
  const weather90Days = await fetch90DayWeather(city);
  await delay(1000);
  const { activities, cultural } = await fetchAllActivities(city);

  const entry = {
    city,
    seededAt: new Date().toISOString(),
    weather90Days,
    activities,
    cultural,
  };

  const slug = cityToSlug(city);
  writeFileSync(join(CACHE_DIR, `${slug}.json`), JSON.stringify(entry, null, 2), "utf-8");

  console.log(`  ✓ Weather:       ${weather90Days.length} days`);
  console.log(`  ✓ Activities:    ${activities.length}`);
  console.log(`  ✓ Cultural tips: ${cultural.length}`);
  console.log(`  ✓ Saved → src/lib/cache/${slug}.json`);
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });
  console.log(`\n🌍 Seeding: ${CITIES.join(", ")}`);
  console.log("─".repeat(50));
  for (const city of CITIES) {
    try { await seedCity(city); }
    catch (err) { console.error(`  ✗ ${city}:`, err); }
  }
  console.log("\n✅ Done! Commit src/lib/cache/*.json to Git.\n");
}

main();
