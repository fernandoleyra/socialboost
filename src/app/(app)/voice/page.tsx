import { redirect } from "next/navigation";
import { VoiceStudio } from "@/components/voice/voice-studio";
import { getActiveProfile } from "@/lib/repo";
import { getVoiceState, indexInBackground } from "@/lib/voice/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Voice · SocialBoost" };

export default function VoicePage() {
  const profile = getActiveProfile();
  if (!profile) redirect("/welcome");
  indexInBackground(profile.id);
  return <VoiceStudio key={profile.id} initial={getVoiceState(profile.id)} author={{ name: profile.name, headline: profile.headline }} />;
}
