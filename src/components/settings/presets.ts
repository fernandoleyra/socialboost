/**
 * Model routing knowledge shared by Settings, the Welcome model check and
 * GET /api/system/health. Pure: no React, no server imports.
 */
import type { AISettings, ModelTask, ProviderConfig, ProviderKind } from "@/lib/types";

export type TaskImportance = "required" | "recommended" | "optional";

export const TASK_INFO: Record<ModelTask, { label: string; description: string; importance: TaskImportance; usesTemperature: boolean; defaultTemperature?: number }> = {
  interviewer: { label: "Interviewer", description: "Asks the next interview question", importance: "required", usesTemperature: true, defaultTemperature: 0.7 },
  extractor: { label: "Extractor", description: "Turns interviews into stories and strategy", importance: "required", usesTemperature: true, defaultTemperature: 0.2 },
  writer: { label: "Writer", description: "Drafts and revises posts in your voice", importance: "required", usesTemperature: true, defaultTemperature: 0.8 },
  critic: { label: "Critic", description: "Scores drafts for humanness and specificity", importance: "required", usesTemperature: true, defaultTemperature: 0.2 },
  vision: { label: "Vision", description: "Describes your photos and checks they look candid", importance: "recommended", usesTemperature: true, defaultTemperature: 0.2 },
  embedding: { label: "Embeddings", description: "Semantic search over stories and past posts", importance: "recommended", usesTemperature: false },
  transcription: { label: "Transcription", description: "Turns voice answers into text (Whisper server)", importance: "optional", usesTemperature: false },
};

export const TASK_ORDER: ModelTask[] = ["interviewer", "extractor", "writer", "critic", "vision", "embedding", "transcription"];

/** What happens when a task has no working model. Shown next to missing models. */
export const TASK_FALLBACK: Partial<Record<ModelTask, string>> = {
  vision: "Without it, photos are saved but not described.",
  embedding: "Without it, search falls back to keywords.",
  transcription: "Without it, voice answers use your browser's dictation.",
};

export const DEFAULT_BASE_URL: Record<ProviderKind, string> = {
  ollama: "http://localhost:11434",
  openai: "http://localhost:1234/v1",
  anthropic: "https://api.anthropic.com",
};

export const PROVIDER_KIND_LABEL: Record<ProviderKind, string> = {
  ollama: "Ollama",
  openai: "OpenAI-compatible",
  anthropic: "Anthropic",
};

export const PROVIDER_KIND_HINT: Record<ProviderKind, string> = {
  ollama: "Local models served by Ollama. Nothing leaves your machine.",
  openai: "LM Studio, llama.cpp server, vLLM, LocalAI, OpenRouter or OpenAI. Use the URL that ends in /v1.",
  anthropic: "Claude models through the Anthropic API. Needs an API key.",
};

/* ------------------------------------------------------------------ */
/* Presets                                                             */
/* ------------------------------------------------------------------ */

export type PresetId = "recommended" | "light";

export type Preset = {
  id: PresetId;
  label: string;
  memory: string;
  description: string;
  routes: Partial<Record<ModelTask, { model: string; temperature?: number }>>;
};

/**
 * Local presets for Ollama. One text model for all text tasks so Ollama never swaps
 * models in the middle of an interview; a separate small vision model; a tiny embedder.
 */
