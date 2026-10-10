import { z } from "zod";
import { handle, ok } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { deletePhoto, editPhoto, photoView, readJsonBody, requireOwnedPhoto } from "@/lib/photos";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const profile = requireProfile();
  return ok({ photo: photoView(requireOwnedPhoto(profile.id, id)) });
});

const Patch = z.object({
  memoryId: z.string().min(1).nullable().optional(),
  caption: z.string().max(1000).optional(),
  userNote: z.string().max(1000).optional(),
  isCandid: z.boolean().nullable().optional(),
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const profile = requireProfile();
  const photo = requireOwnedPhoto(profile.id, id);
  const updated = editPhoto(photo, Patch.parse(await readJsonBody(req)));
  return ok({ photo: photoView(updated) });
});

/** Deletes the row and its files. Posts that used it keep their text and lose the image. */
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const profile = requireProfile();
  deletePhoto(requireOwnedPhoto(profile.id, id));
  return ok({ ok: true });
});
