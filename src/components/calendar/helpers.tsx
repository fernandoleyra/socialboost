"use client";

import type { LucideIcon } from "lucide-react";
import { BellRing, CalendarX2, CircleAlert, CircleCheck, Clock, Eye, Lightbulb, Loader2, PenLine, Send } from "lucide-react";
import { TONES, cx } from "@/components/ui";
import type { CalendarPillar } from "@/lib/calendar/types";
import { STATE_META, type DisplayState } from "@/lib/calendar/view";

export const STATE_ICONS: Record<DisplayState, LucideIcon> = {
  idea: Lightbulb,
  draft: PenLine,
  review: Eye,
  approved: CircleCheck,
  scheduled: Clock,
  due: BellRing,
  publishing: Loader2,
  verify: CircleAlert,
  published: Send,
  stale: CalendarX2,
};

export function toneOf(name: string | null | undefined) {
  return TONES[name ?? "gray"] ?? TONES.gray;
}

export function StateIcon({ state, className }: { state: DisplayState; className?: string }) {
  const Icon = STATE_ICONS[state];
  return <Icon className={cx("shrink-0", state === "publishing" && "animate-spin", className)} style={{ color: toneOf(STATE_META[state].tone).fg }} aria-hidden />;
}

export function StateChip({ state }: { state: DisplayState }) {
  const t = toneOf(STATE_META[state].tone);
  const Icon = STATE_ICONS[state];
  return (
    <span className="chip" style={{ ["--chip-fg" as string]: t.fg, ["--chip-bg" as string]: t.bg }}>
      <Icon className={cx("size-3.5", state === "publishing" && "animate-spin")} aria-hidden />
      {STATE_META[state].label}
    </span>
  );
}

export function PillarDot({ color, className }: { color: string | null | undefined; className?: string }) {
  return <span className={cx("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: toneOf(color).fg }} aria-hidden />;
}

export function pillarById(pillars: CalendarPillar[], id: string | null | undefined): CalendarPillar | null {
  return id ? (pillars.find((p) => p.id === id) ?? null) : null;
}

/** Copy text to the clipboard; falls back to execCommand on plain-http origins (e.g. a LAN IP). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  } catch {
    return false;
  }
}

export function photoUrl(photoId: string, size: "thumb" | "full" = "thumb") {
  return `/api/photos/${encodeURIComponent(photoId)}/file?size=${size}`;
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "?"
  );
}

/** "Tue, Oct 13 · 08:30" in the profile's zone. */
export function formatWhen(at: string | null, timezone: string, locale?: string): string {
  if (!at) return "No date";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "No date";
  const day = new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone: timezone }).format(d);
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timezone }).format(d);
  return `${day} · ${time}`;
}
