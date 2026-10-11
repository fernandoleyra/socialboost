/**
 * The interview engine as pure functions: split a session into story threads, compute
 * coverage ("story depth"), and decide what the interviewer does next. The model only
 * phrases the question; *what* to ask is decided here, which keeps 7-14B local models
 * on track (one element at a time, no repeats, a photo request at the end of every story).
 */
import {
  CAPTION_PROBE,
  PHOTO_ELEMENT,
  PHOTO_PROBE,
  POSITIONING_AREAS,
  POSITIONING_EXAMPLE_PROBE,
  PRIVACY_PROBE,
  SPECIFIC_PROBE,
  STORY_ELEMENTS,
  STORY_THEMES,
  allStoryPrompts,
  type Probe,
} from "./bank";
import { detectStorySignals, isAcknowledgement, isDoneSignal, isGenericAnswer, isSkipAnswer, isSubstantive, wordCount } from "./text";
import type { ActiveInterviewKind, CoverageItem, InterviewState, MessageMeta, Stage, TranscriptMessage } from "./types";

/** Hard cap on answers per story thread before we ask for the photo regardless. */
export const MAX_THREAD_TURNS = 9;

/* ------------------------------------------------------------------ */
/* Threads                                                             */
/* ------------------------------------------------------------------ */

/** Split messages into story threads. A thread starts at a user message listed in `threadStarts`. */
export function splitThreads<T extends { id: string }>(messages: T[], threadStarts: string[]): T[][] {
  const starts = new Set(threadStarts);
  const threads: T[][] = [[]];
  for (const m of messages) {
    if (starts.has(m.id) && threads[threads.length - 1].length > 0) threads.push([]);
    threads[threads.length - 1].push(m);
  }
  return threads;
}

export function currentThread<T extends { id: string }>(messages: T[], state: InterviewState): T[] {
  const threads = splitThreads(messages, state.threadStarts);
  return threads[threads.length - 1];
}

const userMessages = (msgs: TranscriptMessage[]) => msgs.filter((m) => m.role === "user");

/** Combined text of the user's answers (what coverage heuristics look at). */
export function userText(msgs: TranscriptMessage[]): string {
  return userMessages(msgs)
    .map((m) => m.content)
    .join("\n");
}

/* ------------------------------------------------------------------ */
/* Coverage                                                            */
/* ------------------------------------------------------------------ */

type TargetOutcome = { attempts: number; answered: boolean; skipped: boolean };

/** For each target: how often the interviewer asked about it and how the user answered. */
function targetOutcomes(msgs: TranscriptMessage[], meta: Record<string, MessageMeta>, minWords: number): Map<string, TargetOutcome> {
  const out = new Map<string, TargetOutcome>();
  msgs.forEach((m, i) => {
    if (m.role !== "assistant") return;
    const target = meta[m.id]?.target;
    if (!target) return;
    const o = out.get(target) ?? { attempts: 0, answered: false, skipped: false };
    o.attempts++;
    const next = msgs.slice(i + 1).find((x) => x.role === "user");
    if (next) {
      if (isSubstantive(next.content, minWords)) o.answered = true;
      else if (isSkipAnswer(next.content)) o.skipped = true;
    }
    out.set(target, o);
  });
  return out;
}

export function threadHasPhoto(thread: TranscriptMessage[]): boolean {
  return thread.some((m) => m.role === "user" && m.photoIds.length > 0);
}

export function threadPhotoDeferred(thread: TranscriptMessage[], state: InterviewState): boolean {
  return thread.some((m) => m.role === "assistant" && state.photoLater.includes(m.id));
}

/** Story depth for one thread: heuristics ∪ answered targeted questions ∪ model check. */
export function storyCoverage(thread: TranscriptMessage[], state: InterviewState): CoverageItem[] {
  const signals = detectStorySignals(userText(thread));
  const outcomes = targetOutcomes(thread, state.meta, 6);
  const firstUser = thread.find((m) => m.role === "user");
  const llm = state.llm && firstUser && state.llm.threadStart === firstUser.id ? new Set(state.llm.covered) : new Set<string>();
  const items: CoverageItem[] = STORY_ELEMENTS.map((el) => {
    const o = outcomes.get(el.key);
    const covered = signals[el.key as keyof typeof signals] || o?.answered || llm.has(el.key);
    return { key: el.key, label: el.label, hint: el.hint, status: covered ? "covered" : o?.skipped ? "skipped" : "missing" };
  });
  items.push({
    key: PHOTO_ELEMENT.key,
    label: PHOTO_ELEMENT.label,
    hint: PHOTO_ELEMENT.hint,
    status: threadHasPhoto(thread) ? "covered" : threadPhotoDeferred(thread, state) ? "skipped" : "missing",
  });
  return items;
}

