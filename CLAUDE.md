# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # ESLint 9
npm test             # Run all Vitest unit tests (16 tests)
npm run test:watch   # Vitest in watch mode
npm run typecheck    # tsc --noEmit
```

Run a single test file:
```bash
npx vitest run src/tests/nlu.test.ts
```

## Tech Stack

- **Next.js 16** (App Router), **React 19**, **TypeScript 5**
- **Tailwind CSS 4**, **shadcn/ui**, **lucide-react**
- **Zod v4** — all schemas in `src/lib/types.ts`
- **Supabase** — optional auth + JSONB persistence
- **LLMs** — Groq (NLU), Gemini (summaries), OpenRouter (fallback)
- **Vitest + jsdom**, **Playwright** (e2e)

## Architecture

The app is a deterministic pipeline — it runs fully in demo mode without any external API keys.

```
User Query (text/voice)
  → NLU Parser        src/lib/nlu/parser.ts         (regex + optional Groq)
  → Demo Data         src/lib/providers/demo-data.ts (5 seeded cities)
  → Knowledge Graph   src/lib/knowledge/graph.ts     (in-memory entity linking)
  → Synthesis         src/lib/synthesis/brief.ts     (template + optional LLM)
  → UI               src/app/page.tsx                (state machine: home→planning→searching→results|saved)
```

**API endpoint:** `POST /api/plan` with `{ query: string }` — orchestrates the full pipeline and optionally persists to Supabase.

**Demo data cities** (all from Phoenix, AZ): Tokyo, London, Paris, Cancún, New York. Real price data scraped in April 2025. See `SCRAPING_LATER.md` for the live API roadmap.

**Frontend state machine** in `src/app/page.tsx`: `home` → `planning` → `searching` → `results` | `saved`

## Key Directories

| Path | Purpose |
|------|---------|
| `src/app/api/plan` | Core pipeline endpoint |
| `src/app/api/trips` | Trip persistence (Supabase) |
| `src/lib/nlu` | Intent extraction (regex + Groq fallback) |
| `src/lib/providers` | Seeded demo data adapters |
| `src/lib/extraction` | Zod normalization layer |
| `src/lib/knowledge` | In-memory graph: links intent → flights/hotels/itinerary |
| `src/lib/synthesis` | Trip brief generation (template → Gemini → OpenRouter) |
| `src/lib/supabase` | Supabase client + auth |
| `src/lib/types.ts` | All Zod schemas (`TravelIntent`, `TripBrief`, etc.) |
| `src/components/trip` | Domain UI components |
| `src/tests` | Vitest unit tests |
| `supabase/migrations` | DB schema (optional) |

## Environment Variables

Copy `.env.example` to `.env.local`. All are optional — the app runs in demo mode without them.

```
GROQ_API_KEY                  # NLU extraction fallback
GEMINI_API_KEY                # Primary LLM for trip summaries
OPENROUTER_API_KEY            # LLM fallback
OPENWEATHER_API_KEY           # Weather (demo data used if absent)
NEXT_PUBLIC_SUPABASE_URL      # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY # Supabase public key
```

## Important Constraints

- **Voice input/output** uses the Web Speech API — Chrome/Edge only.
- **Saved trips** fall back to localStorage when Supabase is not configured.
- All external data shapes must pass Zod validation before entering the pipeline.
- LLM calls are always wrapped in try/catch and fall back to template-based output.
