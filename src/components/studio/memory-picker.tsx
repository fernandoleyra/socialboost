"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Library, Loader2, PenLine, Search, Sparkles } from "lucide-react";
import { Button, Chip, EmptyState, Field, Input, Segmented, Select, Sheet, Textarea, api, cx, toast } from "@/components/ui";
import type { Post } from "@/lib/types";
import { NeedsPhotoChip, PillarChip, photoSrc, type PillarLite } from "./shared";

export type PickerMemory = {
  id: string;
  title: string;
  summary: string;
  when: string;
  pillar: PillarLite | null;
  coverPhotoId: string | null;
  photoCount: number;
  strength: number;
  status: "raw" | "ready" | "used" | "archived";
  postCount: number;
  createdAt: string;
  /** Lower-cased text used for the instant search. */
  search: string;
};

function Strength({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Story strength ${value} of 5`} title={`Story strength ${value}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="size-1.5 rounded-full" style={{ background: i <= value ? "var(--sys-green)" : "var(--fill)" }} />
      ))}
    </span>
  );
}

function MemoryTile({ m, busy, disabled, onPick }: { m: PickerMemory; busy: boolean; disabled: boolean; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} disabled={disabled} className={cx("card card-interactive text-left overflow-hidden flex flex-col focus-ring disabled:cursor-wait", disabled && !busy && "opacity-60")}>
      <div className="relative aspect-[16/10] w-full bg-fill-4">
        {m.coverPhotoId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoSrc(m.coverPhotoId)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--sys-orange) 16%, transparent), color-mix(in srgb, var(--sys-pink) 10%, transparent))" }} />
        )}
        <div className="absolute left-2.5 top-2.5 flex gap-1.5">{!m.coverPhotoId && <NeedsPhotoChip className="glass-strong" />}</div>
        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-black/25 backdrop-blur-[2px]">
            <span className="glass-strong flex items-center gap-2 rounded-full px-3 py-1.5 t-footnote font-semibold">
              <Loader2 className="size-4 animate-spin" />
              Setting up
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="t-headline line-clamp-2">{m.title}</div>
        {m.summary && <p className="t-footnote text-label-2 line-clamp-2">{m.summary}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          <PillarChip pillar={m.pillar} />
          {m.postCount > 0 ? <Chip tone="gray">Used in {m.postCount} {m.postCount === 1 ? "post" : "posts"}</Chip> : <Chip tone="green">Fresh</Chip>}
          <span className="ml-auto">
            <Strength value={m.strength} />
          </span>
        </div>
      </div>
    </button>
  );
}

