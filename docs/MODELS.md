# Models

SocialBoost routes every model call by **task**. Pick a preset in **Settings → Models**, or set each task yourself.

| Task | What it does | Output |
|---|---|---|
| interviewer | asks the next interview question | streamed text |
| extractor | turns transcripts into strategy and story cards | JSON (schema-constrained) |
| writer | drafts and revises posts | streamed plain text |
| critic | scores drafts | JSON |
| vision | describes photos, judges candid vs. posed | JSON |
| embedding | semantic search over stories and your posts | vectors |
| transcription | voice answers → text | text (OpenAI-compatible Whisper server) |

## Local presets (Ollama ≥ 0.32)

One natively multimodal model handles every text task **and** photos, so Ollama never swaps models in the
middle of an interview and a 16 GB machine never holds two LLMs at once.

| Preset | Text + vision | Embeddings | Hardware |
|---|---|---|---|
| Light | `qwen3.5:4b` | `embeddinggemma` (768d, multilingual) | 8 GB RAM |
| **Recommended** | `gemma4:12b` | `embeddinggemma` | 16 GB RAM / 8–12 GB VRAM |
| Multilingual | `qwen3.5:9b` | `qwen3-embedding:0.6b` (1024d) | 16 GB RAM |
| Pro | `muse-glimmer:30b` (alt. `qwen3.8:27b`) | `qwen3-embedding:0.6b` | 24 GB VRAM / 32 GB+ Mac |

Speech-to-text: browser dictation by default; for private transcription run
[speaches](https://github.com/speaches-ai/speaches) with `Systran/faster-whisper-small` (CPU) or
`large-v3-turbo` (GPU) and set `STT_BASE_URL`.

Changing the embedding model clears stored vectors; they are rebuilt automatically the next time you search.

## How the app talks to Ollama

- Native `/api/chat` with `think: false` (reasoning models answer directly), `keep_alive: 15m`, `num_ctx` from settings.
- Structured output uses Ollama's `format: <JSON schema>` plus the schema in the prompt; responses are validated with
  zod and retried once with the validation error.
- Vendor sampling per family: Qwen `top_p 0.8–0.9, top_k 20, presence_penalty` (0 for JSON); Gemma `top_p 0.95, top_k 64`.
- Embeddings use each model's retrieval prefixes (`task: search result | query:` for embeddinggemma,
  `search_query:`/`search_document:` for nomic, an instruction prefix for qwen3-embedding queries).

## Cloud options

- **Anthropic**: writer `claude-opus-5-5` (or `claude-sonnet-5-5`), other tasks `claude-haiku-5-5`. The app sends
  `output_config.effort` instead of sampling parameters and uses structured outputs for JSON tasks.
- **OpenAI-compatible** (OpenRouter, Groq, OpenAI, LM Studio, llama.cpp, vLLM): `/v1/chat/completions`, with
  `response_format: json_schema` when the server supports it and a graceful fallback when it doesn't.

## Making small models write like a person

What the Studio does, based on what works in practice:

1. Ask for *the post only*, written as you, in first person, about one moment, to your audience — never "write a LinkedIn post".
2. Give 2–3 of your own best posts as examples of rhythm and formatting (not content).
3. Keep the in-prompt "don't" list short (~25 items); enforce the long list with the deterministic linter.
4. Draft → lint + critique → targeted revise (at most two rounds). Plain text throughout; JSON only for scores.
5. Only facts from your story. No invented numbers, names or outcomes.
