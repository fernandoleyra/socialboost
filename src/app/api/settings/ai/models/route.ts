import { z } from "zod";
import { handle, ok } from "@/lib/http";
import { listModels } from "@/lib/llm";
import { unmaskProvider } from "@/lib/settings";
import { ProviderConfigSchema } from "@/lib/types";

/** List the models a provider offers. Accepts an unsaved provider config so the UI can test before saving. */
export const POST = handle(async (req: Request) => {
  const { provider } = z.object({ provider: ProviderConfigSchema }).parse(await req.json());
  try {
    return ok({ ok: true, models: await listModels(unmaskProvider(provider)) });
  } catch (err) {
    const e = err as Error & { hint?: string };
    return ok({ ok: false, models: [], error: e.message, hint: e.hint });
  }
});
