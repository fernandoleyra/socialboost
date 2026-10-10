import "server-only";
import { z } from "zod";
import { logActivity } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { LLMError, chat, chatJson, chatStream } from "@/lib/llm";
import { getMemory, getPost, updatePost } from "@/lib/repo";
import type { Critique, Post } from "@/lib/types";
import { AnglesResponseSchema, HooksResponseSchema, cleanHook, normalizeAngles, parseAngleField, serializeAngleField, toAngle, type Angle, type AngleField, type HookOption } from "./angles";
import { cleanPost } from "./clean";
import { loadContext, type FactoryContext } from "./context";
import { lintPost, type LintResult } from "./lint";
import { applyHumanEdit, postLabel } from "./posts";
import { anglesPrompt, critiquePrompt, draftPrompt, hooksPrompt, instructionsFromCritique, instructionsFromLint, revisePrompt, type Prompt } from "./prompts";
import { buildQuality, dropUnfoundedInventions, isCritiqueFresh, qualityGate, relint } from "./quality";
import { REWRITABLE, statusAfterGeneration } from "./status";
import { getStructure, recommendStructures, type StructureId } from "./structures";
import { saveGeneratedVersion, snapshotBeforeGeneration } from "./versions";

/**
 * The post factory: angle → draft → lint + critique → revise → human.
 *
 * Every model call names its task (writer for prose and angles, critic for scoring) so the
 * user's routing table decides which local or hosted model does the work. Prose is streamed and
 * never asked for as JSON; structured steps go through chatJson.
 */

const WRITER_MAX_TOKENS = 1600;

/**
 * Non-streamed calls only get response headers once the model has finished. Node's fetch gives up
 * after ~300 s without headers and reports "fetch failed", which reads like "Ollama is down".
 * Translate that case into what actually happened.
 */
async function slowSafe<T>(fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    return await fn();
  } catch (err) {
    if (err instanceof LLMError && /fetch failed/i.test(err.message) && Date.now() - started > 240_000) {
      throw new LLMError(
        "The model took more than 4 minutes to answer and the connection timed out.",
        "Your machine may be busy with other model requests. Try again in a moment, or pick a smaller, faster model for this task in Settings → Models.",
      );
    }
    throw err;
  }
}

function messages(p: Prompt) {
  return { system: p.system, messages: p.messages };
}

function requireStory(post: Post) {
  if (!post.memoryId) throw new HttpError(400, "This post has no story attached.", "Start the post from a memory in the Studio, or write it yourself and use Revise.");
}

function requireRewritable(post: Post) {
  if (!REWRITABLE.includes(post.status)) throw new HttpError(409, post.status === "published" ? "This post is already published." : "This post is archived.", "Start a new post from the same story instead.");
}

function lintFor(ctx: FactoryContext, body: string, extraFacts?: string): LintResult {
  const facts = ctx.memoryFull ? ctx.facts : extraFacts ? `${ctx.facts}\n${extraFacts}` : undefined;
  return lintPost(body, ctx.stats, { facts, notes: ctx.memoryFull?.story || undefined, neverSay: ctx.neverSay });
}

function setAngleField(post: Post, field: AngleField, extra: Partial<Post> = {}): Post {
  return updatePost(post.id, { angle: serializeAngleField(field), ...extra });
}

/** Persist a generated text: clean it, lint it, version it, move the status along. */
function finalizeGeneration(postId: string, ctx: FactoryContext, raw: string, source: "ai" | "revision", note: string, extraFacts?: string): Post {
  const body = cleanPost(raw);
  if (!body) throw new LLMError("The model returned an empty post.", "Try again, or choose a larger writer model in Settings → Models.");
  const current = getPost(postId);
  if (!current) throw new HttpError(404, "Post not found");
  const lint = lintFor(ctx, body, extraFacts);
  saveGeneratedVersion(postId, body, source, note);
  const quality = relint(current.quality, body, lint.issues, lint.score);
  return updatePost(postId, { body, quality, status: statusAfterGeneration(current.status), error: null });
}

/* ------------------------------------------------------------------ */
/* Angles                                                              */
/* ------------------------------------------------------------------ */

