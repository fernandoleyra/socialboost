import "server-only";
import { getDb, parseJson } from "./db";
import { AISettingsSchema, type AISettings, type ModelTask } from "./types";

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
  const writer = process.env.SOCIALBOOST_WRITER_MODEL || "qwen3:14b";
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
      vision: { providerId: "ollama", model: process.env.SOCIALBOOST_VISION_MODEL || "qwen2.5vl:7b", temperature: 0.2 },
      embedding: { providerId: "ollama", model: process.env.SOCIALBOOST_EMBED_MODEL || "nomic-embed-text" },
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
  setSetting("ai", AISettingsSchema.parse(settings));
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
