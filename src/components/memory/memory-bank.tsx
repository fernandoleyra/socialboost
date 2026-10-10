"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Archive, Camera, CheckCircle2, Library, Mic, Plus, Search, SearchX, X } from "lucide-react";
import { Button, EmptyState, PageHeader, Segmented, Spinner, TONES, api, cx } from "@/components/ui";
import type { PhotoView } from "@/lib/photo-core";
import { MEMORY_FILTERS, MEMORY_FILTER_LABEL, memoryMatchesFilter, type MemoryCounts, type MemoryFilter, type MemoryListItem } from "@/lib/memory-core";
import { AddMemorySheet } from "./add-memory-sheet";
import { MemoryCard } from "./memory-card";
import { MemorySheet } from "./memory-sheet";
import type { PillarLite } from "./story-depth";

type ListResult = { memories: MemoryListItem[]; counts: MemoryCounts; mode: "list" | "keyword" | "semantic" };

function storyInterviewHref(pillar?: string | null) {
  return `/interviews/new?kind=story${pillar ? `&pillar=${encodeURIComponent(pillar)}` : ""}`;
}

export function MemoryBank({
  initial,
  pillars,
  initialFilter,
  initialPillar,
  openId,
}: {
  initial: ListResult;
  pillars: PillarLite[];
  initialFilter: MemoryFilter;
  initialPillar: string | null;
  openId: string | null;
}) {
  const [memories, setMemories] = useState(initial.memories);
  const [counts, setCounts] = useState(initial.counts);
  const [mode, setMode] = useState(initial.mode);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<MemoryFilter>(initialFilter);
  const [pillar, setPillar] = useState<string | null>(initialPillar);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(openId);
  const [adding, setAdding] = useState(false);
  const seq = useRef(0);
  const skipFirst = useRef(true);

  const fetchList = useCallback(
    async (quiet = false) => {
      const mine = ++seq.current;
      if (!quiet) setLoading(true);
      try {
        const params = new URLSearchParams({ filter });
        if (q.trim()) params.set("q", q.trim());
        if (pillar) params.set("pillar", pillar);
        const res = await api<ListResult>(`/api/memories?${params}`);
        if (mine !== seq.current) return;
        setMemories(res.memories);
        setCounts(res.counts);
        setMode(res.mode);
        setError(null);
      } catch (e) {
        if (mine === seq.current) setError((e as Error).message);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [filter, q, pillar],
  );

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    const t = setTimeout(() => void fetchList(), q.trim() ? 320 : 0);
    return () => clearTimeout(t);
  }, [fetchList, q]);

  // Keep filter / pillar / open story in the URL so links and reloads land in the same place.
  useEffect(() => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("filter", filter);
    if (pillar) params.set("pillar", pillar);
    if (open) params.set("open", open);
    const qs = params.toString();
    window.history.replaceState(window.history.state, "", qs ? `?${qs}` : window.location.pathname);
  }, [filter, pillar, open]);

  const changed = useRef(false);
  const upsert = useCallback(
    (m: MemoryListItem) => {
      changed.current = true;
      setMemories((ms) => {
        const i = ms.findIndex((x) => x.id === m.id);
        if (i < 0) return memoryMatchesFilter(m, filter) && !q.trim() ? [m, ...ms] : ms;
        const next = [...ms];
        next[i] = { ...next[i], ...m };
        return next;
      });
    },
    [filter, q],
  );

  const onPhotoAdded = (memoryId: string, photo: PhotoView) => {
    changed.current = true;
    setMemories((ms) => ms.map((m) => (m.id === memoryId ? { ...m, photoCount: (m.photoCount ?? 0) + 1, coverPhotoId: m.coverPhotoId ?? photo.id } : m)));
    void fetchList(true);
  };

  const closeSheet = () => {
    setOpen(null);
    if (changed.current) {
      changed.current = false;
      void fetchList(true);
    }
  };

  const searching = q.trim().length > 0;
  const bankEmpty = counts.all === 0 && counts.archived === 0 && !pillar;
  const filterOptions = MEMORY_FILTERS.map((f) => ({
    value: f,
    label: (
      <span className="flex items-center gap-1.5">
        {MEMORY_FILTER_LABEL[f]}
        {counts[f] > 0 && <span className={cx("tabular-nums", f === "needs-photo" ? "text-sys-orange" : "text-label-3")}>{counts[f]}</span>}
      </span>
    ),
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Memory Bank"
        title="Your stories"
        subtitle="Real moments from your interviews, with the details and photos that make a post believable. Everything the writer uses comes from here."
        actions={
          <>
            <Button variant="glass" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
              Add a story
            </Button>
            <Link href={storyInterviewHref(pillar)} className="btn btn-primary">
              <Mic className="size-4" />
              Story interview
            </Link>
          </>
        }
      />

      {bankEmpty && !searching ? (
        <EmptyState
          icon={<Library />}
          title="Your Memory Bank is empty"
          body="Stories come from interviews. We'll ask about one moment from your week and save it here with the details that make it real: who was there, what was said, what changed. About 10 minutes."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href={storyInterviewHref()} className="btn btn-primary">
                <Mic className="size-4" />
                Start a story interview
              </Link>
              <Button variant="glass" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
                Write one by hand
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <div className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative w-full lg:max-w-md">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-label-3" />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search by meaning: “the time a client said no”"
                  aria-label="Search stories"
                  className="field rounded-full! pl-10! pr-10! [&::-webkit-search-cancel-button]:appearance-none"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2">
                  {loading && searching ? (
                    <Spinner className="mr-1.5 size-4" />
                  ) : searching ? (
                    <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="grid size-7 place-items-center rounded-full text-label-2 hover:bg-fill-3">
                      <X className="size-4" />
                    </button>
                  ) : null}
                </span>
              </div>
              <div className="-mx-1 overflow-x-auto px-1 pb-1 lg:ml-auto">
                <Segmented value={filter} onChange={setFilter} options={filterOptions} className="w-max whitespace-nowrap" />
              </div>
            </div>

            {pillars.length > 0 && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by pillar">
                <PillarButton active={!pillar} onClick={() => setPillar(null)}>
                  All pillars
                </PillarButton>
                {pillars.map((p) => (
                  <PillarButton key={p.id} active={pillar === p.id} tone={p.color} onClick={() => setPillar(pillar === p.id ? null : p.id)}>
                    {p.name}
                  </PillarButton>
                ))}
              </div>
            )}

            {searching && !loading && mode !== "list" && (
              <p className="px-1 t-footnote text-label-2" aria-live="polite">
                {mode === "semantic" ? (
                  <>Best matches by meaning and keywords.</>
                ) : (
                  <>
                    Keyword search. Add an embedding model in{" "}
                    <Link href="/settings" className="text-accent">
                      Settings → Models
                    </Link>{" "}
                    to search by meaning.
                  </>
                )}
              </p>
            )}
          </div>

          {counts["needs-photo"] > 0 && filter !== "needs-photo" && !searching && (
            <div className="glass flex flex-col gap-3 rounded-panel p-4 sm:flex-row sm:items-center animate-in">
              <span className="grid size-10 shrink-0 place-items-center rounded-full" style={{ color: "var(--sys-orange)", background: "color-mix(in srgb, var(--sys-orange) 15%, transparent)" }}>
                <Camera className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="t-headline">
                  {counts["needs-photo"] === 1 ? "1 story still needs a photo" : `${counts["needs-photo"]} stories still need a photo`}
                </div>
                <p className="t-footnote text-label-2">Every post goes out with a real photo. A phone snapshot from the moment works best.</p>
              </div>
              <Button variant="tinted" onClick={() => setFilter("needs-photo")}>
                Show them
              </Button>
            </div>
          )}

          {error ? (
            <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
              <p className="t-subhead text-label-2">{error}</p>
              <Button variant="glass" onClick={() => void fetchList()}>
                Try again
              </Button>
            </div>
          ) : memories.length === 0 ? (
            <FilteredEmpty filter={filter} query={q} pillar={pillars.find((p) => p.id === pillar) ?? null} onClear={() => setQ("")} onAdd={() => setAdding(true)} />
          ) : (
            <div className={cx("grid gap-4 sm:grid-cols-2 xl:grid-cols-3 transition-opacity", loading && "opacity-60")} aria-busy={loading}>
              {memories.map((m) => (
                <MemoryCard key={m.id} memory={m} pillars={pillars} onOpen={() => setOpen(m.id)} onPhotoAdded={(p) => onPhotoAdded(m.id, p)} />
              ))}
            </div>
          )}
        </>
      )}

      <MemorySheet
        memoryId={open}
        onClose={closeSheet}
        pillars={pillars}
        onChanged={upsert}
        onDeleted={(id) => {
          setMemories((ms) => ms.filter((m) => m.id !== id));
          changed.current = true;
        }}
      />
      <AddMemorySheet
        open={adding}
        onClose={() => {
          setAdding(false);
          void fetchList(true);
        }}
        pillars={pillars}
        onCreated={upsert}
        onOpenStory={(id) => {
          setAdding(false);
          setOpen(id);
        }}
      />
    </div>
  );
}

