import { handle, ok } from "@/lib/http";
import { logActivity } from "@/lib/db";
import { requireProfile } from "@/lib/repo";
import { MemoryFieldsSchema, deleteMemoryAndPlaceholders, memoryPosts, patchMemory, postCountsByMemory, requireOwnedMemory } from "@/lib/memory";
import { listPhotoViews, readJsonBody } from "@/lib/photos";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/memories/[id] → { memory, photos, posts } */
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const profile = requireProfile();
  const memory = requireOwnedMemory(profile.id, id);
  return ok({
    memory: { ...memory, postCount: postCountsByMemory(profile.id).get(id) ?? 0 },
    photos: listPhotoViews(profile.id, { memoryId: id }),
    posts: memoryPosts(profile.id, id),
  });
});

/** PATCH /api/memories/[id] — any story-card field; re-embeds when the searchable text changes. */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const profile = requireProfile();
  const current = requireOwnedMemory(profile.id, id);
  const patch = MemoryFieldsSchema.partial().parse(await readJsonBody(req));
  const memory = await patchMemory(current, patch);
  return ok({ memory: { ...memory, postCount: postCountsByMemory(profile.id).get(id) ?? 0 } });
});

/**
 * DELETE /api/memories/[id] → { ok, freedSlots } — photos stay in the library (unassigned); posts keep
 * their text; planned ideas with no text yet go with the story so Auto-plan can refill their slots.
 */
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const profile = requireProfile();
  const memory = requireOwnedMemory(profile.id, id);
  const freedSlots = deleteMemoryAndPlaceholders(profile.id, id);
  const freed = freedSlots ? ` and ${freedSlots === 1 ? "its planned slot" : `${freedSlots} planned slots`}` : "";
  logActivity("memory", `Deleted the story “${memory.title}”${freed}`, { profileId: profile.id });
  return ok({ ok: true, freedSlots });
});
