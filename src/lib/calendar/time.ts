/**
 * Time-zone math for the calendar. Pure: works on the server and in the browser.
 *
 * The calendar lives in the *profile's* time zone (the cadence "08:30 on Tuesdays" is the
 * person's local morning, wherever the server runs). Days are handled as `YYYY-MM-DD` keys so
 * date arithmetic never trips over DST; instants are UTC `Date`s / ISO strings.
 */

export type DayKey = string;

export type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

/** A valid IANA zone, or "UTC" when the stored value is empty or unknown. */
export function safeTimezone(tz: string | null | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Wall-clock parts of an instant in `tz`. */
export function zonedParts(date: Date, tz: string): ZonedParts {
  const parts = partsFormatter(safeTimezone(tz)).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return { year, month, day, hour: get("hour") % 24, minute: get("minute"), second: get("second"), weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}

/**
 * Parse a timestamp from the database. SQLite's `datetime('now')` writes "YYYY-MM-DD HH:MM:SS"
 * in UTC without a zone; everything we write ourselves is ISO with "Z".
 */
export function parseDbDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const v = value.trim();
  const sqlite = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/.exec(v);
  const d = sqlite ? new Date(`${sqlite[1]}T${sqlite[2]}Z`) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `YYYY-MM-DD` of the local day an instant falls on in `tz`. */
export function dayKeyOf(date: Date | string, tz: string): DayKey {
  const d = typeof date === "string" ? parseDbDate(date) : date;
  if (!d) return "";
  const p = zonedParts(d, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "HH:MM" wall-clock time of an instant in `tz`. */
export function timeOf(date: Date | string, tz: string): string {
  const d = typeof date === "string" ? parseDbDate(date) : date;
  if (!d) return "";
  const p = zonedParts(d, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** "08:30" → [8, 30]. Anything unparsable falls back to 08:30, the cadence default. */
export function parseTime(time: string | null | undefined): [number, number] {
  const m = /^(\d{1,2}):(\d{2})/.exec((time ?? "").trim());
  if (!m) return [8, 30];
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return [8, 30];
  return [h, min];
}

export function formatTime(h: number, m: number): string {
  return `${pad(h)}:${pad(m)}`;
}

export function isDayKey(value: unknown): value is DayKey {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function keyToUtcNoon(key: DayKey): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/** Add whole days to a day key (pure calendar math, DST-proof). */
export function addDays(key: DayKey, days: number): DayKey {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(key: DayKey): number {
  return keyToUtcNoon(key).getUTCDay();
}

/** Whole days from `a` to `b` (positive when b is later). */
export function diffDays(a: DayKey, b: DayKey): number {
  return Math.round((keyToUtcNoon(b).getTime() - keyToUtcNoon(a).getTime()) / 86_400_000);
}

/** First day of the week containing `key`. `weekStartsOn` 1 = Monday. */
export function startOfWeek(key: DayKey, weekStartsOn = 1): DayKey {
  const back = (weekdayOf(key) - weekStartsOn + 7) % 7;
  return addDays(key, -back);
}

export function startOfMonth(key: DayKey): DayKey {
  return `${key.slice(0, 7)}-01`;
}

/** First day of the month `n` months after the month of `key`. */
export function addMonths(key: DayKey, n: number): DayKey {
  const [y, m] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-01`;
}

function offsetMs(instant: number, tz: string): number {
  const p = zonedParts(new Date(instant), tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * The UTC instant of a wall-clock time on a local day in `tz`.
 * Two passes settle DST transitions; a time that doesn't exist (spring-forward gap) lands just after it.
 */
export function zonedToUtc(key: DayKey, time: string, tz: string): Date {
  const zone = safeTimezone(tz);
  const [y, mo, d] = key.split("-").map(Number);
  const [h, mi] = parseTime(time);
  const local = Date.UTC(y, mo - 1, d, h, mi);
  let t = local - offsetMs(local, zone);
  t = local - offsetMs(t, zone);
  return new Date(t);
}

/** Midnight at the start of a local day, as a UTC instant. */
export function startOfDayUtc(key: DayKey, tz: string): Date {
  return zonedToUtc(key, "00:00", tz);
}
