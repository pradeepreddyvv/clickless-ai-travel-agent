import { NextRequest, NextResponse } from "next/server";
import { parseIntent, parseIntentWithGroq } from "@/lib/nlu/parser";
import { getFlights } from "@/lib/providers/flights";
import { getHotels, getWeather, getCulturalTips, getActivities } from "@/lib/providers/demo-data";
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

    // 2. Provider orchestration — static JSON → Duffel live → demo fallback
    const nights = intent.duration || 5;
    const origin = intent.origin || "PHX";
    const { flights: rawFlights, source: flightSource } = await getFlights(intent.destination, origin);
    if (flightSource !== "cache") {
      console.info(`Flights for ${intent.destination} served from: ${flightSource}`);
    }
    const rawHotels = getHotels(intent.destination);
    const rawWeather = getWeather(intent.destination, nights);
    const rawCultural = getCulturalTips(intent.destination);
    const rawActivities = getActivities(intent.destination, intent.activities);

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