function PillarButton({ active, tone, onClick, children }: { active: boolean; tone?: string; onClick: () => void; children: ReactNode }) {
  const t = tone ? (TONES[tone] ?? TONES.blue) : null;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx("chip focus-ring h-8! px-3.5! t-footnote transition-colors", !active && "hover:bg-fill-2")}
      style={
        active
          ? { ["--chip-fg" as string]: t ? t.fg : "var(--accent-contrast)", ["--chip-bg" as string]: t ? t.bg : "var(--accent)", boxShadow: t ? `inset 0 0 0 1.5px ${t.fg}` : undefined }
          : { ["--chip-fg" as string]: "var(--label-2)", ["--chip-bg" as string]: "var(--fill-3)" }
      }
    >
      {t && <span className="size-2 rounded-full" style={{ background: t.fg }} />}
      {children}
    </button>
  );
}

function FilteredEmpty({ filter, query, pillar, onClear, onAdd }: { filter: MemoryFilter; query: string; pillar: PillarLite | null; onClear: () => void; onAdd: () => void }) {
  if (query.trim()) {
    return (
      <EmptyState
        icon={<SearchX />}
        title={`No stories match “${query.trim()}”`}
        body="Try describing what happened instead of exact words, or clear the filters."
        action={
          <Button variant="glass" onClick={onClear}>
            Clear search
          </Button>
        }
      />
    );
  }
  if (filter === "needs-photo") {
    return <EmptyState icon={<CheckCircle2 />} title="Every story has a photo" body="That's what makes posts believable. New stories will show up here until they get one." />;
  }
  if (filter === "archived") {
    return <EmptyState icon={<Archive />} title="Nothing archived" body="Archive stories you don't want suggested for posts. You can restore them any time." />;
  }
  if (filter === "used") {
    return <EmptyState icon={<Library />} title="No used stories yet" body="A story moves here once a post made from it is published." />;
  }
  return (
    <EmptyState
      icon={<Library />}
      title={pillar ? `No ${filter === "ready" ? "ready " : ""}stories for ${pillar.name} yet` : filter === "ready" ? "No stories ready to write" : "No stories here"}
      body={pillar ? "A short story interview focused on this pillar will fill the gap." : "Run a story interview, or open a story marked In progress and fill in what's missing."}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Link href={storyInterviewHref(pillar?.id)} className="btn btn-primary">
            <Mic className="size-4" />
            Story interview
          </Link>
          <Button variant="glass" icon={<Plus className="size-4" />} onClick={onAdd}>
            Add by hand
          </Button>
        </div>
      }
    />
  );
}
