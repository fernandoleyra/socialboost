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

export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : format(d, "MMM d, yyyy");
}

/** The hook: first non-empty line. */
export function firstLine(text: string): string {
  return text.split("\n").find((l) => l.trim())?.trim() ?? "";
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";
