import { describe, expect, it } from "vitest";
import type { AISettings } from "@/lib/types";
import {
  activePreset,
  applyPreset,
  buildHealthReport,
  machineLabel,
  modelAvailable,
  normalizeOllamaModel,
  presetModels,
  pullAllCommand,
  recommendPreset,
  routesMissingModel,
  tasksUsingProvider,
  uniqueProviderId,
  validateProvider,
  type ProviderHealth,
} from "./presets";

function settings(over: Partial<AISettings> = {}): AISettings {
  return {
    providers: [{ id: "ollama", kind: "ollama", label: "Ollama (local)", baseUrl: "http://localhost:11434", apiKey: "" }],
    routes: {
      interviewer: { providerId: "ollama", model: "qwen3:14b", temperature: 0.7 },
      extractor: { providerId: "ollama", model: "qwen3:14b", temperature: 0.2 },
      writer: { providerId: "ollama", model: "qwen3:14b", temperature: 0.8 },
      critic: { providerId: "ollama", model: "qwen3:14b", temperature: 0.2 },
      vision: { providerId: "ollama", model: "qwen2.5vl:7b", temperature: 0.2 },
      embedding: { providerId: "ollama", model: "nomic-embed-text" },
      transcription: null,
    },
    numCtx: 8192,
    ...over,
  };
}

const up = (models: string[], over: Partial<ProviderHealth> = {}): ProviderHealth => ({
  id: "ollama",
  label: "Ollama (local)",
  kind: "ollama",
  baseUrl: "http://localhost:11434",
  ok: true,
  error: null,
  hint: null,
  models,
  ...over,
});

describe("model matching", () => {
  it("treats untagged Ollama names as :latest", () => {
    expect(normalizeOllamaModel("nomic-embed-text")).toBe("nomic-embed-text:latest");
    expect(normalizeOllamaModel("Qwen3:14B")).toBe("qwen3:14b");
    expect(normalizeOllamaModel("hf.co/bartowski/model")).toBe("hf.co/bartowski/model:latest");
    expect(modelAvailable("ollama", "nomic-embed-text", ["nomic-embed-text:latest"])).toBe(true);
    expect(modelAvailable("ollama", "qwen3:14b", ["qwen3:8b", "qwen3:latest"])).toBe(false);
    expect(modelAvailable("ollama", "qwen3", ["qwen3:latest"])).toBe(true);
    expect(modelAvailable("ollama", "", ["qwen3:latest"])).toBe(false);
  });

  it("matches exact ids and dated aliases for API providers", () => {
    expect(modelAvailable("openai", "gpt-4.1-mini", ["gpt-4.1-mini"])).toBe(true);
    expect(modelAvailable("anthropic", "claude-sonnet-5-5", ["claude-sonnet-5-5-20260601"])).toBe(true);
    expect(modelAvailable("openai", "qwen3-14b", ["qwen/qwen3-14b"])).toBe(true);
    expect(modelAvailable("openai", "qwen3", ["qwen3-14b-instruct"])).toBe(true);
    expect(modelAvailable("openai", "llama", ["mistral-7b"])).toBe(false);
  });
});

describe("presets", () => {
  it("lists distinct models and a pasteable pull command", () => {
    expect(presetModels("recommended")).toEqual(["gemma4:12b", "embeddinggemma"]);
    expect(presetModels("light")).toEqual(["qwen3.5:4b", "embeddinggemma"]);
    expect(presetModels("multilingual")).toEqual(["qwen3.5:9b", "qwen3-embedding:0.6b"]);
    expect(pullAllCommand(["a", "b", "a"])).toBe("ollama pull a && ollama pull b");
  });

  it("routes preset tasks to Ollama and keeps transcription", () => {
    const base = settings({ routes: { ...settings().routes, transcription: { providerId: "stt", model: "whisper" } } });
    const light = applyPreset(base, "light");
    expect(light.routes.writer).toEqual({ providerId: "ollama", model: "qwen3.5:4b", temperature: 0.8 });
    expect(light.routes.vision?.model).toBe("qwen3.5:4b");
    expect(light.routes.embedding).toEqual({ providerId: "ollama", model: "embeddinggemma" });
    expect(light.routes.transcription).toEqual({ providerId: "stt", model: "whisper" });
    expect(activePreset(light)).toBe("light");
    expect(activePreset(base)).toBeNull();
    expect(activePreset(applyPreset(base, "recommended"))).toBe("recommended");
  });

  it("adds a local Ollama provider when none exists", () => {
    const cloud = settings({
      providers: [{ id: "ollama", kind: "anthropic", label: "Claude", baseUrl: "https://api.anthropic.com", apiKey: "k" }],
    });
    const next = applyPreset(cloud, "recommended");
    expect(next.providers).toHaveLength(2);
    expect(next.providers[1]).toMatchObject({ id: "ollama-2", kind: "ollama", baseUrl: "http://localhost:11434" });
    expect(next.routes.writer?.providerId).toBe("ollama-2");
  });

  it("returns null when routing matches no preset", () => {
    const custom = settings({ routes: { ...settings().routes, writer: { providerId: "ollama", model: "llama3.1:8b" } } });
    expect(activePreset(custom)).toBeNull();
  });
});

