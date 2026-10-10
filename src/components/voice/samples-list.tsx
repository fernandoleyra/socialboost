"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Eye, MessageCircle, Repeat2, Search, ThumbsUp, Trash2 } from "lucide-react";
import { Button, Chip, Input, Segmented, api, cx, toast } from "@/components/ui";
import type { VoiceSample } from "@/lib/repo";
import { engagement } from "@/lib/voice/rank";
import { wordCount } from "@/lib/voice/text";
import type { VoiceState } from "@/lib/voice/types";
import { errorMessage, firstLine, fmtCount, fmtDay, useHydrated } from "./format";

type Sort = "recent" | "top";
const PAGE = 15;
const SOURCE_LABEL: Record<string, string> = { paste: "Pasted", export: "Export", helper: "Helper" };
const METRICS = [
  { key: "reactions", label: "Reactions", icon: ThumbsUp },
  { key: "comments", label: "Comments", icon: MessageCircle },
  { key: "reposts", label: "Reposts", icon: Repeat2 },
  { key: "impressions", label: "Impressions", icon: Eye },
] as const;
type MetricKey = (typeof METRICS)[number]["key"];

const dateOf = (s: VoiceSample) => s.postedAt ?? s.createdAt;

function MetricsEditor({ sample, onSaved }: { sample: VoiceSample; onSaved: (s: VoiceSample) => void }) {
  const initial = Object.fromEntries(METRICS.map((m) => [m.key, sample[m.key] === null ? "" : String(sample[m.key])])) as Record<MetricKey, string>;
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = METRICS.some((m) => values[m.key] !== initial[m.key]);

  const save = async () => {
    const patch = Object.fromEntries(METRICS.map((m) => [m.key, values[m.key].trim() === "" ? null : Math.max(0, Math.round(Number(values[m.key])))])) as Record<MetricKey, number | null>;
    if (Object.values(patch).some((v) => v !== null && !Number.isFinite(v))) {
      toast("Numbers only, please", "error");
      return;
    }
    setSaving(true);
    try {
      const r = await api<{ sample: VoiceSample }>(`/api/voice/samples/${sample.id}`, { method: "PATCH", json: patch });
      onSaved(r.sample);
      toast("Numbers saved");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="t-caption text-label-2">How did it do? The writer learns most from your best-performing posts.</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {METRICS.map(({ key, label, icon: Icon }) => (
          <label key={key} className="relative block">
            <span className="sr-only">{label}</span>
            <Icon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-label-3" />
            <Input
              inputMode="numeric"
              value={values[key]}
              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value.replace(/[^\d]/g, "") }))}
              placeholder={label}
              className="!min-h-9 !py-1.5 !pl-8 t-footnote"
            />
          </label>
        ))}
      </div>
      {dirty && (
        <div className="flex justify-end">
          <Button size="sm" variant="primary" onClick={save} loading={saving}>
            Save numbers
          </Button>
        </div>
      )}
    </div>
  );
}

