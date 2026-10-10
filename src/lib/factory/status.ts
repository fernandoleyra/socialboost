/**
 * Post status rules shared by the API and the editor. Pure.
 *
 *   idea → draft → review → approved → scheduled → published
 *                                    ↘ archived (from anywhere)
 *
 * The human approves every post (research 02 §2.7; the reference agency's "human touch").
 */

import type { PostStatus } from "@/lib/types";
import { LINKEDIN_MAX_CHARS } from "./lint";

export const STATUS_META: Record<PostStatus, { label: string; tone: string }> = {
  idea: { label: "Idea", tone: "gray" },
  draft: { label: "Draft", tone: "blue" },
  review: { label: "In review", tone: "orange" },
  approved: { label: "Approved", tone: "green" },
  scheduled: { label: "Scheduled", tone: "indigo" },
  published: { label: "Published", tone: "purple" },
  archived: { label: "Archived", tone: "gray" },
};

/** Statuses whose text the model may still rewrite (approved/scheduled go back to review). */
export const REWRITABLE: PostStatus[] = ["idea", "draft", "review", "approved", "scheduled"];

export type StatusCheck = { ok: true } | { ok: false; message: string; hint?: string };

export function checkStatusChange(input: { from: PostStatus; to: PostStatus; body: string; scheduledAt: string | null; now?: Date }): StatusCheck {
  const { from, to, body } = input;
  if (from === to) return { ok: true };
  if (from === "published" && to !== "archived") return { ok: false, message: "This post is already published.", hint: "Archive it instead, or start a new post from the same story." };
  const text = body.trim();
  if (["review", "approved", "scheduled", "published"].includes(to)) {
    if (!text) return { ok: false, message: "Write or draft the post first." };
    if (text.length > LINKEDIN_MAX_CHARS) return { ok: false, message: `The post is ${text.length.toLocaleString("en")} characters.`, hint: `LinkedIn allows ${LINKEDIN_MAX_CHARS.toLocaleString("en")}. Shorten it first.` };
  }
  if (to === "scheduled") {
    if (!input.scheduledAt) return { ok: false, message: "Pick a date and time to schedule it." };
    const at = Date.parse(input.scheduledAt);
    if (Number.isNaN(at)) return { ok: false, message: "That date doesn't look right." };
    const now = (input.now ?? new Date()).getTime();
    if (at < now - 5 * 60_000) return { ok: false, message: "That time is in the past.", hint: "Pick a time from now on." };
  }
  return { ok: true };
}

/** Status after the model writes a new version of the text. */
export function statusAfterGeneration(current: PostStatus): PostStatus {
  if (current === "idea") return "draft";
  if (current === "approved" || current === "scheduled") return "review";
  return current;
}

/** Status after the user edits the text by hand. */
export function statusAfterHumanEdit(current: PostStatus, body: string): PostStatus {
  if (current === "idea" && body.trim()) return "draft";
  return current;
}

export const BOARD_COLUMNS: { status: PostStatus; title: string; empty: string }[] = [
  { status: "idea", title: "Ideas", empty: "Pick a story from your Memory Bank to start a post." },
  { status: "draft", title: "Drafts", empty: "Drafts appear here once the writer has a first version." },
  { status: "review", title: "Review", empty: "Drafts that pass the quality check wait here for your read." },
  { status: "approved", title: "Approved", empty: "Approve a post to make it ready for the calendar." },
];
