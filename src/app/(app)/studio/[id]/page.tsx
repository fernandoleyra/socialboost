import { notFound } from "next/navigation";
import { PostEditor } from "@/components/studio/post-editor";
import { getPost, getStrategy, listPosts, listVoiceSamples, requireProfile } from "@/lib/repo";
import { lintInputs } from "@/lib/factory/context";
import { postDetail } from "@/lib/factory/posts";

export const dynamic = "force-dynamic";

export const metadata = { title: "Editor · Studio" };

export default async function PostEditorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const profile = requireProfile();
  const post = getPost(id);
  if (!post || post.profileId !== profile.id) notFound();

  const detail = postDetail(post);
  const strategy = getStrategy(profile.id);
  const { facts, neverSay, stats } = lintInputs(post);
  const taken = listPosts(profile.id, { status: ["scheduled", "published"] })
    .filter((p) => p.id !== post.id)
    .map((p) => p.scheduledAt ?? p.publishedAt)
    .filter((t): t is string => !!t);

  return (
    <PostEditor
      key={post.id}
      initial={detail}
      author={{ name: profile.name, headline: profile.headline, avatarPhotoId: profile.avatarPhotoId }}
      pillars={(strategy?.pillars ?? []).map((p) => ({ id: p.id, name: p.name, color: p.color }))}
      voiceStats={stats}
      voiceSamples={listVoiceSamples(profile.id, "own").length}
      neverSay={neverSay}
      facts={facts ?? null}
      cadence={strategy ? { days: strategy.cadence.days, time: strategy.cadence.time } : null}
      taken={taken}
      hasCta={!!strategy?.cta.trim()}
      autoAngles={sp.angles === "1"}
    />
  );
}
