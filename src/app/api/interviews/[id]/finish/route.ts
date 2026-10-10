import { handle, ok } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { FinishBody } from "@/lib/interview/schemas";
import { finishInterview } from "@/lib/interview/service";

export const dynamic = "force-dynamic";
/** Extraction runs one or more structured calls on local models; allow it time. */
export const maxDuration = 300;

/**
 * positioning → drafts/merges the Strategy. story → saves 1-3 memories (verbatim quotes
 * checked, embedded, photos linked). Returns {interview, memories, strategy}.
 */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const profile = requireProfile();
  const body = FinishBody.parse(await req.json().catch(() => ({})));
  return ok(await finishInterview(profile, id, body));
});
