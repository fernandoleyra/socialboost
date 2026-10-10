import { redirect } from "next/navigation";
import { PhotoLibrary } from "@/components/photos/photo-library";
import { getActiveProfile, getStrategy, listMemories } from "@/lib/repo";
import { listPhotoViews } from "@/lib/photos";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PhotosPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = getActiveProfile();
  if (!profile) redirect("/welcome");
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) || null;
  };
  const photos = listPhotoViews(profile.id);
  const linked = new Set(photos.map((p) => p.memoryId).filter(Boolean));
  // Archived stories only appear in the picker when a photo still points at them.
  const memories = listMemories(profile.id)
    .filter((m) => m.status !== "archived" || linked.has(m.id))
    .map((m) => ({ id: m.id, title: m.title, status: m.status }));
  const pillars = (getStrategy(profile.id)?.pillars ?? []).map((p) => ({ id: p.id, name: p.name, color: p.color }));
  const f = one("filter") ?? (one("unassigned") === "1" ? "unassigned" : null);
  const filter = f === "unassigned" || f === "linked" ? f : "all";

  return <PhotoLibrary initialPhotos={photos} memories={memories} pillars={pillars} openId={one("open")} initialFilter={filter} />;
}
