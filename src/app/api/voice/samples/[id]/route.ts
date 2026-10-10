import { handle, ok } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { readJson, removeSample, updateSampleMetrics } from "@/lib/voice/service";
import { SampleUpdateSchema } from "@/lib/voice/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/voice/samples/[id] { impressions?, reactions?, comments?, reposts? } → { sample } */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const profile = requireProfile();
  const { id } = await ctx.params;
  const patch = SampleUpdateSchema.parse(await readJson(req));
  return ok({ sample: updateSampleMetrics(profile.id, id, patch) });
});

/** DELETE /api/voice/samples/[id] → VoiceState (stats are recomputed without the post). */
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const profile = requireProfile();
  const { id } = await ctx.params;
  return ok(removeSample(profile.id, id));
});
