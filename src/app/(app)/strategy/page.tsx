import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActiveProfile, getStrategy, listInterviews, listMemories } from "@/lib/repo";
import { safeTimezone } from "@/lib/dashboard";
import { StrategyEditor } from "@/components/strategy/strategy-editor";
import { pillarIdOf } from "@/components/strategy/model";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Strategy — SocialBoost" };

export default function StrategyPage() {
  const profile = getActiveProfile();
  if (!profile) redirect("/welcome");
  const strategy = getStrategy(profile.id);
  const pillars = strategy?.pillars ?? [];

  // Stories per pillar (anything still in play) so the editor can show depth and warn before removing a pillar.
  const storyCounts: Record<string, number> = {};
  for (const m of listMemories(profile.id, { status: "active" })) {
    const id = pillarIdOf(pillars, m.pillar);
    if (id) storyCounts[id] = (storyCounts[id] ?? 0) + 1;
  }

  const activePositioningId =
    listInterviews(profile.id).find((i) => i.kind === "positioning" && i.status === "active" && (i.messageCount ?? 0) > 0)?.id ?? null;

  return (
    // Keyed by profile: switching people must not carry one person's unsaved edits into the other's strategy.
    <StrategyEditor
      key={profile.id}
      profileId={profile.id}
      initial={strategy}
      language={profile.language}
      timezone={safeTimezone(profile.timezone)}
      storyCounts={storyCounts}
      activePositioningId={activePositioningId}
    />
  );
}
