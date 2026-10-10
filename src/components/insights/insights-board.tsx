"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { ArrowRight, ChartNoAxesColumn, FileUp, Heart, Lightbulb, MessageSquare, Send, Trophy } from "lucide-react";
import { Button, Card, Chip, EmptyState, PageHeader, Section, Segmented, Stat, TONES, api, toast } from "@/components/ui";
import { MAX_WEIGHT_SHIFT, type GroupStat, type InsightPillar, type Insights } from "@/lib/calendar/insights";
import { BarList, liftLabel } from "./bar-list";
import { ImportSheet } from "./import-sheet";
import { Narrative } from "./narrative";
import { PostsTable } from "./posts-table";

export type InsightsPayload = { insights: Insights; pillars: InsightPillar[]; timezone: string };

type GroupKey = keyof Insights["groups"];

function ChartCard<K extends GroupKey>({
  title,
  subtitle,
  options,
  insights,
  colorOf,
}: {
  title: string;
  subtitle: string;
  options: { value: K; label: string }[];
  insights: Insights;
  colorOf?: (g: GroupStat) => string | undefined;
}) {
  const [which, setWhich] = useState<K>(options[0].value);
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="t-headline">{title}</h3>
          <p className="t-caption text-label-2">{subtitle}</p>
        </div>
        {options.length > 1 && <Segmented value={which} onChange={setWhich} options={options} />}
      </div>
      <BarList groups={insights.groups[which]} colorOf={colorOf} empty="Log results for a few posts to see this." />
    </Card>
  );
}

