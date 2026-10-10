import Link from "next/link";
import { Compass, Mic } from "lucide-react";
import type { PillarBalanceRow } from "@/lib/dashboard";
import { toneColor } from "./tone";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function PillarBalance({ rows, storyTarget }: { rows: PillarBalanceRow[]; storyTarget: number }) {
  return (
    <section className="space-y-3" aria-labelledby="balance-title">
      <div className="flex items-end justify-between gap-4 px-1">
        <div>
          <h2 id="balance-title" className="t-title-3">
            Pillar balance
          </h2>
          <p className="t-footnote mt-0.5 text-label-2">Stories ready to write (not yet planned) against the mix you want.</p>
        </div>
        <Link href="/strategy" className="btn btn-plain btn-sm shrink-0">
          Strategy
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="card flex flex-col items-start gap-3 p-5">
          <span className="grid size-10 place-items-center rounded-full bg-fill-4 text-label-2">
            <Compass className="size-5" />
          </span>
          <p className="t-subhead text-label-2">
            No content pillars yet. The positioning interview suggests 3-4 themes you can own; you can also add them yourself on the Strategy page.
          </p>
          <Link href="/strategy" className="btn btn-tinted btn-sm">
            Set up pillars
          </Link>
        </div>
      ) : (
        <div className="card space-y-4 p-5">
          {rows.map((r) => {
            const color = toneColor(r.color);
            const low = r.state !== "ok";
            return (
              <div key={r.id} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
                  <span className="min-w-0 flex-1 truncate t-subhead font-semibold">{r.name}</span>
                  <span className="t-footnote tabular-nums text-label-2">
                    {r.ready} ready
                  </span>
                </div>
                <div
                  className="relative h-2 rounded-full bg-fill-3"
                  role="img"
                  aria-label={`${r.name}: ${pct(r.storyShare)} of ready stories, target ${pct(r.targetShare)}`}
                >
                  <span className="absolute inset-y-0 left-0 rounded-full transition-[width]" style={{ width: pct(r.storyShare), background: color }} />
                  {/* target marker */}
                  <span className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-label" style={{ left: `calc(${pct(r.targetShare)} - 1px)`, opacity: 0.55 }} />
                </div>
                <div className="flex items-center justify-between gap-2 t-caption text-label-2">
                  <span>
                    Target {pct(r.targetShare)} · ready stories {pct(r.storyShare)}
                  </span>
                  {low && (
                    <Link
                      href={`/interviews/new?kind=story&pillar=${encodeURIComponent(r.id)}`}
                      className="inline-flex items-center gap-1 font-semibold text-sys-orange hover:underline"
                    >
                      <Mic className="size-3" />
                      {r.state === "empty" ? "None ready" : `Needs ~${Math.ceil(r.gap)} more`}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
          <p className="border-t border-separator pt-3 t-caption text-label-3">
            The marker shows your target mix. Two weeks of posting uses about {storyTarget} stories.
          </p>
        </div>
      )}
    </section>
  );
}
