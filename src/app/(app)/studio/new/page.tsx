import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { CreateFromMemory, MemoryPicker, type PickerMemory } from "@/components/studio/memory-picker";
import { getMemory, getStrategy, listMemories, listPosts, requireProfile } from "@/lib/repo";
import { findPillar } from "@/lib/factory/pillars";

export const dynamic = "force-dynamic";

export const metadata = { title: "New post · Studio" };

export default async function NewPostPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = requireProfile();
  const sp = await searchParams;
  const memoryParam = typeof sp.memory === "string" ? sp.memory : null;

  if (memoryParam) {
    const memory = getMemory(memoryParam);
    if (memory && memory.profileId === profile.id) return <CreateFromMemory memoryId={memory.id} title={memory.title} />;
  }

  const strategy = getStrategy(profile.id);
  const pillars = (strategy?.pillars ?? []).map((p) => ({ id: p.id, name: p.name, color: p.color }));
  const usage = new Map<string, number>();
  for (const p of listPosts(profile.id)) if (p.memoryId && p.status !== "archived") usage.set(p.memoryId, (usage.get(p.memoryId) ?? 0) + 1);

  const memories: PickerMemory[] = listMemories(profile.id, { status: "active" }).map((m) => {
    const pillar = findPillar(strategy, m.pillar);
    return {
      id: m.id,
      title: m.title,
      summary: m.summary,
      when: m.when,
      pillar: pillar ? { id: pillar.id, name: pillar.name, color: pillar.color } : null,
      coverPhotoId: m.coverPhotoId ?? null,
      photoCount: m.photoCount ?? 0,
      strength: m.strength,
      status: m.status,
      postCount: usage.get(m.id) ?? 0,
      createdAt: m.createdAt,
      search: [m.title, m.summary, m.story.slice(0, 600), m.place, m.when, m.lesson, ...m.people, ...m.tags, pillar?.name].filter(Boolean).join(" ").toLowerCase(),
    };
  });

  return (
    <div className="space-y-2">
      <Link href="/studio" className="btn btn-plain btn-sm -ml-3 mb-2">
        <ChevronLeft className="size-4" />
        Studio
      </Link>
      <PageHeader
        eyebrow="New post"
        title="Which story should we tell?"
        subtitle={
          memoryParam
            ? "That story isn't in this profile's Memory Bank. Pick one below."
            : "Pick a moment from your Memory Bank. We'll suggest three angles, draft it in your voice and flag anything that sounds machine-made. You approve every word."
        }
      />
      <MemoryPicker memories={memories} pillars={pillars} />
    </div>
  );
}
