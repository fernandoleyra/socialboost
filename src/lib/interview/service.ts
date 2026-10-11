import "server-only";
import { logActivity } from "@/lib/db";
import { HttpError, streamText } from "@/lib/http";
import { LLMError, chatJson, chatStream, embed } from "@/lib/llm";
import { getRoute } from "@/lib/settings";
import {
  addMessage,
  createInterview,
  createMemory,
  getInterview,
  getMemory,
  getPhoto,
  getProfile,
  getStrategy,
  listInterviews,
  listMemories,
  listMessages,
  memoryEmbeddingText,
  saveStrategy,
  updateInterview,
  updateMemory,
  updatePhoto,
  type Interview,
  type Profile,
} from "@/lib/repo";
import type { Memory, Photo, Strategy } from "@/lib/types";
import { POSITIONING_AREAS } from "./bank";
import {
  applyUserTurn,
  currentThread,
  decideNext,
  depthScore,
  planStoryInterview,
  positioningCoverage,
  splitThreads,
  storyCoverage,
  storyExtractionTranscript,
  strengthFromCoverage,
  threadHasPhoto,
  threadPhotoDeferred,
  type Decision,
} from "./engine";
import { cardToMemory, extractSummary, groundPositioning, mergeStrategy } from "./outputs";
import {
  coverageCheckPrompt,
  formatTranscript,
  interviewerMessages,
  interviewerSystemPrompt,
  isEnglish,
  openingMessage,
  pillarsPrompt,
  positioningPrompt,
  protocolLines,
  questionOnTarget,
  storyCardPrompt,
  type InterviewContext,
} from "./prompts";
import {
  PillarsOnlySchema,
  PositioningCoreSchema,
  PositioningCoverageCheckSchema,
  StoryCoverageCheckSchema,
  storyCardSchema,
  type CreateInterviewBody,
  type FinishBody,
  type ReplyBody,
} from "./schemas";
import { clearInterviewState, getInterviewState, updateInterviewState } from "./store";
import { cleanReply, filterTurn, truncate, wordCount, type TurnFilterOptions } from "./text";
import type { ActiveInterviewKind, InterviewState, InterviewView, PillarChip, TranscriptMessage, ViewMessage } from "./types";
import type { z } from "zod";

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

export function activeKind(i: Pick<Interview, "kind">): ActiveInterviewKind {
  return i.kind === "positioning" ? "positioning" : "story";
}

/** The interview, if it belongs to this profile — otherwise a 404 (never leak other profiles). */
export function getOwnedInterview(profileId: string, id: string): Interview {
  const i = getInterview(id);
  if (!i || i.profileId !== profileId) throw new HttpError(404, "Interview not found", "It may have been deleted. Start a new one from Interviews.");
  return i;
}

function transcriptOf(interviewId: string): (TranscriptMessage & { createdAt: string })[] {
  return listMessages(interviewId)
    .filter((m) => m.role !== "system")
    .map((m) => ({ id: m.id, role: m.role as "assistant" | "user", content: m.content, photoIds: m.photoIds, createdAt: m.createdAt }));
}

function pillarChips(strategy: Strategy | null): PillarChip[] {
  return (strategy?.pillars ?? []).map((p) => ({ id: p.id, name: p.name, color: p.color }));
}

function coverageFor(kind: ActiveInterviewKind, msgs: TranscriptMessage[], state: InterviewState) {
  return kind === "story" ? storyCoverage(currentThread(msgs, state), state) : positioningCoverage(msgs, state);
}

function ownedPhotos(profileId: string, ids: string[]): Photo[] {
  return [...new Set(ids)].map((id) => getPhoto(id)).filter((p): p is Photo => !!p && p.profileId === profileId);
}

