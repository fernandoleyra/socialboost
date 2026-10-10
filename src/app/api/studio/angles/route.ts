import { z } from "zod";
import { handle, ok } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { generateAngles } from "@/lib/factory/pipeline";
import { requirePost } from "@/lib/factory/posts";
import { readBody } from "@/lib/factory/request";

export const dynamic = "force-dynamic";

/** POST /api/studio/angles { postId } → { angles, post }. Three ways to tell the story; saved on the post. */
export const POST = handle(async (req: Request) => {
  const profile = requireProfile();
  const { postId } = await readBody(req, z.object({ postId: z.string().min(1) }));
  const post = requirePost(profile.id, postId);
  const res = await generateAngles(post, req.signal);
  return ok(res);
});
