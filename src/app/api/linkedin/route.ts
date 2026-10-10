import { z } from "zod";
import { handle, ok } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { jsonBody } from "@/lib/calendar/body";
import { requestOrigin } from "@/lib/calendar/origin";
import { deleteLinkedInAccount, linkedInSettingsFor, saveLinkedInConfig } from "@/lib/linkedin";

export const dynamic = "force-dynamic";

/** GET /api/linkedin → LinkedInSettings { config (no secret), defaultRedirectUri, account } for the active profile. */
export const GET = handle(async (req: Request) => {
  const profile = requireProfile();
  return ok(linkedInSettingsFor(profile.id, requestOrigin(req.headers, req.url)));
});

const Config = z.object({
  clientId: z.string().max(200).optional(),
  clientSecret: z.string().max(500).optional(),
  redirectUri: z.string().max(500).optional(),
  apiVersion: z.string().max(10).optional(),
});

/** PUT /api/linkedin { clientId?, clientSecret? (empty keeps the saved one), redirectUri?, apiVersion? } → LinkedInSettings */
export const PUT = handle(async (req: Request) => {
  const profile = requireProfile();
  saveLinkedInConfig(await jsonBody(req, Config));
  return ok(linkedInSettingsFor(profile.id, requestOrigin(req.headers, req.url)));
});

/** DELETE /api/linkedin → disconnect the active profile (the app config stays). → LinkedInSettings */
export const DELETE = handle(async (req: Request) => {
  const profile = requireProfile();
  deleteLinkedInAccount(profile.id);
  return ok(linkedInSettingsFor(profile.id, requestOrigin(req.headers, req.url)));
});