/** Everything the interview page needs, in one object (also returned by GET /api/interviews/[id]). */
export function loadInterviewView(profile: Profile, id: string): InterviewView {
  const interview = getOwnedInterview(profile.id, id);
  const kind = activeKind(interview);
  const state = getInterviewState(id);
  const msgs = transcriptOf(id);
  const coverage = coverageFor(kind, msgs, state);
  const strategy = getStrategy(profile.id);

  const messages: ViewMessage[] = msgs.map((m) => ({ ...m, stage: m.role === "assistant" ? (state.meta[m.id]?.stage ?? null) : null }));
  const photos: Record<string, Photo> = {};
  for (const p of ownedPhotos(profile.id, msgs.flatMap((m) => m.photoIds))) photos[p.id] = p;

  const thread = kind === "story" ? currentThread(msgs, state) : msgs;
  let pendingPhotoRequestId: string | null = null;
  if (kind === "story" && interview.status === "active") {
    const idx = thread.map((m) => m.role === "assistant" && state.meta[m.id]?.stage === "photo").lastIndexOf(true);
    if (idx >= 0) {
      const req = thread[idx];
      const answeredWithPhoto = thread.slice(idx + 1).some((m) => m.role === "user" && m.photoIds.length > 0);
      if (!answeredWithPhoto && !state.photoLater.includes(req.id)) pendingPhotoRequestId = req.id;
    }
  }
  const last = msgs[msgs.length - 1];
  const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
  const lastStage = lastAssistant ? state.meta[lastAssistant.id]?.stage : undefined;

  return {
    interview,
    messages,
    photos,
    coverage,
    depth: depthScore(coverage),
    pendingPhotoRequestId,
    threadPhotoDone: kind === "story" && (threadHasPhoto(thread) || threadPhotoDeferred(thread, state)),
    needsReply: interview.status === "active" && (!last || last.role === "user"),
    readyToFinish: !!lastStage && ["wrap", "closing", "pos-wrap", "pos-followup"].includes(lastStage) && last?.role === "assistant",
    threadCount: splitThreads(msgs, state.threadStarts).filter((t) => t.some((m) => m.role === "user")).length,
    pillars: pillarChips(strategy),
    memories: kind === "story" ? listMemories(profile.id).filter((m) => m.interviewId === id) : [],
    strategySummary:
      kind === "positioning" && interview.status === "completed" && strategy
        ? { positioning: strategy.positioning, goals: strategy.goals.slice(0, 4), pillars: pillarChips(strategy) }
        : null,
    language: profile.language,
  };
}

/* ------------------------------------------------------------------ */
/* Creating                                                            */
/* ------------------------------------------------------------------ */

export function startInterview(profile: Profile, body: z.infer<typeof CreateInterviewBody>): Interview {
  if (body.kind === "positioning") {
    // One positioning interview at a time: starting over closes the unfinished one.
    for (const old of listInterviews(profile.id)) if (old.kind === "positioning" && old.status === "active") updateInterview(old.id, { status: "abandoned" });
    const interview = createInterview({ profileId: profile.id, kind: "positioning", title: "Positioning interview", promptSeed: POSITIONING_AREAS[0].question.text });
    logActivity("interview", "Started the positioning interview", { profileId: profile.id, refId: interview.id });
    return interview;
  }

  const strategy = getStrategy(profile.id);
  const pillars = strategy?.pillars ?? [];
  const memories = listMemories(profile.id);
  const validPillar = body.pillar && pillars.some((p) => p.id === body.pillar) ? body.pillar : null;
  // pillar: null means "any topic" (chosen by the user); omitted means "target the pillar that needs stories".
  const anyTopic = body.pillar === null;
  const knownStory = body.knownStory?.trim() || null;

  let pillarId: string | null;
  let seed: string;
  if (knownStory) {
    pillarId = validPillar;
    seed = knownStory;
  } else {
    const plan = planStoryInterview({
      pillars: anyTopic ? [] : pillars,
      memories,
      previousSeeds: listInterviews(profile.id)
        .map((i) => i.promptSeed ?? "")
        .filter(Boolean),
      pillarId: validPillar,
      themeId: body.theme ?? null,
    });
    pillarId = plan.pillarId;
    seed = body.seed?.trim() || plan.seed;
  }

  const pillar = pillars.find((p) => p.id === pillarId);
  const title = knownStory ? truncate(knownStory, 70) : pillar ? `${pillar.name} story` : "Story interview";
  const interview = createInterview({ profileId: profile.id, kind: "story", title, pillar: pillarId, promptSeed: seed });
  // "I already know the story" counts as the first answer; the interviewer picks it up from there.
  if (knownStory) addMessage(interview.id, "user", knownStory);
  logActivity("interview", `Started a story interview${pillar ? ` for ${pillar.name}` : ""}`, { profileId: profile.id, refId: interview.id });
  return interview;
}

export function deleteInterviewData(interviewId: string) {
  clearInterviewState(interviewId);
}

