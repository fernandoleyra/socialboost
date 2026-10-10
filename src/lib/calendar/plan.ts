/**
 * Auto-planner: fill open cadence slots with stories from the Memory Bank. Pure.
 *
 * For each open slot, in time order:
 *  1. Pick the pillar furthest behind its target share (weights from the strategy, optionally
 *     nudged by Insights), counting posts already on the calendar and recently published.
 *     Avoid the same pillar as the post right before or after the slot (research 02 §9:
 *     "avoid two consecutive posts on the same pillar").
 *  2. In that pillar, take the best unused ready story: one with a photo first (the candid photo
 *     is the format that works, research 02 §5.4), then the most vivid (strength), then the newest.
 *  3. When the chosen pillar has nothing left, record a gap ("run a story interview for X") and
 *     fall back to the next pillar, then to stories without a pillar.
 *
 * The server turns assignments into `idea` posts with `scheduledAt` = slot; they stay ideas until
 * drafted and approved.
 */

import type { DayKey } from "./time";

export type PlanPillar = { id: string; name: string; weight: number };

export type PlanMemory = {
  id: string;
  title: string;
  pillar: string | null;
  strength: number;
  coverPhotoId: string | null;
  photoCount: number;
  createdAt: string;
};

/** Posts already dated in the planning window (or recently published), used for balance and spacing. */
export type PlanExisting = { at: string; pillar: string | null };

export type PlanAssignment = {
  at: string;
  day: DayKey;
  memoryId: string;
  memoryTitle: string;
  pillar: string | null;
  photoId: string | null;
  needsPhoto: boolean;
  reason: string;
};

export type PlanGap = { pillar: string | null; pillarName: string; missing: number };

export type PlanResult = {
  assignments: PlanAssignment[];
  gaps: PlanGap[];
  unfilled: { at: string; day: DayKey }[];
  needsPhoto: number;
};

const DAY_MS = 86_400_000;

/** Ranking of a story for planning. Photo dominates, then strength, then freshness. */
export function memoryScore(m: PlanMemory, now: Date): number {
  const hasPhoto = !!m.coverPhotoId || m.photoCount > 0;
  const strength = Math.max(1, Math.min(5, Math.round(m.strength || 3)));
  const created = Date.parse(m.createdAt.includes("T") ? m.createdAt : m.createdAt.replace(" ", "T") + "Z");
  const ageDays = Number.isNaN(created) ? 365 : Math.max(0, (now.getTime() - created) / DAY_MS);
  const freshness = Math.max(0, 5 - ageDays / 30);
  return (hasPhoto ? 30 : 0) + strength * 8 + freshness;
}

/** Target share per pillar (0..1). Zero or missing weights fall back to an even split. */
export function pillarShares(pillars: PlanPillar[]): Map<string, number> {
  const total = pillars.reduce((s, p) => s + Math.max(0, p.weight || 0), 0);
  const shares = new Map<string, number>();
  for (const p of pillars) shares.set(p.id, total > 0 ? Math.max(0, p.weight || 0) / total : 1 / pillars.length);
  return shares;
}

