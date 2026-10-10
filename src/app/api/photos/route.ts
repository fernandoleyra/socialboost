import { after } from "next/server";
import { handle, ok, HttpError } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { listPhotoViews, photoView, processUpload, queueCaption } from "@/lib/photos";

export const dynamic = "force-dynamic";

/** GET /api/photos?memoryId=…&unassigned=1 → { photos } (newest first). */
export const GET = handle(async (req: Request) => {
  const profile = requireProfile();
  const sp = new URL(req.url).searchParams;
  const memoryId = sp.get("memoryId");
  const unassigned = sp.get("unassigned") === "1" || sp.get("unassigned") === "true";
  return ok({ photos: listPhotoViews(profile.id, { memoryId: memoryId || null, unassigned }) });
});

/**
 * POST /api/photos (multipart: file, memoryId?, note?) → { photo }.
 * The photo is stored immediately; the vision caption runs after the response.
 */
export const POST = handle(async (req: Request) => {
  const profile = requireProfile();
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Send the photo as multipart form data with a `file` field.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "No photo in the upload.", "Attach the image as the `file` field.");
  const memoryId = String(form.get("memoryId") ?? "").trim() || null;
  const note = String(form.get("note") ?? "");
  const photo = await processUpload(profile.id, file, { memoryId, note });
  after(() => queueCaption(photo.id));
  return ok({ photo: photoView(photo) }, { status: 201 });
});
