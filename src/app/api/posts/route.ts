import { z } from "zod";
import { readBody } from "@/lib/factory/request";
import { handle, ok, HttpError } from "@/lib/http";
import { listPosts, requireProfile } from "@/lib/repo";
import { createBlankPost, createPostFromMemory, parseStatuses } from "@/lib/factory/posts";

export const dynamic = "force-dynamic";

/** GET /api/posts?status=draft,review&from=ISO&to=ISO&memoryId= → { posts } */
export const GET = handle(async (req: Request) => {
  const profile = requireProfile();
  const sp = new URL(req.url).searchParams;
  const posts = listPosts(profile.id, {
    status: parseStatuses(sp.get("status")),
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
    memoryId: sp.get("memoryId") || undefined,
  });
  return ok({ posts });
});

const Body = z.object({
  memoryId: z.string().min(1).optional(),
  pillar: z.string().max(120).nullable().optional(),
  format: z.string().max(40).nullable().optional(),
  /** Reuse an untouched idea post for the same memory instead of creating a duplicate. */
  reuseEmpty: z.boolean().optional(),
  scheduledAt: z.string().nullable().optional(),
  /** Start from the user's own text instead of a memory. */
  body: z.string().max(10000).optional(),
});

/**
 * POST /api/posts
 *  - from a memory: { memoryId, pillar?, format?, reuseEmpty? } → idea post with the memory's first photo
 *  - from scratch:  { body, pillar? } → draft post with the user's text
 * → { post, reused }
 */
export const POST = handle(async (req: Request) => {
  const profile = requireProfile();
  const body = await readBody(req, Body);
  if (body.scheduledAt && Number.isNaN(Date.parse(body.scheduledAt))) throw new HttpError(400, "scheduledAt must be an ISO date.");
  if (body.memoryId) {
    const { post, reused } = createPostFromMemory(profile.id, { memoryId: body.memoryId, pillar: body.pillar, format: body.format, reuseEmpty: body.reuseEmpty, scheduledAt: body.scheduledAt });
    return ok({ post, reused }, { status: reused ? 200 : 201 });
  }
  if (body.body === undefined) throw new HttpError(400, "Send a memoryId to start from a story, or a body to start from your own text.");
  const post = createBlankPost(profile.id, { body: body.body, pillar: body.pillar, format: body.format });
  return ok({ post, reused: false }, { status: 201 });
});
