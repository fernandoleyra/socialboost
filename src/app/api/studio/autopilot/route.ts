import { z } from "zod";
import { handle, ok } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { autopilot } from "@/lib/factory/pipeline";
import { requirePost } from "@/lib/factory/posts";
import { readBody } from "@/lib/factory/request";

export const dynamic = "force-dynamic";

/**
 * POST /api/studio/autopilot { postId, force? } → { post, steps }
 * Angle → draft → lint + critique → one revision if needed. Non-streaming; slow on local models
 * (several model calls), so callers show progress per post. Refuses to overwrite an existing
 * draft unless force is true.
 */
export const POST = handle(async (req: Request) => {
  const profile = requireProfile();
  const { postId, force } = await readBody(req, z.object({ postId: z.string().min(1), force: z.boolean().optional() }));
  const post = requirePost(profile.id, postId);
  return ok(await autopilot(post, { force, signal: req.signal }));
});
