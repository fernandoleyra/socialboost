import { HttpError, handle, ok } from "@/lib/http";
import { LLMError, transcribe } from "@/lib/llm";
import { requireProfile } from "@/lib/repo";
import { getAISettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/** Is a Whisper-compatible transcription server routed? (Same resolution as llm.transcribe.) */
function sttConfigured(): boolean {
  const s = getAISettings();
  const route = s.routes.transcription;
  if (!route) return false;
  const provider = s.providers.find((p) => p.id === route.providerId);
  if (provider) return provider.kind !== "anthropic";
  return route.providerId === "stt" && !!process.env.STT_BASE_URL;
}

/** {available}: lets the UI pick server transcription or the browser's own dictation up front. */
export const GET = handle(async () => {
  requireProfile();
  return ok({ available: sttConfigured() });
});

/** Multipart {file} (webm/ogg/mp4/wav audio) → {text}. 501 when no server STT is set up. */
export const POST = handle(async (req: Request) => {
  requireProfile();
  if (!sttConfigured()) {
    throw new HttpError(501, "Voice transcription isn't set up on this server.", "Using your browser's dictation instead. To transcribe locally, add a Whisper server in Settings → Models.");
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") throw new HttpError(400, "No audio received.", "Record again and keep the mic on for a second or two.");
  if (file.size === 0) throw new HttpError(400, "The recording was empty.", "Check that the right microphone is selected.");
  if (file.size > MAX_AUDIO_BYTES) throw new HttpError(413, "That recording is too long.", "Keep voice answers under about 10 minutes.");
  const name = (file as File).name || `answer.${/mp4|m4a/.test(file.type) ? "m4a" : /ogg/.test(file.type) ? "ogg" : /wav/.test(file.type) ? "wav" : "webm"}`;
  const t0 = Date.now();
  try {
    return ok({ text: await transcribe(file, name) });
  } catch (err) {
    // Node's fetch drops responses that take over 5 minutes to start; say so instead of "couldn't reach".
    if (err instanceof LLMError && Date.now() - t0 >= 290_000) {
      throw new LLMError("Transcription took more than 5 minutes and was dropped.", "Record shorter answers, or use a smaller Whisper model in Settings → Models.");
    }
    throw err;
  }
});
