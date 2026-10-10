"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, MessageSquare, Plus, Sparkles, ThumbsUp, AlertTriangle } from "lucide-react";
import { Chip, EmptyState, Segmented, cx } from "@/components/ui";
import { VERIFY_MESSAGE, publishingSince } from "@/lib/calendar/linkedin-format";
import { BOARD_COLUMNS } from "@/lib/factory/status";
import type { PostStatus } from "@/lib/types";
import { MissingPhotoTile, NeedsPhotoChip, PillarChip, ScoreRing, StatusChip, When, photoSrc, type PillarLite } from "./shared";

export type BoardItem = {
  id: string;
  status: PostStatus;
  /** First line of the post, else the chosen angle's hook. Empty for fresh ideas. */
  hook: string;
  memoryTitle: string | null;
  pillar: PillarLite | null;
  photoId: string | null;
  score: number | null;
  ready: boolean;
  scheduledAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
  reactions: number | null;
  comments: number | null;
  error: string | null;
};

type View = "pipeline" | "scheduled" | "published" | "archived";

function PostCard({ item }: { item: BoardItem }) {
  const title = item.hook || item.memoryTitle || "Untitled post";
  return (
    <Link href={`/studio/${item.id}`} className="card card-interactive flex gap-3 p-3 focus-ring" aria-label={`Open post: ${title}`}>
      {item.photoId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoSrc(item.photoId)} alt="" loading="lazy" className="h-[70px] w-14 shrink-0 rounded-inner object-cover bg-fill-4" />
      ) : (
        <MissingPhotoTile className="h-[70px] w-14 shrink-0" />
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        {item.hook ? (
          <p className="t-subhead font-medium line-clamp-2">{item.hook}</p>
        ) : (
          <p className="t-subhead line-clamp-2">
            <span className="text-label-2">Idea · </span>
            {item.memoryTitle ?? "Untitled"}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <PillarChip pillar={item.pillar} />
          {!item.photoId && item.status !== "published" && <NeedsPhotoChip />}
          {item.scheduledAt && item.status !== "published" && (
            <Chip tone={item.status === "scheduled" ? "indigo" : "gray"}>
              <CalendarDays className="size-3" />
              <When iso={item.scheduledAt} withTime={item.status === "scheduled"} />
            </Chip>
          )}
          {item.ready && item.status === "review" && (
            <Chip tone="green">
              <CheckCircle2 className="size-3" />
              Passed checks
            </Chip>
          )}
          {item.error && item.status !== "published" && (
            <Chip tone={publishingSince(item.error) ? "blue" : item.error === VERIFY_MESSAGE ? "yellow" : "red"}>
              <AlertTriangle className="size-3" />
              {publishingSince(item.error) ? "Publishing" : item.error === VERIFY_MESSAGE ? "Check LinkedIn" : "Publish failed"}
            </Chip>
          )}
        </div>
        {item.hook && item.memoryTitle && <p className="t-caption text-label-3 truncate">From “{item.memoryTitle}”</p>}
      </div>
      {item.status !== "idea" && <ScoreRing score={item.score} size={34} />}
    </Link>
  );
}

function ListRow({ item, view }: { item: BoardItem; view: View }) {
  const title = item.hook || item.memoryTitle || "Untitled post";
  const when = view === "published" ? item.publishedAt : view === "scheduled" ? item.scheduledAt : item.updatedAt;
  return (
    <Link href={`/studio/${item.id}`} className="list-row hover:bg-fill-4 transition-colors focus-ring">
      {item.photoId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoSrc(item.photoId)} alt="" loading="lazy" className="size-11 shrink-0 rounded-[10px] object-cover bg-fill-4" />
      ) : (
        <MissingPhotoTile className="size-11 shrink-0" label={false} />
      )}
      <div className="min-w-0 flex-1">
        <p className="t-subhead font-medium truncate">{title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 t-caption text-label-2">
          {when && <span>{view === "archived" ? <>Archived <When iso={when} relative /></> : <When iso={when} />}</span>}
          {item.pillar && <span className="truncate">· {item.pillar.name}</span>}
          {view === "published" && (item.reactions !== null || item.comments !== null) && (
            <span className="inline-flex items-center gap-2">
              · <ThumbsUp className="size-3" /> {item.reactions ?? 0}
              <MessageSquare className="size-3" /> {item.comments ?? 0}
            </span>
          )}
        </div>
      </div>
      <StatusChip status={item.status} />
    </Link>
  );
}

export function StudioBoard({ items, hasMemories }: { items: BoardItem[]; hasMemories: boolean }) {
  const [view, setView] = useState<View>("pipeline");
  const [column, setColumn] = useState<PostStatus>(() => BOARD_COLUMNS.find((c) => items.some((i) => i.status === c.status))?.status ?? "idea");

  const by = useMemo(() => {
    const m = new Map<PostStatus, BoardItem[]>();
    for (const i of items) m.set(i.status, [...(m.get(i.status) ?? []), i]);
    const sortBy = (xs: BoardItem[] | undefined, key: (i: BoardItem) => string | null, dir: 1 | -1) => [...(xs ?? [])].sort((a, b) => dir * ((key(a) ?? "") < (key(b) ?? "") ? -1 : (key(a) ?? "") > (key(b) ?? "") ? 1 : 0));
    return {
      columns: Object.fromEntries(BOARD_COLUMNS.map((c) => [c.status, sortBy(m.get(c.status), (i) => i.updatedAt, -1)])) as Record<PostStatus, BoardItem[]>,
      scheduled: sortBy(m.get("scheduled"), (i) => i.scheduledAt, 1),
      published: sortBy(m.get("published"), (i) => i.publishedAt, -1),
      archived: sortBy(m.get("archived"), (i) => i.updatedAt, -1),
    };
  }, [items]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles />}
        title="Your post factory is empty"
        body={
          hasMemories
            ? "Every post starts from a real story. Pick one from your Memory Bank and we'll suggest three angles, draft it in your voice and check it for anything that sounds machine-made."
            : "Every post starts from a real story, and your Memory Bank is still empty. A 10-minute story interview gives the writer something true to work with."
        }
        action={
          hasMemories ? (
            <Link href="/studio/new" className="btn btn-primary">
              <Plus className="size-4" />
              Write your first post
            </Link>
          ) : (
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/interviews/new" className="btn btn-primary">
                Start a story interview
              </Link>
              <Link href="/studio/new" className="btn btn-glass">
                Write it yourself
              </Link>
            </div>
          )
        }
      />
    );
  }

  const count = (s: PostStatus) => items.filter((i) => i.status === s).length;
  const views: { value: View; label: string }[] = [
    { value: "pipeline", label: "Pipeline" },
    { value: "scheduled", label: `Scheduled${count("scheduled") ? ` ${count("scheduled")}` : ""}` },
    { value: "published", label: `Published${count("published") ? ` ${count("published")}` : ""}` },
    { value: "archived", label: "Archived" },
  ];

  return (
    <div className="space-y-5">
      <div className="overflow-x-auto -mx-1 px-1 pb-1">
        <Segmented value={view} options={views} onChange={setView} />
      </div>

      {view === "pipeline" && (
        <>
          <div className="md:hidden overflow-x-auto -mx-1 px-1 pb-1">
            <Segmented
              value={column}
              onChange={setColumn}
              options={BOARD_COLUMNS.map((c) => ({ value: c.status, label: `${c.title} ${by.columns[c.status].length}` }))}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {BOARD_COLUMNS.map((c) => {
              const list = by.columns[c.status];
              return (
                <section key={c.status} className={cx("space-y-3", c.status !== column && "hidden md:block")} aria-label={c.title}>
                  <div className="hidden md:flex items-center justify-between px-1">
                    <h2 className="t-headline">{c.title}</h2>
                    <span className="t-footnote text-label-2 tabular-nums">{list.length}</span>
                  </div>
                  {list.length ? (
                    <div className="space-y-2.5">
                      {list.map((i) => (
                        <PostCard key={i.id} item={i} />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-card border border-dashed border-separator px-4 py-6 text-center t-footnote text-label-2">{c.empty}</div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      {view !== "pipeline" && (
        <div className="card list-group">
          {(view === "scheduled" ? by.scheduled : view === "published" ? by.published : by.archived).map((i) => (
            <ListRow key={i.id} item={i} view={view} />
          ))}
          {(view === "scheduled" ? by.scheduled : view === "published" ? by.published : by.archived).length === 0 && (
            <div className="px-6 py-10 text-center t-subhead text-label-2">
              {view === "scheduled" && (
                <>
                  Nothing scheduled yet. Approve a post, then pick a time, or let the{" "}
                  <Link href="/calendar" className="text-accent">
                    Calendar
                  </Link>{" "}
                  plan the next weeks.
                </>
              )}
              {view === "published" && "Published posts show up here with their reactions and comments."}
              {view === "archived" && "Archived posts stay here, out of your pipeline. Open one to bring it back."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
