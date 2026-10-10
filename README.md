# SocialBoost

**A self-hosted LinkedIn ghostwriting studio that interviews you, keeps your real stories, asks for your photos, and writes in your voice — on local models.**

Good ghostwriting agencies don't start from a blank prompt. They interview their clients, collect true stories with
concrete details, ask for candid photos from the moment, fit each story into a structure that works on LinkedIn,
and have a human pass before anything goes out. SocialBoost runs that whole process on your own machine.

```
 Positioning interview ──▶ Strategy (audience, pillars, cadence)
 Story interviews ───────▶ Memory Bank (real stories, exact quotes, details)  ◀── always asks for a photo
 Your LinkedIn posts ────▶ Voice (how you actually write)
                              │
                              ▼
 Studio: angle → draft → AI-tell lint + critique → revise → you edit and approve
                              │
                              ▼
 Calendar (cadence slots, auto-plan by pillar) → publish via LinkedIn API, or a "post it now" reminder
                              │
                              ▼
 Insights (what each post did) → pillar weights and hook patterns feed the next plan
```

## What's inside

- **Interviews** — a positioning interview that turns into your strategy, then short story-mining interviews targeted
  at the pillar that needs stories most. One question at a time, journalist-style follow-ups (when, where, who, what was
  said, numbers, what changed). Answer by typing or by voice. Every story ends with a photo request.
- **Memory Bank** — every story as a card: the story in your words, verbatim quotes, details, people, lesson, pillar,
  possible angles, a story-depth score and its photos. Semantic search. Stories without a photo are flagged until you add one.
- **Photos** — drop in candid shots; they're auto-rotated, stripped of location metadata, resized for LinkedIn, and
  described by a local vision model so the right photo can be matched to the right post.
- **Voice** — import your past posts (paste, LinkedIn data export `Shares.csv`, or — for members in the EEA and
  Switzerland — LinkedIn's Member Data Portability API). SocialBoost measures your style (length, rhythm, lists, emojis,
  hashtags, hooks) and writes a style guide. Your best posts are used as examples when drafting. Add posts from
  creators you admire as structure references.
- **Studio** — the factory. Pick a story, choose one of three angles, stream a draft, and see AI tells highlighted
  (banned phrases, "it's not X, it's Y", em-dash habits, staircase formatting, hook length vs. the "see more" fold).
  One-tap revisions, critique scores, version history, a LinkedIn preview with the photo.
- **Calendar** — your cadence as open slots, auto-planning by pillar mix, drag-and-drop, "draft everything planned",
  and an ICS feed for your own calendar.
- **Publishing** — connect LinkedIn (self-serve "Share on LinkedIn" app) to publish at the scheduled time, or skip it
  and get a "post it now" reminder with copy-and-open. Nothing is published without your approval.
- **Insights** — enter or import metrics; see what works by pillar, structure, hook type and weekday; apply suggested
  pillar weights to the next plan.
- **Teams** — one install can ghostwrite for several people; each has their own strategy, voice, stories and calendar.
- **Apple Liquid Glass UI** — light and dark, glass slider, reduce-transparency and contrast options, mobile layout.

## Quick start (local)

Requirements: Node.js 20.9+ and [Ollama](https://ollama.com) 0.32+.

```bash
# 1. Models (one multimodal model does text and photos; one small model for search)
ollama pull gemma4:12b
ollama pull embeddinggemma

# 2. App
npm install
npm run build && npm start      # or: npm run dev
```

Open http://localhost:3000. The welcome screen creates your profile, checks your models, and starts the positioning
interview. All data lives in `./data` (SQLite + photos) — back up that folder and you've backed up everything.

### Model presets

Pick a preset in **Settings → Models**, or route each task (interviewer, extractor, writer, critic, vision,
embedding, transcription) to any provider yourself.

| Preset | Text + vision | Embeddings | Good for |
|---|---|---|---|
| Light | `qwen3.5:4b` | `embeddinggemma` | 8 GB RAM laptops |
| Recommended | `gemma4:12b` | `embeddinggemma` | 16 GB RAM / 8–12 GB VRAM |
| Multilingual | `qwen3.5:9b` | `qwen3-embedding:0.6b` | writing in Spanish, German, French… |
| Pro | `muse-glimmer:30b` | `qwen3-embedding:0.6b` | 24 GB VRAM / 32 GB+ Mac |

Also supported: any OpenAI-compatible server (LM Studio, llama.cpp, vLLM, LocalAI, OpenRouter, OpenAI) and
Anthropic (Claude) as a cloud option for any task. Embeddings stay local.

**Voice answers:** your browser's dictation works out of the box. For private, higher-quality transcription run a
Whisper server (e.g. `docker compose --profile voice up -d whisper`) and set `STT_BASE_URL`.

## Docker

```bash
docker compose up -d                                   # app + Ollama
docker compose exec ollama ollama pull gemma4:12b
docker compose exec ollama ollama pull embeddinggemma
```

On a Mac, run Ollama natively (Docker can't use the Apple GPU) and start only the app:
`OLLAMA_BASE_URL=http://host.docker.internal:11434 docker compose up -d app`.

### Running it online

SocialBoost is single-tenant. If you put it on a server, set `SOCIALBOOST_PASSWORD` — the whole studio then sits
behind a sign-in screen (the calendar feed gets its own read-only key). Put it behind HTTPS.

## Connecting LinkedIn (optional)

1. Create an app at <https://developer.linkedin.com> (it must be linked to a Company Page you admin).
2. Under **Products**, add **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn** (both self-serve).
3. Under **Auth**, add the redirect URL shown in **Settings → LinkedIn** (e.g. `http://localhost:3000/api/linkedin/callback`).
4. Paste the client ID and secret into **Settings → LinkedIn** and click **Connect**.

Notes from LinkedIn's current platform rules: access tokens last 60 days and self-serve apps get no refresh token,
so you reconnect every two months (the app warns you). This publishing app can't read your past posts or analytics
for personal profiles — bring posts into Voice by pasting them or uploading `Shares.csv` from the data export (members
in the EEA and Switzerland can also use LinkedIn's Member Data Portability API there), and enter/import metrics in Insights.

## The workflow

1. **Positioning interview** (10–15 min) → Strategy: who you're writing for, 3–4 content pillars, cadence, CTA.
2. **Import your posts** in Voice → style guide and examples.
3. **Story interviews** (10 min each, or quick-capture from Today) → stories in the Memory Bank, each with a photo.
4. **Calendar → Auto-plan** fills your cadence with stories by pillar mix → **Draft all planned**.
5. **Studio**: review each draft, fix what the linter flags, approve, schedule.
6. Publish (API or reminder) → add metrics in **Insights** → apply the suggested pillar weights.

## Development

```bash
npm run dev          # http://localhost:3000
npm test             # unit tests (vitest)
npm run typecheck
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the code map and conventions.

## Privacy

Everything — stories, photos, voice samples, drafts — stays in `./data` on your machine. With local models nothing
leaves it. If you route a task to a cloud provider, only that task's prompt is sent there.
