import { z } from "zod";
import { handle, ok, HttpError } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { lintAndSave } from "@/lib/factory/pipeline";
import { requirePost } from "@/lib/factory/posts";

export const dynamic = "force-dynamic";

/**
 * POST /api/posts/[id]/lint { text? } → { lint, score, post }
 * Without `text` the stored body is checked and the result saved on the post.
 */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const profile = requireProfile();
  const { id } = await ctx.params;
  const post = requirePost(profile.id, id);
  const raw = await req.text();
  let json: unknown = {};
  if (raw.trim()) {
    try {
      json = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "Send JSON like { \"text\": \"...\" }, or an empty body.");
    }
  }
  const { text } = z.object({ text: z.string().max(10000).optional() }).parse(json);
  const res = await lintAndSave(post, text);
  return ok({ lint: res.lint.issues, score: res.lint.score, post: res.post });
});