/* ------------------------------------------------------------------ */
/* Replying (streamed)                                                 */
/* ------------------------------------------------------------------ */

function buildContext(profile: Profile, interview: Interview, msgs: TranscriptMessage[], state: InterviewState): InterviewContext {
  const kind = activeKind(interview);
  const strategy = getStrategy(profile.id);
  const pillar = strategy?.pillars.find((p) => p.id === interview.pillar) ?? null;
  const threads = kind === "story" ? splitThreads(msgs, state.threadStarts) : [msgs];
  const audience = strategy ? [strategy.audience.who, strategy.audience.pains.length ? `They struggle with: ${strategy.audience.pains.slice(0, 3).join(", ")}` : ""].filter(Boolean).join(". ") : "";
  return {
    kind,
    name: profile.name,
    headline: profile.headline,
    language: profile.language,
    positioning: strategy?.positioning ?? "",
    audience,
    goals: strategy?.goals ?? [],
    pillar: pillar ? { name: pillar.name, description: pillar.description } : null,
    savedTitles:
      kind === "story"
        ? listMemories(profile.id, { status: "active" })
            .filter((m) => m.interviewId !== interview.id && (!interview.pillar || m.pillar === interview.pillar))
            .slice(0, 10)
            .map((m) => m.title)
        : [],
    avoidTopics: strategy?.avoidTopics ?? [],
    seed: interview.promptSeed,
    earlierThreads: threads
      .slice(0, -1)
      .map((t) => t.find((m) => m.role === "user")?.content ?? "")
      .filter(Boolean),
  };
}

type TurnPlan = { fixed: string } | { filter: TurnFilterOptions; suffix: string | null };

/**
 * How a turn is produced. Protocol lines (greeting, photo request, finish hints) are fixed
 * text in the user's language; the model writes only the short reaction and the question,
 * and an off-target question is swapped for the bank probe (English).
 */
