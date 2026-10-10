import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { getActiveProfile, listProfiles } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const active = getActiveProfile();
  if (!active) redirect("/welcome");
  const profiles = listProfiles().map((p) => ({ id: p.id, name: p.name, headline: p.headline }));
  return (
    <Shell profiles={profiles} activeId={active.id}>
      {children}
    </Shell>
  );
}
