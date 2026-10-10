import { z } from "zod";
import { handle, ok, HttpError } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { jsonBody } from "@/lib/calendar/body";
import { LinkedInApiError, connectWithToken } from "@/lib/linkedin";

export const dynamic = "force-dynamic";

const Body = z.object({
  token: z.string().trim().min(20, "That token looks too short.").max(4000),
  expiresInDays: z.number().int().min(1).max(365).default(60),
});

/**
 * POST /api/linkedin/token { token, expiresInDays? } → { account }
 * Connect with a token from LinkedIn's developer Token Generator instead of the redirect flow.
 */
export const POST = handle(async (req: Request) => {
  const profile = requireProfile();
  const body = await jsonBody(req, Body);
  try {
    return ok({ account: await connectWithToken(profile.id, body.token, body.expiresInDays) });
  } catch (err) {
    if (err instanceof LinkedInApiError) throw new HttpError(502, err.info.message, err.info.hint);
    throw err;
  }
});
