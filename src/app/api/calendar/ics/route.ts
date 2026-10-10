import { handle, ok, HttpError } from "@/lib/http";
import { getProfile, requireProfile } from "@/lib/repo";
import { icsFeed, icsKey, verifyIcsKey } from "@/lib/calendar/service";
import { requestOrigin } from "@/lib/calendar/origin";

export const dynamic = "force-dynamic";

/**
 * GET /api/calendar/ics?profile=<id>&key=<secret> → text/calendar feed of planned, scheduled and
 * recently published posts (post text in DESCRIPTION, link to the Studio). Calendar apps fetch
 * it without a session, so it's protected by a per-profile secret instead.
 */
export const GET = handle(async (req: Request) => {
  const url = new URL(req.url);
  const profileId = url.searchParams.get("profile") ?? "";
  const profile = profileId ? getProfile(profileId) : null;
  if (!profile || !verifyIcsKey(profile.id, url.searchParams.get("key"))) {
    throw new HttpError(404, "Calendar feed not found.", "Copy the subscription link again from the Calendar page.");
  }
  const body = icsFeed(profile, requestOrigin(req.headers, req.url));
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `inline; filename="socialboost-${profile.id}.ics"`,
      "cache-control": "no-cache",
    },
  });
});

/** POST /api/calendar/ics → { path } with a fresh secret; old subscription links stop working. */
export const POST = handle(async () => {
  const profile = requireProfile();
  const key = icsKey(profile.id, true);
  return ok({ path: `/api/calendar/ics?profile=${encodeURIComponent(profile.id)}&key=${key}` });
});
