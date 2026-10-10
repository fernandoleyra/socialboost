import "server-only";
import { getDb } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/settings";
import { EMPTY_STATE, type InterviewState } from "./types";

/**
 * Per-interview engine state (message stages, story threads, deferred photos, model
 * coverage checks). Stored in the key/value settings table so the module needs no
 * schema migration.
 */
const key = (interviewId: string) => `interview-state:${interviewId}`;

function normalize(raw: Partial<InterviewState> | null): InterviewState {
  if (!raw || typeof raw !== "object") return { ...EMPTY_STATE, meta: {} };
  return {
    v: 1,
    meta: raw.meta && typeof raw.meta === "object" ? raw.meta : {},
    threadStarts: Array.isArray(raw.threadStarts) ? raw.threadStarts : [],
    photoLater: Array.isArray(raw.photoLater) ? raw.photoLater : [],
    llm: raw.llm && typeof raw.llm === "object" ? raw.llm : null,
  };
}

export function getInterviewState(interviewId: string): InterviewState {
  return normalize(getSetting<Partial<InterviewState> | null>(key(interviewId), null));
}

/** Read-modify-write without awaiting in between (SQLite calls are synchronous). */
export function updateInterviewState(interviewId: string, fn: (s: InterviewState) => InterviewState): InterviewState {
  const next = fn(getInterviewState(interviewId));
  setSetting(key(interviewId), next);
  return next;
}

export function clearInterviewState(interviewId: string) {
  getDb().prepare(`DELETE FROM settings WHERE key = ?`).run(key(interviewId));
}