export async function generateAngles(post: Post, signal?: AbortSignal): Promise<{ angles: Angle[]; post: Post }> {
  requireStory(post);
  requireRewritable(post);
  const ctx = await loadContext(post);
  const recommended = recommendStructures(ctx.memoryFull!, { hasPhoto: !!post.photoId });
  const res = await slowSafe(() => chatJson(AnglesResponseSchema, { task: "writer", ...messages(anglesPrompt(ctx, recommended)), temperature: 0.7, maxTokens: 1400, signal }));
  const angles = normalizeAngles(res.angles, recommended[0]);
  if (!angles.length) throw new LLMError("The model didn't return usable angles.", "Try again, or choose a larger writer model in Settings → Models.");
  const field = parseAngleField(post.angle);
  const updated = setAngleField(post, { ...field, options: angles });
  return { angles, post: updated };
}

/** Which angle a draft uses: an explicit one, an option by index, the saved one, or none. */
export function resolveAngle(post: Post, input: { angle?: Angle | null; angleIndex?: number | null }): { angle: Angle | null; field: AngleField } {
  const field = parseAngleField(post.angle);
  if (input.angle) {
    const a = toAngle(input.angle);
    if (a) return { angle: a, field: { ...field, selected: a } };
  }
  if (input.angleIndex !== undefined && input.angleIndex !== null) {
    const a = field.options[input.angleIndex];
    if (!a) throw new HttpError(400, "That angle doesn't exist anymore.", "Suggest angles again.");
    return { angle: a, field: { ...field, selected: a } };
  }
  return { angle: field.selected, field };
}

/* ------------------------------------------------------------------ */
/* Draft                                                               */
/* ------------------------------------------------------------------ */

export async function draftStream(post: Post, input: { angle?: Angle | null; angleIndex?: number | null; signal?: AbortSignal }) {
  requireStory(post);
  requireRewritable(post);
  const { angle, field } = resolveAngle(post, input);
  let current = post;
  const memory = getMemory(post.memoryId!);
  if (!memory) throw new HttpError(404, "The story behind this post was deleted.", "Pick another memory, or write the post yourself.");
  const structureId: StructureId = angle?.structureId ?? recommendStructures(memory, { hasPhoto: !!post.photoId })[0];
  const structure = getStructure(structureId)!;
  current = setAngleField(current, field, { format: structure.format });
  snapshotBeforeGeneration(current.id, current.body);
  const ctx = await loadContext(current);
  const prompt = draftPrompt(ctx, angle, structureId);
  const gen = chatStream({ task: "writer", ...messages(prompt), maxTokens: WRITER_MAX_TOKENS, signal: input.signal });
  const onDone = (full: string) => {
    const saved = finalizeGeneration(current.id, ctx, full, "ai", `Draft · ${structure.name}`);
    logActivity("post", `Drafted: ${postLabel(saved)}`, { profileId: saved.profileId, refId: saved.id });
  };
  return { gen, onDone };
}

/* ------------------------------------------------------------------ */
/* Critique                                                            */
/* ------------------------------------------------------------------ */

/**
 * What the critic fills in. Scores are plain numbers here and clamped to 1-10 afterwards, so a
 * small model answering 0 or 11 doesn't fail the whole critique on validation.
 */
const CritiqueReply = z.object({
  humanness: z.number(),
  specificity: z.number(),
  voiceMatch: z.number(),
  hook: z.number(),
  issues: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([]),
});

function tidyCritique(c: z.infer<typeof CritiqueReply>, facts: string | null): Critique {
  const clamp = (n: number) => Math.max(1, Math.min(10, Math.round(n)));
  const tidy: Critique = {
    humanness: clamp(c.humanness),
    specificity: clamp(c.specificity),
    voiceMatch: clamp(c.voiceMatch),
    hook: clamp(c.hook),
    issues: c.issues.map((s) => s.trim()).filter(Boolean).slice(0, 6),
    suggestions: c.suggestions.map((s) => s.trim()).filter(Boolean).slice(0, 5),
  };
  return facts ? dropUnfoundedInventions(tidy, facts) : tidy;
}

