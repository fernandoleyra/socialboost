import { getStrategy, listInterviews, listMemories, requireProfile } from "@/lib/repo";
import { safeTimezone } from "@/lib/dashboard";
import { StrategyEditor } from "@/components/strategy/strategy-editor";

export const dynamic = "force-dynamic";

export default function StrategyPage() {
  const profile = requireProfile();
  const strategy = getStrategy(profile.id);

  // Stories per pillar (anything still in play) so the editor can show depth and warn before removing a pillar.
  const storyCounts: Record<string, number> = {};
  for (const m of listMemories(profile.id, { status: "active" })) {
    if (m.pillar) storyCounts[m.pillar] = (storyCounts[m.pillar] ?? 0) + 1;
  }

  const activePositioningId =
    listInterviews(profile.id).find((i) => i.kind === "positioning" && i.status === "active" && (i.messageCount ?? 0) > 0)?.id ?? null;

  return (
    <StrategyEditor
      initial={strategy}
      language={profile.language}
      timezone={safeTimezone(profile.timezone)}
      storyCounts={storyCounts}
      activePositioningId={activePositioningId}
    />
  );
}
