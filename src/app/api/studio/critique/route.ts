import { z } from "zod";
import { handle, ok } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { runCritique } from "@/lib/factory/pipeline";
import { requirePost } from "@/lib/factory/posts";
import { qualityGate } from "@/lib/factory/quality";
import { readBody } from "@/lib/factory/request";

export const dynamic = "force-dynamic";

/**
 * POST /api/studio/critique { postId, body? } → { critique, post, gate }
 * `body` lets the editor critique unsaved text; it is saved first so the score matches the post.
 */
export const POST = handle(async (req: Request) => {
  const profile = requireProfile();
  const { postId, body } = await readBody(req, z.object({ postId: z.string().min(1), body: z.string().max(10000).optional() }));
  const post = requirePost(profile.id, postId);
  const res = await runCritique(post, body, req.signal);
  return ok({ ...res, gate: qualityGate(res.post.quality, res.post.body) });
});