export function planCalendar(input: {
  slots: { at: string; day: DayKey }[];
  memories: PlanMemory[];
  pillars: PlanPillar[];
  existing: PlanExisting[];
  now: Date;
}): PlanResult {
  const { pillars, now } = input;
  const pillarIds = new Set(pillars.map((p) => p.id));
  const shares = pillarShares(pillars);
  const nameOf = (id: string | null) => (id ? (pillars.find((p) => p.id === id)?.name ?? "Unsorted") : "Unsorted");

  // Ready-story pools per pillar, best first. Stories whose pillar no longer exists count as unsorted.
  const pools = new Map<string | null, PlanMemory[]>();
  const ranked = [...input.memories].sort((a, b) => memoryScore(b, now) - memoryScore(a, now) || a.id.localeCompare(b.id));
  for (const m of ranked) {
    const key = m.pillar && pillarIds.has(m.pillar) ? m.pillar : null;
    if (!pools.has(key)) pools.set(key, []);
    pools.get(key)!.push(m);
  }

  const counts = new Map<string, number>();
  for (const e of input.existing) if (e.pillar && pillarIds.has(e.pillar)) counts.set(e.pillar, (counts.get(e.pillar) ?? 0) + 1);
  let total = input.existing.length;

  // Timeline of dated items for adjacency checks (existing + what we assign).
  const timeline: { t: number; pillar: string | null }[] = input.existing
    .map((e) => ({ t: Date.parse(e.at), pillar: e.pillar }))
    .filter((e) => !Number.isNaN(e.t));

  /** Pillars that were the first choice for a slot but had no ready story left. */
  const dry = new Set<string>();
  const assignments: PlanAssignment[] = [];
  const unfilled: { at: string; day: DayKey }[] = [];

  const slots = [...input.slots].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (const slot of slots) {
    const t = Date.parse(slot.at);
    let prev: string | null | undefined;
    let next: string | null | undefined;
    let prevT = -Infinity;
    let nextT = Infinity;
    for (const item of timeline) {
      if (item.t < t && item.t > prevT) {
        prevT = item.t;
        prev = item.pillar;
      }
      if (item.t > t && item.t < nextT) {
        nextT = item.t;
        next = item.pillar;
      }
    }

    const ordered = pillars
      .map((p) => {
        const share = shares.get(p.id) ?? 0;
        let deficit = share * (total + 1) - (counts.get(p.id) ?? 0);
        if (p.id === prev || p.id === next) deficit -= 1;
        return { p, share, deficit };
      })
      .filter((x) => x.share > 0)
      .sort((a, b) => b.deficit - a.deficit || b.share - a.share || a.p.id.localeCompare(b.p.id));

    let chosen: { memory: PlanMemory; pillar: string | null; reason: string } | null = null;
    for (let i = 0; i < ordered.length; i++) {
      const { p, share } = ordered[i];
      const pool = pools.get(p.id);
      if (pool && pool.length) {
        const memory = pool.shift()!;
        const reason = i === 0 ? `${p.name} is furthest behind its ${Math.round(share * 100)}% share` : `${ordered[0].p.name} has no ready stories, so ${p.name} goes next`;
        chosen = { memory, pillar: p.id, reason };
        break;
      }
      if (i === 0) dry.add(p.id);
    }
    if (!chosen) {
      const pool = pools.get(null);
      if (pool && pool.length) {
        const memory = pool.shift()!;
        chosen = { memory, pillar: null, reason: pillars.length ? "No pillar has a ready story left; this one has no pillar yet" : "Your strongest ready story" };
      }
    }
    if (!chosen) {
      unfilled.push({ at: slot.at, day: slot.day });
      continue;
    }

    const photoId = chosen.memory.coverPhotoId;
    const needsPhoto = !photoId && chosen.memory.photoCount === 0;
    assignments.push({
      at: slot.at,
      day: slot.day,
      memoryId: chosen.memory.id,
      memoryTitle: chosen.memory.title,
      pillar: chosen.pillar,
      photoId,
      needsPhoto,
      reason: chosen.reason,
    });
    if (chosen.pillar) counts.set(chosen.pillar, (counts.get(chosen.pillar) ?? 0) + 1);
    total++;
    timeline.push({ t, pillar: chosen.pillar });
  }

  // How many more stories each dry pillar needs to reach its share of the whole window.
  const windowTotal = total + unfilled.length;
  const gaps: PlanGap[] = [...dry]
    .map((pillar) => ({
      pillar,
      pillarName: nameOf(pillar),
      missing: Math.max(1, Math.round((shares.get(pillar) ?? 0) * windowTotal) - (counts.get(pillar) ?? 0)),
    }))
    .sort((a, b) => b.missing - a.missing || a.pillarName.localeCompare(b.pillarName));

  return { assignments, gaps, unfilled, needsPhoto: assignments.filter((a) => a.needsPhoto).length };
}

/** Plain-language summary lines for the plan preview. */
export function planMessages(result: PlanResult, openSlots: number): string[] {
  const out: string[] = [];
  if (openSlots === 0) {
    out.push("Every posting day in this range already has a post.");
    return out;
  }
  out.push(`${result.assignments.length} of ${openSlots} open ${openSlots === 1 ? "slot" : "slots"} filled with stories from your Memory Bank.`);
  for (const g of result.gaps) {
    out.push(`Not enough stories for ${g.pillarName}: it needs about ${g.missing} more to keep its share. Run a story interview for this pillar.`);
  }
  if (result.unfilled.length) {
    out.push(`${result.unfilled.length} ${result.unfilled.length === 1 ? "slot stays" : "slots stay"} open because there are no unused ready stories left.`);
  }
  if (result.needsPhoto) {
    out.push(`${result.needsPhoto} planned ${result.needsPhoto === 1 ? "story has" : "stories have"} no photo yet. Add one before the post goes out.`);
  }
  return out;
}
