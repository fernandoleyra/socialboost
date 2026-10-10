import { handle, ok } from "@/lib/http";
import { deleteInterview, getStrategy, requireProfile, updateInterview } from "@/lib/repo";
import { PatchInterviewBody } from "@/lib/interview/schemas";
import { deleteInterviewData, getOwnedInterview, loadInterviewView } from "@/lib/interview/service";
import { HttpError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** The interview with its messages, coverage and (when finished) results. */
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return ok(loadInterviewView(requireProfile(), id));
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const profile = requireProfile();
  const current = getOwnedInterview(profile.id, id);
  const body = PatchInterviewBody.parse(await req.json());
  if (body.status && current.status === "completed") {
    throw new HttpError(409, "This interview is already saved.", "Start a new interview to add more stories.");
  }
  if (body.pillar && !getStrategy(profile.id)?.pillars.some((p) => p.id === body.pillar)) {
    throw new HttpError(400, "That pillar doesn't exist.", "Pick one of the pillars from your strategy.");
  }
  updateInterview(id, body);
  return ok(loadInterviewView(profile, id));
});

/** Deletes the interview and its transcript. Memories already saved from it stay in the Memory Bank. */
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const profile = requireProfile();
  getOwnedInterview(profile.id, id);
  deleteInterview(id);
  deleteInterviewData(id);
  return ok({ ok: true });
});
