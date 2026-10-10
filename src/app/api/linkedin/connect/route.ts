import { NextResponse } from "next/server";
import { HttpError } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { requestOrigin } from "@/lib/calendar/origin";
import { beginLinkedInAuth } from "@/lib/linkedin";

export const dynamic = "force-dynamic";

/**
 * GET /api/linkedin/connect → 302 to LinkedIn's consent screen for the active profile.
 * Used as a plain link, so problems redirect back to the settings page instead of returning JSON.
 */
export async function GET(req: Request) {
  const origin = requestOrigin(req.headers, req.url);
  try {
    const profile = requireProfile();
    return NextResponse.redirect(beginLinkedInAuth(profile.id, origin));
  } catch (err) {
    const message = err instanceof HttpError ? err.message : "Couldn't start the LinkedIn sign-in.";
    return NextResponse.redirect(`${origin}/settings/linkedin?error=${encodeURIComponent(message)}`);
  }
}
