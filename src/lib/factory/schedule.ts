/**
 * Suggested publishing slots for the editor's Schedule sheet. Pure — runs in the browser.
 *
 * Uses the Calendar's own slot rules (src/lib/calendar/slots.ts) so the Studio never suggests a
 * time the Calendar wouldn't: the strategy cadence in the *profile's* time zone, posting days
 * thinned to posts-per-week, and one post per local day — a day is taken by any dated post,
 * including ideas the auto-planner already put there (research 02 §1.3: posts ≥ a day apart).
 */

import { cadenceSlots, markTaken, type Cadence } from "@/lib/calendar/slots";

export type { Cadence };

/** A post that occupies a day on the calendar. */
export type TakenSlot = { id: string; at: string | null };

/** Slots closer than this to "now" aren't worth suggesting. */
const LEAD_MS = 30 * 60_000;

/** The next `count` open cadence slots after `now`, as UTC instants. */
export function nextOpenSlots(input: { cadence: Cadence | null | undefined; timezone: string; taken: TakenSlot[]; now: Date; count?: number; horizonDays?: number }): Date[] {
  const from = new Date(input.now.getTime() + LEAD_MS);
  const to = new Date(input.now.getTime() + (input.horizonDays ?? 42) * 86_400_000);
  return markTaken(cadenceSlots({ cadence: input.cadence, timezone: input.timezone, from, to }), input.taken, input.timezone)
    .filter((s) => !s.taken)
    .slice(0, input.count ?? 4)
    .map((s) => new Date(s.at));
}

/** Value for <input type="datetime-local"> from a Date, in the browser's local time. */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Parse a datetime-local value (browser local time) into an ISO string, or null. */
export function fromLocalInput(v: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
