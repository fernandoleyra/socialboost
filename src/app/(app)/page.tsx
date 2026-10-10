import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, Camera, Library, Mic, PenLine } from "lucide-react";
import { PageHeader, Stat } from "@/components/ui";
import { getActiveProfile } from "@/lib/repo";
import { loadDashboard, type DashboardView } from "@/components/today/data";
import { NextActions } from "@/components/today/next-actions";
import { WeekStrip } from "@/components/today/week-strip";
import { PillarBalance } from "@/components/today/pillar-balance";
import { ActivityList } from "@/components/today/activity-list";
import { QuickCapture } from "@/components/today/quick-capture";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Today — SocialBoost" };

function statusLine(v: DashboardView): string {
  if (!v.hasStrategy) return "Let's get your LinkedIn engine running. It starts with a short conversation about what you want LinkedIn to do for you.";
  const s = v.stats;
  const parts = [`${s.readyUnused} ${s.readyUnused === 1 ? "story" : "stories"} ready to write`];
  if (s.inReview) parts.push(`${s.inReview} ${s.inReview === 1 ? "draft" : "drafts"} to review`);
  const next = v.nextPost ? ` Next post: ${v.nextPost.when}.` : "";
  return parts.join(", ") + "." + next;
}

export default function TodayPage() {
  const profile = getActiveProfile();
  if (!profile) redirect("/welcome");
  const now = new Date();
  const v = loadDashboard(profile, now);
  const pillarMap = Object.fromEntries(v.pillars.map((p) => [p.id, { name: p.name, color: p.color }]));
  const s = v.stats;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={v.dateLabel}
        title={`${v.greeting}, ${v.firstName}`}
        subtitle={statusLine(v)}
        actions={
          <Link href="/interviews/new?kind=story" className="btn btn-primary">
            <Mic className="size-4" />
            Story interview
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <NextActions actions={v.actions} />
        </div>
        <div className="space-y-6">
          <QuickCapture />
          <div className="grid grid-cols-2 gap-3">
            <Link href="/memories" className="block rounded-card transition-transform hover:-translate-y-0.5 focus-ring">
              <Stat label="Stories ready" value={s.readyUnused} sub={`Aim for ${s.storyTarget}: two weeks of posts`} tone="blue" icon={<Library />} />
            </Link>
            <Link href="/memories?filter=needs-photo" className="block rounded-card transition-transform hover:-translate-y-0.5 focus-ring">
              <Stat label="Need a photo" value={s.needPhoto} sub={s.needPhoto ? "Add one per story" : "All stories have one"} tone="orange" icon={<Camera />} />
            </Link>
            <Link href="/studio" className="block rounded-card transition-transform hover:-translate-y-0.5 focus-ring">
              <Stat label="Drafts" value={s.drafts} sub={`${s.inReview} waiting for review`} tone="teal" icon={<PenLine />} />
            </Link>
            <Link href="/calendar" className="block rounded-card transition-transform hover:-translate-y-0.5 focus-ring">
              <Stat label="Scheduled" value={s.scheduledNext14} sub={`Next 14 days · ${s.approvedNext14} approved`} tone="green" icon={<CalendarCheck />} />
            </Link>
          </div>
        </div>
      </div>

      <WeekStrip week={v.week} pillars={pillarMap} />

      <div className="grid gap-6 md:grid-cols-2">
        <PillarBalance rows={v.balance} storyTarget={s.storyTarget} />
        <ActivityList items={v.activity} now={now} />
      </div>
    </div>
  );
}
