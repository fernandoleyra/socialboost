import { redirect } from "next/navigation";
import { MemoryBank } from "@/components/memory/memory-bank";
import { getActiveProfile, getStrategy } from "@/lib/repo";
import { queryMemories } from "@/lib/memory";
import { parseMemoryFilter, type MemoryFilter } from "@/lib/memory-core";

export const dynamic = "force-dynamic";
export const metadata = { title: "Memory Bank · SocialBoost" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function MemoriesPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = getActiveProfile();
  if (!profile) redirect("/welcome");
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) || null;
  };
  const status = one("status");
  const filter: MemoryFilter = parseMemoryFilter(one("filter")) ?? (status === "ready" || status === "used" || status === "archived" ? status : "all");
  const pillar = one("pillar");
  const pillars = (getStrategy(profile.id)?.pillars ?? []).map((p) => ({ id: p.id, name: p.name, color: p.color }));
  const initial = await queryMemories(profile.id, { filter, pillar });

  return <MemoryBank key={profile.id} initial={initial} pillars={pillars} initialFilter={filter} initialPillar={pillar} openId={one("open") ?? one("id")} />;
}
