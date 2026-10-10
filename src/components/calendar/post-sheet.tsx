"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, CalendarClock, CalendarX2, Camera, CircleAlert, Copy, Download, ExternalLink, Library, Link2, RotateCcw, Send, Sparkles } from "lucide-react";
import { Button, Chip, Field, Input, Sheet, Typing, api, cx, toast } from "@/components/ui";
import type { CalendarData, CalendarPost } from "@/lib/calendar/types";
import { linkedinComposerUrl } from "@/lib/calendar/linkedin-format";
import { STATE_META } from "@/lib/calendar/view";
import { zonedToUtc, isDayKey, parseTime } from "@/lib/calendar/time";
import { LinkedInPreview } from "./linkedin-preview";
import { PillarDot, StateChip, copyText, formatWhen, photoUrl, pillarById } from "./helpers";
import { LOCALE } from "./views";

type Props = {
  post: CalendarPost | null;
  data: CalendarData;
  profile: { name: string; headline: string };
  onClose: () => void;
  /** Move or unschedule; resolves true when it worked. */
  onMove: (post: CalendarPost, scheduledAt: string | null) => Promise<boolean>;
  /** Something changed on the server: refetch. */
  onChanged: () => void;
};

function Callout({ tone, icon, children }: { tone: "red" | "orange" | "blue"; icon: React.ReactNode; children: React.ReactNode }) {
  const color = `var(--sys-${tone})`;
  return (
    <div className="flex items-start gap-2.5 rounded-inner px-3.5 py-3 t-subhead" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
      <span className="mt-0.5 shrink-0 [&>svg]:size-4" style={{ color }}>
        {icon}
      </span>
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}

function MetricsForm({ post, onSaved }: { post: CalendarPost; onSaved: () => void }) {
  const [values, setValues] = useState({
    impressions: post.impressions?.toString() ?? "",
    reactions: post.reactions?.toString() ?? "",
    comments: post.comments?.toString() ?? "",
    reposts: post.reposts?.toString() ?? "",
  });
  const [saving, setSaving] = useState(false);
  const fields: { key: keyof typeof values; label: string }[] = [
    { key: "impressions", label: "Impressions" },
    { key: "reactions", label: "Reactions" },
    { key: "comments", label: "Comments" },
    { key: "reposts", label: "Reposts" },
  ];
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body: Record<string, number | null> = {};
    for (const f of fields) {
      const raw = values[f.key].replace(/[\s,.']/g, "");
      if (raw === "") body[f.key] = null;
      else if (!/^\d+$/.test(raw)) {
        toast(`${f.label} should be a whole number.`, "error");
        return;
      } else body[f.key] = Number(raw);
    }
    setSaving(true);
    try {
      await api(`/api/posts/${post.id}/metrics`, { method: "PUT", json: body });
      toast("Results saved. Insights will use them.");
      onSaved();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {fields.map((f) => (
          <Field key={f.key} label={f.label}>
            <Input inputMode="numeric" value={values[f.key]} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} placeholder="–" className="tabular-nums" />
          </Field>
        ))}
      </div>
      <Button type="submit" variant="tinted" size="sm" loading={saving}>
        Save results
      </Button>
    </form>
  );
}

function PostedByHandForm({ post, onDone, verify }: { post: CalendarPost; onDone: () => void; verify?: boolean }) {
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/api/posts/${post.id}/publish`, { method: "POST", json: { manual: true, url: url.trim() || null } });
      toast("Marked as posted. Add its results in a few days.");
      onDone();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <Field label="Link to the post (optional)" hint="On LinkedIn: … menu on your post → Copy link to post. It lets Insights match results later.">
        <Input type="url" inputMode="url" placeholder="https://www.linkedin.com/feed/update/…" value={url} onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <Button type="submit" variant={verify ? "primary" : "tinted"} size="sm" loading={saving} icon={<Send className="size-4" />}>
        {verify ? "It's live on LinkedIn" : "I posted it"}
      </Button>
    </form>
  );
}

function RescheduleForm({ post, data, onMove }: { post: CalendarPost; data: CalendarData; onMove: Props["onMove"] }) {
  const [day, setDay] = useState(post.day && post.day >= data.todayKey ? post.day : data.todayKey);
  const [time, setTime] = useState(post.time ?? data.cadence.time);
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isDayKey(day)) return toast("Pick a date.", "error");
    const [h, m] = parseTime(time);
    const at = zonedToUtc(day, `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, data.timezone);
    if (at.getTime() < Date.now()) return toast("That time has already passed. Pick a later one.", "error");
    setSaving(true);
    await onMove(post, at.toISOString());
    setSaving(false);
  };
  const willSchedule = post.status === "approved" || post.status === "scheduled";
  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Field label="Day">
          <Input type="date" value={day} min={data.todayKey} onChange={(e) => setDay(e.target.value)} required />
        </Field>
        <Field label="Time">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required className="w-[7.5rem]" />
        </Field>
      </div>
      <p className="px-1 t-caption text-label-2">
        Times are in {data.timezone}. {willSchedule ? "The post is queued for this time." : "The post stays a plan until you approve it in the Studio."}
      </p>
      <Button type="submit" variant="glass" size="sm" loading={saving} icon={<CalendarClock className="size-4" />}>
        {post.at ? "Move" : willSchedule ? "Schedule" : "Plan for this time"}
      </Button>
    </form>
  );
}

