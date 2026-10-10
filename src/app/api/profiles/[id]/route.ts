import { z } from "zod";
import { handle, ok } from "@/lib/http";
import { deleteProfile, updateProfile } from "@/lib/repo";
import { deleteProfilePhotos } from "@/lib/photos";

const Patch = z.object({
  name: z.string().min(1).max(120).optional(),
  headline: z.string().max(220).optional(),
  linkedinUrl: z.string().max(300).optional(),
  language: z.string().max(10).optional(),
  timezone: z.string().max(60).optional(),
});

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return ok({ profile: updateProfile(id, Patch.parse(await req.json())) });
});

export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  // Remove image files first; the row cascade would otherwise orphan them in data/uploads.
  deleteProfilePhotos(id);
  deleteProfile(id);
  return ok({ ok: true });
});
