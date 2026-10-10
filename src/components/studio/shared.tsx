"use client";

import { Camera } from "lucide-react";
import { Chip, TONES, cx } from "@/components/ui";
import { scoreTone } from "@/lib/factory/quality";
import { STATUS_META } from "@/lib/factory/status";
import type { PostStatus } from "@/lib/types";

/** URL of a stored photo (served by the Photos module). */
export function photoSrc(id: string, size: "thumb" | "full" = "thumb", download = false): string {
  return `/api/photos/${encodeURIComponent(id)}/file?size=${size}${download ? "&download=1" : ""}`;
}

export type PillarLite = { id: string; name: string; color: string };

export function PillarChip({ pillar, className }: { pillar: PillarLite | null | undefined; className?: string }) {
  if (!pillar) return null;
  return (
    <Chip tone={pillar.color} className={cx("max-w-full", className)}>
      <span className="truncate">{pillar.name}</span>
    </Chip>
  );
}

export function StatusChip({ status, className }: { status: PostStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <Chip tone={meta.tone} className={className}>
      {meta.label}
    </Chip>
  );
}

export function NeedsPhotoChip({ className }: { className?: string }) {
  return (
    <Chip tone="orange" className={className}>
      <Camera className="size-3" />
      Needs a photo
    </Chip>
  );
}

/** Circular score gauge, Apple Activity-ring style. */
export function ScoreRing({ score, size = 40, stroke, label, className }: { score: number | null | undefined; size?: number; stroke?: number; label?: string; className?: string }) {
  const sw = stroke ?? Math.max(3, Math.round(size / 10));
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const value = score === null || score === undefined ? 0 : Math.max(0, Math.min(100, score));
  const tone = TONES[scoreTone(score)] ?? TONES.gray;
  return (
    <span className={cx("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }} role="img" aria-label={label ?? (score === null || score === undefined ? "Not scored yet" : `Quality score ${score} of 100`)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill-3)" strokeWidth={sw} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone.fg}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
          style={{ transition: "stroke-dashoffset var(--dur-slow) var(--spring)" }}
        />
      </svg>
      <span className="absolute font-semibold tabular-nums" style={{ fontSize: Math.max(10, size * 0.3), color: score === null || score === undefined ? "var(--label-3)" : "var(--label)" }}>
        {score === null || score === undefined ? "–" : score}
      </span>
    </span>
  );
}

export function formatWhen(iso: string | null | undefined, opts: { withTime?: boolean } = {}): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(opts.withTime === false ? {} : { hour: "2-digit", minute: "2-digit" }),
  });
}

export function relativeTime(iso: string): string {
  const t = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(t)) return "";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Placeholder tile for a missing photo — orange, obvious, never mistaken for content. */
export function MissingPhotoTile({ className, label = true }: { className?: string; label?: boolean }) {
  return (
    <div
      className={cx("grid place-items-center rounded-inner border border-dashed text-center", className)}
      style={{ borderColor: "color-mix(in srgb, var(--sys-orange) 55%, transparent)", background: "color-mix(in srgb, var(--sys-orange) 10%, transparent)", color: "var(--sys-orange)" }}
    >
      <span className="flex flex-col items-center gap-1 px-1">
        <Camera className="size-4" />
        {label && <span className="text-[10px] font-semibold leading-tight">No photo</span>}
      </span>
    </div>
  );
}
