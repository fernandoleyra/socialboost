import { redirect } from "next/navigation";
import { getActiveProfile } from "@/lib/repo";
import { insightsFor } from "@/lib/calendar/service";
import { InsightsBoard } from "@/components/insights/insights-board";

export const dynamic = "force-dynamic";

export const metadata = { title: "Insights · SocialBoost" };

export default function InsightsPage() {
  const profile = getActiveProfile();
  if (!profile) redirect("/welcome");
  return <InsightsBoard key={profile.id} initial={insightsFor(profile)} />;
}
