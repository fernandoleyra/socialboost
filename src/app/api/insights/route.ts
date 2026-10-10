import { handle, ok } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { insightsFor } from "@/lib/calendar/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/insights → { insights, pillars, timezone }
 * Aggregates per pillar / opening style / structure / weekday / time / format / photo / length,
 * engagement rate, top and bottom posts, findings, and suggested pillar weights.
 */
export const GET = handle(async () => {
  const profile = requireProfile();
  return ok(insightsFor(profile));
});
