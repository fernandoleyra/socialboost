/**
 * Cadence slots: the posting times a strategy's cadence asks for. Pure.
 *
 * Strategy.cadence = { postsPerWeek, days (0 = Sun … 6 = Sat), time "HH:MM" } in the profile's
 * time zone. Research 02 §1.3 / §9: 3 posts a week is the baseline, at least 24 h apart, with
 * Tue–Thu the most popular days and hour-of-day close to flat. So one slot per posting day, and
 * when fewer posts than days are wanted we pick the days that spread out best across the week.
 */

import { addDays, dayKeyOf, diffDays, parseTime, formatTime, safeTimezone, weekdayOf, zonedToUtc, type DayKey } from "./time";

export type Cadence = { postsPerWeek: number; days: number[]; time: string };

export const DEFAULT_CADENCE: Cadence = { postsPerWeek: 3, days: [2, 3, 4], time: "08:30" };

/** Tie-break order when choosing posting days: Tue, Wed, Thu first, then Mon, Fri, weekend. */
export const DAY_PREFERENCE = [2, 3, 4, 1, 5, 6, 0] as const;

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export type SlotTime = { at: string; day: DayKey; time: string };
export type Slot = SlotTime & { taken: boolean; postId: string | null };

function uniqueDays(days: number[]): number[] {
  return [...new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [first, ...rest] = items;
  return [...combinations(rest, k - 1).map((c) => [first, ...c]), ...combinations(rest, k)];
}

/** Smallest gap in days between consecutive posting days, wrapping around the week. */
function minCircularGap(days: number[]): number {
  if (days.length < 2) return 7;
  const sorted = [...days].sort((a, b) => a - b);
  let min = 7;
  for (let i = 0; i < sorted.length; i++) {
    const next = i === sorted.length - 1 ? sorted[0] + 7 : sorted[i + 1];
    min = Math.min(min, next - sorted[i]);
  }
  return min;
}

const preferenceRank = (d: number) => DAY_PREFERENCE.indexOf(d as (typeof DAY_PREFERENCE)[number]);

/**
 * The weekdays we actually post on. All selected days when postsPerWeek covers them; otherwise the
 * subset of size postsPerWeek with the widest spacing (ties go to Tue/Wed/Thu).
 */
export function postingDays(cadence: Cadence | null | undefined): number[] {
  const c = cadence ?? DEFAULT_CADENCE;
  const days = uniqueDays(c.days.length ? c.days : DEFAULT_CADENCE.days);
  const want = Math.max(1, Math.min(Math.round(c.postsPerWeek) || 1, 7));
  if (want >= days.length) return days;
  let best: number[] = [];
  let bestGap = -1;
  let bestPref = Infinity;
  for (const combo of combinations(days, want)) {
    const gap = minCircularGap(combo);
    const pref = combo.reduce((s, d) => s + preferenceRank(d), 0);
    if (gap > bestGap || (gap === bestGap && pref < bestPref)) {
      best = combo;
      bestGap = gap;
      bestPref = pref;
    }
  }
  return best.sort((a, b) => a - b);
}

/** A sentence explaining a mismatch between posts per week and posting days, or null. */
export function cadenceNote(cadence: Cadence | null | undefined): string | null {
  const c = cadence ?? DEFAULT_CADENCE;
  const days = uniqueDays(c.days);
  if (days.length === 0) return "No posting days are set in your strategy, so we use Tuesday to Thursday.";
  if (c.postsPerWeek > days.length) {
    return `Your strategy asks for ${c.postsPerWeek} posts a week but has ${days.length} posting ${days.length === 1 ? "day" : "days"}. We plan one post per posting day so posts stay at least a day apart.`;
  }
  if (c.postsPerWeek < days.length) {
    const used = postingDays(c).map((d) => WEEKDAY_SHORT[d]).join(", ");
    return `${c.postsPerWeek} posts a week across ${days.length} posting days: we use ${used}, the best-spaced choice.`;
  }
  return null;
}

/** Normalised "HH:MM" for the cadence. */
export function cadenceTime(cadence: Cadence | null | undefined): string {
  const [h, m] = parseTime(cadence?.time);
  return formatTime(h, m);
}

/**
 * Every cadence slot in [from, to). Times are the cadence time on each posting day in `timezone`,
 * returned as UTC ISO instants plus the local day key.
 */
export function cadenceSlots(input: { cadence: Cadence | null | undefined; timezone: string; from: Date; to: Date }): SlotTime[] {
  const tz = safeTimezone(input.timezone);
  const days = new Set(postingDays(input.cadence));
  const time = cadenceTime(input.cadence);
  const out: SlotTime[] = [];
  if (input.to.getTime() <= input.from.getTime()) return out;
  const first = dayKeyOf(input.from, tz);
  const last = dayKeyOf(input.to, tz);
  const span = diffDays(first, last);
  for (let i = 0; i <= span; i++) {
    const day = addDays(first, i);
    if (!days.has(weekdayOf(day))) continue;
    const at = zonedToUtc(day, time, tz);
    if (at.getTime() < input.from.getTime() || at.getTime() >= input.to.getTime()) continue;
    out.push({ at: at.toISOString(), day, time });
  }
  return out;
}

/**
 * Mark slots whose local day already has a post (scheduled, planned or published).
 * One post per day keeps posts ≥ ~24 h apart.
 */
export function markTaken(slots: SlotTime[], posts: { id: string; at: string | null }[], timezone: string): Slot[] {
  const tz = safeTimezone(timezone);
  const byDay = new Map<DayKey, string>();
  for (const p of posts) {
    if (!p.at) continue;
    const key = dayKeyOf(p.at, tz);
    if (key && !byDay.has(key)) byDay.set(key, p.id);
  }
  return slots.map((s) => ({ ...s, taken: byDay.has(s.day), postId: byDay.get(s.day) ?? null }));
}