export function positioningCoverage(messages: TranscriptMessage[], state: InterviewState): CoverageItem[] {
  const outcomes = targetOutcomes(messages, state.meta, 4);
  const llm = new Set(state.llm?.covered ?? []);
  return POSITIONING_AREAS.map((a) => {
    const o = outcomes.get(a.key);
    const covered = o?.answered || llm.has(a.key);
    return { key: a.key, label: a.label, hint: a.hint, status: covered ? "covered" : o?.skipped ? "skipped" : "missing" };
  });
}

/** 0..1 — skipped items count half (the user was asked, there was nothing to tell). */
export function depthScore(items: CoverageItem[]): number {
  if (items.length === 0) return 0;
  const pts = items.reduce((s, i) => s + (i.status === "covered" ? 1 : i.status === "skipped" ? 0.5 : 0), 0);
  return pts / items.length;
}

/** Memory strength (1-5) implied by coverage, ignoring the photo. */
export function strengthFromCoverage(items: CoverageItem[]): number {
  const story = items.filter((i) => i.key !== PHOTO_ELEMENT.key);
  const covered = story.filter((i) => i.status === "covered").length;
  return Math.max(1, Math.min(5, 1 + Math.round((4 * covered) / Math.max(1, story.length))));
}

/* ------------------------------------------------------------------ */
/* Turn bookkeeping                                                    */
/* ------------------------------------------------------------------ */

export type ReplyIntent = "photo-later" | undefined;

/**
 * After a wrap or closing line: does this reply mean "nothing more" rather than a new story?
 * Covers "that's it", "ok thanks", "no", "nope, all good", "I don't know" and a bare photo.
 */
export function isFinishingReply(text: string): boolean {
  if (isDoneSignal(text) || isAcknowledgement(text) || isSkipAnswer(text)) return true;
  const t = text.trim().toLowerCase().replace(/^[¡¿]+\s*/, "").replace(/[.!]+$/, "");
  return /^(?:(?:no|nope|nah|nop|não|nein|non)(?:[,.!]*\s*(?:thanks?|thank you|gracias|muchas gracias|obrigad[oa]|grazie|merci|danke|all good|that'?s (?:it|all)|eso es todo|ya est[aá]|nada m[aá]s|estoy bien|i'?m (?:good|done|fine)|not (?:now|today)))*|not (?:really|now|today)|maybe later)$/u.test(t);
}

function lastAssistantBefore(messages: TranscriptMessage[], index: number): TranscriptMessage | undefined {
  for (let i = index - 1; i >= 0; i--) if (messages[i].role === "assistant") return messages[i];
  return undefined;
}

/**
 * Update the state for a user message that was just stored (the last item in `messages`):
 * open a new story thread after a wrap, record "remind me later" for an unanswered photo
 * request. Returns a new state object.
 */
export function applyUserTurn(kind: ActiveInterviewKind, messages: TranscriptMessage[], state: InterviewState, intent: ReplyIntent): InterviewState {
  const idx = messages.length - 1;
  const user = messages[idx];
  if (!user || user.role !== "user") return state;
  const prev = lastAssistantBefore(messages, idx);
  const prevStage = prev ? state.meta[prev.id]?.stage : undefined;
  const next: InterviewState = { ...state, threadStarts: [...state.threadStarts], photoLater: [...state.photoLater] };
  if (kind !== "story" || !prev) return next;
  if (prevStage === "photo" && user.photoIds.length === 0 && !next.photoLater.includes(prev.id)) {
    // Either "Remind me later" or an answer without a photo: don't ask again for this story.
    next.photoLater.push(prev.id);
  } else if (intent === "photo-later") {
    const pending = [...messages].reverse().find((m) => m.role === "assistant" && state.meta[m.id]?.stage === "photo");
    if (pending && !next.photoLater.includes(pending.id)) next.photoLater.push(pending.id);
  }
  if ((prevStage === "wrap" || prevStage === "closing") && !isFinishingReply(user.content) && intent !== "photo-later" && !next.threadStarts.includes(user.id)) {
    next.threadStarts.push(user.id);
  }
  return next;
}

