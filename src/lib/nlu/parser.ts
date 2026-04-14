import { TravelIntent, TravelIntentSchema } from "@/lib/types";
import { Groq } from 'groq-sdk';

const groq_key = process.env.GROQ_API_KEY ?? "";

const CITY_ALIASES: Record<string, string> = {
  tokyo: "Tokyo",
  london: "London",
  paris: "Paris",
  cancun: "Cancún",
  "new york": "New York",
  nyc: "New York",
  phx: "Phoenix",
  phoenix: "Phoenix",
  lax: "Los Angeles",
  "los angeles": "Los Angeles",
  sf: "San Francisco",
  "san francisco": "San Francisco",
  chicago: "Chicago",
  miami: "Miami",
  seattle: "Seattle",
  denver: "Denver",
  austin: "Austin",
  barcelona: "Barcelona",
  rome: "Rome",
  bali: "Bali",
  bangkok: "Bangkok",
};

const ACTIVITY_KEYWORDS: Record<string, string[]> = {
  temples: ["temple", "temples", "shrine", "shrines", "spiritual"],
  "food tours": ["food", "food tour", "culinary", "cuisine", "eating", "street food", "restaurants"],
  hiking: ["hiking", "hike", "trek", "trekking", "trail", "trails"],
  museums: ["museum", "museums", "gallery", "galleries", "art"],
  beaches: ["beach", "beaches", "snorkeling", "diving", "surfing", "swimming"],
  nightlife: ["nightlife", "bars", "clubs", "nightclub", "pub crawl"],
  shopping: ["shopping", "markets", "mall", "boutique"],
  sightseeing: ["sightseeing", "landmarks", "tour", "tours", "explore"],
  adventure: ["adventure", "bungee", "skydiving", "zip line", "rafting"],
  culture: ["culture", "cultural", "history", "historical", "heritage"],
};

const MONTH_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function extractDestination(text: string): { origin?: string; destination?: string } {
  const lower = text.toLowerCase();

  // "from X to Y"
  const fromTo = lower.match(/from\s+([a-z\s]+?)\s+to\s+([a-z\s]+?)(?:\s+in|\s+for|\s+under|\s*,|\s*$)/);
  if (fromTo) {
    const origin = matchCity(fromTo[1].trim());
    const dest = matchCity(fromTo[2].trim());
    if (dest) return { origin: origin || fromTo[1].trim(), destination: dest };
  }

  // "to X from Y"
  const toFrom = lower.match(/to\s+([a-z\s]+?)\s+from\s+([a-z\s]+?)(?:\s+in|\s+for|\s+under|\s*,|\s*$)/);
  if (toFrom) {
    const dest = matchCity(toFrom[1].trim());
    const origin = matchCity(toFrom[2].trim());
    if (dest) return { origin: origin || toFrom[2].trim(), destination: dest };
  }

  // "X trip from Y" (handles "5-night Tokyo trip from Phoenix")
  const tripFrom = lower.match(/(?:\d+[-\s]*(?:night|day|week)\s+)?([a-z\s]+?)\s+trip\s+from\s+([a-z\s]+?)(?:\s+in|\s+for|\s+under|\s*,|\s*$)/);
  if (tripFrom) {
    const dest = matchCity(tripFrom[1].trim());
    const origin = matchCity(tripFrom[2].trim());
    if (dest) return { origin: origin || tripFrom[2].trim(), destination: dest };
  }

  // fallback: first recognized city is destination
  for (const [alias, city] of Object.entries(CITY_ALIASES)) {
    if (lower.includes(alias)) return { destination: city };
  }

  return {};
}

function matchCity(text: string): string | undefined {
  const lower = text.toLowerCase().trim();
  if (CITY_ALIASES[lower]) return CITY_ALIASES[lower];
  // Accept any multi-char word as a city (capitalize each word)
  if (lower.length >= 3 && /^[a-z\s]+$/.test(lower)) {
    return lower.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return undefined;
}

function extractDuration(text: string): number | undefined {
  const lower = text.toLowerCase();
  const nightMatch = lower.match(/(\d+)\s*(?:-\s*)?night/);
  if (nightMatch) return parseInt(nightMatch[1]);
  const dayMatch = lower.match(/(\d+)\s*(?:-\s*)?day/);
  if (dayMatch) return parseInt(dayMatch[1]) - 1; // days to nights
  const weekMatch = lower.match(/(\d+)\s*week/);
  if (weekMatch) return parseInt(weekMatch[1]) * 7;
  return undefined;
}

function extractBudget(text: string): number | undefined {
  const lower = text.toLowerCase();
  const match = lower.match(/(?:under|budget|max|less than|up to|around)\s*\$?\s*([\d,]+)/);
  if (match) return parseInt(match[1].replace(",", ""));
  const dollarMatch = lower.match(/\$([\d,]+)/);
  if (dollarMatch) return parseInt(dollarMatch[1].replace(",", ""));
  return undefined;
}

function extractTravelers(text: string): number {
  const lower = text.toLowerCase();
  const match = lower.match(/(\d+)\s*(?:people|travelers|travellers|adults|persons|guests)/);
  if (match) return parseInt(match[1]);
  if (lower.includes("solo") || lower.includes("just me")) return 1;
  if (lower.includes("couple") || lower.includes("two of us")) return 2;
  if (lower.includes("family")) return 4;
  return 1;
}

function extractActivities(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const [activity, keywords] of Object.entries(ACTIVITY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      found.push(activity);
    }
  }
  return found;
}