function SampleRow({
  sample,
  open,
  localDates,
  onToggle,
  onDeleted,
  onSaved,
}: {
  sample: VoiceSample;
  open: boolean;
  localDates: boolean;
  onToggle: () => void;
  onDeleted: (s: VoiceState) => void;
  onSaved: (s: VoiceSample) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = async () => {
    if (!confirm) {
      setConfirm(true);
      setTimeout(() => setConfirm(false), 4000);
      return;
    }
    setDeleting(true);
    try {
      onDeleted(await api<VoiceState>(`/api/voice/samples/${sample.id}`, { method: "DELETE" }));
      toast("Post removed from your voice library");
    } catch (e) {
      toast(errorMessage(e), "error");
      setDeleting(false);
    }
  };
  const hasNumbers = sample.reactions !== null || sample.comments !== null || sample.reposts !== null;

  return (
    <li className="list-row !block !py-3">
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 rounded-md text-left focus-ring" aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <div className={cx("t-subhead font-medium", !open && "truncate")}>{firstLine(sample.text)}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 t-caption text-label-2">
            <span>{fmtDay(dateOf(sample), localDates)}</span>
            <span>{wordCount(sample.text)} words</span>
            {hasNumbers ? (
              <>
                <span className="inline-flex items-center gap-1">
                  <ThumbsUp className="size-3" />
                  {fmtCount(sample.reactions)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MessageCircle className="size-3" />
                  {fmtCount(sample.comments)}
                </span>
                {sample.reposts !== null && sample.reposts > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Repeat2 className="size-3" />
                    {fmtCount(sample.reposts)}
                  </span>
                )}
              </>
            ) : (
              <span className="text-label-3">No numbers yet</span>
            )}
            {SOURCE_LABEL[sample.source] && <span className="text-label-3">{SOURCE_LABEL[sample.source]}</span>}
          </div>
        </div>
        <ChevronDown className={cx("mt-1 size-4 shrink-0 text-label-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-3 space-y-4 animate-in">
          <p className="li-text max-h-80 overflow-y-auto rounded-[14px] bg-fill-4 p-4">{sample.text}</p>
          <MetricsEditor sample={sample} onSaved={onSaved} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            {sample.url ? (
              <a href={sample.url} target="_blank" rel="noreferrer" className="btn btn-plain btn-sm">
                <ExternalLink className="size-3.5" />
                Open on LinkedIn
              </a>
            ) : (
              <span />
            )}
            <Button size="sm" variant="destructive" icon={<Trash2 className="size-3.5" />} onClick={remove} loading={deleting}>
              {confirm ? "Tap again to remove" : "Remove"}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function SamplesList({
  samples,
  indexed,
  embeddingsConfigured,
  onDeleted,
  onSaved,
}: {
  samples: VoiceSample[];
  indexed: number;
  embeddingsConfigured: boolean;
  onDeleted: (s: VoiceState) => void;
  onSaved: (s: VoiceSample) => void;
}) {
  const [sort, setSort] = useState<Sort>("recent");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const hydrated = useHydrated();
  const withNumbers = samples.filter((s) => engagement(s) !== null).length;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? samples.filter((s) => s.text.toLowerCase().includes(needle)) : [...samples];
    if (sort === "top") list.sort((a, b) => (engagement(b) ?? -1) - (engagement(a) ?? -1));
    else list.sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
    return list;
  }, [samples, q, sort]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h2 className="t-title-3">
            Your posts <span className="text-label-3 tabular-nums">{samples.length}</span>
          </h2>
          <p className="t-footnote mt-0.5 text-label-2">
            {embeddingsConfigured
              ? indexed >= samples.length
                ? "All indexed: the writer sees the ones closest to each new post as examples."
                : `${indexed} of ${samples.length} indexed for topic matching. The rest are being indexed in the background. If this number stops moving, check the embedding model in Settings → Models.`
              : "The writer picks your best and most recent posts as examples. Set an embedding model in Settings → Models to match by topic."}
          </p>
        </div>
        <Segmented
          value={sort}
          onChange={setSort}
          options={[
            { value: "recent", label: "Recent" },
            { value: "top", label: "Best performing" },
          ]}
        />
      </div>

      {samples.length > 8 && (
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-label-3" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a post" aria-label="Find a post" className="field rounded-full! pl-10!" />
        </div>
      )}

      {sort === "top" && withNumbers === 0 && (
        <Chip tone="orange" className="!h-auto whitespace-normal py-1">
          None of your posts have numbers yet. Open a post and add its reactions and comments.
        </Chip>
      )}

      {shown.length === 0 ? (
        <div className="card px-6 py-8 text-center t-subhead text-label-2">No post matches “{q}”.</div>
      ) : (
        <ul className="card list-group">
          {shown.slice(0, limit).map((s) => (
            <SampleRow
              key={s.id}
              sample={s}
              open={open === s.id}
              localDates={hydrated}
              onToggle={() => setOpen(open === s.id ? null : s.id)}
              onDeleted={(st) => {
                setOpen(null);
                onDeleted(st);
              }}
              onSaved={onSaved}
            />
          ))}
        </ul>
      )}
      {shown.length > limit && (
        <div className="flex justify-center">
          <Button variant="glass" onClick={() => setLimit((l) => l + PAGE * 2)}>
            Show more ({shown.length - limit})
          </Button>
        </div>
      )}
    </section>
  );
}
