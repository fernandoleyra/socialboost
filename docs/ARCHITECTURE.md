# SocialBoost architecture

SocialBoost is a self-hosted LinkedIn ghostwriting studio. It copies the process good
ghostwriting agencies run (interview first, real stories, the client's own photos, proven
post structures, a human pass before anything goes out) and runs it on your own machine
with local models.

```
           ┌────────────────────┐
 you ────▶ │  Interviews        │  positioning interview → Strategy (pillars, audience, cadence)
           │  (chat + voice)    │  story interviews      → Memory Bank (+ photo request every time)
           └─────────┬──────────┘
                     ▼
 LinkedIn posts ─▶ Voice (stats + style guide + your best posts as examples)
                     ▼
           ┌────────────────────┐
           │  Studio (factory)  │  angle → draft → AI-tell lint + critique → revise → you edit/approve
           └─────────┬──────────┘
                     ▼
           Calendar (cadence slots, auto-plan by pillar weights) → publish (LinkedIn API or copy & post)
                     ▼
           Insights (metrics per post) → pillar weights & hook patterns feed back into planning
```

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 16 (App Router, route handlers), React 19, TypeScript | one process, server components read SQLite directly |
| Data | SQLite via better-sqlite3, `data/socialboost.db` | zero-ops, one folder to back up |
| Files | `data/uploads/` (photos, resized with sharp) | local, private |
| Models | `src/lib/llm.ts`: Ollama native API, any OpenAI-compatible server, Anthropic SDK | local-first; each *task* routes to its own model |
| Vectors | embeddings stored as JSON on rows, cosine in JS | thousands of memories fit easily; no extra service |
| UI | Tailwind v4 + `globals.css` Liquid Glass tokens, `src/components/ui.tsx` | Apple HIG look, dark mode, a11y fallbacks |

## Model tasks

Every model call names a task. Settings → Models maps each task to a provider + model.

| Task | Used for | Local default |
|---|---|---|
| `interviewer` | asking the next interview question (streamed) | writer model |
| `extractor` | strategy & memory extraction (structured JSON) | writer model |
| `writer` | drafting and revising posts (streamed) | `qwen3:14b` (configurable) |
| `critic` | scoring drafts (structured JSON) | writer model |
| `vision` | describing photos, candid check | `qwen2.5vl:7b` |
| `embedding` | memory + voice retrieval | `nomic-embed-text` |
| `transcription` | voice answers (OpenAI-compatible Whisper server) | optional |

## Source layout

```
src/
  app/
    (app)/            pages inside the glass shell (Today, Interviews, Memory Bank, Photos,
                      Studio, Calendar, Voice, Insights, Strategy, Settings)
    welcome/          first-run onboarding (outside the shell)
    api/              route handlers (JSON; streamed text for generation)
  components/
    ui.tsx            design-system primitives + api()/streamText() client helpers
    shell.tsx         floating glass sidebar, profile switcher, mobile tab bar
  lib/
    db.ts             SQLite + migrations
    types.ts          zod schemas & shared types
    repo.ts           all table access (profiles, strategy, interviews, memories, photos, voice, posts)
    settings.ts       key/value settings, model routing, active profile
    llm.ts            provider layer: chat, chatStream, chatJson, embed, transcribe, listModels
    http.ts           route helpers: handle(), ok(), HttpError, streamText()
    interview/        interview prompts, engine, extraction
    photos.ts         upload processing, vision captions
    memory.ts         semantic search over the memory bank
    strategy.ts       strategy normalization (every writer runs it before saveStrategy) + editor model
    voice/            import parsers, stylometry, style-guide analysis, example retrieval
    factory/          AI-tell linter, post structures, generation pipeline
    calendar/         cadence slots, auto-planner, ICS export
    linkedin.ts       OAuth + Posts/Images API publishing
    scheduler.ts      background publisher (started from instrumentation.ts)
```

## Conventions

- Route handlers wrap their body in `handle(async (req, ctx) => …)` and return `ok(data)`;
  throw `HttpError(status, message, hint?)` for user-facing errors. `ctx.params` is a Promise.
- The *active profile* is resolved server-side with `requireProfile()`; the client never sends a profile id.
- Generation endpoints stream plain text with `streamText(generator, onDone)` from `lib/http.ts`;
  the client reads them with `streamText(url, body, onChunk)` from `components/ui.tsx`.
  Mid-stream failures arrive as a NUL-prefixed JSON trailer that the client helper turns into an Error.
- Structured LLM output always goes through `chatJson(zodSchema, …)`; prose never asks for JSON.
- Client pages fetch with `api()` and report with `toast()`.
- Pages are server components where possible (read via `repo.ts`), with client islands for interaction.
