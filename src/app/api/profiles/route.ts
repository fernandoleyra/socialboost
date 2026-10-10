import { z } from "zod";
import { handle, ok } from "@/lib/http";
import { createProfile, getActiveProfile, listProfiles } from "@/lib/repo";

export const GET = handle(async () => ok({ profiles: listProfiles(), active: getActiveProfile() }));

const Body = z.object({
  name: z.string().min(1).max(120),
  headline: z.string().max(220).optional(),
  linkedinUrl: z.string().max(300).optional(),
  language: z.string().max(10).optional(),
  timezone: z.string().max(60).optional(),
});

export const POST = handle(async (req: Request) => {
  const body = Body.parse(await req.json());
  return ok({ profile: createProfile(body) });
});
