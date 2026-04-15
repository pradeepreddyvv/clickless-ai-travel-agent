import { NextRequest, NextResponse } from "next/server";
import { parseIntentWithGroq } from "@/lib/nlu/parser";
import { getSupabaseData } from "@/lib/providers/supabase-data";
import { getWeatherLive } from "@/lib/providers/weather-live";
import { getWikivoyageData } from "@/lib/providers/wikivoyage";
import { normalizePayload } from "@/lib/extraction/normalize";
import { buildKnowledgeGraph } from "@/lib/knowledge/graph";
import { synthesizeTripBrief, synthesizeWithGemini, synthesizeWithLLM } from "@/lib/synthesis/brief";
import { getSupabase } from "@/lib/supabase/client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = body.query as string;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // 1. NLU — parse intent
    const intent = (await parseIntentWithGroq(query));

    if (intent.destination === "Unknown") {
      return NextResponse.json(
        { error: "Could not identify a destination. Try: 'Plan a trip to Tokyo from Phoenix'" },
        { status: 422 }
      );
    }

    // 2. Provider orchestration — Supabase (dynamic, budget-aware) + live weather/wikivoyage
    const totalDays = intent.duration || 5;
    const [supabaseData, rawWeather, wikivoyage] = await Promise.all([
      getSupabaseData(intent),                                              // dynamic from DB
      getWeatherLive(intent.destination, totalDays, intent.dates?.start),    // live OWM
      getWikivoyageData(intent.destination, intent.activities),              // live Wikivoyage
    ]);
    const rawFlights = supabaseData.flights;
    const rawHotels = supabaseData.hotels;
    // Merge Supabase activities with Wikivoyage activities (dedup by name)
    const wikiActivities = wikivoyage.activities;
    const supaActivities = supabaseData.activities;
    const seenNames = new Set(supaActivities.map((a) => a.name.toLowerCase()));
    const rawActivities = [
      ...supaActivities,
      ...wikiActivities.filter((a) => !seenNames.has(a.name.toLowerCase())),
    ];
    const rawCultural = wikivoyage.cultural;

    // 3. Extraction/normalization
    const normalized = normalizePayload({
      flights: rawFlights,
      hotels: rawHotels,
      weather: rawWeather,
      cultural: rawCultural,
      activities: rawActivities,
    });

    // 4. Knowledge graph
    const graph = buildKnowledgeGraph(
      intent,
      normalized.flights,
      normalized.hotels,
      normalized.weather,
      normalized.cultural,
      normalized.activities
    );

    // 5. Synthesis
    const brief = synthesizeTripBrief(graph);

    // Try LLM-enhanced summary: Gemini (primary) → OpenRouter (fallback)
    const geminiKey = process.env.GEMINI_API_KEY;
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    if (geminiKey) {
      brief.summary = await synthesizeWithGemini(graph, geminiKey);
    } else if (openrouterKey) {
      brief.summary = await synthesizeWithLLM(graph, openrouterKey);
    }

    // 6. Persist to Supabase if configured
    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase.from("trip_results").insert({
          id: brief.id,
          query: query,
          intent: intent,
          result: brief,
          created_at: brief.createdAt,
        });
      } catch (e) {
        console.warn("Failed to persist trip result:", e);
      }
    }

    return NextResponse.json(brief);
  } catch (error) {
    console.error("Plan API error:", error);
    return NextResponse.json(
      { error: "Failed to generate trip plan. Please try again." },
      { status: 500 }
    );
  }
}
