import { z } from "zod";
import { handle, ok } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { jsonBody } from "@/lib/calendar/body";
import { requestOrigin } from "@/lib/calendar/origin";
import type { LinkedInSettings } from "@/lib/calendar/types";
import { defaultRedirectUri, deleteLinkedInAccount, getLinkedInAccount, getLinkedInConfig, saveLinkedInConfig } from "@/lib/linkedin";

export const dynamic = "force-dynamic";

function status(req: Request): LinkedInSettings {
  const profile = requireProfile();
  const origin = requestOrigin(req.headers, req.url);
  const cfg = getLinkedInConfig(origin);
  return {
    config: {
      clientId: cfg.clientId,
      hasSecret: !!cfg.clientSecret,
      redirectUri: cfg.redirectUri,
      apiVersion: cfg.apiVersion,
      env: cfg.env,
      ready: !!cfg.clientId && !!cfg.clientSecret,
    },
    defaultRedirectUri: defaultRedirectUri(origin),
    account: getLinkedInAccount(profile.id),
  };
}

/** GET /api/linkedin → { config (no secret), defaultRedirectUri, account } for the active profile. */
export const GET = handle(async (req: Request) => ok(status(req)));

const Config = z.object({
  clientId: z.string().max(200).optional(),
  clientSecret: z.string().max(500).optional(),
  redirectUri: z.string().max(500).optional(),
  apiVersion: z.string().max(10).optional(),
});

/** PUT /api/linkedin { clientId?, clientSecret? (empty keeps the saved one), redirectUri?, apiVersion? } → status */
export const PUT = handle(async (req: Request) => {
  requireProfile();
  saveLinkedInConfig(await jsonBody(req, Config));
  return ok(status(req));
});

/** DELETE /api/linkedin → disconnect the active profile (the app config stays). */
export const DELETE = handle(async (req: Request) => {
  const profile = requireProfile();
  deleteLinkedInAccount(profile.id);
  return ok(status(req));
});
