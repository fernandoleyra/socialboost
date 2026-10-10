import { after } from "next/server";
import { handle } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { ReplyBody } from "@/lib/interview/schemas";
import { refreshCoverage, replyStream } from "@/lib/interview/service";

export const dynamic = "force-dynamic";

/**
 * Body {content, photoIds, intent?}. Saves the answer, then streams the next question as
 * plain text. An empty body on a fresh interview (or after a failed turn) streams the
 * opening / retried question without adding a user message.
 */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const profile = requireProfile();
  const body = ReplyBody.parse(await req.json().catch(() => ({})));
  const res = replyStream(profile, id, body, req.signal);
  // Every few answers, re-check coverage with the extractor model once the reply is done.
  after(() => refreshCoverage(id));
  return res;
});
