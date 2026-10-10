"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ExternalLink, Star } from "lucide-react";
import { Chip, Spinner, api, cx, toast } from "@/components/ui";
import { HOOK_TYPE_INFO, type InsightRow } from "@/lib/calendar/insights";
import type { InsightPillar } from "@/lib/calendar/insights";
import { liftColor, liftLabel } from "./bar-list";

type Metric = "impressions" | "reactions" | "comments" | "reposts";
const METRICS: { key: Metric; label: string; short: string }[] = [
  { key: "impressions", label: "Impressions", short: "Impr." },
  { key: "reactions", label: "Reactions", short: "React." },
  { key: "comments", label: "Comments", short: "Comm." },
  { key: "reposts", label: "Reposts", short: "Rep." },
];

const PAGE = 15;

function MetricInput({ row, metric, onSaved }: { row: InsightRow; metric: (typeof METRICS)[number]; onSaved: () => void }) {
  const initial = row[metric.key]?.toString() ?? "";
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  useEffect(() => setValue(initial), [initial]);
  useEffect(() => {
    if (state !== "saved") return;
    const t = setTimeout(() => setState("idle"), 1400);
    return () => clearTimeout(t);
  }, [state]);

  const save = async () => {
    const raw = value.replace(/[\s,.']/g, "");
    if (raw === initial) return;
    if (raw !== "" && !/^\d+$/.test(raw)) {
      toast(`${metric.label} should be a whole number.`, "error");
      setValue(initial);
      return;
    }
    setState("saving");
    try {
      await api(`/api/posts/${row.id}/metrics`, { method: "PUT", json: { [metric.key]: raw === "" ? null : Number(raw) } });
      setState("saved");
      onSaved();
    } catch (err) {
      toast((err as Error).message, "error");
      setValue(initial);
      setState("idle");
    }
  };

  return (
    <label className="relative block">
      <span className="sr-only">
        {metric.label} for “{row.hook}”
      </span>
      <input
        inputMode="numeric"
        value={value}
        placeholder="–"
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setValue(initial);
        }}
        className="field h-9! min-h-0! w-full px-2.5! py-1! text-right tabular-nums"
      />
      {state !== "idle" && (
        <span className="pointer-events-none absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-[var(--bg-elevated)] shadow">
          {state === "saving" ? <Spinner className="size-3" /> : <Check className="size-3 text-sys-green" />}
        </span>
      )}
    </label>
  );
}

function dateLabel(iso: string | null, timezone: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "2-digit", timeZone: timezone }).format(new Date(iso));
}

export function PostsTable({ rows, pillars, timezone, top, onSaved }: { rows: InsightRow[]; pillars: InsightPillar[]; timezone: string; top: string[]; onSaved: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, PAGE);
  const pillarOf = (id: string | null) => pillars.find((p) => p.id === id);
  const needsResults = (r: InsightRow) => r.score === null && !!r.publishedAt && Date.now() - Date.parse(r.publishedAt) > 2 * 86_400_000;

  return (
    <div className="space-y-3">
      {/* Desktop table */}
      <div className="card hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] border-collapse t-footnote">
          <thead>
            <tr className="border-b border-separator text-left text-label-2">
              <th className="px-4 py-2.5 font-semibold">Post</th>
              {METRICS.map((m) => (
                <th key={m.key} className="w-[104px] px-1.5 py-2.5 text-right font-semibold">
                  {m.label}
                </th>
              ))}
              <th className="w-[96px] px-4 py-2.5 text-right font-semibold">vs. typical</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const pillar = pillarOf(r.pillar);
              return (
                <tr key={r.id} className="border-b border-separator last:border-b-0 align-middle">
                  <td className="max-w-0 px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {top.includes(r.id) && <Star className="size-3.5 shrink-0 fill-[var(--sys-yellow)] text-sys-yellow" aria-label="Top post" />}
                      <Link href={`/studio/${r.id}`} className="min-w-0 truncate font-medium hover:text-accent">
                        {r.hook || "Untitled post"}
                      </Link>
                      {r.linkedinUrl && (
                        <a href={r.linkedinUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-label-3 hover:text-accent" aria-label="Open on LinkedIn">
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 t-caption text-label-2">
                      <span className="tabular-nums" suppressHydrationWarning>
                        {dateLabel(r.publishedAt, timezone)}
                      </span>
                      {pillar && <span>· {pillar.name}</span>}
                      <span>· {HOOK_TYPE_INFO[r.hookType].label} opening</span>
                      {needsResults(r) && <Chip tone="orange" className="h-5! px-2!">Add results</Chip>}
                    </div>
                  </td>
                  {METRICS.map((m) => (
                    <td key={m.key} className="px-1.5 py-2">
                      <MetricInput row={r} metric={m} onSaved={onSaved} />
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums" style={{ color: r.index !== null ? liftColor(r.index) : undefined }}>
                    {r.index !== null ? liftLabel(r.index) : <span className="font-normal text-label-3">–</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phone cards */}
      <div className="space-y-2 md:hidden">
        {visible.map((r) => {
          const pillar = pillarOf(r.pillar);
          return (
            <div key={r.id} className="card space-y-3 p-3.5">
              <div className="min-w-0">
                <div className="flex items-start gap-1.5">
                  {top.includes(r.id) && <Star className="mt-0.5 size-3.5 shrink-0 fill-[var(--sys-yellow)] text-sys-yellow" aria-label="Top post" />}
                  <Link href={`/studio/${r.id}`} className="t-subhead font-medium line-clamp-2">
                    {r.hook || "Untitled post"}
                  </Link>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 t-caption text-label-2">
                  <span suppressHydrationWarning>{dateLabel(r.publishedAt, timezone)}</span>
                  {pillar && <span>· {pillar.name}</span>}
                  {r.index !== null && (
                    <span className="font-semibold" style={{ color: liftColor(r.index) }}>
                      · {liftLabel(r.index)} vs. typical
                    </span>
                  )}
                  {needsResults(r) && <Chip tone="orange" className="h-5! px-2!">Add results</Chip>}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {METRICS.map((m) => (
                  <div key={m.key} className="space-y-1">
                    <div className="px-1 t-caption-2 font-semibold text-label-2">{m.short}</div>
                    <MetricInput row={r} metric={m} onSaved={onSaved} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {rows.length > PAGE && (
        <button type="button" className={cx("btn btn-plain btn-sm")} onClick={() => setShowAll((s) => !s)}>
          {showAll ? "Show fewer" : `Show all ${rows.length} posts`}
        </button>
      )}
    </div>
  );
}