/* ------------------------------------------------------------------ */
/* Deciding the next move                                              */
/* ------------------------------------------------------------------ */

export type Decision = {
  stage: Stage;
  /** Coverage item / positioning area the next question targets. */
  target?: string;
  /** Suggested wording the model adapts. */
  probe?: Probe;
  /** The first assistant message of the session (say hello). */
  firstMessage: boolean;
  /** Story: the last answer was a generality → ask for one specific time first. */
  generic?: boolean;
  /** Story: the user skipped the photo for this thread ("remind me later"). */
  photoDeferred?: boolean;
  /** Story: people are involved → ask about anonymity at the wrap. */
  mentionsPeople?: boolean;
  /** Labels of what is already covered (so the model doesn't re-ask). */
  covered: string[];
  /** Labels of what is still missing, most important first. */
  missing: string[];
};

export function decideNext(kind: ActiveInterviewKind, messages: TranscriptMessage[], state: InterviewState): Decision {
  const firstMessage = !messages.some((m) => m.role === "assistant");
  const last = messages[messages.length - 1];
  const prev = last ? lastAssistantBefore(messages, messages.length - (last.role === "user" ? 1 : 0)) : undefined;
  const prevStage = prev ? state.meta[prev.id]?.stage : undefined;
  const lastUser = last?.role === "user" ? last : undefined;
  return kind === "positioning"
    ? decidePositioning(messages, state, { firstMessage, prevStage, prevTarget: prev ? state.meta[prev.id]?.target : undefined, lastUser })
    : decideStory(messages, state, { firstMessage, prevStage, lastUser });
}

function labelsBy(items: CoverageItem[], pred: (i: CoverageItem) => boolean) {
  return items.filter(pred).map((i) => i.label.toLowerCase());
}

function decideStory(
  messages: TranscriptMessage[],
  state: InterviewState,
  ctx: { firstMessage: boolean; prevStage?: Stage; lastUser?: TranscriptMessage },
): Decision {
  const thread = currentThread(messages, state);
  const coverage = storyCoverage(thread, state);
  const base = {
    firstMessage: ctx.firstMessage,
    covered: labelsBy(coverage, (i) => i.status === "covered" && i.key !== "photo"),
    missing: labelsBy(coverage, (i) => i.status === "missing" && i.key !== "photo"),
  };
  const hasPhoto = threadHasPhoto(thread);
  const deferred = threadPhotoDeferred(thread, state);
  const mentionsPeople = coverage.find((i) => i.key === "people")?.status === "covered";
  const wrap = (): Decision => ({ ...base, stage: "wrap", photoDeferred: deferred && !hasPhoto, mentionsPeople });
  const askedCaption = thread.some((m) => m.role === "assistant" && state.meta[m.id]?.stage === "photo-caption");
  const photoStep = (): Decision =>
    hasPhoto ? (askedCaption ? wrap() : { ...base, stage: "photo-caption", target: "photo", probe: CAPTION_PROBE }) : deferred ? wrap() : { ...base, stage: "photo", target: "photo", probe: PHOTO_PROBE };

  const lastUser = ctx.lastUser;
  if (!messages.some((m) => m.role === "user") || !lastUser) return { ...base, stage: "opening" };

  switch (ctx.prevStage) {
    case "photo":
      return lastUser.photoIds.length > 0 ? { ...base, stage: "photo-caption", target: "photo", probe: CAPTION_PROBE } : wrap();
    case "photo-caption":
      return wrap();
    case "wrap":
    case "closing":
      if (isFinishingReply(lastUser.content)) return { ...base, stage: "closing" };
      break; // a new thread was opened by applyUserTurn → keep mining
  }

  if (isDoneSignal(lastUser.content)) return photoStep();

  const userTurns = thread.filter((m) => m.role === "user").length;
  const attempts = new Map<string, number>();
  for (const m of thread) {
    const t = m.role === "assistant" ? state.meta[m.id]?.target : undefined;
    if (t) attempts.set(t, (attempts.get(t) ?? 0) + 1);
  }
  const nextItem = STORY_ELEMENTS.find((el) => coverage.find((c) => c.key === el.key)?.status === "missing" && !attempts.get(el.key));
  if (!nextItem || userTurns >= MAX_THREAD_TURNS) {
    // Before the photo: a consent check when other people are in the story (F20).
    if (mentionsPeople && !attempts.get("privacy")) {
      return { ...base, stage: "probe", target: "privacy", probe: PRIVACY_PROBE };
    }
    return photoStep();
  }

  const threadIndex = splitThreads(messages, state.threadStarts).length - 1;
  const probe = nextItem.probes[threadIndex % nextItem.probes.length];
  const askedSpecific = thread.some((m) => m.role === "assistant" && state.meta[m.id]?.generic);
  if (!askedSpecific && isGenericAnswer(lastUser.content)) {
    return { ...base, stage: "probe", target: nextItem.key, probe: SPECIFIC_PROBE, generic: true };
  }
  return { ...base, stage: "probe", target: nextItem.key, probe };
}

