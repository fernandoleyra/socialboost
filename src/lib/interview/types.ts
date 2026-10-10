/**
 * Shared types for the interview module. Pure (no server-only imports) so client
 * components and unit tests can use them.
 */
import type { Interview } from "@/lib/repo";
import type { Memory, Photo } from "@/lib/types";

export type ActiveInterviewKind = "positioning" | "story";

/**
 * What an assistant message was trying to do. Stored per message so the engine can
 * follow the conversation as a small state machine (and the UI knows where to put
 * the inline photo card).
 */
export type Stage =
  | "opening" // first question of a session
  | "probe" // story: dig for one missing element of the story
  | "photo" // story: ask for a candid photo (always happens)
  | "photo-caption" // story: thank for the photo, ask for the one-line caption
  | "wrap" // story: thread complete — offer Finish & save or another story
  | "closing" // user is done — point at the Finish button
  | "pos-question" // positioning: ask about one area
  | "pos-example" // positioning: answer was thin, ask for an example
  | "pos-wrap" // positioning: everything covered
  | "pos-followup"; // positioning: user added more after the wrap

export type MessageMeta = {
  stage: Stage;
  /** Coverage item (story) or area (positioning) this message targeted. */
  target?: string;
  /** Id of the bank question / probe used as the model's hint (P01, F08…). */
  probeId?: string;
  /** True when this message asked for a specific instance after a generic answer. */
  generic?: boolean;
};

export type InterviewState = {
  v: 1;
  /** Keyed by assistant message id. */
  meta: Record<string, MessageMeta>;
  /** User message ids that start a new story thread (after a wrap). */
  threadStarts: string[];
  /** Photo-request message ids the user answered with "remind me later". */
  photoLater: string[];
  /** Latest model-based coverage check for the current thread. */
  llm: { threadStart: string; covered: string[]; userTurns: number } | null;
};

export const EMPTY_STATE: InterviewState = { v: 1, meta: {}, threadStarts: [], photoLater: [], llm: null };

export type TranscriptMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  photoIds: string[];
};

export type CoverageStatus = "covered" | "skipped" | "missing";
export type CoverageItem = { key: string; label: string; hint: string; status: CoverageStatus };

export type ViewMessage = TranscriptMessage & { createdAt: string; stage: Stage | null };

export type PillarChip = { id: string; name: string; color: string };

export type InterviewView = {
  interview: Interview;
  messages: ViewMessage[];
  /** Photos referenced by messages, keyed by id. */
  photos: Record<string, Photo>;
  coverage: CoverageItem[];
  /** 0..1 depth of the current thread (story) or overall coverage (positioning). */
  depth: number;
  /** The unresolved photo-request message, if the interviewer is waiting for one. */
  pendingPhotoRequestId: string | null;
  /** The current thread already has a photo, or the user chose "remind me later". */
  threadPhotoDone: boolean;
  /** No assistant reply after the last user message (first question, or a failed turn). */
  needsReply: boolean;
  /** Last assistant message offered Finish & save. */
  readyToFinish: boolean;
  threadCount: number;
  pillars: PillarChip[];
  memories: Memory[];
  strategySummary: { positioning: string; goals: string[]; pillars: PillarChip[] } | null;
  language: string;
};
