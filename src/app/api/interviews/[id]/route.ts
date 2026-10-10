import { HttpError, handle, ok } from "@/lib/http";
import { deleteInterview, getStrategy, listInterviews, requireProfile, updateInterview } from "@/lib/repo";
import { PatchInterviewBody } from "@/lib/interview/schemas";
import { deleteInterviewData, getOwnedInterview, loadInterviewView } from "@/lib/interview/service";

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
  const body = PatchInterviewBody.parse(await req.json().catch(() => ({})));
  if (body.status && current.status === "completed") {
    throw new HttpError(409, "This interview is already saved.", "Start a new interview to add more stories.");
  }
  if (body.pillar && !getStrategy(profile.id)?.pillars.some((p) => p.id === body.pillar)) {
    throw new HttpError(400, "That pillar doesn't exist.", "Pick one of the pillars from your strategy.");
  }
  if (body.status === "active" && current.kind === "positioning") {
    // One positioning interview at a time: reopening this one closes any other unfinished one.
    for (const other of listInterviews(profile.id)) {
      if (other.id !== id && other.kind === "positioning" && other.status === "active") updateInterview(other.id, { status: "abandoned" });
    }
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
