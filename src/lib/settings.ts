import "server-only";
import { getDb, parseJson } from "./db";
import { AISettingsSchema, type AISettings, type ModelTask, type ProviderConfig } from "./types";
import { sameProviderEndpoint } from "./provider-endpoint";

export function getSetting<T>(key: string, fallback: T): T {
  const row = getDb().prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined;
  return row ? parseJson<T>(row.value, fallback) : fallback;
}

export function setSetting(key: string, value: unknown) {
  getDb()
    .prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(key, JSON.stringify(value));
}

/**
 * Defaults favour a fully local setup: everything routed to Ollama.
 * Env vars let a Docker/self-hosted deploy pre-seed models without touching the UI.
 */
export function defaultAISettings(): AISettings {
  const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  // One natively multimodal model for every text task and vision, so Ollama never swaps
  // models mid-interview (see docs/MODELS.md for the light / multilingual / pro presets).
  const writer = process.env.SOCIALBOOST_WRITER_MODEL || "gemma4:12b";
  const fast = process.env.SOCIALBOOST_FAST_MODEL || writer;
  const providers: AISettings["providers"] = [
    { id: "ollama", kind: "ollama", label: "Ollama (local)", baseUrl: ollamaUrl, apiKey: "" },
  ];
  if (process.env.OPENAI_COMPAT_BASE_URL) {
    providers.push({
      id: "openai",
      kind: "openai",
      label: "OpenAI-compatible",
      baseUrl: process.env.OPENAI_COMPAT_BASE_URL,
      apiKey: process.env.OPENAI_COMPAT_API_KEY || "",
    });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    providers.push({
      id: "anthropic",
      kind: "anthropic",
      label: "Anthropic",
      baseUrl: "https://api.anthropic.com",
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return {
    providers,
    routes: {
      interviewer: { providerId: "ollama", model: fast, temperature: 0.7 },
      extractor: { providerId: "ollama", model: fast, temperature: 0.2 },
      writer: { providerId: "ollama", model: writer, temperature: 0.8 },
      critic: { providerId: "ollama", model: fast, temperature: 0.2 },
      vision: { providerId: "ollama", model: process.env.SOCIALBOOST_VISION_MODEL || writer, temperature: 0.2 },
      embedding: { providerId: "ollama", model: process.env.SOCIALBOOST_EMBED_MODEL || "embeddinggemma" },
      transcription: process.env.STT_BASE_URL ? { providerId: "stt", model: process.env.STT_MODEL || "Systran/faster-whisper-small" } : null,
    },
    numCtx: Number(process.env.SOCIALBOOST_NUM_CTX || 8192),
  };
}

export function getAISettings(): AISettings {
  const stored = getSetting<unknown>("ai", null);
  const defaults = defaultAISettings();
  if (!stored) return defaults;
  const parsed = AISettingsSchema.safeParse(stored);
  if (!parsed.success) return defaults;
  // Fill any task added after the settings were first saved.
  const routes = { ...defaults.routes, ...parsed.data.routes };
  return { ...parsed.data, routes };
}

export function saveAISettings(settings: AISettings) {
  const prev = getAISettings().routes.embedding;
  const next = AISettingsSchema.parse(settings);
  setSetting("ai", next);
  // Vectors from different embedding models aren't comparable (even at equal dimensions).
  // Drop them; memory search and voice retrieval re-embed lazily with the new model.
  const cur = next.routes.embedding;
  if ((prev?.providerId ?? null) !== (cur?.providerId ?? null) || (prev?.model ?? null) !== (cur?.model ?? null)) {
    const db = getDb();
    db.exec(`UPDATE memories SET embedding = NULL; UPDATE voice_samples SET embedding = NULL;`);
  }
}

export function getRoute(task: ModelTask) {
  const s = getAISettings();
  const route = s.routes[task];
  if (!route) return null;
  const provider = s.providers.find((p) => p.id === route.providerId);
  if (!provider) return null;
  return { route, provider, numCtx: s.numCtx };
}

/* Active profile: the person currently being ghostwritten. Stored server-side so API routes agree. */
export function getActiveProfileId(): string | null {
  return getSetting<string | null>("activeProfileId", null);
}

export function setActiveProfileId(id: string) {
  setSetting("activeProfileId", id);
}

/* ------------------------------------------------------------------ */
/* API keys never leave the server in clear text                       */
/* ------------------------------------------------------------------ */

const MASK = "••••";
export const isMaskedKey = (k: string) => k.startsWith(MASK);
const maskKey = (k: string) => (k ? MASK + (k.length > 8 ? k.slice(-4) : "") : "");

/** Settings safe to send to the browser: API keys replaced by a mask showing the last 4 chars. */
export function maskAISettings(s: AISettings): AISettings {
  return { ...s, providers: s.providers.map((p) => ({ ...p, apiKey: maskKey(p.apiKey) })) };
}

/**
 * Swap masked keys coming back from the browser for the stored ones (matched by provider id). The
 * stored key is only restored while the provider still points at the same kind and host; a changed
 * address gets no key, so it can't be used to send the saved key somewhere else.
 */
export function unmaskProvider<T extends Pick<ProviderConfig, "id" | "kind" | "baseUrl" | "apiKey">>(p: T): T {
  if (!isMaskedKey(p.apiKey)) return p;
  const stored = getAISettings().providers.find((x) => x.id === p.id);
  return { ...p, apiKey: stored && sameProviderEndpoint(stored, p) ? stored.apiKey : "" };
}

export function unmaskAISettings(s: AISettings): AISettings {
  return { ...s, providers: s.providers.map(unmaskProvider) };
}
