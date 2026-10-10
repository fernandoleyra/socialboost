import { NextResponse } from "next/server";
import { HttpError } from "@/lib/http";
import { getProfile } from "@/lib/repo";
import { requestOrigin } from "@/lib/calendar/origin";
import { LinkedInApiError, completeLinkedInAuth, takeOAuthState } from "@/lib/linkedin";

export const dynamic = "force-dynamic";

/**
 * GET /api/linkedin/callback?code&state (or ?error&error_description) — the redirect URL
 * registered in the LinkedIn app. Exchanges the code, stores the connection, and sends the
 * browser back to Settings → LinkedIn with the outcome.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = takeOAuthState(url.searchParams.get("state"));
  // Return to the origin the redirect URL points at, which is the one the browser is on.
  let origin = requestOrigin(req.headers, req.url);
  if (state) {
    try {
      origin = new URL(state.redirectUri).origin;
    } catch {
      /* keep request origin */
    }
  }
  const back = (params: Record<string, string>) => NextResponse.redirect(`${origin}/settings/linkedin?${new URLSearchParams(params).toString()}`);

  const error = url.searchParams.get("error");
  if (error) {
    const cancelled = /cancel/i.test(error);
    return back({ error: cancelled ? "You cancelled the LinkedIn sign-in. Nothing changed." : url.searchParams.get("error_description") || error });
  }
  if (!state) return back({ error: "That sign-in link expired or didn't come from this app. Please connect again." });
  const code = url.searchParams.get("code");
  if (!code) return back({ error: "LinkedIn didn't send a sign-in code. Please connect again." });
  if (!getProfile(state.profileId)) return back({ error: "The profile you were connecting no longer exists." });

  try {
    await completeLinkedInAuth(state, code, origin);
    return back({ connected: "1" });
  } catch (err) {
    const message = err instanceof LinkedInApiError ? [err.info.message, err.info.hint].filter(Boolean).join(" ") : err instanceof HttpError ? err.message : "Connecting to LinkedIn failed.";
    return back({ error: message });
  }
}
