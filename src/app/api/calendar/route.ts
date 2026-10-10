import { handle, ok } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { getCalendarData, resolveRange } from "@/lib/calendar/service";
import { safeTimezone } from "@/lib/calendar/time";

export const dynamic = "force-dynamic";

/**
 * GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD (end exclusive; ISO instants also accepted)
 * → CalendarData: posts placed in the range (scheduled, planned or published), approved posts
 *   without a date, open/taken cadence slots from now on, cadence, pillars, LinkedIn status.
 */
export const GET = handle(async (req: Request) => {
  const profile = requireProfile();
  const sp = new URL(req.url).searchParams;
  const now = new Date();
  const range = resolveRange(sp.get("from"), sp.get("to"), safeTimezone(profile.timezone), now);
  return ok(getCalendarData(profile, range, now));
});
