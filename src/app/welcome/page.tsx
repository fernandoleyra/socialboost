import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listProfiles } from "@/lib/repo";
import { WelcomeFlow } from "./welcome-flow";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Welcome · SocialBoost" };

/**
 * First-run onboarding (outside the app shell). With `?new=1` it adds another person
 * to an existing workspace; otherwise it only runs while there are no profiles yet.
 */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const adding = sp.new === "1";
  const hasProfiles = listProfiles().length > 0;
  if (hasProfiles && !adding) redirect("/");
  return <WelcomeFlow adding={hasProfiles} />;
}
