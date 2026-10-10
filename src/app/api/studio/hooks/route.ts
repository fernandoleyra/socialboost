import { z } from "zod";
import { handle, ok } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { suggestHooks } from "@/lib/factory/pipeline";
import { requirePost } from "@/lib/factory/posts";
import { readBody } from "@/lib/factory/request";

export const dynamic = "force-dynamic";

/** POST /api/studio/hooks { postId, body? } → { hooks: [{ text, type }] } — five alternative first lines. */
export const POST = handle(async (req: Request) => {
  const profile = requireProfile();
  const { postId, body } = await readBody(req, z.object({ postId: z.string().min(1), body: z.string().max(10000).optional() }));
  const post = requirePost(profile.id, postId);
  return ok({ hooks: await suggestHooks(post, body, req.signal) });
});
