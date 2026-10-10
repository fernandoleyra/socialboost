import { handle, ok, HttpError } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { photoView, recaptionPhoto, requireOwnedPhoto } from "@/lib/photos";

export const dynamic = "force-dynamic";

/** POST /api/photos/[id]/caption → re-run the vision caption + candid check now. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const profile = requireProfile();
  requireOwnedPhoto(profile.id, id);
  const photo = await recaptionPhoto(id);
  if (!photo) throw new HttpError(404, "Photo not found", "It was deleted while we were describing it.");
  return ok({ photo: photoView(photo) });
});
