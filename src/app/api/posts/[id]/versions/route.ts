import { z } from "zod";
import { readBody } from "@/lib/factory/request";
import { handle, ok, HttpError } from "@/lib/http";
import { listPostVersions, requireProfile } from "@/lib/repo";
import { applyHumanEdit, assertNotPublishing, requirePost } from "@/lib/factory/posts";
import { getVersion } from "@/lib/factory/versions";
import { safeTimezone } from "@/lib/calendar/time";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/posts/[id]/versions → { versions } newest first. */
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const profile = requireProfile();
  const { id } = await ctx.params;
  const post = requirePost(profile.id, id);
  return ok({ versions: listPostVersions(post.id) });
});

/** POST /api/posts/[id]/versions { versionId } → restore that text as the current body. → { post } */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const profile = requireProfile();
  const { id } = await ctx.params;
  const { versionId } = await readBody(req, z.object({ versionId: z.string().min(1) }));
  const post = requirePost(profile.id, id);
  if (post.status === "published") throw new HttpError(409, "This post is already published.");
  assertNotPublishing(post);
  const version = getVersion(post.id, versionId);
  if (!version) throw new HttpError(404, "Version not found");
  // The note is stored text, so write the time in the person's own time zone, not the server's.
  const when = new Date(version.createdAt).toLocaleString("en", { timeZone: safeTimezone(profile.timezone), month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return ok({ post: applyHumanEdit(post, version.body, `Restored the version from ${when}`) });
});