export const PRESETS: Preset[] = [
  {
    id: "recommended",
    label: "Recommended",
    memory: "16 GB RAM or more",
    description: "Qwen3 14B writes and interviews well; Qwen2.5-VL reads your photos.",
    routes: {
      interviewer: { model: "qwen3:14b", temperature: 0.7 },
      extractor: { model: "qwen3:14b", temperature: 0.2 },
      writer: { model: "qwen3:14b", temperature: 0.8 },
      critic: { model: "qwen3:14b", temperature: 0.2 },
      vision: { model: "qwen2.5vl:7b", temperature: 0.2 },
      embedding: { model: "nomic-embed-text" },
    },
  },
  {
    id: "light",
    label: "Light",
    memory: "8 GB RAM",
    description: "Qwen3 4B for text and Gemma 3 4B for photos. Faster, a little less polished.",
    routes: {
      interviewer: { model: "qwen3:4b", temperature: 0.7 },
      extractor: { model: "qwen3:4b", temperature: 0.2 },
      writer: { model: "qwen3:4b", temperature: 0.8 },
      critic: { model: "qwen3:4b", temperature: 0.2 },
      vision: { model: "gemma3:4b", temperature: 0.2 },
      embedding: { model: "nomic-embed-text" },
    },
  },
];

export function getPreset(id: PresetId): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

/** Distinct models a preset needs, in a stable order. */
export function presetModels(id: PresetId): string[] {
  return [...new Set(Object.values(getPreset(id).routes).map((r) => r!.model))];
}

export function pullCommand(model: string): string {
  return `ollama pull ${model}`;
}

/** One line to paste in a terminal (`ollama pull` takes one model at a time). */
export function pullAllCommand(models: string[]): string {
  return [...new Set(models)].map(pullCommand).join(" && ");
}

/**
 * Route every preset task to the first Ollama provider (adding the default local one if
 * there is none). Transcription and providers' other settings are left alone.
 */
export function applyPreset(settings: AISettings, id: PresetId): AISettings {
  const preset = getPreset(id);
  let providers = settings.providers;
  let ollama = providers.find((p) => p.kind === "ollama");
  if (!ollama) {
    ollama = { id: uniqueProviderId(providers, "ollama"), kind: "ollama", label: "Ollama (local)", baseUrl: DEFAULT_BASE_URL.ollama, apiKey: "" };
    providers = [...providers, ollama];
  }
  const routes = { ...settings.routes };
  for (const [task, r] of Object.entries(preset.routes) as [ModelTask, { model: string; temperature?: number }][]) {
    routes[task] = { providerId: ollama.id, model: r.model, ...(r.temperature !== undefined ? { temperature: r.temperature } : {}) };
  }
  return { ...settings, providers, routes };
}