function decidePositioning(
  messages: TranscriptMessage[],
  state: InterviewState,
  ctx: { firstMessage: boolean; prevStage?: Stage; prevTarget?: string; lastUser?: TranscriptMessage },
): Decision {
  const coverage = positioningCoverage(messages, state);
  const base = {
    firstMessage: ctx.firstMessage,
    covered: labelsBy(coverage, (i) => i.status === "covered"),
    missing: labelsBy(coverage, (i) => i.status === "missing"),
  };
  const first = POSITIONING_AREAS[0];
  const lastUser = ctx.lastUser;
  if (!messages.some((m) => m.role === "user") || !lastUser) return { ...base, stage: "opening", target: first.key, probe: first.question };

  if (ctx.prevStage === "pos-wrap" || ctx.prevStage === "pos-followup" || ctx.prevStage === "closing") {
    return isFinishingReply(lastUser.content) ? { ...base, stage: "closing" } : { ...base, stage: "pos-followup" };
  }
  if (isDoneSignal(lastUser.content)) return { ...base, stage: "pos-wrap" };

  const askedExample = new Set(messages.filter((m) => m.role === "assistant" && state.meta[m.id]?.stage === "pos-example").map((m) => state.meta[m.id]?.target));
  if (ctx.prevTarget && !askedExample.has(ctx.prevTarget) && !isSkipAnswer(lastUser.content) && wordCount(lastUser.content) < 6) {
    return { ...base, stage: "pos-example", target: ctx.prevTarget, probe: POSITIONING_EXAMPLE_PROBE };
  }

  const asked = new Set(messages.filter((m) => m.role === "assistant").map((m) => state.meta[m.id]?.target));
  const nextArea = POSITIONING_AREAS.find((a) => coverage.find((c) => c.key === a.key)?.status === "missing" && !asked.has(a.key));
  if (!nextArea) return { ...base, stage: "pos-wrap" };
  return { ...base, stage: "pos-question", target: nextArea.key, probe: nextArea.question };
}

/**
 * The part of a story thread the extractor should read: the story itself, without the
 * photo request, the caption exchange, the privacy check or the wrap. The privacy answer
 * comes back separately so the extractor can respect it.
 */
export function storyExtractionTranscript(thread: TranscriptMessage[], meta: Record<string, MessageMeta>): { messages: TranscriptMessage[]; privacy: string | null } {
  const skip = new Set<Stage>(["photo", "photo-caption", "wrap", "closing"]);
  const out: TranscriptMessage[] = [];
  let privacy: string | null = null;
  let prev: MessageMeta | undefined;
  for (const m of thread) {
    if (m.role === "assistant") {
      prev = meta[m.id];
      if (prev?.target === "privacy" || (prev && skip.has(prev.stage))) continue;
      out.push(m);
      continue;
    }
    if (prev?.target === "privacy") {
      if (m.content.trim()) privacy = m.content.trim();
      continue;
    }
    if (prev && skip.has(prev.stage)) continue;
    out.push(m);
  }
  return { messages: out, privacy };
}

