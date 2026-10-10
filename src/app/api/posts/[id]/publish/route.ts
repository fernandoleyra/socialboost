import { z } from "zod";
import { handle, ok } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { jsonBody } from "@/lib/calendar/body";
import { markPostedByHand, publishToLinkedIn } from "@/lib/linkedin";

export const dynamic = "force-dynamic";

const Body = z.object({
  /** true = the person posted it themselves; just record it. */
  manual: z.boolean().default(false),
  /** Link to the live post (manual only). */
  url: z.string().max(1000).nullable().optional(),
  /** When it went out, if not now (manual only). */
  publishedAt: z.string().nullable().optional(),
  /** Retry after an unconfirmed attempt, once the person checked LinkedIn. */
  retry: z.boolean().default(false),
});

/**
 * POST /api/posts/[id]/publish → { post }
 *  - {}                         publish to LinkedIn now (approved or scheduled posts; needs a connection)
 *  - { manual: true, url? }     mark as posted by hand (also adds a link to an already published post)
 *  - { retry: true }            publish again after an unconfirmed attempt
 */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const profile = requireProfile();
  const { id } = await ctx.params;
  const body = await jsonBody(req, Body);
  if (body.manual) return ok({ post: markPostedByHand(profile.id, id, { url: body.url, publishedAt: body.publishedAt }) });
  return ok({ post: await publishToLinkedIn(profile.id, id, { trigger: "manual", retryUnconfirmed: body.retry }) });
});
