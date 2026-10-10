"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BellRing, CalendarCheck2, CalendarPlus, Camera, ChevronLeft, ChevronRight, CircleAlert, Inbox, Plug, Sparkles, Wand2, X } from "lucide-react";
import { Button, IconButton, PageHeader, Segmented, api, cx, toast } from "@/components/ui";
import type { Slot } from "@/lib/calendar/slots";
import { WEEKDAY_SHORT } from "@/lib/calendar/slots";
import type { CalendarData, CalendarPost } from "@/lib/calendar/types";
import { dayKeyOf, zonedToUtc, type DayKey } from "@/lib/calendar/time";
import { STATE_META, formatDayShort, formatMonthTitle, formatWeekTitle, shiftAnchor, viewRange, type CalendarView, type DisplayState } from "@/lib/calendar/view";
import { PillarDot, StateIcon } from "./helpers";
import { CardPill } from "./post-pill";
import { DraftAllSheet } from "./draft-all-sheet";
import { PlanSheet } from "./plan-sheet";
import { PostSheet } from "./post-sheet";
import { SlotSheet } from "./slot-sheet";
import { SubscribeSheet } from "./subscribe-sheet";
import { DayAgenda, LOCALE, MonthView, WeekView } from "./views";

const VIEW_KEY = "sb-calendar-view";

function Banner({ tone, icon, children, action, onDismiss }: { tone: "red" | "orange" | "blue" | "gray"; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode; onDismiss?: () => void }) {
  const color = tone === "gray" ? "var(--label-2)" : `var(--sys-${tone})`;
  return (
    <div
      className="flex flex-col gap-3 rounded-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      style={{ background: tone === "gray" ? "var(--fill-4)" : `color-mix(in srgb, ${color} 11%, transparent)` }}
    >
      <div className="flex min-w-0 items-start gap-2.5 t-subhead">
        <span className="mt-0.5 shrink-0 [&>svg]:size-4" style={{ color }}>
          {icon}
        </span>
        <div className="min-w-0">{children}</div>
      </div>
      {(action || onDismiss) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {action}
          {onDismiss && (
            <IconButton label="Hide this note" onClick={onDismiss} className="size-8! text-label-2">
              <X className="size-4" />
            </IconButton>
          )}
        </div>
      )}
    </div>
  );
}

const HIDDEN_KEY = "sb-calendar-hidden-notes";

/** Notes the person dismissed (per browser). */
function useHiddenNotes() {
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    try {
      setHidden(JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]"));
    } catch {
      /* private mode or bad JSON */
    }
  }, []);
  const hide = (id: string) =>
    setHidden((cur) => {
      const next = [...new Set([...cur, id])];
      try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
      } catch {
        /* private mode */
      }
      return next;
    });
  return { isHidden: (id: string) => hidden.includes(id), hide };
}