/* ------------------------------------------------------------------ */
/* Targeting a story interview                                         */
/* ------------------------------------------------------------------ */

export type PillarInput = { id: string; name: string; weight: number; storyPrompts: string[] };
export type MemoryInput = { pillar: string | null; status: string };
export type PillarStat = { id: string; ready: number; total: number };

export function pillarStats(pillars: PillarInput[], memories: MemoryInput[]): PillarStat[] {
  return pillars.map((p) => ({
    id: p.id,
    ready: memories.filter((m) => m.pillar === p.id && m.status === "ready").length,
    total: memories.filter((m) => m.pillar === p.id && m.status !== "archived").length,
  }));
}

/** The pillar that most needs stories: fewest ready memories relative to its weight. */
export function neediestPillar(pillars: PillarInput[], memories: MemoryInput[]): string | null {
  if (pillars.length === 0) return null;
  const stats = pillarStats(pillars, memories);
  const scored = pillars.map((p, i) => ({ id: p.id, ready: stats[i].ready, weight: p.weight, order: i }));
  scored.sort((a, b) => a.ready - b.ready || b.weight - a.weight || a.order - b.order);
  return scored[0].id;
}

export type StoryPlan = { pillarId: string | null; seed: string; source: "pillar" | "theme"; themeId: string | null };

const normSeed = (s: string) => s.trim().toLowerCase();

function pick<T>(items: T[], rng: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/**
 * Choose the pillar and opening question for a story interview.
 *  - explicit theme → an unused prompt from that theme
 *  - otherwise the pillar's own story prompts (from the positioning interview), unused first
 *  - otherwise a bank prompt from the least-used theme
 */
export function planStoryInterview(input: {
  pillars: PillarInput[];
  memories: MemoryInput[];
  previousSeeds: string[];
  pillarId?: string | null;
  themeId?: string | null;
  rng?: () => number;
}): StoryPlan {
  const rng = input.rng ?? Math.random;
  const used = new Set(input.previousSeeds.map(normSeed));
  const pillarId = input.pillarId && input.pillars.some((p) => p.id === input.pillarId) ? input.pillarId : neediestPillar(input.pillars, input.memories);
  const pillar = input.pillars.find((p) => p.id === pillarId);

  const theme = input.themeId ? STORY_THEMES.find((t) => t.id === input.themeId) : undefined;
  if (theme) {
    const fresh = theme.prompts.filter((p) => !used.has(normSeed(p.text)));
    return { pillarId: pillarId ?? null, seed: pick(fresh.length ? fresh : theme.prompts, rng).text, source: "theme", themeId: theme.id };
  }

  const pillarPrompts = (pillar?.storyPrompts ?? []).map((s) => s.trim()).filter(Boolean);
  if (pillarPrompts.length) {
    const fresh = pillarPrompts.filter((s) => !used.has(normSeed(s)));
    if (fresh.length) return { pillarId: pillarId ?? null, seed: pick(fresh, rng), source: "pillar", themeId: null };
  }

  // Least-used theme, ties broken randomly.
  const all = allStoryPrompts();
  const useCount = new Map(STORY_THEMES.map((t) => [t.id, 0]));
  for (const p of all) if (used.has(normSeed(p.text))) useCount.set(p.themeId, (useCount.get(p.themeId) ?? 0) + 1);
  const min = Math.min(...useCount.values());
  const themes = STORY_THEMES.filter((t) => useCount.get(t.id) === min);
  const chosen = pick(themes, rng);
  const fresh = chosen.prompts.filter((p) => !used.has(normSeed(p.text)));
  return { pillarId: pillarId ?? null, seed: pick(fresh.length ? fresh : chosen.prompts, rng).text, source: "theme", themeId: chosen.id };
}

/** "Surprise me": any unused prompt from any theme. */
export function surprisePrompt(previousSeeds: string[], rng: () => number = Math.random): { seed: string; themeId: string } {
  const used = new Set(previousSeeds.map(normSeed));
  const all = allStoryPrompts();
  const fresh = all.filter((p) => !used.has(normSeed(p.text)));
  const p = pick(fresh.length ? fresh : all, rng);
  return { seed: p.text, themeId: p.themeId };
}
