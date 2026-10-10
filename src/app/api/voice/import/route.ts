import { handle, ok } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { importVoice, readJson } from "@/lib/voice/service";
import { ImportRequestSchema } from "@/lib/voice/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/voice/import { kind: "own" | "reference", format: "text" | "csv" | "json", content, author?, origin?: "paste" | "export" | "linkedin" }
 * → { found, inserted, updated, skipped, warnings, state }
 */
export const POST = handle(async (req: Request) => {
  const profile = requireProfile();
  const body = ImportRequestSchema.parse(await readJson(req));
  return ok(await importVoice(profile, body));
});
