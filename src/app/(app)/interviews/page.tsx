import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Mic } from "lucide-react";
import { EmptyState, PageHeader, Section } from "@/components/ui";
import { PositioningCard, StoryInterviewCard } from "@/components/interview/interview-cards";
import { getStrategy, listInterviews, requireProfile } from "@/lib/repo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Interviews — SocialBoost" };

export default function InterviewsPage() {
  const profile = requireProfile();
  const interviews = listInterviews(profile.id);
  const strategy = getStrategy(profile.id);
  const pillars = (strategy?.pillars ?? []).map((p) => ({ id: p.id, name: p.name, color: p.color }));

  const positioning = interviews.find((i) => i.kind === "positioning" && i.status === "active") ?? interviews.find((i) => i.kind === "positioning" && i.status === "completed") ?? null;
  const stories = interviews.filter((i) => i.kind === "story");
  const inProgress = stories.filter((i) => i.status === "active");
  const past = stories.filter((i) => i.status !== "active");
  const saved = stories.reduce((n, i) => n + (i.memoryCount ?? 0), 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Interviews"
        subtitle="Every post starts as a conversation. Tell one real moment, add a photo, and it lands in your Memory Bank, ready to write."
        actions={
          <Link href="/interviews/new?kind=story" className="btn btn-primary">
            <Mic className="size-4" />
            Start a story interview
          </Link>
        }
      />

      <PositioningCard interview={positioning} strategy={strategy} timeZone={profile.timezone} />

      {inProgress.length > 0 && (
        <Section title="In progress" subtitle="Pick up where you left off. Nothing is saved to the Memory Bank until you tap Finish.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {inProgress.map((i) => (
              <StoryInterviewCard key={i.id} interview={i} pillars={pillars} timeZone={profile.timezone} />
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Story interviews"
        subtitle={past.length ? `${past.length} ${past.length === 1 ? "interview" : "interviews"} · ${saved} ${saved === 1 ? "story" : "stories"} saved` : undefined}
      >
        {past.length === 0 ? (
          <EmptyState
            icon={<BookOpen />}
            title={inProgress.length ? "No finished stories yet" : "No story interviews yet"}
            body="We'll ask about one moment from your work: where you were, who was there, what was said, what changed. About 10 minutes. You'll end with a story in your Memory Bank and a photo to go with it."
            action={
              <Link href="/interviews/new?kind=story" className="btn btn-primary">
                Start a story interview
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {past.map((i) => (
              <StoryInterviewCard key={i.id} interview={i} pillars={pillars} timeZone={profile.timezone} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
