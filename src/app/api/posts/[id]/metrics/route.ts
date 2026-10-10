import { z } from "zod";
import { handle, ok } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { jsonBody } from "@/lib/calendar/body";
import { saveMetrics } from "@/lib/calendar/service";

export const dynamic = "force-dynamic";

const Count = z.number().int().min(0).max(1_000_000_000).nullable().optional();
const Body = z.object({ impressions: Count, reactions: Count, comments: Count, reposts: Count });

/**
 * PUT /api/posts/[id]/metrics { impressions?, reactions?, comments?, reposts? } → { post }
 * Results typed in by hand for a published post. Omitted fields stay; null clears one.
 */
export const PUT = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const profile = requireProfile();
  const { id } = await ctx.params;
  return ok({ post: saveMetrics(profile, id, await jsonBody(req, Body)) });
});
