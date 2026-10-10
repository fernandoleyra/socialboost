import { handle, ok } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { analyzeVoice } from "@/lib/voice/service";

export const dynamic = "force-dynamic";

/** POST /api/voice/analyze → VoiceState with fresh stats and a model-written style guide. Cancelled when the client disconnects. */
export const POST = handle(async (req: Request) => {
  const profile = requireProfile();
  return ok(await analyzeVoice(profile, req.signal));
});
