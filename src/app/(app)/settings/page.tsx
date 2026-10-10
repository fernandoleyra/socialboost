import { PageHeader } from "@/components/ui";
import { DATA_DIR } from "@/lib/db";
import { listProfiles, requireProfile } from "@/lib/repo";
import { getAISettings } from "@/lib/settings";
import { ProfileSection } from "@/components/settings/profile-section";
import { ModelsSection } from "@/components/settings/models-section";
import { DataSection, PublishingSection } from "@/components/settings/data-section";
import { AppearanceSection } from "@/components/settings/appearance-section";

export const dynamic = "force-dynamic";

const JUMP = [
  { href: "#profile", label: "Profile" },
  { href: "#models", label: "Models" },
  { href: "#publishing", label: "Publishing" },
  { href: "#data", label: "Data" },
  { href: "#appearance", label: "Appearance" },
];

export default function SettingsPage() {
  const profile = requireProfile();
  const others = listProfiles().filter((p) => p.id !== profile.id).length;

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <PageHeader eyebrow="Settings" title="Settings" subtitle="Your profile, the models that do the work, publishing and backups." />

      <nav aria-label="Settings sections" className="-mt-6 flex gap-1.5 overflow-x-auto pb-1">
        {JUMP.map((j) => (
          <a key={j.href} href={j.href} className="chip shrink-0 transition-colors hover:bg-fill-2! focus-ring">
            {j.label}
          </a>
        ))}
      </nav>

      <ProfileSection
        profile={{ id: profile.id, name: profile.name, headline: profile.headline, linkedinUrl: profile.linkedinUrl, language: profile.language, timezone: profile.timezone }}
        otherProfiles={others}
      />
      <ModelsSection initial={getAISettings()} />
      <PublishingSection />
      <DataSection profileName={profile.name} dataDir={DATA_DIR} />
      <AppearanceSection />
    </div>
  );
}
