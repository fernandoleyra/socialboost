import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NewInterview } from "@/components/interview/new-interview";
import { neediestPillar, pillarStats, planStoryInterview } from "@/lib/interview/engine";
import { getActiveProfile, getStrategy, listInterviews, listMemories } from "@/lib/repo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New interview · SocialBoost" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewInterviewPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const profile = getActiveProfile();
  if (!profile) redirect("/welcome");
  const interviews = listInterviews(profile.id);
  const activePositioning = interviews.find((i) => i.kind === "positioning" && i.status === "active") ?? null;
  const donePositioning = interviews.find((i) => i.kind === "positioning" && i.status === "completed") ?? null;

  const kindParam = sp.kind === "positioning" || sp.kind === "story" ? sp.kind : null;
  const auto = sp.auto === "1";
  // Welcome links here with auto=1: resume an unfinished positioning interview instead of starting a second one.
  if (kindParam === "positioning" && auto && activePositioning) redirect(`/interviews/${activePositioning.id}`);

  const strategy = getStrategy(profile.id);
  const memories = listMemories(profile.id);
  const pillars = strategy?.pillars ?? [];
  const stats = pillarStats(pillars, memories);
  const pillarParam = typeof sp.pillar === "string" && pillars.some((p) => p.id === sp.pillar) ? sp.pillar : null;
  const defaultPillarId = pillarParam ?? neediestPillar(pillars, memories);
  const previousSeeds = interviews.map((i) => i.promptSeed ?? "").filter(Boolean);
  const plan = planStoryInterview({ pillars, memories, previousSeeds, pillarId: defaultPillarId });
  const activeStory = interviews.find((i) => i.kind === "story" && i.status === "active") ?? null;

  return (
    <NewInterview
      initialKind={kindParam ?? (strategy?.pillars.length ? "story" : "positioning")}
      auto={auto}
      positioning={{ status: activePositioning ? "active" : donePositioning ? "completed" : "none", id: activePositioning?.id ?? donePositioning?.id ?? null }}
      pillars={pillars.map((p, i) => ({ id: p.id, name: p.name, color: p.color, description: p.description, weight: p.weight, storyPrompts: p.storyPrompts, ready: stats[i].ready }))}
      defaultPillarId={plan.pillarId}
      initialSeed={plan.seed}
      initialThemeId={plan.themeId}
      previousSeeds={previousSeeds}
      activeStory={activeStory ? { id: activeStory.id, title: activeStory.title || "Story interview" } : null}
    />
  );
}