function planTurn(profile: Profile, interview: Interview, ctx: InterviewContext, d: Decision): TurnPlan {
  const proto = protocolLines(profile.language);
  const statement = (maxStatements: number, suffix: string): TurnPlan => ({ filter: { mode: "statement", maxStatements, maxChars: 320 }, suffix });
  const free: TurnPlan = { filter: { mode: "free", maxStatements: 0, maxChars: 560 }, suffix: null };
  switch (d.stage) {
    case "opening": {
      const returning = listInterviews(profile.id).some((i) => i.id !== interview.id && i.kind === interview.kind && i.status === "completed");
      const variant = [...interview.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
      const text = openingMessage(ctx, { returning, variant });
      return text ? { fixed: text } : { filter: { mode: "question", maxStatements: 3, maxChars: 600 }, suffix: null };
    }
    case "closing":
      return proto ? { fixed: interview.kind === "positioning" ? proto.closingPositioning : proto.closingStory } : free;
    case "probe":
    case "pos-question":
    case "pos-example": {
      const target = d.stage === "pos-example" ? "example" : d.generic ? "specific" : d.target;
      const check = isEnglish(profile.language) && d.probe ? { accept: (q: string) => questionOnTarget(target, q), fallbackQuestion: d.probe.text } : {};
      return { filter: { mode: "question", maxStatements: d.firstMessage ? 2 : 1, maxChars: 420, ...check }, suffix: null };
    }
    case "photo":
      return proto ? statement(1, proto.photoAsk) : { filter: { mode: "question", maxStatements: 1, maxChars: 420 }, suffix: null };
    case "photo-caption":
      return proto ? statement(1, proto.captionAsk) : { filter: { mode: "question", maxStatements: 1, maxChars: 420 }, suffix: null };
    case "wrap":
      return proto ? statement(2, d.photoDeferred ? proto.wrapDeferred : proto.wrap) : free;
    case "pos-wrap":
      return proto ? statement(1, proto.posWrap) : free;
    case "pos-followup":
      return proto ? statement(1, proto.posFollowup) : free;
  }
}

/**
 * Store the user's answer (if any), decide the next move and stream the interviewer's
 * reply. The answer is saved before generation, so a failed or cancelled turn can be
 * retried by posting an empty answer.
 */
export function replyStream(profile: Profile, id: string, body: z.infer<typeof ReplyBody>, signal: AbortSignal): Response {
  const interview = getOwnedInterview(profile.id, id);
  if (interview.status === "completed") throw new HttpError(409, "This interview is already saved.", "Start a new interview to tell another story.");
  if (interview.status !== "active") throw new HttpError(409, "This interview was ended without saving.", "Tap Reopen to keep going, or start a new interview.");
  const kind = activeKind(interview);

  let msgs = transcriptOf(id);
  const content = body.content.trim();
  const photos = ownedPhotos(profile.id, body.photoIds);
  if (photos.length !== new Set(body.photoIds).size) throw new HttpError(400, "One of the photos couldn't be found.", "Upload it again.");

  if (content || photos.length || body.intent === "photo-later") {
    const text = content || (body.intent === "photo-later" ? "No photo right now. I'll add one later." : "");
    addMessage(id, "user", text, photos.map((p) => p.id));
    msgs = transcriptOf(id);
    const updated = msgs;
    const state = updateInterviewState(id, (s) => applyUserTurn(kind, updated, s, body.intent));
    if (content) saveCaption(profile.id, currentThread(msgs, state), state, content);
  } else if (msgs.length > 0 && msgs[msgs.length - 1].role === "assistant") {
    throw new HttpError(400, "Type an answer first.");
  }

  const state = getInterviewState(id);
  const decision = decideNext(kind, msgs, state);
  const ctx = buildContext(profile, interview, msgs, state);
  const plan = planTurn(profile, interview, ctx, decision);

  const upstream = new AbortController();
  const onAbort = () => upstream.abort();
  signal.addEventListener("abort", onAbort, { once: true });

  async function* reply(): AsyncGenerator<string> {
    if ("fixed" in plan) {
      yield plan.fixed;
      return;
    }
    const thread = kind === "story" ? currentThread(msgs, state) : msgs;
    const source = chatStream({
      task: "interviewer",
      system: interviewerSystemPrompt(ctx),
      messages: interviewerMessages(ctx, thread, decision, plan.filter.mode === "free" ? "free" : "protocol", {
        noteInUserTurn: getRoute("interviewer")?.provider.kind === "openai",
      }),
      maxTokens: 260,
      signal: upstream.signal,
    });
    let text = "";
    for await (const piece of filterTurn(source, plan.filter, () => upstream.abort())) {
      text += piece;
      yield piece;
    }
    if (plan.suffix) {
      const extra = (text ? "\n\n" : "") + plan.suffix;
      text += extra;
      yield extra;
    }
    if (!text.trim()) throw new LLMError("The model sent back an empty reply.", "Try again, or pick another model for the Interviewer task in Settings → Models.");
  }

  return streamText(reply(), (full) => {
    signal.removeEventListener("abort", onAbort);
    const msg = addMessage(id, "assistant", cleanReply(full));
    recordMeta(id, msg.id, decision);
  });
}

/** The answer to "what's the one line you'd tell a friend about this photo?" becomes the photo's note. */
function saveCaption(profileId: string, thread: TranscriptMessage[], state: InterviewState, answer: string) {
  const idx = thread.length - 1;
  const prev = [...thread.slice(0, idx)].reverse().find((m) => m.role === "assistant");
  if (!prev || state.meta[prev.id]?.stage !== "photo-caption") return;
  const photoMsg = [...thread].reverse().find((m) => m.role === "user" && m.photoIds.length > 0);
  for (const p of ownedPhotos(profileId, photoMsg?.photoIds ?? [])) if (!p.userNote) updatePhoto(p.id, { userNote: answer.slice(0, 500) });
}

function recordMeta(interviewId: string, messageId: string, d: Decision) {
  updateInterviewState(interviewId, (s) => ({
    ...s,
    meta: { ...s.meta, [messageId]: { stage: d.stage, ...(d.target ? { target: d.target } : {}), ...(d.probe ? { probeId: d.probe.id } : {}), ...(d.generic ? { generic: true } : {}) } },
  }));
}

/**
 * Model-based coverage check, run after a reply every few answers. It catches what the
 * keyword heuristics miss (other languages, paraphrases) so the interviewer doesn't ask
 * for things the user already told. Failures are ignored: heuristics still work.
 */
export async function refreshCoverage(interviewId: string): Promise<void> {
  const interview = getInterview(interviewId);
  if (!interview || interview.status !== "active") return;
  const kind = activeKind(interview);
  const state = getInterviewState(interviewId);
  const msgs = transcriptOf(interviewId);
  const thread = kind === "story" ? currentThread(msgs, state) : msgs;
  const users = thread.filter((m) => m.role === "user");
  if (users.length < 2) return;
  const threadStart = users[0].id;
  if (state.llm && state.llm.threadStart === threadStart && users.length - state.llm.userTurns < 3) return;
  const heuristic = coverageFor(kind, msgs, { ...state, llm: null });
  if (!heuristic.some((i) => i.status === "missing" && i.key !== "photo")) return;

  const name = getProfile(interview.profileId)?.name ?? "the user";
  const prompt = coverageCheckPrompt(kind, name, formatTranscript(thread, name, transcriptBudget(12000, 300)));
  const opts = { task: "extractor" as const, system: prompt.system, messages: [{ role: "user" as const, content: prompt.user }], temperature: 0, maxTokens: 300 };
  try {
    const result: Record<string, boolean> = kind === "story" ? await chatJson(StoryCoverageCheckSchema, opts) : await chatJson(PositioningCoverageCheckSchema, opts);
    const covered = Object.entries(result)
      .filter(([, v]) => v === true)
      .map(([k]) => k);
    updateInterviewState(interviewId, (s) => ({ ...s, llm: { threadStart, covered, userTurns: users.length } }));
  } catch (err) {
    console.warn(`[interview] coverage check skipped: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/* ------------------------------------------------------------------ */
/* Finishing                                                           */
/* ------------------------------------------------------------------ */

export type FinishResult = { interview: Interview; memories: Memory[]; strategy: Strategy | null };

const finishing = new Set<string>();

export async function finishInterview(profile: Profile, id: string, body: z.infer<typeof FinishBody>): Promise<FinishResult> {
  const interview = getOwnedInterview(profile.id, id);
  if (interview.status === "completed") {
    return { interview, memories: listMemories(profile.id).filter((m) => m.interviewId === id), strategy: getStrategy(profile.id) };
  }
  if (finishing.has(id)) throw new HttpError(409, "Already saving this interview.", "Give it a moment — local models can take a minute.");
  finishing.add(id);
  try {
    const msgs = transcriptOf(id);
    const userWords = msgs.filter((m) => m.role === "user").reduce((n, m) => n + wordCount(m.content), 0);
    if (userWords < 15) {
      throw new HttpError(400, "There isn't enough here to save yet.", "Answer a few more questions first, or end the interview without saving.");
    }
    return activeKind(interview) === "positioning" ? await finishPositioning(profile, interview, msgs) : await finishStory(profile, interview, msgs, body.photoIds);
  } finally {
    finishing.delete(id);
  }
}

/**
 * How much transcript fits an extractor call. Ollama silently drops the start of a prompt
 * that overflows num_ctx (the instructions would go first), so budget from the configured
 * context: ~3 characters per token, minus the reply and the prompt around the transcript.
 */
function transcriptBudget(maxChars: number, replyTokens: number): number {
  const r = getRoute("extractor");
  if (!r || r.provider.kind !== "ollama") return maxChars;
  return Math.max(4000, Math.min(maxChars, (r.numCtx - replyTokens - 1200) * 3));
}

/** Node's fetch gives up on a response whose headers take over 5 minutes (non-streamed calls). */
const SLOW_CALL_MS = 290_000;

async function timed<T>(fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    return await fn();
  } catch (err) {
    if (err instanceof LLMError && Date.now() - t0 >= SLOW_CALL_MS) {
      throw new LLMError(
        "The model took more than 5 minutes to answer, so the request was dropped. Nothing was lost: your interview is still here.",
        "Try again when the machine is less busy, or pick a smaller or faster model for the Extractor task in Settings → Models.",
      );
    }
    throw err;
  }
}

async function finishPositioning(profile: Profile, interview: Interview, msgs: TranscriptMessage[]): Promise<FinishResult> {
  // Two small calls instead of one big one: local models on a CPU stay well under the 5-minute limit.
  const prompt = positioningPrompt({
    name: profile.name,
    headline: profile.headline,
    language: profile.language,
    transcript: formatTranscript(msgs, profile.name, transcriptBudget(24000, 1200)),
  });
  // Ground the extract in what the person actually said: drops off-limits topics that only appeared
  // in the interviewer's own questions and strips currencies the person never named.
  const core = groundPositioning(
    await timed(() =>
      chatJson(PositioningCoreSchema, { task: "extractor", system: prompt.system, messages: [{ role: "user", content: prompt.user }], maxTokens: 1200 }),
    ),
    msgs,
  );
  const summary = extractSummary({ ...core, pillars: [] }) || formatTranscript(msgs, profile.name, 6000);
  const p = pillarsPrompt({ name: profile.name, language: profile.language, summary });
  let pillars = (await timed(() => chatJson(PillarsOnlySchema, { task: "extractor", system: p.system, messages: [{ role: "user", content: p.user }], maxTokens: 900 }))).pillars;
  if (pillars.filter((x) => x.name.trim()).length < 2) {
    // Small models sometimes return an empty list; one more try.
    pillars = (await timed(() => chatJson(PillarsOnlySchema, { task: "extractor", system: p.system, messages: [{ role: "user", content: p.user }], maxTokens: 900, temperature: 0.5 }))).pillars;
  }
  const existing = getStrategy(profile.id);
  const strategy = mergeStrategy(existing, { ...core, pillars }, { language: profile.language });
  saveStrategy(profile.id, strategy);
  const updated = updateInterview(interview.id, { status: "completed", title: "Positioning interview", summary: strategy.positioning || "Strategy drafted from the interview." });
  logActivity("strategy", existing ? "Strategy updated from the positioning interview" : "Strategy drafted from the positioning interview", {
    profileId: profile.id,
    refId: interview.id,
  });
  return { interview: updated, memories: [], strategy };
}

async function finishStory(profile: Profile, interview: Interview, msgs: TranscriptMessage[], extraPhotoIds: string[]): Promise<FinishResult> {
  const state = getInterviewState(interview.id);
  const strategy = getStrategy(profile.id);
  const pillars = strategy?.pillars ?? [];
  const schema = storyCardSchema(pillars.map((p) => p.name));

  const userWords = (t: TranscriptMessage[]) => t.filter((m) => m.role === "user").reduce((n, m) => n + wordCount(m.content), 0);
  let threads = splitThreads(msgs, state.threadStarts).filter((t) => userWords(t) >= 12);
  if (threads.length === 0) threads = [msgs];

  const extraPhotos = ownedPhotos(profile.id, extraPhotoIds).map((p) => p.id);
  const cards: { memory: ReturnType<typeof cardToMemory>; photoIds: string[] }[] = [];
  for (const [i, thread] of threads.entries()) {
    const story = storyExtractionTranscript(thread, state.meta);
    const prompt = storyCardPrompt({
      name: profile.name,
      headline: profile.headline,
      language: profile.language,
      pillars: pillars.map((p) => ({ name: p.name, description: p.description })),
      transcript: formatTranscript(story.messages, profile.name, transcriptBudget(16000, 1400)),
      privacy: story.privacy,
    });
    const card = await timed(() => chatJson(schema, { task: "extractor", system: prompt.system, messages: [{ role: "user", content: prompt.user }], maxTokens: 1400 }));
    const users = thread.filter((m) => m.role === "user");
    const memory = cardToMemory(card, {
      userTexts: users.map((m) => m.content),
      pillars,
      presetPillarId: interview.pillar,
      coverageStrength: strengthFromCoverage(storyCoverage(thread, state)),
    });
    const photoIds = [...new Set([...users.flatMap((m) => m.photoIds), ...(i === threads.length - 1 ? extraPhotos : [])])];
    cards.push({ memory, photoIds });
  }

  const vectors = await embed(cards.map((c) => memoryEmbeddingText(c.memory)));
  const memories: Memory[] = cards.map((c, i) => {
    const created = createMemory(profile.id, c.memory, { interviewId: interview.id, embedding: vectors?.[i] ?? null });
    for (const p of ownedPhotos(profile.id, c.photoIds)) updatePhoto(p.id, { memoryId: created.id });
    // Thin stories stay in the bank as drafts so the planner doesn't build posts on them.
    if (c.memory.strength <= 2) updateMemory(created.id, { status: "raw" });
    return getMemory(created.id)!;
  });

  const titles = memories.map((m) => m.title);
  const updated = updateInterview(interview.id, {
    status: "completed",
    title: titles.length > 1 ? `${titles[0]} (+${titles.length - 1} more)` : titles[0],
    summary: titles.length > 1 ? `Saved ${titles.length} stories: ${titles.join("; ")}` : `Saved: ${titles[0]}`,
  });
  return { interview: updated, memories, strategy: null };
}
