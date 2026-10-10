import { handle, ok } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { readJson, updateVoiceProfile } from "@/lib/voice/service";
import { ProfileUpdateSchema } from "@/lib/voice/types";

export const dynamic = "force-dynamic";

/** PUT /api/voice/profile { manualRules?, guide?: Partial<VoiceGuide> } → VoiceState */
export const PUT = handle(async (req: Request) => {
  const profile = requireProfile();
  const body = ProfileUpdateSchema.parse(await readJson(req));
  return ok(updateVoiceProfile(profile.id, body));
});
