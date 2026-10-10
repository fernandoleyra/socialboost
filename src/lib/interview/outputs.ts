/**
 * Turning model output into stored data: story card → memory (with quote provenance
 * checks) and positioning extract → Strategy (merged with what the user already has).
 * Pure and unit-tested.
 */
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
  const title = clean(card.title).replace(/^["'“]|["'”]$/g, "").slice(0, 120) || "Untitled story";
  return {
    title,
    summary: clean(card.summary),
    story: cleanBlock(card.story),
    when: clean(card.when),
    place: clean(card.place),
    people: tidyList(card.people, 10),
    emotions: tidyList(card.emotions, 8).map((e) => e.toLowerCase()),
    details: tidyList(card.details, 12),
    quotes: keepVerbatimQuotes(tidyList(card.quotes, 8), opts.userTexts).slice(0, 4),
    lesson: clean(card.lesson),
    pillar,
    tags: tidyList(card.tags, 8).map((t) => t.toLowerCase().replace(/^#/, "")),
    angles: tidyList(card.angles, 4),
    strength,
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
    pillars: mergePillars(base.pillars, x.pillars, makeId),
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