export function PostSheet({ post, data, profile, onClose, onMove, onChanged }: Props) {
  const [busy, setBusy] = useState<null | "publish" | "retry" | "schedule" | "unschedule" | "draft">(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  if (!post) return null;
  const pillar = pillarById(data.pillars, post.pillar);
  const meta = STATE_META[post.state];
  const connected = data.linkedin.connected && !data.linkedin.expired;
  const movable = post.state !== "published" && post.state !== "publishing";

  const publish = async (retry = false) => {
    setBusy(retry ? "retry" : "publish");
    try {
      await api(`/api/posts/${post.id}/publish`, { method: "POST", json: retry ? { retry: true } : {} });
      toast("Published on LinkedIn.");
      onChanged();
      onClose();
    } catch (err) {
      toast((err as Error).message, "error");
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (await copyText(post.body)) toast("Copied. Paste it into LinkedIn.");
    else toast("Couldn't copy. Open the post in the Studio and copy it there.", "error");
  };

  const openLinkedIn = async () => {
    await copyText(post.body);
    window.open(linkedinComposerUrl(post.body), "_blank", "noopener,noreferrer");
    toast("Text copied. If LinkedIn's box is empty, paste it.", "info");
  };

  const draftNow = async () => {
    setBusy("draft");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await api("/api/studio/autopilot", { method: "POST", json: { postId: post.id }, signal: ctrl.signal });
      toast("First draft ready. Review it in the Studio.");
      onChanged();
    } catch (err) {
      if ((err as Error).name !== "AbortError") toast((err as Error).message, "error");
    } finally {
      abortRef.current = null;
      setBusy(null);
    }
  };

  const done = () => {
    onChanged();
    onClose();
  };

  const run = async (kind: "schedule" | "unschedule", at: string | null) => {
    setBusy(kind);
    const ok = await onMove(post, at);
    setBusy(null);
    if (ok && kind === "unschedule") onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex min-w-0 items-center gap-2">
          <StateChip state={post.state} />
          <span className="truncate t-headline">{post.state === "published" ? `Posted ${formatWhen(post.at, data.timezone, LOCALE)}` : post.at ? formatWhen(post.at, data.timezone, LOCALE) : "Not on the calendar"}</span>
        </span>
      }
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="order-2 md:order-1">
          <LinkedInPreview name={profile.name} headline={profile.headline} body={post.body} photoId={post.photoId} />
        </div>

        <div className="order-1 space-y-5 md:order-2">
          <div className="flex flex-wrap items-center gap-2">
            {pillar && (
              <Chip tone={pillar.color}>
                <PillarDot color={pillar.color} className="size-1.5" />
                {pillar.name}
              </Chip>
            )}
            {post.score !== null && <Chip tone={post.score >= 80 ? "green" : post.score >= 60 ? "orange" : "red"}>Quality {post.score}</Chip>}
            {!post.photoId && post.state !== "published" && (
              <Chip tone="orange">
                <Camera className="size-3.5" aria-hidden />
                Needs a photo
              </Chip>
            )}
          </div>

          <p className="t-subhead text-label-2">{meta.description}</p>

          {post.error && post.state !== "verify" && (
            <Callout tone="red" icon={<CircleAlert />}>
              <p>{post.error}</p>
            </Callout>
          )}

          {post.memoryTitle && post.memoryId && (
            <Link href={`/memories/${post.memoryId}`} className="flex items-center gap-2 rounded-inner bg-fill-4 px-3 py-2.5 t-subhead hover:bg-fill-3 focus-ring">
              <Library className="size-4 shrink-0 text-label-2" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                <span className="text-label-2">Story: </span>
                {post.memoryTitle}
              </span>
              <ArrowUpRight className="size-4 shrink-0 text-label-3" aria-hidden />
            </Link>
          )}

          {/* Primary actions by state */}
          <div className="space-y-3">
            {post.state === "due" && (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={openLinkedIn} icon={<ExternalLink className="size-4" />}>
                    Open LinkedIn
                  </Button>
                  <Button variant="glass" onClick={copy} icon={<Copy className="size-4" />}>
                    Copy text
                  </Button>
                  {post.photoId && (
                    <a className="btn btn-glass" href={`${photoUrl(post.photoId, "full")}&download=1`} download>
                      <Download className="size-4" aria-hidden />
                      Photo
                    </a>
                  )}
                  {connected && (
                    <Button variant="tinted" onClick={() => publish()} loading={busy === "publish"} icon={<Send className="size-4" />}>
                      Publish now
                    </Button>
                  )}
                </div>
                <PostedByHandForm post={post} onDone={done} />
              </>
            )}

            {post.state === "verify" && (
              <Callout tone="orange" icon={<CircleAlert />}>
                <p className="font-semibold">We couldn&apos;t confirm whether this went out.</p>
                <p className="text-label-2">Check your LinkedIn feed first. If it&apos;s there, mark it as live. If not, try again.</p>
                <div className="pt-2">
                  <PostedByHandForm post={post} onDone={done} verify />
                </div>
                <Button variant="glass" size="sm" onClick={() => publish(true)} loading={busy === "retry"} icon={<RotateCcw className="size-4" />} disabled={!connected}>
                  It didn&apos;t post. Try again
                </Button>
              </Callout>
            )}

            {post.state === "publishing" && (
              <div className="flex items-center gap-2 t-subhead text-label-2">
                <Typing /> Sending to LinkedIn…
              </div>
            )}

            {post.state === "approved" && post.at && (
              <Button variant="primary" onClick={() => run("schedule", post.at)} loading={busy === "schedule"} icon={<CalendarClock className="size-4" />}>
                Queue for {post.time}
              </Button>
            )}

            {post.state === "scheduled" && (
              <div className="flex flex-wrap gap-2">
                {connected ? (
                  <Button variant="glass" onClick={() => publish()} loading={busy === "publish"} icon={<Send className="size-4" />}>
                    Publish now
                  </Button>
                ) : (
                  <p className="w-full t-footnote text-label-2">
                    When it&apos;s time, this turns into a reminder with the text ready to paste.{" "}
                    <Link href="/settings/linkedin" className="text-accent hover:underline">
                      Connect LinkedIn
                    </Link>{" "}
                    to publish automatically.
                  </p>
                )}
              </div>
            )}

            {post.state === "idea" && post.memoryId && (
              <div className="space-y-2">
                <Button variant="tinted" onClick={draftNow} loading={busy === "draft"} icon={<Sparkles className="size-4" />}>
                  Write a first draft
                </Button>
                {busy === "draft" && (
                  <div className="flex items-center gap-2 t-footnote text-label-2">
                    <Typing />
                    Angle, draft, check, fix. This can take a couple of minutes on a local model.
                    <button type="button" className="text-accent hover:underline" onClick={() => abortRef.current?.abort()}>
                      Stop
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Link href={`/studio/${post.id}`} className={cx("btn", post.state === "published" || post.state === "due" ? "btn-glass" : "btn-primary")}>
                Open in Studio
              </Link>
              {post.state === "published" && post.linkedinUrl && (
                <a href={post.linkedinUrl} target="_blank" rel="noopener noreferrer" className="btn btn-glass">
                  <ExternalLink className="size-4" aria-hidden />
                  View on LinkedIn
                </a>
              )}
            </div>
          </div>

          {post.state === "published" && (
            <section className="space-y-3">
              <h3 className="t-footnote font-semibold uppercase tracking-wide text-label-2">Results</h3>
              <p className="t-footnote text-label-2">Check LinkedIn 2 to 3 days after posting and copy the numbers here.</p>
              <MetricsForm post={post} onSaved={onChanged} />
              {!post.linkedinUrl && (
                <details className="rounded-inner bg-fill-4 px-3 py-2">
                  <summary className="cursor-pointer t-subhead font-medium">
                    <Link2 className="mr-1.5 inline size-4 align-[-3px]" aria-hidden />
                    Add the LinkedIn link
                  </summary>
                  <div className="pt-3">
                    <PostedByHandForm post={post} onDone={onChanged} />
                  </div>
                </details>
              )}
            </section>
          )}

          {movable && (
            <section className="space-y-3 border-t border-separator pt-4">
              <h3 className="t-footnote font-semibold uppercase tracking-wide text-label-2">{post.at ? "Change the day" : "Put it on the calendar"}</h3>
              <RescheduleForm post={post} data={data} onMove={onMove} />
              {post.at && (
                <Button variant="plain" size="sm" onClick={() => run("unschedule", null)} loading={busy === "unschedule"} icon={<CalendarX2 className="size-4" />}>
                  Take off the calendar
                </Button>
              )}
            </section>
          )}
        </div>
      </div>
    </Sheet>
  );
}
