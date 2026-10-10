import { redirect } from "next/navigation";
import { VoiceStudio } from "@/components/voice/voice-studio";
import { getActiveProfile } from "@/lib/repo";
import { getVoiceState } from "@/lib/voice/service";

export const dynamic = "force-dynamic";

export default function VoicePage() {
  const profile = getActiveProfile();
  if (!profile) redirect("/welcome");
  return <VoiceStudio key={profile.id} initial={getVoiceState(profile.id)} author={{ name: profile.name, headline: profile.headline }} />;
}