/** The judge itself: lint, then the critic model, then save the combined quality. */
async function critiqueWith(ctx: FactoryContext, post: Post, text: string, signal?: AbortSignal): Promise<{ post: Post; critique: Critique }> {
  const lint = lintFor(ctx, text);
  const raw = await slowSafe(() => chatJson(CritiqueReply, { task: "critic", ...messages(critiquePrompt(ctx, text, lint.issues)), temperature: 0.2, maxTokens: 900, signal }));
  const critique = tidyCritique(raw, ctx.memoryFull ? ctx.facts : null);
  const quality = buildQuality({ body: text, lint: lint.issues, lintScore: lint.score, critique, critiqueBody: text });
  return { post: updatePost(post.id, { quality }), critique };
}

/**
 * Lint + LLM judge. If `body` differs from the saved text (unsaved edits in the editor), it is
 * saved as a human edit first so the score always describes the stored post.
 */
export async function runCritique(post: Post, body?: string, signal?: AbortSignal): Promise<{ post: Post; critique: Critique }> {
  const text = body ?? post.body;
  if (!text.trim()) throw new HttpError(400, "There's nothing to critique yet.", "Draft the post first.");
  const edited = body !== undefined && body !== post.body ? body : null;
  if (edited !== null && post.status === "published") throw new HttpError(409, "This post is already published.", "Edit it on LinkedIn; changes here wouldn't reach your feed.");
  const current = edited !== null ? applyHumanEdit(post, edited) : post;
  const ctx = await loadContext(current);
  return critiqueWith(ctx, current, text, signal);
}

/* ------------------------------------------------------------------ */
/* Revise                                                              */
/* ------------------------------------------------------------------ */

export type ReviseInput = {
  /** Free-text instruction from the user. */
  instruction?: string | null;
  /** Ready-made instructions (presets, lint fixes, critique suggestions). */
  changes?: string[];
  /** The editor's current text, if it has unsaved edits. */
  body?: string | null;
  note?: string;
  signal?: AbortSignal;
};

/** Build the change list for "Fix flagged lines" / "Apply critique". */
export async function fixInstructions(post: Post, body: string, kind: "lint" | "critique" | "all"): Promise<string[]> {
  const out: string[] = [];
  if (kind === "lint" || kind === "all") {
    const ctx = await loadContext(post, { examplesQuery: "" });
    out.push(...instructionsFromLint(lintFor(ctx, body).issues));
  }
  if ((kind === "critique" || kind === "all") && post.quality?.critique && isCritiqueFresh(post.quality, body)) out.push(...instructionsFromCritique(post.quality.critique));
  return out;
}

