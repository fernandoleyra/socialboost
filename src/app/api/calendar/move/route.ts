import { z } from "zod";
import { handle, ok } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { jsonBody } from "@/lib/calendar/body";
import { moveOnCalendar, toCalendarPost } from "@/lib/calendar/service";
import { safeTimezone } from "@/lib/calendar/time";

export const dynamic = "force-dynamic";

const Body = z.object({
  postId: z.string().min(1),
  /** ISO instant, or null to take the post off the calendar. */
  scheduledAt: z.string().nullable(),
});

/**
 * POST /api/calendar/move { postId, scheduledAt } → { post: CalendarPost }
 * Drag & drop and the date picker. Approved posts become scheduled; ideas, drafts and posts in
 * review keep their status (planned only). Clears old scheduler messages; refuses past times.
 */
export const POST = handle(async (req: Request) => {
  const profile = requireProfile();
  const body = await jsonBody(req, Body);
  const now = new Date();
  const post = moveOnCalendar(profile, body.postId, body.scheduledAt, now);
  return ok({ post: toCalendarPost(post, safeTimezone(profile.timezone), new Map(), now) });
});