describe("providers", () => {
  it("creates unique ids and finds tasks using a provider", () => {
    expect(uniqueProviderId([], "openai")).toBe("openai");
    expect(uniqueProviderId([{ id: "openai" }, { id: "openai-2" }], "openai")).toBe("openai-3");
    expect(tasksUsingProvider(settings(), "ollama")).toEqual(["interviewer", "extractor", "writer", "critic", "vision", "embedding"]);
    expect(tasksUsingProvider(settings(), "nope")).toEqual([]);
  });

  it("validates provider forms", () => {
    expect(validateProvider({ kind: "ollama", label: "", baseUrl: "http://x", apiKey: "" })).toMatch(/name/);
    expect(validateProvider({ kind: "ollama", label: "L", baseUrl: "localhost:11434", apiKey: "" })).toMatch(/http/);
    expect(validateProvider({ kind: "ollama", label: "L", baseUrl: "ftp://x", apiKey: "" })).toMatch(/http/);
    expect(validateProvider({ kind: "anthropic", label: "C", baseUrl: "https://api.anthropic.com", apiKey: " " })).toMatch(/API key/);
    expect(validateProvider({ kind: "openai", label: "LM Studio", baseUrl: "http://localhost:1234/v1", apiKey: "" })).toBeNull();
  });
});

describe("health report", () => {
  it("marks routes ready, missing or off and collects pull commands", () => {
    const r = buildHealthReport(settings(), [up(["qwen3:14b", "nomic-embed-text:latest"])], new Date("2026-10-10T00:00:00Z"));
    const byTask = Object.fromEntries(r.routes.map((x) => [x.task, x]));
    expect(byTask.writer).toMatchObject({ status: "ready", available: true, pull: null });
    expect(byTask.vision).toMatchObject({ status: "missing", available: false, pull: "ollama pull qwen2.5vl:7b" });
    expect(byTask.transcription).toMatchObject({ status: "off", importance: "optional" });
    expect(r.summary).toEqual({ ready: true, missingRequired: 0, missingRecommended: 1, pullCommands: ["ollama pull qwen2.5vl:7b"] });
    expect(r.checkedAt).toBe("2026-10-10T00:00:00.000Z");
  });

  it("reports a down provider and missing provider ids", () => {
    const s = settings({ routes: { ...settings().routes, critic: { providerId: "gone", model: "x" } } });
    const r = buildHealthReport(s, [up([], { ok: false, error: "Couldn't reach Ollama", hint: "Is Ollama running?" })]);
    const byTask = Object.fromEntries(r.routes.map((x) => [x.task, x]));
    expect(byTask.writer.status).toBe("provider-down");
    expect(byTask.critic).toMatchObject({ status: "no-provider", providerLabel: "gone" });
    expect(r.summary.ready).toBe(false);
    expect(r.summary.missingRequired).toBe(4);
    expect(r.summary.pullCommands).toEqual([]);
  });

  it("treats API providers that can't list models as unknown, not broken", () => {
    const s = settings({
      providers: [{ id: "lm", kind: "openai", label: "LM Studio", baseUrl: "http://localhost:1234/v1", apiKey: "" }],
      routes: { ...settings().routes, writer: { providerId: "lm", model: "local-model" } },
    });
    const r = buildHealthReport(s, [{ ...up([]), id: "lm", kind: "openai", label: "LM Studio" }]);
    expect(r.routes.find((x) => x.task === "writer")?.status).toBe("unknown");
  });

  it("counts a switched-off required task as missing", () => {
    const s = settings({ routes: { ...settings().routes, writer: null } });
    const r = buildHealthReport(s, [up(["qwen3:14b", "qwen2.5vl:7b", "nomic-embed-text"])]);
    expect(r.summary).toMatchObject({ ready: false, missingRequired: 1, missingRecommended: 0 });
  });
});

describe("unsaveable routes", () => {
  it("lists tasks that point at a provider without a model name", () => {
    expect(routesMissingModel(settings())).toEqual([]);
    const s = settings();
    const blank = { ...s, routes: { ...s.routes, writer: { providerId: "ollama", model: "  " }, vision: null } };
    expect(routesMissingModel(blank)).toEqual(["writer"]);
  });
});

describe("machine recommendation", () => {
  it("picks the preset that fits the machine's memory", () => {
    expect(recommendPreset(8)).toBe("light");
    expect(recommendPreset(16)).toBe("recommended");
    expect(recommendPreset(24)).toBe("recommended");
    expect(recommendPreset(32)).toBe("pro");
    expect(recommendPreset(64)).toBe("pro");
  });

  it("names the machine for copy", () => {
    expect(machineLabel({ platform: "darwin", arch: "arm64" })).toBe("Mac with Apple silicon");
    expect(machineLabel({ platform: "win32", arch: "x64" })).toBe("Windows PC");
    expect(machineLabel({ platform: "linux", arch: "x64" })).toBe("Linux machine");
  });

  it("adds the machine and its recommended preset to the health report", () => {
    const r = buildHealthReport(settings(), [up([])], new Date("2026-10-11T00:00:00Z"), { memGB: 32, platform: "darwin", arch: "arm64" });
    expect(r.machine).toEqual({ memGB: 32, platform: "darwin", arch: "arm64", recommended: "pro", label: "Mac with Apple silicon" });
    expect(buildHealthReport(settings(), [up([])]).machine).toBeUndefined();
  });
});
