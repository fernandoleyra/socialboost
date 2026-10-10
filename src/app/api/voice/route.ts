import { handle, ok } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { getVoiceState } from "@/lib/voice/service";

export const dynamic = "force-dynamic";

/** GET /api/voice → VoiceState: samples (own + reference), profile (stats, guide, manual rules), extras, meta, prompt block. */
export const GET = handle(async () => {
  const profile = requireProfile();
  return ok(getVoiceState(profile.id));
});