function extractDates(text: string, duration?: number): { start: string; end: string } | undefined {
  const lower = text.toLowerCase();

  // "in April", "in March 2025"
  for (const [monthName, monthIdx] of Object.entries(MONTH_MAP)) {
    const monthRegex = new RegExp(`in\\s+${monthName}(?:\\s+(\\d{4}))?`, "i");
    const match = lower.match(monthRegex);
    if (match) {
      const year = match[1] ? parseInt(match[1]) : new Date().getFullYear();
      const start = new Date(year, monthIdx, 15); // mid-month default
      const nights = duration || 5;
      const end = new Date(start);
      end.setDate(end.getDate() + nights);
      return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
    }
  }

  // "April 10-15"
  for (const [monthName, monthIdx] of Object.entries(MONTH_MAP)) {
    const rangeRegex = new RegExp(`${monthName}\\s+(\\d{1,2})\\s*[-–to]+\\s*(\\d{1,2})(?:\\s*,?\\s*(\\d{4}))?`, "i");
    const match = lower.match(rangeRegex);
    if (match) {
      const year = match[3] ? parseInt(match[3]) : new Date().getFullYear();
      return {
        start: new Date(year, monthIdx, parseInt(match[1])).toISOString().split("T")[0],
        end: new Date(year, monthIdx, parseInt(match[2])).toISOString().split("T")[0],
      };
    }
  }

  return undefined;
}


const VALID_ACTIVITIES = [
  "temples", "food tours", "hiking", "museums", "beaches",
  "nightlife", "shopping", "sightseeing", "adventure", "culture",
];

function buildGroqPrompt(): string {
  const today = new Date().toISOString().split("T")[0];
  return `You are a travel intent extractor. Extract structured data from the user's travel query.
Return ONLY valid JSON — no markdown, no explanation, no extra keys.
Today's date is ${today}. Use this as the reference for all relative dates (e.g. "next month", "in April" means the upcoming April).

Schema:
{
  "destination": string,     // city name e.g. "Tokyo". Use "Unknown" if not mentioned
  "origin": string | null,   // departure city, null if not mentioned
  "duration": number | null, // trip length in NIGHTS as integer, null if not mentioned. Weeks × 7, days − 1
  "budget": number | null,   // total budget in USD as integer, null if not mentioned
  "travelers": number,       // number of people (default 1; "couple"/"two of us"=2, "family"=4)
  "activities": string[],    // subset of: ["temples","food tours","hiking","museums","beaches","nightlife","shopping","sightseeing","adventure","culture"]
  "dates": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } | null  // null if not mentioned; use today's year for dates without an explicit year
}`;
}

export async function parseIntentWithGroq(query: string): Promise<TravelIntent> {

  if (groq_key == ""){
    return parseIntent(query);
  }
  try {
    const client = new Groq({ apiKey: groq_key });

    const completion = await client.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: buildGroqPrompt() },
        { role: "user", content: query },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");

    const activities = Array.isArray(parsed.activities)
      ? parsed.activities.filter((a: unknown) => typeof a === "string" && VALID_ACTIVITIES.includes(a))
      : [];

    return TravelIntentSchema.parse({
      destination: parsed.destination ?? "Unknown",
      origin: parsed.origin ?? undefined,
      duration: typeof parsed.duration === "number" ? parsed.duration : undefined,
      budget: typeof parsed.budget === "number" ? parsed.budget : undefined,
      travelers: typeof parsed.travelers === "number" ? parsed.travelers : 1,
      activities,
      dates: parsed.dates ?? undefined,
      rawQuery: query,
    });
  } catch {
    return parseIntent(query);
  }
}

export function parseIntent(query: string): TravelIntent {
  const { origin, destination } = extractDestination(query);
  const duration = extractDuration(query);
  const dates = extractDates(query, duration);
  const budget = extractBudget(query);
  const travelers = extractTravelers(query);
  const activities = extractActivities(query);

  const raw: TravelIntent = {
    origin,
    destination: destination || "Unknown",
    dates: dates || undefined,
    duration,
    budget,
    travelers,
    activities,
    rawQuery: query,
  };

  return TravelIntentSchema.parse(raw);
}
