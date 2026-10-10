"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Camera, CircleAlert, Library, MessagesSquare, Wand2 } from "lucide-react";
import { Button, Chip, EmptyState, Segmented, Sheet, Switch, api, toast } from "@/components/ui";
import type { CalendarData, CalendarPost, PlanPreview } from "@/lib/calendar/types";
import { startOfWeek } from "@/lib/calendar/time";
import { formatDayShort } from "@/lib/calendar/view";
import { PillarDot, photoUrl, pillarById } from "./helpers";
import { LOCALE } from "./views";

const WEEK_OPTIONS = [
  { value: "2", label: "2 weeks" },
  { value: "4", label: "4 weeks" },
  { value: "6", label: "6 weeks" },
  { value: "8", label: "8 weeks" },
] as const;
type WeeksValue = (typeof WEEK_OPTIONS)[number]["value"];

/**
 * Auto-plan: shows a dry run first (which stories go where, and what's missing), then writes the
 * planned posts when the person confirms.
 */
export function PlanSheet({ open, data, onClose, onPlanned }: { open: boolean; data: CalendarData; onClose: () => void; onPlanned: (created: CalendarPost[]) => void }) {
  const [weeks, setWeeks] = useState<WeeksValue>("4");
  const [useInsights, setUseInsights] = useState(false);
  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ preview: PlanPreview }>("/api/calendar/plan", { method: "POST", json: { weeks: Number(weeks), dryRun: true, useInsights } });
      setPreview(res.preview);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [weeks, useInsights]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const confirm = async () => {
    setSaving(true);
    try {
      const res = await api<{ preview: PlanPreview; created: CalendarPost[] }>("/api/calendar/plan", { method: "POST", json: { weeks: Number(weeks), dryRun: false, useInsights } });
      const n = res.created.length;
      toast(n ? `Planned ${n} ${n === 1 ? "post" : "posts"}. Draft them when you're ready.` : "Nothing new to plan.");
      onPlanned(res.created);
      onClose();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const count = preview?.items.length ?? 0;
  const byWeek = new Map<string, PlanPreview["items"]>();
  for (const item of preview?.items ?? []) {
    const monday = startOfWeek(item.day);
    if (!byWeek.has(monday)) byWeek.set(monday, []);
    byWeek.get(monday)!.push(item);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="lg"
      title="Plan the next weeks"
      footer={
        <>
          <Button variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirm} loading={saving} disabled={loading || !count} icon={<Wand2 className="size-4" />}>
            {count ? `Add ${count} ${count === 1 ? "post" : "posts"} to the calendar` : "Nothing to add"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="t-subhead text-label-2">
          We fill your open posting days with unused stories from your Memory Bank, keep your pillars in balance, avoid the same pillar twice in a row, and pick stories with a photo
          first. They land as plans: nothing is written or posted until you draft and approve them.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented value={weeks} options={WEEK_OPTIONS.map((o) => ({ ...o }))} onChange={setWeeks} />
          <label className="flex items-center gap-2 t-footnote text-label-2">
            <Switch checked={useInsights} onChange={setUseInsights} label="Use the pillar mix Insights suggests" />
            Use the mix Insights suggests
          </label>
        </div>

        {loading && !preview && (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="skeleton h-14" />
            ))}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-inner px-3.5 py-3 t-subhead" style={{ background: "color-mix(in srgb, var(--sys-red) 12%, transparent)" }}>
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-sys-red" aria-hidden />
            <div className="space-y-2">
              <p>{error}</p>
              <Button size="sm" variant="glass" onClick={() => void load()}>
                Try again
              </Button>
            </div>
          </div>
        )}

        {preview && (
          <div className={loading ? "space-y-5 opacity-60 transition-opacity" : "space-y-5 transition-opacity"}>
            {useInsights && preview.weightsFrom === "strategy" && <p className="t-footnote text-label-2">Not enough results yet for a suggested mix, so this plan uses your strategy&apos;s weights.</p>}

            {preview.readyStories === 0 && preview.openSlots > 0 ? (
              <EmptyState
                icon={<Library />}
                title="No unused stories to plan with"
                body="Every ready story already has a post, or the Memory Bank is empty. A 10-minute story interview gives you one or two new ones."
                action={
                  <Link href="/interviews/new?kind=story" className="btn btn-primary">
                    <MessagesSquare className="size-4" aria-hidden />
                    Start a story interview
                  </Link>
                }
              />
            ) : (
              <ul className="space-y-1.5 t-subhead">
                {preview.messages.map((m) => (
                  <li key={m} className="flex gap-2">
                    <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-label-3" aria-hidden />
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            )}

            {preview.gaps.length > 0 && (
              <div className="space-y-2">
                {preview.gaps.map((g) => {
                  const pillar = pillarById(data.pillars, g.pillar);
                  return (
                    <div key={g.pillar ?? "none"} className="flex flex-wrap items-center justify-between gap-3 rounded-inner px-3.5 py-3" style={{ background: "color-mix(in srgb, var(--sys-orange) 11%, transparent)" }}>
                      <span className="flex items-center gap-2 t-subhead">
                        <PillarDot color={pillar?.color} />
                        <span>
                          <strong className="font-semibold">{g.pillarName}</strong> needs about {g.missing} more {g.missing === 1 ? "story" : "stories"}
                        </span>
                      </span>
                      <Link href={`/interviews/new?kind=story${g.pillar ? `&pillar=${encodeURIComponent(g.pillar)}` : ""}`} className="btn btn-sm btn-glass">
                        Story interview
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}

            {[...byWeek.entries()].map(([monday, items]) => (
              <section key={monday} className="space-y-2">
                <h3 className="px-1 t-footnote font-semibold uppercase tracking-wide text-label-2">Week of {formatDayShort(monday, LOCALE)}</h3>
                <div className="card list-group">
                  {items.map((item) => {
                    const pillar = pillarById(data.pillars, item.pillar);
                    return (
                      <div key={item.at} className="list-row">
                        {item.photoId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photoUrl(item.photoId)} alt="" loading="lazy" className="size-11 shrink-0 rounded-[10px] object-cover" />
                        ) : (
                          <span className="grid size-11 shrink-0 place-items-center rounded-[10px] text-sys-orange" style={{ background: "color-mix(in srgb, var(--sys-orange) 14%, transparent)" }}>
                            <Camera className="size-4" aria-label="Needs a photo" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="t-subhead font-medium line-clamp-1">{item.memoryTitle}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 t-caption text-label-2">
                            <span className="tabular-nums">
                              {formatDayShort(item.day, LOCALE)} · {item.time}
                            </span>
                            {pillar && (
                              <span className="flex items-center gap-1">
                                <PillarDot color={pillar.color} className="size-1.5" />
                                {pillar.name}
                              </span>
                            )}
                            <span className="hidden text-label-3 sm:inline">{item.reason}</span>
                          </div>
                        </div>
                        {item.needsPhoto && <Chip tone="orange">Needs a photo</Chip>}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