export function InsightsBoard({ initial }: { initial: InsightsPayload }) {
  const [data, setData] = useState(initial);
  const [importOpen, setImportOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { insights, pillars, timezone } = data;
  const t = insights.totals;

  const refresh = useCallback(async () => {
    try {
      setData(await api<InsightsPayload>("/api/insights"));
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }, []);

  /** Inline edits arrive one field at a time; recompute once they settle. */
  const refreshSoon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void refresh(), 700);
  }, [refresh]);

  const applyWeights = async () => {
    setApplying(true);
    try {
      await api("/api/insights/apply-weights", { method: "POST", json: {} });
      toast("Pillar weights updated. Auto-plan uses them from now on.");
      await refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setApplying(false);
    }
  };

  const pillarColor = (g: GroupStat) => (g.color ? (TONES[g.color] ?? TONES.blue).fg : "var(--label-3)");
  const header = (
    <PageHeader
      title="Insights"
      subtitle="What works in your own posts, compared with your typical post. LinkedIn doesn't share analytics with personal apps, so the numbers come from you."
      actions={
        t.published > 0 ? (
          <Button variant="glass" onClick={() => setImportOpen(true)} icon={<FileUp className="size-4" />}>
            Import CSV
          </Button>
        ) : undefined
      }
    />
  );

  if (t.published === 0) {
    return (
      <div>
        {header}
        <EmptyState
          icon={<ChartNoAxesColumn />}
          title="Nothing published yet"
          body="When a post goes out, it shows up here. Two or three days later, copy its reactions, comments and impressions from LinkedIn. After about five posts you'll see which pillars, openings and days work best for you."
          action={
            <Link href="/calendar" className="btn btn-primary">
              Open the calendar
            </Link>
          }
        />
      </div>
    );
  }

  const best = insights.bestPillar;
  const weights = insights.weights;
  const narrativeReason = t.measured < 3 ? `Needs results for ${3 - t.measured} more ${3 - t.measured === 1 ? "post" : "posts"}.` : "";

  return (
    <div className="space-y-8">
      {header}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Published" value={t.published} sub={`${t.last30} in the last 30 days`} icon={<Send />} tone="purple" />
        <Stat label="Avg reactions" value={t.avgReactions !== null ? Math.round(t.avgReactions) : "–"} sub={t.measured ? `across ${t.measured} measured ${t.measured === 1 ? "post" : "posts"}` : "No results logged yet"} icon={<Heart />} tone="pink" />
        <Stat
          label="Avg comments"
          value={t.avgComments !== null ? (t.avgComments < 10 ? t.avgComments.toFixed(1) : Math.round(t.avgComments)) : "–"}
          sub={t.avgRate !== null ? `${(t.avgRate * 100).toFixed(1)}% engagement rate` : "Add impressions for a rate"}
          icon={<MessageSquare />}
          tone="blue"
        />
        <Stat
          label="Best pillar"
          value={<span className="block truncate text-[22px] leading-8">{best && best.count >= 2 ? best.label : "–"}</span>}
          sub={best && best.count >= 2 ? `${liftLabel(best.smoothed)} vs. your typical post` : "Needs 2+ measured posts in a pillar"}
          icon={<Trophy />}
          tone="orange"
        />
      </div>

      {t.missingMetrics > 0 && (
        <div className="flex flex-col gap-3 rounded-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between" style={{ background: "color-mix(in srgb, var(--sys-orange) 11%, transparent)" }}>
          <p className="t-subhead">
            <strong className="font-semibold">
              {t.missingMetrics} {t.missingMetrics === 1 ? "post has" : "posts have"} no results yet.
            </strong>{" "}
            <span className="text-label-2">Type them into the table below, or import a CSV.</span>
          </p>
          <Button size="sm" variant="glass" onClick={() => setImportOpen(true)}>
            Import CSV
          </Button>
        </div>
      )}

      <Section title="What's working" subtitle="Plain findings from your numbers. Small groups are pulled toward your average so one lucky post doesn't steer the plan.">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Card className="space-y-5 p-5">
            <ul className="space-y-3">
              {insights.recommendations.map((r) => (
                <li key={r} className="flex gap-2.5 t-subhead">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-sys-yellow" aria-hidden />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-separator pt-4">
              <Narrative enabled={t.measured >= 3} reason={narrativeReason} />
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <div>
              <h3 className="t-headline">Suggested pillar mix</h3>
              <p className="t-caption text-label-2">Shifts your strategy&apos;s weights toward what performs, at most {MAX_WEIGHT_SHIFT} points per pillar at a time, so your positioning doesn&apos;t drift.</p>
            </div>
            {weights.rows.length === 0 ? (
              <p className="t-subhead text-label-2">
                {weights.reason}{" "}
                <Link href="/strategy" className="text-accent hover:underline">
                  Open Strategy
                </Link>
              </p>
            ) : (
              <ul className="space-y-2.5">
                {weights.rows.map((r) => {
                  const tone = TONES[r.color] ?? TONES.blue;
                  return (
                    <li key={r.pillarId} className="flex items-center gap-3 t-subhead">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: tone.fg }} aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{r.name}</span>
                      <span className="tabular-nums text-label-2">{r.current}%</span>
                      <ArrowRight className="size-3.5 text-label-3" aria-label="becomes" />
                      <span className="w-10 text-right font-semibold tabular-nums">{weights.ready ? `${r.suggested}%` : "–"}</span>
                      <span className="w-12 text-right">
                        {weights.ready && r.delta !== 0 && (
                          <Chip tone={r.delta > 0 ? "green" : "orange"} className="h-5! px-1.5! tabular-nums">
                            {r.delta > 0 ? "+" : "−"}
                            {Math.abs(r.delta)}
                          </Chip>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {weights.rows.length > 0 && (
              <div className="space-y-2 pt-1">
                <Button variant="primary" onClick={applyWeights} loading={applying} disabled={!weights.ready || !weights.changed}>
                  Apply suggested weights
                </Button>
                <p className="t-caption text-label-2">{!weights.ready ? weights.reason : !weights.changed ? "Your current mix already matches the numbers." : "Auto-plan uses the new weights for upcoming slots."}</p>
              </div>
            )}
          </Card>
        </div>
      </Section>

      <Section title="Breakdown" subtitle="Each bar is the group's engagement against your typical post (the dashed line).">
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="By pillar" subtitle="Which topics land" options={[{ value: "pillar", label: "Pillar" }]} insights={insights} colorOf={pillarColor} />
          <ChartCard
            title="By opening and structure"
            subtitle="The first line, and the shape of the post"
            options={[
              { value: "hook", label: "Opening" },
              { value: "structure", label: "Structure" },
              { value: "format", label: "Format" },
            ]}
            insights={insights}
          />
          <ChartCard
            title="By timing"
            subtitle={`In ${timezone}`}
            options={[
              { value: "weekday", label: "Weekday" },
              { value: "timeOfDay", label: "Time of day" },
            ]}
            insights={insights}
          />
          <ChartCard
            title="By photo and length"
            subtitle="Your own photo vs. text only, and how long"
            options={[
              { value: "photo", label: "Photo" },
              { value: "length", label: "Length" },
            ]}
            insights={insights}
          />
        </div>
      </Section>

      <Section title="Published posts" subtitle="Type results in after 2 to 3 days. Changes save when you leave a field.">
        <PostsTable rows={insights.rows} pillars={pillars} timezone={timezone} top={insights.top} onSaved={refreshSoon} />
      </Section>

      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} onImported={() => void refresh()} />
    </div>
  );
}