/** Which preset (if any) the current routing matches exactly. */
export function activePreset(settings: AISettings): PresetId | null {
  for (const preset of PRESETS) {
    const match = (Object.entries(preset.routes) as [ModelTask, { model: string }][]).every(([task, r]) => {
      const route = settings.routes[task];
      const provider = route && settings.providers.find((p) => p.id === route.providerId);
      return !!route && provider?.kind === "ollama" && sameOllamaModel(route.model, r.model);
    });
    if (match) return preset.id;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Providers                                                           */
/* ------------------------------------------------------------------ */

export function uniqueProviderId(providers: Pick<ProviderConfig, "id">[], kind: ProviderKind): string {
  const taken = new Set(providers.map((p) => p.id));
  if (!taken.has(kind)) return kind;
  for (let i = 2; ; i++) if (!taken.has(`${kind}-${i}`)) return `${kind}-${i}`;
}

/** Tasks currently routed to a provider (to block removing a provider that's in use). */
export function tasksUsingProvider(settings: AISettings, providerId: string): ModelTask[] {
  return TASK_ORDER.filter((t) => settings.routes[t]?.providerId === providerId);
}

/** Basic sanity check for a provider form. Returns an error message or null. */
export function validateProvider(p: Pick<ProviderConfig, "kind" | "label" | "baseUrl" | "apiKey">): string | null {
  if (!p.label.trim()) return "Give this provider a name.";
  if (p.kind !== "anthropic" || p.baseUrl.trim()) {
    try {
      const u = new URL(p.baseUrl.trim());
      if (u.protocol !== "http:" && u.protocol !== "https:") return "The address must start with http:// or https://";
    } catch {
      return "That address doesn't look like a URL (e.g. http://localhost:11434).";
    }
  }
  if (p.kind === "anthropic" && !p.apiKey.trim()) return "Anthropic needs an API key.";
  return null;
}

/* ------------------------------------------------------------------ */
/* Model availability                                                  */
/* ------------------------------------------------------------------ */

/** Ollama names default to the `latest` tag: `nomic-embed-text` == `nomic-embed-text:latest`. */
export function normalizeOllamaModel(name: string): string {
  const n = name.trim().toLowerCase();
  const lastSegment = n.split("/").pop() ?? n;
  return lastSegment.includes(":") ? n : `${n}:latest`;
}

export function sameOllamaModel(a: string, b: string): boolean {
  return normalizeOllamaModel(a) === normalizeOllamaModel(b);
}

/**
 * Is `wanted` among the models a provider reports?
 * Ollama: tag-aware. Others: exact id, or a dated id that starts with the alias (Anthropic).
 */
export function modelAvailable(kind: ProviderKind, wanted: string, installed: string[]): boolean {
  if (!wanted.trim()) return false;
  if (kind === "ollama") return installed.some((m) => sameOllamaModel(m, wanted));
  const w = wanted.trim().toLowerCase();
  return installed.some((m) => {
    const id = m.toLowerCase();
    return id === w || id.startsWith(w + "-") || id.endsWith("/" + w);
  });
}

/* ------------------------------------------------------------------ */
/* Health report shape (GET /api/system/health)                        */
/* ------------------------------------------------------------------ */

export type ProviderHealth = {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  ok: boolean;
  error: string | null;
  hint: string | null;
  models: string[];
};

export type RouteStatus = "ready" | "missing" | "unknown" | "provider-down" | "no-provider" | "off";

export type RouteHealth = {
  task: ModelTask;
  providerId: string;
  providerLabel: string;
  model: string;
  available: boolean;
  status: RouteStatus;
  importance: TaskImportance;
  /** Command that fixes a missing Ollama model. */
  pull: string | null;
};

export type HealthReport = {
  providers: ProviderHealth[];
  routes: RouteHealth[];
  summary: { ready: boolean; missingRequired: number; missingRecommended: number; pullCommands: string[] };
  checkedAt: string;
};

/** Combine provider pings with the routing table. Pure so it can be tested. */
export function buildHealthReport(settings: AISettings, providers: ProviderHealth[], now = new Date()): HealthReport {
  const byId = new Map(providers.map((p) => [p.id, p]));
  const routes: RouteHealth[] = TASK_ORDER.map((task) => {
    const info = TASK_INFO[task];
    const route = settings.routes[task];
    if (!route) {
      return { task, providerId: "", providerLabel: "", model: "", available: false, status: "off", importance: info.importance, pull: null };
    }
    const p = byId.get(route.providerId);
    const base = { task, providerId: route.providerId, providerLabel: p?.label ?? route.providerId, model: route.model, importance: info.importance };
    if (!p) return { ...base, available: false, status: "no-provider", pull: null };
    if (!p.ok) return { ...base, available: false, status: "provider-down", pull: null };
    if (p.models.length === 0 && p.kind !== "ollama") return { ...base, available: false, status: "unknown", pull: null };
    const ok = modelAvailable(p.kind, route.model, p.models);
    return { ...base, available: ok, status: ok ? "ready" : "missing", pull: !ok && p.kind === "ollama" ? pullCommand(route.model) : null };
  });
  const broken = (r: RouteHealth) => r.status !== "ready" && r.status !== "unknown" && r.status !== "off";
  const missingRequired = routes.filter((r) => r.importance === "required" && (broken(r) || r.status === "off")).length;
  const missingRecommended = routes.filter((r) => r.importance === "recommended" && broken(r)).length;
  const pullCommands = [...new Set(routes.map((r) => r.pull).filter((x): x is string => !!x))];
  return { providers, routes, summary: { ready: missingRequired === 0, missingRequired, missingRecommended, pullCommands }, checkedAt: now.toISOString() };
}
