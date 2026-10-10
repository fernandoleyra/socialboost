import { handle, ok } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { importFromLinkedIn, readJson } from "@/lib/voice/service";
import { LinkedInImportRequestSchema } from "@/lib/voice/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/voice/import/linkedin { token } → { found, inserted, updated, skipped, pages, warnings, state }
 * Reads the person's posts from LinkedIn's Member Data Portability API (EEA and Switzerland only).
 * The token is used for this import and never stored. Stops when the client disconnects.
 */
export const POST = handle(async (req: Request) => {
  const profile = requireProfile();
  const { token } = LinkedInImportRequestSchema.parse(await readJson(req));
  return ok(await importFromLinkedIn(profile, token, { signal: req.signal }));
});
