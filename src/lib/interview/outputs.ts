/**
 * Turning model output into stored data: story card → memory (with quote provenance
 * checks) and positioning extract → Strategy (merged with what the user already has).
 * Figures are put back the way the user said them, and only the user's own words can
 * put a topic on the off-limits list. Pure and unit-tested.
 */
import { alignFigures } from "@/lib/factory/numbers";
import { PILLAR_COLORS, normalizeStrategy } from "@/lib/strategy";
import { StrategySchema, type ExtractedMemory, type Pillar, type Strategy } from "@/lib/types";
import type { PositioningExtract, StoryCard, ExtractedPillar } from "./schemas";
import { keepVerbatimQuotes } from "./text";

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const cleanBlock = (s: string | null | undefined) => (s ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

/** Trimmed, de-duplicated (case-insensitive), non-empty, capped list. */
export function tidyList(items: (string | null | undefined)[], max = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    // Strip list markers ("- ", "• ", "1. ", "2) ") but never a leading number: "40,000 francs" stays.
    const v = clean(raw).replace(/^(?:[-–•*]\s+|\d{1,3}[.)]\s+)/, "");
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Story card → memory                                                 */
/* ------------------------------------------------------------------ */

export function cardToMemory(
  card: StoryCard,
  opts: { userTexts: string[]; pillars: { id: string; name: string }[]; presetPillarId: string | null; coverageStrength: number },
): ExtractedMemory {
  const byName = new Map(opts.pillars.map((p) => [p.name.trim().toLowerCase(), p.id]));
  const modelPillar = byName.get(clean(card.pillar).toLowerCase()) ?? null;
  const pillar = opts.presetPillarId && opts.pillars.some((p) => p.id === opts.presetPillarId) ? opts.presetPillarId : modelPillar;
  const modelStrength = Number.isFinite(card.strength) ? Math.round(card.strength) : 3;
  const strength = Math.max(1, Math.min(5, Math.round((Math.max(1, Math.min(5, modelStrength)) + opts.coverageStrength) / 2)));
  // Numbers and currencies as the user said them: "40k" never becomes "$40k" or "forty thousand".
  const said = opts.userTexts.join("\n");
  const fig = (text: string) => alignFigures(text, said);
  const title = fig(clean(card.title).replace(/^["'“]|["'”]$/g, "")).slice(0, 120) || "Untitled story";
  return {
    title,
    summary: fig(clean(card.summary)),
    story: fig(cleanBlock(card.story)),
    when: fig(clean(card.when)),
    place: fig(clean(card.place)),
    people: tidyList(card.people, 10),
    emotions: tidyList(card.emotions, 8).map((e) => e.toLowerCase()),
    details: tidyList(card.details.map(fig), 12),
    quotes: keepVerbatimQuotes(tidyList(card.quotes, 8), opts.userTexts).slice(0, 4),
    lesson: fig(clean(card.lesson)),
    pillar,
    tags: tidyList(card.tags, 8).map((t) => t.toLowerCase().replace(/^#/, "")),
    angles: tidyList(card.angles.map(fig), 4),
    strength,
  };
}

/* ------------------------------------------------------------------ */
/* Positioning extract: only the user's own words count                */
/* ------------------------------------------------------------------ */

export type SaidMessage = { role: "user" | "assistant"; content: string };

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Words too generic to tie a topic to what was said ("personal topics", "my work"). */
const TOPIC_STOPWORDS = new Set(
  "the and or of my our their his her its about any all to in on for with from topics topic things thing stuff posts post personal life work talk talking anything everything de la el los las lo mi mis tu su sus y o del al sobre temas tema cosas nada todo".split(" "),
);

/** Crude stems that survive plurals and close variants: "politics"/"political"/"política" → "polit". */
function topicStems(text: string): string[] {
  return (fold(text).match(/\p{L}+/gu) ?? [])
    .filter((w) => w.length >= 3 && !TOPIC_STOPWORDS.has(w))
    .map((w) => w.replace(/ies$/, "y").replace(/(?:es|s)$/, "").slice(0, 5));
}

/** A sentence that rules something out ("I don't want to talk about politics", "nada de política"). */
const EXCLUSION_CUE =
  /(?<![\p{L}])(?:don['’]?t|do not|doesn['’]?t|won['’]?t|will not|wouldn['’]?t|never|not|no|avoid\w*|off[- ]limits|private|rather not|prefer not|keep (?:out|away|it out|that out)|stay away|leave (?:out|aside)|nothing about|exclud\w*|without|nunca|jam[aá]s|evit\w*|prefiero no|nada de|fuera|privad[oa]s?)(?![\p{L}])/iu;
/** The interviewer asked what is off-limits. */
const BOUNDARY_QUESTION = /off[- ]limits|\bavoid|\bprivate\b|\bboundar|never (?:post|share|talk)|(?:won['’]?t|don['’]?t want to) (?:post|share|talk)|fuera de|\bevitar|\bprivad/i;

const sentencesOf = (text: string) =>
  text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * Keep only off-limits topics the user ruled out in their own words. Options the interviewer
 * listed in a question ("clients, family, politics, money?") are not answers: a topic needs a
 * stem in a user sentence that rules something out, or in a short direct answer to the
 * off-limits question.
 */
export function groundAvoidTopics(topics: string[], transcript: SaidMessage[]): string[] {
  const support = new Set<string>();
  transcript.forEach((m, i) => {
    if (m.role !== "user") return;
    const prev = transcript.slice(0, i).reverse().find((x) => x.role === "assistant");
    const answersBoundary = !!prev && BOUNDARY_QUESTION.test(prev.content);
    for (const sentence of sentencesOf(m.content)) {
      const short = sentence.split(/\s+/).length <= 6;
      if (EXCLUSION_CUE.test(sentence) || (answersBoundary && short)) for (const st of topicStems(sentence)) support.add(st);
    }
  });
  return topics.filter((t) => topicStems(t).some((st) => support.has(st)));
}

/** All the free text of an extract, for checking figures. */
function extractText(x: Omit<PositioningExtract, "pillars">): string {
  return [
    x.positioning,
    ...x.goals,
    x.audienceWho,
    ...x.audiencePains,
    ...x.audienceDesires,
    ...x.expertise,
    ...x.offers,
    ...x.beliefs,
    ...x.contrarianTakes,
    ...x.avoidTopics,
    x.cta,
    x.notes,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Hold a positioning extract to the transcript: off-limits topics must come from the user's own
 * messages, and figures read the way the user wrote them (no added currencies). Run it on the
 * model's output before anything else uses it (pillar generation, mergeStrategy).
 */
export function groundPositioning<T extends Omit<PositioningExtract, "pillars"> & { pillars?: ExtractedPillar[] }>(x: T, transcript: SaidMessage[]): T {
  const said = transcript
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
  const fig = (text: string) => alignFigures(text, said);
  return {
    ...x,
    positioning: fig(x.positioning),
    goals: x.goals.map(fig),
    audienceWho: fig(x.audienceWho),
    audiencePains: x.audiencePains.map(fig),
    audienceDesires: x.audienceDesires.map(fig),
    expertise: x.expertise.map(fig),
    offers: x.offers.map(fig),
    beliefs: x.beliefs.map(fig),
    contrarianTakes: x.contrarianTakes.map(fig),
    avoidTopics: groundAvoidTopics(x.avoidTopics, transcript),
    cta: fig(x.cta),
    notes: fig(x.notes),
    ...(x.pillars ? { pillars: x.pillars.map((p) => ({ ...p, name: fig(p.name), description: fig(p.description), storyPrompts: p.storyPrompts.map(fig) })) } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Positioning extract → Strategy                                      */
/* ------------------------------------------------------------------ */

/** Weekdays (0 = Sunday) for a weekly post count, spaced at least a day apart where possible. */
export function cadenceDays(postsPerWeek: number): number[] {
  const n = Math.max(1, Math.min(7, Math.round(postsPerWeek)));
  const table: Record<number, number[]> = {
    1: [3],
    2: [2, 4],
    3: [2, 3, 4],
    4: [1, 2, 3, 4],
    5: [1, 2, 3, 4, 5],
    6: [1, 2, 3, 4, 5, 6],
    7: [0, 1, 2, 3, 4, 5, 6],
  };
  return table[n];
}

const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2),
  );

/** Do two pillar names describe the same pillar? Exact match or ≥ 50% shared words. */
export function samePillar(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (x === y) return true;
  const ta = tokens(x);
  const tb = tokens(y);
  if (!ta.size || !tb.size) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size) >= 0.5;
}

/** Split 100 points evenly (first pillars get the remainder). */
export function evenWeights(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(100 / n);
  return Array.from({ length: n }, (_, i) => base + (i < 100 - base * n ? 1 : 0));
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "pillar"
  );
}

function mergePillars(existing: Pillar[], extracted: ExtractedPillar[], makeId: (name: string) => string): Pillar[] {
  const incoming = extracted.filter((p) => clean(p.name)).slice(0, 5);
  if (existing.length === 0) {
    const chosen = incoming.slice(0, 4);
    const weights = evenWeights(chosen.length);
    return chosen.map((p, i) => ({
      id: makeId(p.name),
      name: clean(p.name).slice(0, 60),
      description: clean(p.description),
      weight: weights[i],
      storyPrompts: tidyList(p.storyPrompts, 6),
      color: PILLAR_COLORS[i % PILLAR_COLORS.length],
    }));
  }
  const merged: Pillar[] = existing.map((p) => ({ ...p, storyPrompts: [...p.storyPrompts] }));
  const added: Pillar[] = [];
  for (const p of incoming) {
    const match = merged.find((e) => samePillar(e.name, p.name));
    if (match) {
      if (!match.description) match.description = clean(p.description);
      match.storyPrompts = tidyList([...match.storyPrompts, ...p.storyPrompts], 8);
    } else if (merged.length + added.length < 5) {
      const used = new Set([...merged, ...added].map((x) => x.color));
      added.push({
        id: makeId(p.name),
        name: clean(p.name).slice(0, 60),
        description: clean(p.description),
        weight: 0,
        storyPrompts: tidyList(p.storyPrompts, 6),
        color: PILLAR_COLORS.find((c) => !used.has(c)) ?? PILLAR_COLORS[(merged.length + added.length) % PILLAR_COLORS.length],
      });
    }
  }
  if (added.length === 0) return merged;
  // Give new pillars an even share and scale the existing weights down to make room.
  const all = [...merged, ...added];
  const share = Math.round(100 / all.length);
  const existingTotal = merged.reduce((s, p) => s + p.weight, 0) || 1;
  const remaining = 100 - share * added.length;
  return all.map((p, i) =>
    i < merged.length ? { ...p, weight: Math.max(0, Math.min(100, Math.round((p.weight / existingTotal) * remaining))) } : { ...p, weight: share },
  );
}

/**
 * Merge a positioning-interview extract into the user's strategy. Single-line fields take
 * the interview's answer when it has one; lists are unioned; nothing the user wrote is
 * deleted. Pillars are matched by name so ids, colors and tuned weights survive a re-run.
 */
export function mergeStrategy(existing: Strategy | null, x: PositioningExtract, opts: { language: string; idFor?: (name: string, taken: Set<string>) => string }): Strategy {
  const base = StrategySchema.parse(existing ?? { language: opts.language });
  const taken = new Set(base.pillars.map((p) => p.id));
  const idFor =
    opts.idFor ??
    ((name: string, used: Set<string>) => {
      let id = `pl_${slug(name)}`;
      for (let i = 2; used.has(id); i++) id = `pl_${slug(name)}_${i}`;
      return id;
    });
  const makeId = (name: string) => {
    const id = idFor(name, taken);
    taken.add(id);
    return id;
  };

  const pick = (incoming: string, current: string) => clean(incoming) || current;
  // The cap limits what the interview adds; it never trims a list the person already wrote.
  const union = (current: string[], incoming: string[], max = 12) => tidyList([...current, ...incoming], Math.max(max, current.length));

  const ppw = Math.round(x.postsPerWeek || 0);
  const cadenceUntouched = !existing;
  const cadence =
    ppw >= 1 && ppw <= 14 && cadenceUntouched
      ? { ...base.cadence, postsPerWeek: ppw, days: cadenceDays(Math.min(ppw, 7)) }
      : base.cadence;

  const notes = clean(x.notes);
  // Pillars are written from a summary of the extract; their figures must read like the extract's.
  const said = extractText(x);
  const fig = (text: string) => alignFigures(text, said);
  const pillarsIn = x.pillars.map((p) => ({ ...p, name: fig(p.name), description: fig(p.description), storyPrompts: p.storyPrompts.map(fig) }));
  // Same normalization as PUT /api/strategy, so the editor, Calendar and Insights get valid pillar ids and colors.
  return normalizeStrategy(StrategySchema.parse({
    ...base,
    positioning: pick(x.positioning, base.positioning),
    goals: union(base.goals, x.goals, 8),
    audience: {
      who: pick(x.audienceWho, base.audience.who),
      pains: union(base.audience.pains, x.audiencePains, 10),
      desires: union(base.audience.desires, x.audienceDesires, 10),
    },
    expertise: union(base.expertise, x.expertise, 10),
    offers: union(base.offers, x.offers, 8),
    beliefs: union(base.beliefs, x.beliefs, 12),
    contrarianTakes: union(base.contrarianTakes, x.contrarianTakes, 12),
    pillars: mergePillars(base.pillars, pillarsIn, makeId),
    avoidTopics: union(base.avoidTopics, x.avoidTopics, 12),
    cta: pick(x.cta, base.cta),
    cadence,
    language: base.language || opts.language,
    notes: notes && !base.notes.includes(notes) ? [base.notes, notes].filter(Boolean).join("\n") : base.notes,
  }));
}

/** Plain-text summary of an extract, used to retry pillar generation on its own. */
export function extractSummary(x: PositioningExtract): string {
  const lines = [
    x.positioning && `Positioning: ${x.positioning}`,
    x.goals.length && `Goals: ${x.goals.join("; ")}`,
    x.audienceWho && `Audience: ${x.audienceWho}`,
    x.audiencePains.length && `Audience pains: ${x.audiencePains.join("; ")}`,
    x.expertise.length && `Expertise: ${x.expertise.join("; ")}`,
    x.offers.length && `Offers: ${x.offers.join("; ")}`,
    x.beliefs.length && `Beliefs: ${x.beliefs.join("; ")}`,
    x.contrarianTakes.length && `Contrarian takes: ${x.contrarianTakes.join("; ")}`,
    x.avoidTopics.length && `Off-limits: ${x.avoidTopics.join("; ")}`,
  ];
  return lines.filter(Boolean).join("\n");
}
