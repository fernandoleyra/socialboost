import { z } from "zod";
import { handle, ok, HttpError } from "@/lib/http";
import { getProfile } from "@/lib/repo";
import { setActiveProfileId } from "@/lib/settings";

export const POST = handle(async (req: Request) => {
  const { id } = z.object({ id: z.string() }).parse(await req.json());
  if (!getProfile(id)) throw new HttpError(404, "Profile not found");
  setActiveProfileId(id);
  return ok({ ok: true });
});
