import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActiveProfile } from "@/lib/repo";
import { requestOrigin } from "@/lib/calendar/origin";
import { safeTimezone } from "@/lib/calendar/time";
import { linkedInSettingsFor } from "@/lib/linkedin";
import { LinkedInSetup } from "./linkedin-setup";

export const dynamic = "force-dynamic";

export const metadata = { title: "LinkedIn · Settings · SocialBoost" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LinkedInSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = getActiveProfile();
  if (!profile) redirect("/welcome");
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? null;
  };
  const origin = requestOrigin(await headers());
  return (
    <LinkedInSetup
      initial={linkedInSettingsFor(profile.id, origin)}
      profileName={profile.name}
      timezone={safeTimezone(profile.timezone)}
      connected={one("connected") === "1"}
      error={one("error")}
    />
  );
}
