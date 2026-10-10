/**
 * Quality score = deterministic lint + LLM critique. Pure — shared by server and editor.
 *
 * Research 02 §8: deterministic checks are authoritative and run first; the judge scores
 * humanness, specificity, voice and hook. A draft is "ready for review" at ≥ 80 with no lint
 * errors and no critique dimension below 6/10 (the rubric's "no dimension below 3/5").
 */

import type { Critique, LintIssue, PostQuality } from "@/lib/types";
import { matchesFacts } from "./lint";

export const READY_SCORE = 80;
const MIN_DIMENSION = 6;

/** Stored on posts.quality. Extra fields let us tell when the critique is about an older text. */
export type FactoryQuality = PostQuality & {
  /** Hash of the body the lint ran on. */
  bodyHash: string;
  /** Hash of the body the critique ran on (null when there's no critique). */
  critiqueHash: string | null;
  lintScore: number;
};

export const CRITIQUE_DIMENSIONS: { key: keyof Pick<Critique, "humanness" | "specificity" | "voiceMatch" | "hook">; label: string; weight: number; hint: string }[] = [
  { key: "humanness", label: "Sounds human", weight: 0.3, hint: "No AI phrasing, natural rhythm" },
  { key: "specificity", label: "Specific", weight: 0.3, hint: "Real details from your story" },
  { key: "voiceMatch", label: "Your voice", weight: 0.2, hint: "Matches how you write" },
  { key: "hook", label: "Hook", weight: 0.2, hint: "First line earns the click" },
];

/** FNV-1a over whitespace-normalised text. Cheap, stable, good enough to detect edits. */
export function hashBody(body: string): string {
  const norm = body.replace(/\s+/g, " ").trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + norm.length.toString(36);
}

/** Weighted critique on a 0-100 scale. */
export function critiqueScore(c: Critique): number {
  const clamp = (n: number) => Math.max(1, Math.min(10, n));
  const total = CRITIQUE_DIMENSIONS.reduce((sum, d) => sum + clamp(c[d.key]) * 10 * d.weight, 0);
  return Math.round(total);
}

/**
 * Final score. Without a (fresh) critique it is the lint score. With one: 40% lint, 60% critique,
 * capped below the ready line while any lint error or weak dimension remains.
 */
export function combineScore(lintScore: number, lint: Pick<LintIssue, "severity">[], critique: Critique | null): number {
  if (!critique) return lintScore;
  let score = Math.round(0.4 * lintScore + 0.6 * critiqueScore(critique));
  const blocked = lint.some((i) => i.severity === "error") || CRITIQUE_DIMENSIONS.some((d) => critique[d.key] < MIN_DIMENSION);
  if (blocked) score = Math.min(score, READY_SCORE - 1);
  return score;
}

export function buildQuality(input: { body: string; lint: LintIssue[]; lintScore: number; critique: Critique | null; critiqueBody?: string | null }): FactoryQuality {
  const bodyHash = hashBody(input.body);
  const critiqueHash = input.critique ? hashBody(input.critiqueBody ?? input.body) : null;
  const fresh = input.critique && critiqueHash === bodyHash ? input.critique : null;
  return {
    lint: input.lint,
    critique: input.critique,
    score: combineScore(input.lintScore, input.lint, fresh),
    checkedAt: new Date().toISOString(),
    bodyHash,
    critiqueHash,
    lintScore: input.lintScore,
  };
}

/** Re-lint after an edit while keeping the last critique (marked stale if the text moved on). */
export function relint(prev: PostQuality | null, body: string, lint: LintIssue[], lintScore: number): FactoryQuality {
  const p = prev as Partial<FactoryQuality> | null;
  const critique = p?.critique ?? null;
  const critiqueHash = p?.critiqueHash ?? (critique ? (p?.bodyHash ?? null) : null);
  const bodyHash = hashBody(body);
  const fresh = critique && critiqueHash === bodyHash ? critique : null;
  return { lint, critique, score: combineScore(lintScore, lint, fresh), checkedAt: new Date().toISOString(), bodyHash, critiqueHash, lintScore };
}

export function isCritiqueFresh(q: PostQuality | null, body: string): boolean {
  const f = q as Partial<FactoryQuality> | null;
  return !!(f?.critique && f.critiqueHash && f.critiqueHash === hashBody(body));
}

/**
 * Small critic models sometimes call a real fact "invented". Drop an `Invented: "…"` issue when the
 * quoted words are in the notes after all. Our deterministic checks own provenance anyway.
 */
export function dropUnfoundedInventions(c: Critique, facts: string): Critique {
  const issues = c.issues.filter((issue) => {
    if (!/^invented\b/i.test(issue.trim())) return true;
    const q = /["“'‘]([^"“”'‘’]{3,})["”'’]/.exec(issue)?.[1];
    return !q || !matchesFacts(q, facts);
  });
  return issues.length === c.issues.length ? c : { ...c, issues };
}

export type Gate = { ready: boolean; reasons: string[] };

/** Whether a draft can go to the human for review, and what's in the way. */
export function qualityGate(q: PostQuality | null, body: string): Gate {
  const reasons: string[] = [];
  if (!body.trim()) return { ready: false, reasons: ["The post is empty."] };
  if (!q) return { ready: false, reasons: ["Not checked yet."] };
  const errors = q.lint.filter((i) => i.severity === "error").length;
  if (errors) reasons.push(`${errors} lint ${errors === 1 ? "error" : "errors"} to fix.`);
  const fresh = isCritiqueFresh(q, body);
  if (!fresh) reasons.push(q.critique ? "The critique is about an earlier version." : "No critique yet.");
  else {
    for (const d of CRITIQUE_DIMENSIONS) if (q.critique![d.key] < MIN_DIMENSION) reasons.push(`${d.label} scored ${q.critique![d.key]}/10.`);
  }
  if (q.score < READY_SCORE) reasons.push(`Score ${q.score} is under ${READY_SCORE}.`);
  return { ready: reasons.length === 0, reasons };
}

export function scoreTone(score: number | null | undefined): "green" | "orange" | "red" | "gray" {
  if (score === null || score === undefined) return "gray";
  if (score >= READY_SCORE) return "green";
  if (score >= 60) return "orange";
  return "red";
}