export async function reviseStream(post: Post, input: ReviseInput) {
  requireRewritable(post);
  let current = post;
  const base = input.body ?? post.body;
  if (!base.trim()) throw new HttpError(400, "There's nothing to revise yet.", "Draft the post first, or write a few lines yourself.");
  const changes = [...(input.changes ?? []), ...(input.instruction?.trim() ? [input.instruction.trim()] : [])];
  if (!changes.length) throw new HttpError(400, "Tell the writer what to change.", "Pick a quick fix or type an instruction.");
  if (input.body !== undefined && input.body !== null && input.body !== post.body) current = applyHumanEdit(post, input.body);
  snapshotBeforeGeneration(current.id, base);
  const ctx = await loadContext(current);
  const original = current.memoryId ? undefined : base;
  const gen = chatStream({ task: "writer", ...messages(revisePrompt(ctx, base, changes)), maxTokens: WRITER_MAX_TOKENS, signal: input.signal });
  const note = input.note ?? (input.instruction?.trim() ? `Revised: ${input.instruction.trim().slice(0, 80)}` : "Revised");
  const onDone = (full: string) => {
    finalizeGeneration(current.id, ctx, full, "revision", note, original);
  };
  return { gen, onDone };
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

export async function suggestHooks(post: Post, body?: string | null, signal?: AbortSignal): Promise<HookOption[]> {
  const text = body ?? post.body;
  if (!text.trim()) throw new HttpError(400, "Draft the post first, then try other hooks.");
  const ctx = await loadContext(post);
  const res = await slowSafe(() => chatJson(HooksResponseSchema, { task: "writer", ...messages(hooksPrompt(ctx, text)), temperature: 0.85, maxTokens: 900, signal }));
  const seen = new Set<string>();
  const out: HookOption[] = [];
  for (const h of res.hooks) {
    const t = cleanHook(h.text, { keepQuotes: h.type === "dialogue" });
    const key = t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    if (!t || t.length > 230 || seen.has(key)) continue;
    seen.add(key);
    out.push({ text: t, type: h.type });
  }
  if (!out.length) throw new LLMError("The model didn't return usable hooks.", "Try again, or choose a larger writer model in Settings → Models.");
  return out.slice(0, 5);
}

/* ------------------------------------------------------------------ */
/* Autopilot                                                           */
/* ------------------------------------------------------------------ */

export type AutopilotStep = "angles" | "draft" | "critique" | "revise";

/**
 * One call, no streaming: angle (if none chosen) → draft → lint + critique → one revision when
 * the gate fails → critique again. Used by the Calendar's "Draft all". A draft that passes the
 * gate moves to Review; everything else stays a Draft for the human.
 */
export async function autopilot(post: Post, opts: { force?: boolean; signal?: AbortSignal } = {}): Promise<{ post: Post; steps: AutopilotStep[] }> {
  requireStory(post);
  requireRewritable(post);
  if (post.body.trim() && post.status !== "idea" && !opts.force) {
    throw new HttpError(409, "This post already has a draft.", "Open it in the Studio to revise it, or send force: true to overwrite.");
  }
  const steps: AutopilotStep[] = [];
  let current = post;

  let { angle, field } = resolveAngle(current, {});
  if (!angle) {
    const res = await generateAngles(current, opts.signal);
    angle = res.angles[0];
    field = { ...parseAngleField(res.post.angle), selected: angle };
    current = res.post;
    steps.push("angles");
  }
  const structure = getStructure(angle.structureId)!;
  current = setAngleField(current, field, { format: structure.format });
  snapshotBeforeGeneration(current.id, current.body);

  const ctx = await loadContext(current);
  const draft = await slowSafe(() => chat({ task: "writer", ...messages(draftPrompt(ctx, angle, structure.id)), maxTokens: WRITER_MAX_TOKENS, signal: opts.signal }));
  current = finalizeGeneration(current.id, ctx, draft, "ai", `Draft · ${structure.name} (autopilot)`);
  steps.push("draft");

  current = (await critiqueWith(ctx, current, current.body, opts.signal)).post;
  steps.push("critique");

  if (!qualityGate(current.quality, current.body).ready) {
    const changes = [...instructionsFromLint(current.quality?.lint ?? []), ...(current.quality?.critique ? instructionsFromCritique(current.quality.critique) : [])];
    if (changes.length) {
      const revised = await slowSafe(() => chat({ task: "writer", ...messages(revisePrompt(ctx, current.body, changes)), maxTokens: WRITER_MAX_TOKENS, signal: opts.signal }));
      current = finalizeGeneration(current.id, ctx, revised, "revision", "Autopilot fixes");
      steps.push("revise");
      current = (await critiqueWith(ctx, current, current.body, opts.signal)).post;
      steps.push("critique");
    }
  }

  if (qualityGate(current.quality, current.body).ready && current.status === "draft") current = updatePost(current.id, { status: "review" });
  logActivity("post", `Autopilot drafted: ${postLabel(current)} (score ${current.quality?.score ?? "–"})`, { profileId: current.profileId, refId: current.id });
  return { post: current, steps };
}

/**
 * Run the deterministic checks. With no `body` (or the stored body) the result is saved on the
 * post; a different `body` is only checked, never stored.
 */
export async function lintAndSave(post: Post, body?: string): Promise<{ post: Post; lint: LintResult }> {
  const text = body ?? post.body;
  const ctx = await loadContext(post, { examplesQuery: "" });
  const lint = lintFor(ctx, text);
  if (text !== post.body) return { post, lint };
  const quality = relint(post.quality, text, lint.issues, lint.score);
  return { post: updatePost(post.id, { quality }), lint };
}
