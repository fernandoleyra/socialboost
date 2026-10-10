import { z } from "zod";
import { handle, ok } from "@/lib/http";
import { chat, embed } from "@/lib/llm";
import { MODEL_TASKS } from "@/lib/types";

/** Smoke-test the model routed to a task. */
export const POST = handle(async (req: Request) => {
  const { task } = z.object({ task: z.enum(MODEL_TASKS) }).parse(await req.json());
  const started = Date.now();
  try {
    if (task === "embedding") {
      const v = await embed(["A quick test sentence."]);
      if (!v?.[0]?.length) return ok({ ok: false, error: "Embedding model returned nothing. Is it pulled?" });
      return ok({ ok: true, sample: `${v[0].length}-dim vector`, ms: Date.now() - started });
    }
    if (task === "transcription") return ok({ ok: true, sample: "Record a voice answer in an interview to test.", ms: 0 });
    const text = await chat({ task, messages: [{ role: "user", content: "Reply with exactly five words describing a sunrise." }], maxTokens: 60 });
    return ok({ ok: true, sample: text.slice(0, 200), ms: Date.now() - started });
  } catch (err) {
    const e = err as Error & { hint?: string };
    return ok({ ok: false, error: e.message, hint: e.hint, ms: Date.now() - started });
  }
});
