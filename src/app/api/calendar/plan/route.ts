import { z } from "zod";
import { handle, ok } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { jsonBody } from "@/lib/calendar/body";
import { planFor } from "@/lib/calendar/service";

export const dynamic = "force-dynamic";

const Body = z.object({
  weeks: z.number().int().min(1).max(12).default(4),
  dryRun: z.boolean().default(false),
  /** Plan with the pillar weights Insights suggests instead of the strategy's. */
  useInsights: z.boolean().default(false),
});

/**
 * POST /api/calendar/plan { weeks?, dryRun?, useInsights? }
 * → { preview: PlanPreview, created: CalendarPost[] }
 * Fills open cadence slots with unused ready stories (pillar balance, photo first). With dryRun
 * nothing is written; otherwise each assignment becomes an `idea` post dated to its slot.
 */
export const POST = handle(async (req: Request) => {
  const profile = requireProfile();
  const body = await jsonBody(req, Body);
  return ok(planFor(profile, body), { status: body.dryRun ? 200 : 201 });
});
