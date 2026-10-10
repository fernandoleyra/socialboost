/**
 * Suggested publishing slots for the editor's Schedule sheet. Pure.
 *
 * Works in the browser's local time (the date-time picker is local too). Follows the strategy
 * cadence (weekdays + time) and skips days that already have a post, keeping ≥ 12 h between
 * posts (research 02 §1.3: < 12 h after the previous post costs reach; 12-24 h is neutral).
 */

export type Cadence = { days: number[]; time: string };

export const DEFAULT_CADENCE: Cadence = { days: [2, 3, 4], time: "08:30" };

function parseTime(time: string): [number, number] {
  const m = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!m) return [8, 30];
  return [Math.min(23, Number(m[1])), Math.min(59, Number(m[2]))];
}

const MIN_GAP_MS = 12 * 3600_000;

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/**
 * The next `count` open cadence slots after `now`, as local Date objects.
 * `taken` are ISO timestamps of posts already scheduled or published.
 */
export function nextOpenSlots(cadence: Cadence | null | undefined, taken: string[], now: Date, count = 3, horizonDays = 42): Date[] {
  const c = cadence && cadence.days.length ? cadence : DEFAULT_CADENCE;
  const [hh, mm] = parseTime(c.time);
  const takenDays = new Set(
    taken
      .map((t) => new Date(t))
      .filter((d) => !Number.isNaN(d.getTime()))
      .map(dayKey),
  );
  const takenTimes = taken.map((t) => new Date(t).getTime()).filter((t) => !Number.isNaN(t));
  const out: Date[] = [];
  for (let i = 0; i <= horizonDays && out.length < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hh, mm, 0, 0);
    if (!c.days.includes(d.getDay())) continue;
    if (d.getTime() <= now.getTime() + 30 * 60_000) continue;
    if (takenDays.has(dayKey(d))) continue;
    if (takenTimes.some((t) => Math.abs(t - d.getTime()) < MIN_GAP_MS)) continue;
    out.push(d);
  }
  return out;
}

/** Value for <input type="datetime-local"> from a Date, in local time. */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Parse a datetime-local value (local time) into an ISO string, or null. */
export function fromLocalInput(v: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
