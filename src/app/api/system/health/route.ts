import { handle, ok } from "@/lib/http";
import { LLMError, listModels } from "@/lib/llm";
import { getAISettings } from "@/lib/settings";
import type { ProviderConfig } from "@/lib/types";
import { buildHealthReport, type ProviderHealth } from "@/components/settings/presets";
import { machineInfo } from "@/lib/machine";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 5000;

function withTimeout<T>(p: Promise<T>, ms: number, provider: ProviderConfig): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new LLMError(
            `${provider.label} didn't answer within ${ms / 1000}s at ${provider.baseUrl}.`,
            provider.kind === "ollama" ? "Is Ollama running? Start it with `ollama serve`." : "Check the address in Settings → Models.",
          ),
        ),
      ms,
    );
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

async function ping(provider: ProviderConfig): Promise<ProviderHealth> {
  const base = { id: provider.id, label: provider.label, kind: provider.kind, baseUrl: provider.baseUrl };
  try {
    const models = await withTimeout(listModels(provider), TIMEOUT_MS, provider);
    return { ...base, ok: true, error: null, hint: null, models };
  } catch (err) {
    const e = err as Error & { hint?: string };
    return { ...base, ok: false, error: e.message, hint: e.hint ?? null, models: [] };
  }
}

/**
 * Ping every configured provider and report which routed models are installed.
 * Used by the Welcome model check and Settings → Models.
 */
export const GET = handle(async () => {
  const settings = getAISettings();
  const providers: ProviderConfig[] = [...settings.providers];

  // Transcription may point at the env-configured Whisper server ("stt") that isn't in the provider list.
  const stt = settings.routes.transcription;
  if (stt && !providers.some((p) => p.id === stt.providerId) && stt.providerId === "stt" && process.env.STT_BASE_URL) {
    providers.push({ id: "stt", kind: "openai", label: "Whisper (STT_BASE_URL)", baseUrl: process.env.STT_BASE_URL, apiKey: process.env.STT_API_KEY || "" });
  }

  const results = await Promise.all(providers.map(ping));
  return ok(buildHealthReport(settings, results, new Date(), machineInfo()));
});
