import { z } from "zod";
import { handle, streamText } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { draftStream } from "@/lib/factory/pipeline";
import { requirePost } from "@/lib/factory/posts";
import { readBody } from "@/lib/factory/request";
import { HOOK_TYPES } from "@/lib/factory/angles";
import { STRUCTURE_IDS } from "@/lib/factory/structures";

export const dynamic = "force-dynamic";

const Body = z.object({
  postId: z.string().min(1),
  /** Index into the angle options saved by /api/studio/angles. */
  angleIndex: z.number().int().min(0).max(9).nullable().optional(),
  /** Or a full angle (e.g. one the user edited). */
  angle: z
    .object({
      hook: z.string().max(400),
      hookType: z.enum(HOOK_TYPES).default("scene"),
      structureId: z.enum(STRUCTURE_IDS),
      takeaway: z.string().max(400).default(""),
      whyItWorks: z.string().max(400).default(""),
    })
    .nullable()
    .optional(),
});

/**
 * POST /api/studio/draft { postId, angleIndex? | angle? } → streamed post text.
 * When the stream ends the cleaned text is saved as an AI version, linted, and an idea becomes a draft.
 */
export const POST = handle(async (req: Request) => {
  const profile = requireProfile();
  const body = await readBody(req, Body);
  const post = requirePost(profile.id, body.postId);
  const { gen, onDone } = await draftStream(post, { angle: body.angle ?? null, angleIndex: body.angleIndex ?? null, signal: req.signal });
  return streamText(gen, onDone);
});
