import { z } from "zod";
import { logActivity } from "@/lib/db";
import { readBody } from "@/lib/factory/request";
import { handle, ok, HttpError } from "@/lib/http";
import { deletePost, getPhoto, requireProfile, updatePost } from "@/lib/repo";
import { POST_STATUSES, type Post } from "@/lib/types";
import { normalizeAngles, parseAngleField, serializeAngleField } from "@/lib/factory/angles";
import { applyHumanEdit, postDetail, postLabel, requireMemory, requirePost } from "@/lib/factory/posts";
import { checkStatusChange, STATUS_META } from "@/lib/factory/status";
import { PUBLISHING_MARKER, STALE_PUBLISH_MS, publishingSince } from "@/lib/calendar/linkedin-format";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const PRE_APPROVAL: Post["status"][] = ["idea", "draft", "review"];

const sameInstant = (a: string | null, b: string | null) => a === b || (!!a && !!b && Date.parse(a) === Date.parse(b));

/** GET /api/posts/[id] → { post, memory, photo, memoryPhotos, libraryPhotos } */
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const profile = requireProfile();
  const { id } = await ctx.params;
  return ok(postDetail(requirePost(profile.id, id)));
});

const AngleInput = z.object({
  hook: z.string().max(400).optional(),
  hookType: z.string().optional(),
  structureId: z.string().optional(),
  takeaway: z.string().max(400).optional(),
  whyItWorks: z.string().max(400).optional(),
});

const Patch = z.object({
  body: z.string().max(10000).optional(),
  photoId: z.string().nullable().optional(),
  memoryId: z.string().nullable().optional(),
  pillar: z.string().max(120).nullable().optional(),
  format: z.string().max(40).optional(),
  /** A free-text note, or a structured angle that becomes the selected one. */
  angle: z.union([z.string().max(20000), AngleInput]).optional(),
  status: z.enum(POST_STATUSES).optional(),
  scheduledAt: z.string().nullable().optional(),
});

/**
 * PATCH /api/posts/[id] → { post }
 * Body edits are saved as a "You" version (one per editing session) and re-linted. Status
 * changes are validated (no empty approvals, no scheduling in the past, published is final).
 */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const profile = requireProfile();
  const { id } = await ctx.params;
  let post = requirePost(profile.id, id);
  const patch = await readBody(req, Patch);

  if (patch.scheduledAt && Number.isNaN(Date.parse(patch.scheduledAt))) throw new HttpError(400, "That date doesn't look right.");
  if (patch.photoId) {
    const photo = getPhoto(patch.photoId);
    if (!photo || photo.profileId !== profile.id) throw new HttpError(404, "Photo not found");
  }
  if (patch.memoryId) requireMemory(profile.id, patch.memoryId);
  if (post.status === "published" && patch.body !== undefined && patch.body !== post.body) {
    throw new HttpError(409, "This post is already published.", "Edit it on LinkedIn; changes here wouldn't reach your feed.");
  }

  if (patch.status === "published" && post.status !== "published") {
    throw new HttpError(400, "Use “Mark as posted” or “Publish now” to publish a post.", "They record the LinkedIn link and mark the story as used, so Insights can track it.");
  }

  const nextBody = patch.body ?? post.body;
  const nextScheduled = patch.scheduledAt !== undefined ? patch.scheduledAt : post.scheduledAt;
  // Approving a post that already has a future date on the calendar (Auto-plan put it there, or it
  // was dragged there before approval) queues it for that time: the Calendar's rule that a dated,
  // approved post is a scheduled one. Otherwise the scheduler would never pick it up.
  const status =
    patch.status === "approved" && PRE_APPROVAL.includes(post.status) && nextScheduled && Date.parse(nextScheduled) > Date.now() ? "scheduled" : patch.status;
  const rescheduled = patch.scheduledAt !== undefined && !sameInstant(patch.scheduledAt, post.scheduledAt);
  const statusChanged = !!status && status !== post.status;

  // Same rule as the Calendar: no changes while the scheduler or "Publish now" is sending this text.
  const publishing = publishingSince(post.error);
  if (publishing && Date.now() - publishing.getTime() < STALE_PUBLISH_MS && (rescheduled || statusChanged || (patch.body !== undefined && patch.body !== post.body))) {
    throw new HttpError(409, "This post is being published right now.", "Wait a moment, then refresh the page.");
  }
  if (status && status !== post.status) {
    const check = checkStatusChange({ from: post.status, to: status, body: nextBody, scheduledAt: nextScheduled });
    if (!check.ok) throw new HttpError(400, check.message, check.hint);
  } else if (post.status === "scheduled" && rescheduled) {
    // Moving a scheduled post: the new time must be valid too, or the scheduler would publish it at once.
    const check = checkStatusChange({ from: "approved", to: "scheduled", body: nextBody, scheduledAt: nextScheduled });
    if (!check.ok) throw new HttpError(400, check.message, check.hint);
  }

  if (patch.body !== undefined && patch.body !== post.body) post = applyHumanEdit(post, patch.body);

  const update: Partial<Post> = {};
  if (patch.photoId !== undefined) update.photoId = patch.photoId;
  if (patch.memoryId !== undefined) update.memoryId = patch.memoryId;
  if (patch.pillar !== undefined) update.pillar = patch.pillar;
  if (patch.format !== undefined) update.format = patch.format;
  if (patch.scheduledAt !== undefined) update.scheduledAt = patch.scheduledAt ? new Date(patch.scheduledAt).toISOString() : null;
  if (patch.angle !== undefined) {
    const field = parseAngleField(post.angle);
    // A JSON document is read like the stored column (validated angles, canonical structure ids);
    // anything else is kept as the free-text note next to the current angles.
    if (typeof patch.angle === "string") update.angle = serializeAngleField(patch.angle.trim().startsWith("{") ? parseAngleField(patch.angle) : { ...field, note: patch.angle });
    else {
      const [a] = normalizeAngles([patch.angle], field.selected?.structureId ?? "scene-lesson", 1);
      if (!a) throw new HttpError(400, "The angle needs a hook.");
      update.angle = serializeAngleField({ ...field, selected: a });
    }
  }
  if (status && status !== post.status) update.status = status;
  // A new time or status means the person dealt with the post: an earlier slot's publish failure
  // or "missed" note no longer applies, and the scheduler gets a fresh attempt at the new time.
  // The in-flight marker stays (a stuck one asks the person to check LinkedIn first).
  if ((rescheduled || statusChanged) && post.error && !post.error.startsWith(PUBLISHING_MARKER)) update.error = null;
  if (Object.keys(update).length) post = updatePost(post.id, update);

  if (update.status === "approved" || update.status === "scheduled" || update.status === "review") {
    const when = update.status === "scheduled" && post.scheduledAt ? ` for ${new Date(post.scheduledAt).toUTCString().slice(0, 22)} UTC` : "";
    logActivity("post", `${STATUS_META[update.status].label}${when}: ${postLabel(post)}`, { profileId: profile.id, refId: post.id });
  }
  return ok({ post });
});

/** DELETE /api/posts/[id] → { ok } (versions go with it; the memory and photo stay). */
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const profile = requireProfile();
  const { id } = await ctx.params;
  const post = requirePost(profile.id, id);
  deletePost(post.id);
  logActivity("post", `Deleted post: ${postLabel(post)}`, { profileId: profile.id, refId: null });
  return ok({ ok: true });
});