export function CalendarBoard({ initial, initialView, profile }: { initial: CalendarData; initialView: CalendarView; profile: { name: string; headline: string } }) {
  const [view, setView] = useState<CalendarView>(initialView);
  const [anchor, setAnchor] = useState<DayKey>(initial.todayKey);
  const [data, setData] = useState<CalendarData>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<DayKey>(initial.todayKey);
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [openSlot, setOpenSlot] = useState<Slot | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [draftTargets, setDraftTargets] = useState<CalendarPost[] | null>(null);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [dragging, setDragging] = useState<CalendarPost | null>(null);
  const [schedulingAll, setSchedulingAll] = useState(false);
  const notes = useHiddenNotes();
  const requestRef = useRef(0);
  const firstLoad = useRef(true);

  // The server rendered the month; switch to the remembered view after mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "week" || saved === "month") setView(saved);
    } catch {
      /* private mode */
    }
  }, []);

  const load = useCallback(async (v: CalendarView, a: DayKey, opts: { silent?: boolean } = {}) => {
    const id = ++requestRef.current;
    if (!opts.silent) setLoading(true);
    const range = viewRange(v, a);
    try {
      const next = await api<CalendarData>(`/api/calendar?from=${range.from}&to=${range.to}`);
      if (id !== requestRef.current) return;
      setData(next);
      setError(null);
    } catch (err) {
      if (id !== requestRef.current) return;
      setError((err as Error).message);
    } finally {
      if (id === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // The first render already has the server's data for the initial month.
    if (firstLoad.current && view === "month" && anchor === initial.todayKey) {
      firstLoad.current = false;
      return;
    }
    firstLoad.current = false;
    void load(view, anchor);
  }, [view, anchor, load, initial.todayKey]);

  const refresh = useCallback(() => void load(view, anchor), [load, view, anchor]);

  // Keep "due" states honest while the page stays open, without dimming the grid every minute.
  useEffect(() => {
    const t = setInterval(() => void load(view, anchor, { silent: true }), 60_000);
    return () => clearInterval(t);
  }, [load, view, anchor]);

  const changeView = (v: CalendarView) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode */
    }
  };

  const allPosts = useMemo(() => {
    const seen = new Set<string>();
    return [...data.posts, ...data.unscheduled, ...data.due].filter((p) => !seen.has(p.id) && seen.add(p.id));
  }, [data]);
  const openPost = openPostId ? (allPosts.find((p) => p.id === openPostId) ?? null) : null;

  /** Move a post; returns whether it worked. */
  const move = useCallback(
    async (post: CalendarPost, scheduledAt: string | null): Promise<boolean> => {
      try {
        const res = await api<{ post: CalendarPost }>("/api/calendar/move", { method: "POST", json: { postId: post.id, scheduledAt } });
        const p = res.post;
        if (!scheduledAt) toast("Taken off the calendar.");
        else if (p.status === "scheduled") toast(`Scheduled for ${formatDayShort(p.day ?? "", LOCALE)} at ${p.time}.`);
        else toast(`Planned for ${formatDayShort(p.day ?? "", LOCALE)}. Approve it in the Studio to queue it.`);
        await load(view, anchor);
        return true;
      } catch (err) {
        toast((err as Error).message, "error");
        await load(view, anchor);
        return false;
      }
    },
    [load, view, anchor],
  );

  const dropOnDay = (day: DayKey, postId: string) => {
    setDragging(null);
    const post = allPosts.find((p) => p.id === postId);
    if (!post) return;
    if (day < data.todayKey) return toast("Pick today or a later day.", "error");
    const slot = data.slots.find((s) => s.day === day);
    const time = post.time ?? slot?.time ?? data.cadence.time;
    const at = zonedToUtc(day, time, data.timezone);
    if (at.getTime() < Date.now() + 60_000) return toast(`${time} has already passed today. Open the post to pick a later time.`, "error");
    // Optimistic: show it on the new day right away.
    setData((d) => ({
      ...d,
      posts: [...d.posts.filter((p) => p.id !== postId), { ...post, day, at: at.toISOString(), time }],
      unscheduled: d.unscheduled.filter((p) => p.id !== postId),
    }));
    void move(post, at.toISOString());
  };

  const nav = (dir: -1 | 1) => {
    const next = shiftAnchor(view, anchor, dir);
    setAnchor(next);
    // On phones the agenda follows the page: today in the current month, else the first day shown.
    if (view === "month") setSelectedDay(next.slice(0, 7) === data.todayKey.slice(0, 7) ? data.todayKey : next);
  };
  const goToday = () => {
    setAnchor(data.todayKey);
    setSelectedDay(data.todayKey);
  };
  const showDay = (day: DayKey) => {
    changeView("week");
    setAnchor(day);
  };

  const due = data.due;
  const approvedDated = data.posts.filter((p) => p.state === "approved");
  const ideas = data.posts.filter((p) => p.state === "idea" && p.memoryId);
  const needPhoto = data.posts.filter((p) => !p.photoId && ["idea", "draft", "review", "approved", "scheduled"].includes(p.state));
  const title = view === "month" ? formatMonthTitle(anchor, LOCALE) : formatWeekTitle(anchor, LOCALE);
  const days = data.cadence.postingDays.map((d) => WEEKDAY_SHORT[d]).join(", ");

  const scheduleAll = async () => {
    setSchedulingAll(true);
    let ok = 0;
    for (const p of approvedDated) {
      try {
        await api("/api/calendar/move", { method: "POST", json: { postId: p.id, scheduledAt: p.at } });
        ok++;
      } catch (err) {
        toast((err as Error).message, "error");
      }
    }
    setSchedulingAll(false);
    if (ok) toast(`${ok} ${ok === 1 ? "post" : "posts"} queued.`);
    refresh();
  };

  const li = data.linkedin;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        subtitle={
          <>
            You post on {days} at {data.cadence.time} ({data.timezone}). Drag a post to another day to move it.
          </>
        }
        actions={
          <>
            <Button variant="primary" onClick={() => setPlanOpen(true)} icon={<Wand2 className="size-4" />}>
              Auto-plan
            </Button>
            <Button variant="glass" onClick={() => setDraftTargets(ideas)} icon={<Sparkles className="size-4" />} title="Write first drafts for the planned ideas in view">
              Draft all{ideas.length ? ` (${ideas.length})` : ""}
            </Button>
            <IconButton label="Subscribe in your calendar app" onClick={() => setSubscribeOpen(true)} className="btn-glass">
              <CalendarPlus className="size-4.5" />
            </IconButton>
          </>
        }
      />

      {/* Banners */}
      <div className="space-y-2 empty:hidden">
        {due.length > 0 && (
          <Banner
            tone="red"
            icon={<BellRing />}
            action={
              <Button size="sm" variant="primary" onClick={() => setOpenPostId(due[0].id)}>
                {due[0].state === "verify" ? "Check it" : "Post it now"}
              </Button>
            }
          >
            <p className="font-semibold">
              {due.length === 1 ? "A post is due" : `${due.length} posts are due`}
              {due[0].state === "verify" ? ": check LinkedIn" : ""}
            </p>
            <p className="line-clamp-1 text-label-2">“{due[0].hook || "Untitled post"}”</p>
          </Banner>
        )}
        {approvedDated.length > 0 && (
          <Banner
            tone="blue"
            icon={<CalendarCheck2 />}
            action={
              <Button size="sm" variant="tinted" onClick={scheduleAll} loading={schedulingAll}>
                Queue {approvedDated.length === 1 ? "it" : "them"}
              </Button>
            }
          >
            {approvedDated.length === 1 ? "An approved post is on the calendar but not queued yet." : `${approvedDated.length} approved posts are on the calendar but not queued yet.`}
          </Banner>
        )}
        {li.connected && li.expired && (
          <Banner tone="red" icon={<Plug />} action={<a href="/api/linkedin/connect" className="btn btn-sm btn-primary">Reconnect</a>}>
            Your LinkedIn connection expired, so scheduled posts won&apos;t publish by themselves.
          </Banner>
        )}
        {li.connected && !li.expired && li.expiringSoon && (
          <Banner tone="orange" icon={<Plug />} action={<a href="/api/linkedin/connect" className="btn btn-sm btn-glass">Reconnect</a>}>
            LinkedIn needs a reconnect in {li.daysLeft} {li.daysLeft === 1 ? "day" : "days"}. It takes one click.
          </Banner>
        )}
        {li.connected && !li.expired && !li.expiringSoon && li.scheduledAfterExpiry > 0 && li.expiresAt && (
          <Banner tone="orange" icon={<Plug />} action={<a href="/api/linkedin/connect" className="btn btn-sm btn-glass">Reconnect now</a>}>
            {li.scheduledAfterExpiry === 1 ? "A scheduled post falls" : `${li.scheduledAfterExpiry} scheduled posts fall`} after your LinkedIn connection expires on{" "}
            {formatDayShort(dayKeyOf(li.expiresAt, data.timezone), LOCALE)}. Reconnecting resets the 60 days.
          </Banner>
        )}
        {needPhoto.length > 0 && (
          <Banner tone="orange" icon={<Camera />} action={<Link href="/memories?filter=needs-photo" className="btn btn-sm btn-glass">Add photos</Link>}>
            {needPhoto.length === 1 ? "An upcoming post has" : `${needPhoto.length} upcoming posts have`} no photo yet. A real photo from the moment is what makes a story post land.
          </Banner>
        )}
        {!li.connected && !notes.isHidden("connect") && (
          <Banner tone="gray" icon={<Plug />} action={<Link href="/settings/linkedin" className="btn btn-sm btn-glass">Connect LinkedIn</Link>} onDismiss={() => notes.hide("connect")}>
            You publish by hand: when a post is due, it shows here with the text ready to copy. Connect LinkedIn to publish on schedule.
          </Banner>
        )}
        {!data.hasStrategy && (
          <Banner tone="gray" icon={<CircleAlert />} action={<Link href="/strategy" className="btn btn-sm btn-glass">Set cadence</Link>}>
            Using the default cadence, Tuesday to Thursday at 08:30. Set your own posting days in Strategy.
          </Banner>
        )}
        {data.cadence.note && data.hasStrategy && !notes.isHidden(`cadence:${data.cadence.note}`) && (
          <Banner tone="gray" icon={<CircleAlert />} onDismiss={() => notes.hide(`cadence:${data.cadence.note}`)}>
            {data.cadence.note}
          </Banner>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <IconButton label={view === "month" ? "Previous month" : "Previous week"} onClick={() => nav(-1)}>
            <ChevronLeft className="size-5" />
          </IconButton>
          <IconButton label={view === "month" ? "Next month" : "Next week"} onClick={() => nav(1)}>
            <ChevronRight className="size-5" />
          </IconButton>
          <h2 className="ml-1 t-title-3 tabular-nums" aria-live="polite">
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="glass" onClick={goToday}>
            Today
          </Button>
          <Segmented
            value={view}
            onChange={changeView}
            options={[
              { value: "month", label: "Month" },
              { value: "week", label: "Week" },
            ]}
          />
        </div>
      </div>

      {error && (
        <Banner tone="red" icon={<CircleAlert />} action={<Button size="sm" variant="glass" onClick={refresh}>Try again</Button>}>
          {error}
        </Banner>
      )}

      {/* Unscheduled tray */}
      {data.unscheduled.length > 0 && (
        <section className="space-y-2" aria-label="Approved posts without a day">
          <div className="flex items-center gap-2 px-1 t-footnote font-semibold uppercase tracking-wide text-label-2">
            <Inbox className="size-4" aria-hidden />
            Approved, waiting for a day
            <span className="font-normal normal-case tracking-normal text-label-3">
              <span className="hidden sm:inline">Drag one onto a day, or open it to pick a time.</span>
            </span>
          </div>
          <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {data.unscheduled.map((p) => (
              <div key={p.id} className="w-[160px] shrink-0 snap-start">
                <CardPill post={p} pillars={data.pillars} onOpen={(x) => setOpenPostId(x.id)} onDragStart={setDragging} onDragEnd={() => setDragging(null)} showDate="no day yet" />
              </div>
            ))}
          </div>
        </section>
      )}

      <div className={cx("relative transition-opacity", loading && "opacity-60")} aria-busy={loading}>
        {view === "month" ? (
          <div className="space-y-4">
            <MonthView
              anchor={anchor}
              data={data}
              dragging={dragging}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              onShowDay={showDay}
              onOpenPost={(p) => setOpenPostId(p.id)}
              onOpenSlot={setOpenSlot}
              onDragStart={setDragging}
              onDragEnd={() => setDragging(null)}
              onDropDay={dropOnDay}
            />
            <DayAgenda day={selectedDay} data={data} onOpenPost={(p) => setOpenPostId(p.id)} onOpenSlot={setOpenSlot} />
          </div>
        ) : (
          <WeekView
            anchor={anchor}
            data={data}
            dragging={dragging}
            onOpenPost={(p) => setOpenPostId(p.id)}
            onOpenSlot={setOpenSlot}
            onDragStart={setDragging}
            onDragEnd={() => setDragging(null)}
            onDropDay={dropOnDay}
          />
        )}
      </div>

      <Legend data={data} />

      {openPost && <PostSheet key={openPost.id} post={openPost} data={data} profile={profile} onClose={() => setOpenPostId(null)} onMove={move} onChanged={refresh} />}
      <SlotSheet key={openSlot?.at ?? "none"} slot={openSlot} data={data} onClose={() => setOpenSlot(null)} onPlace={move} onAutoPlan={() => setPlanOpen(true)} />
      <PlanSheet open={planOpen} data={data} onClose={() => setPlanOpen(false)} onPlanned={refresh} />
      <DraftAllSheet open={draftTargets !== null} posts={draftTargets ?? []} timezone={data.timezone} onClose={() => setDraftTargets(null)} onFinished={refresh} />
      <SubscribeSheet open={subscribeOpen} path={data.icsPath} onClose={() => setSubscribeOpen(false)} onPathChange={(path) => setData((d) => ({ ...d, icsPath: path }))} />
    </div>
  );
}

function Legend({ data }: { data: CalendarData }) {
  const states: DisplayState[] = ["idea", "draft", "review", "approved", "scheduled", "due", "published"];
  return (
    <div className="flex flex-col gap-2 px-1 t-caption text-label-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
      {data.pillars.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {data.pillars.map((p) => (
            <span key={p.id} className="flex items-center gap-1.5">
              <PillarDot color={p.color} />
              {p.name}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {states.map((s) => (
          <span key={s} className="flex items-center gap-1">
            <StateIcon state={s} className="size-3" />
            {STATE_META[s].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-[4px] border border-dashed border-label-3" aria-hidden />
          Open posting day
        </span>
      </div>
    </div>
  );
}