function WriteYourselfSheet({ open, onClose, pillars }: { open: boolean; onClose: () => void; pillars: PillarLite[] }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pillar, setPillar] = useState("");
  const [saving, setSaving] = useState(false);
  const create = async () => {
    setSaving(true);
    try {
      const { post } = await api<{ post: Post }>("/api/posts", { method: "POST", json: { body, pillar: pillar || null } });
      router.push(`/studio/${post.id}`);
    } catch (e) {
      toast((e as Error).message, "error");
      setSaving(false);
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Write it yourself"
      footer={
        <>
          <Button variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={create} loading={saving} disabled={!body.trim()}>
            Open in editor
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="t-subhead text-label-2">Paste a rough draft or a few notes. In the editor you get the same checks for AI tells, the critique and quick revisions. The writer will only use what's in your text.</p>
        <Field label="Your draft or notes">
          <Textarea rows={9} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Last Thursday a client asked me why their forecast missed by 30%…" className="li-text" autoFocus />
        </Field>
        {pillars.length > 0 && (
          <Field label="Pillar">
            <Select value={pillar} onChange={(e) => setPillar(e.target.value)}>
              <option value="">No pillar</option>
              {pillars.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
    </Sheet>
  );
}

export function MemoryPicker({ memories, pillars }: { memories: PickerMemory[]; pillars: PillarLite[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim().toLowerCase());
  const [pillar, setPillar] = useState<string>("all");
  const [scope, setScope] = useState<"fresh" | "all">(() => (memories.some((m) => m.postCount === 0 && m.status !== "archived") ? "fresh" : "all"));
  const [busy, setBusy] = useState<string | null>(null);
  const [writeOpen, setWriteOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shown = useMemo(() => {
    const words = query.split(/\s+/).filter(Boolean);
    return memories
      .filter((m) => m.status !== "archived")
      .filter((m) => scope === "all" || m.postCount === 0)
      .filter((m) => pillar === "all" || m.pillar?.id === pillar)
      .filter((m) => words.every((w) => m.search.includes(w)))
      .sort((a, b) => a.postCount - b.postCount || b.strength - a.strength || (a.createdAt < b.createdAt ? 1 : -1));
  }, [memories, query, scope, pillar]);

  const pick = async (m: PickerMemory) => {
    setBusy(m.id);
    try {
      const { post } = await api<{ post: Post }>("/api/posts", { method: "POST", json: { memoryId: m.id, reuseEmpty: true } });
      router.push(`/studio/${post.id}?angles=1`);
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(null);
    }
  };

  const active = memories.filter((m) => m.status !== "archived");

  if (active.length === 0) {
    return (
      <>
        <EmptyState
          icon={<Library />}
          title="No stories in your Memory Bank yet"
          body="Posts here are built from real moments you've told us about. A story interview takes about 10 minutes and ends with a photo request. Or start from your own draft."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/interviews/new" className="btn btn-primary">
                Start a story interview
              </Link>
              <Button variant="glass" icon={<PenLine className="size-4" />} onClick={() => setWriteOpen(true)}>
                Write it yourself
              </Button>
            </div>
          }
        />
        <WriteYourselfSheet open={writeOpen} onClose={() => setWriteOpen(false)} pillars={pillars} />
      </>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-label-3" />
          <Input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your stories" className="pl-10" aria-label="Search your stories" />
        </div>
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: "fresh", label: "Not used yet" },
            { value: "all", label: "All stories" },
          ]}
        />
      </div>

      {pillars.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by pillar">
          <button type="button" onClick={() => setPillar("all")} aria-pressed={pillar === "all"} className={cx("chip focus-ring", pillar === "all" && "!bg-[var(--label)] !text-[var(--bg-elevated)]")}>
            All pillars
          </button>
          {pillars.map((p) => (
            <button key={p.id} type="button" onClick={() => setPillar(p.id)} aria-pressed={pillar === p.id} className="focus-ring rounded-full">
              <PillarChip pillar={p} className={cx(pillar === p.id && "ring-2 ring-[var(--chip-fg)]")} />
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <button type="button" onClick={() => setWriteOpen(true)} className="card card-interactive flex min-h-[220px] flex-col items-center justify-center gap-3 p-6 text-center focus-ring">
          <span className="grid size-12 place-items-center rounded-full bg-fill-4 text-label-2">
            <PenLine className="size-5" />
          </span>
          <span className="t-headline">Write it yourself</span>
          <span className="t-footnote text-label-2 max-w-[240px]">Start from your own draft or notes and use the checks and quick revisions.</span>
        </button>
        {shown.map((m) => (
          <MemoryTile key={m.id} m={m} busy={busy === m.id} disabled={busy !== null} onPick={() => pick(m)} />
        ))}
      </div>

      {shown.length === 0 && (
        <div className="card px-6 py-10 text-center space-y-3">
          <p className="t-subhead text-label-2">
            {scope === "fresh" && !query && pillar === "all" ? "Every story has been used at least once. Show all stories, or collect new ones." : "No stories match. Try other words, or show all stories."}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {scope === "fresh" && (
              <Button variant="glass" size="sm" onClick={() => setScope("all")}>
                Show all stories
              </Button>
            )}
            <Link href="/interviews/new" className="btn btn-tinted btn-sm">
              <Sparkles className="size-3.5" />
              Find a new story
            </Link>
          </div>
        </div>
      )}

      <WriteYourselfSheet open={writeOpen} onClose={() => setWriteOpen(false)} pillars={pillars} />
    </div>
  );
}

/** `/studio/new?memory=<id>`: create (or reuse) the post on the client, then open the editor. */
export function CreateFromMemory({ memoryId, title }: { memoryId: string; title: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api<{ post: Post }>("/api/posts", { method: "POST", json: { memoryId, reuseEmpty: true } })
      .then(({ post }) => router.replace(`/studio/${post.id}?angles=1`))
      .catch((e: Error) => setError(e.message));
  }, [memoryId, router]);
  return (
    <div className="mx-auto max-w-md pt-10">
      <div className="card flex flex-col items-center gap-3 px-8 py-12 text-center animate-in">
        {error ? (
          <>
            <div className="t-headline">Couldn't start the post</div>
            <p className="t-subhead text-label-2">{error}</p>
            <div className="mt-2 flex gap-2">
              <Link href="/studio/new" className="btn btn-glass">
                Pick another story
              </Link>
              <Link href="/memories" className="btn btn-plain">
                Memory Bank
              </Link>
            </div>
          </>
        ) : (
          <>
            <Loader2 className="size-6 animate-spin text-label-2" />
            <div className="t-headline">Setting up your post</div>
            <p className="t-subhead text-label-2">From “{title}”. Next, we'll suggest three angles.</p>
          </>
        )}
      </div>
    </div>
  );
}
