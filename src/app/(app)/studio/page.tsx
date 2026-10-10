import Link from "next/link";
import { CalendarDays, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { StudioBoard, type BoardItem } from "@/components/studio/board";
import { getStrategy, listMemories, listPosts, requireProfile } from "@/lib/repo";
import { hookOf, parseAngleField } from "@/lib/factory/angles";
import { findPillar } from "@/lib/factory/pillars";
import { qualityGate } from "@/lib/factory/quality";

export const dynamic = "force-dynamic";

export const metadata = { title: "Studio · SocialBoost" };

function plural(n: number, one: string, many = one + "s") {
  return `${n} ${n === 1 ? one : many}`;
}

export default function StudioPage() {
  const profile = requireProfile();
  const strategy = getStrategy(profile.id);
  const posts = listPosts(profile.id);
  const memories = listMemories(profile.id);
  const titles = new Map(memories.map((m) => [m.id, m.title]));

  const items: BoardItem[] = posts.map((p) => {
    const pillar = findPillar(strategy, p.pillar);
    return {
      id: p.id,
      status: p.status,
      hook: hookOf(p.body) || parseAngleField(p.angle).selected?.hook || "",
      memoryTitle: p.memoryId ? (titles.get(p.memoryId) ?? null) : null,
      pillar: pillar ? { id: pillar.id, name: pillar.name, color: pillar.color } : null,
      photoId: p.photoId,
      score: p.body.trim() ? (p.quality?.score ?? null) : null,
      ready: qualityGate(p.quality, p.body).ready,
      scheduledAt: p.scheduledAt,
      publishedAt: p.publishedAt,
      updatedAt: p.updatedAt,
      reactions: p.reactions,
      comments: p.comments,
      error: p.error,
    };
  });

  const count = (s: string) => posts.filter((p) => p.status === s).length;
  const summary = [
    count("idea") && plural(count("idea"), "idea"),
    count("draft") && plural(count("draft"), "draft"),
    count("review") && `${count("review")} waiting for your review`,
    count("approved") && `${count("approved")} approved`,
  ].filter(Boolean);

  return (
    <div className="space-y-2">
      <PageHeader
        eyebrow="Studio"
        title="Post factory"
        subtitle={
          summary.length
            ? `${summary.join(" · ")}. Every post is built from a real story, checked for AI tells, and waits for your approval.`
            : "Turn the stories in your Memory Bank into posts that sound like you. Nothing goes out without your approval."
        }
        actions={
          <>
            <Link href="/calendar" className="btn btn-glass">
              <CalendarDays className="size-4" />
              Calendar
            </Link>
            <Link href="/studio/new" className="btn btn-primary">
              <Plus className="size-4" />
              New post
            </Link>
          </>
        }
      />
      <StudioBoard items={items} hasMemories={memories.some((m) => m.status !== "archived")} />
    </div>
  );
}
