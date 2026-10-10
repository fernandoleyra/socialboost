import { z } from "zod";
import { handle, ok } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { jsonBody } from "@/lib/calendar/body";
import { applyWeights } from "@/lib/calendar/service";

export const dynamic = "force-dynamic";

const Body = z.object({
  /** pillarId → weight (0-100). Omit to apply the current suggestion. */
  weights: z.record(z.string(), z.number().min(0).max(100)).optional(),
});

/** POST /api/insights/apply-weights { weights? } → { strategy } */
export const POST = handle(async (req: Request) => {
  const profile = requireProfile();
  const body = await jsonBody(req, Body);
  return ok({ strategy: applyWeights(profile, body.weights) });
});
