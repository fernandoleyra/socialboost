"use client";

import { cx } from "@/components/ui";
import type { GroupStat } from "@/lib/calendar/insights";

export function liftLabel(smoothed: number): string {
  const pct = Math.round((smoothed - 1) * 100);
  if (pct === 0) return "average";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`;
}

export function liftColor(smoothed: number): string {
  if (smoothed >= 1.1) return "var(--sys-green)";
  if (smoothed <= 0.9) return "var(--sys-orange)";
  return "var(--label-2)";
}

/**
 * Horizontal bars of each group's smoothed index. The dashed line marks the person's typical
 * post (index 1), so "longer than the line" reads as "better than usual".
 */
export function BarList({ groups, colorOf, empty }: { groups: GroupStat[]; colorOf?: (g: GroupStat) => string | undefined; empty: string }) {
  if (!groups.length) return <p className="py-6 text-center t-subhead text-label-2">{empty}</p>;
  const max = Math.max(2, ...groups.map((g) => g.smoothed)) * 1.05;
  const avgLeft = (1 / max) * 100;
  return (
    <ul className="space-y-3">
      {groups.map((g) => {
        const width = Math.max(2, (g.smoothed / max) * 100);
        const color = colorOf?.(g) ?? "var(--accent)";
        return (
          <li key={g.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 t-footnote">
              <span className="min-w-0 truncate font-medium">{g.label}</span>
              <span className="shrink-0 font-semibold tabular-nums" style={{ color: liftColor(g.smoothed) }}>
                {liftLabel(g.smoothed)}
              </span>
            </div>
            <div className="relative h-2.5 rounded-full bg-fill-3" aria-hidden>
              <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500" style={{ width: `${width}%`, background: color }} />
              <span className="absolute -inset-y-1 w-0 border-l border-dashed border-label-2" style={{ left: `${avgLeft}%` }} />
            </div>
            <div className={cx("t-caption text-label-2 tabular-nums")}>
              {g.count} {g.count === 1 ? "post" : "posts"} · {Math.round(g.avgReactions)} reactions · {Math.round(g.avgComments)} comments
              {g.avgRate !== null && ` · ${(g.avgRate * 100).toFixed(1)}% rate`}
              {g.count < 3 && <span className="text-label-3"> · early signal</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
