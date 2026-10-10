import { PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/repo";

export default function TodayPage() {
  const profile = requireProfile();
  return <PageHeader eyebrow="Today" title={`Good to see you, ${profile.name.split(" ")[0]}`} subtitle="Placeholder" />;
}
