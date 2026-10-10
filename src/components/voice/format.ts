import { useSyncExternalStore } from "react";
import { format } from "date-fns";

/** 1234 → "1.2K", 12 → "12". */
export function fmtCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

/** 0.4567 → "46%". */
export const fmtPct = (r: number) => `${Math.round(r * 100)}%`;

/** 1.25 → "1.3", 12.4 → "12". */
export const fmtNum = (n: number) => (Math.abs(n) >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10));

/** ISO strings and SQLite's "YYYY-MM-DD HH:MM:SS" (which is UTC). */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * "Oct 3, 2026". `local: false` gives the UTC calendar day, which server and browser agree on:
 * use it until hydration is done, or the day can differ and React reports a mismatch.
 */
export function fmtDay(value: string | null | undefined, local = true): string {
  const d = parseDate(value);
  if (!d) return "";
  return format(local ? d : new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), "MMM d, yyyy");
}

const subscribeNothing = () => () => {};
/** False on the server and during hydration, true afterwards. Gate time-zone or clock dependent text on it. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}

/** The hook: first non-empty line. */
export function firstLine(text: string): string {
  return text.split("\n").find((l) => l.trim())?.trim() ?? "";
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";
