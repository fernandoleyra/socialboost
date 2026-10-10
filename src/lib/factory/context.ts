import "server-only";
import { getMemory, getPhoto, getProfile, getStrategy, getVoiceProfile, type VoiceSample } from "@/lib/repo";
import { HttpError } from "@/lib/http";
import { pickVoiceExamples, voicePromptBlock } from "@/lib/voice/examples";
import type { Memory, Pillar, Post, Strategy, VoiceProfile } from "@/lib/types";
import { extractNeverSay, lintPost, type LintResult } from "./lint";
import { factsText, type PromptContext } from "./prompts";

/** Match a post/memory pillar reference (id or name) to the strategy's pillar. */
export function findPillar(strategy: Strategy | null, key: string | null | undefined): Pillar | null {
  if (!strategy || !key) return null;
  const k = key.trim().toLowerCase();
  return strategy.pillars.find((p) => p.id === key) ?? strategy.pillars.find((p) => p.name.trim().toLowerCase() === k) ?? null;
}

export type FactoryContext = PromptContext & {
  profileId: string;
  post: Post;
  memoryFull: Memory | null;
  voice: VoiceProfile;
  facts: string;
  neverSay: string[];
};

/**
 * Everything the writer needs for one post. Voice retrieval failures (no embeddings, empty
 * corpus) degrade to "no examples" instead of blocking the draft.
 */
export async function loadContext(post: Post, opts: { examplesQuery?: string } = {}): Promise<FactoryContext> {
  const profile = getProfile(post.profileId);
  if (!profile) throw new HttpError(404, "Profile not found");
  const strategy = getStrategy(post.profileId);
  const memory = post.memoryId ? getMemory(post.memoryId) : null;
  const photo = post.photoId ? getPhoto(post.photoId) : null;
  const pillar = findPillar(strategy, post.pillar ?? memory?.pillar);
  const voice = getVoiceProfile(post.profileId);

  let voiceBlock = "";
  try {
    voiceBlock = voicePromptBlock(post.profileId);
  } catch (err) {
    console.warn("[factory] voice block unavailable:", err instanceof Error ? err.message : err);
  }

  let examples: string[] = [];
  const query = opts.examplesQuery ?? [memory?.title, memory?.summary, memory?.lesson, post.body.slice(0, 400)].filter(Boolean).join("\n");
  if (query.trim()) {
    try {
      examples = (await pickVoiceExamples(post.profileId, query, 3)).map((s: VoiceSample) => s.text);
    } catch (err) {
      console.warn("[factory] voice examples unavailable:", err instanceof Error ? err.message : err);
    }
  }

  const ctx: PromptContext = {
    author: { name: profile.name, headline: profile.headline },
    language: strategy?.language || profile.language || "en",
    strategy,
    pillar,
    memory,
    photo: photo ? { caption: photo.caption, userNote: photo.userNote } : null,
    voiceBlock,
    examples,
    stats: voice.stats,
  };
  return {
    ...ctx,
    profileId: post.profileId,
    post,
    memoryFull: memory,
    voice,
    facts: factsText(ctx),
    neverSay: extractNeverSay(voice.manualRules),
  };
}

/** Lint options for a post without loading voice examples (cheap: used on every save). */
export function lintForPost(post: Post, body: string): LintResult {
  const strategy = getStrategy(post.profileId);
  const profile = getProfile(post.profileId);
  const memory = post.memoryId ? getMemory(post.memoryId) : null;
  const photo = post.photoId ? getPhoto(post.photoId) : null;
  const voice = getVoiceProfile(post.profileId);
  const facts = factsText({
    author: { name: profile?.name ?? "", headline: profile?.headline ?? "" },
    language: strategy?.language || profile?.language || "en",
    strategy,
    pillar: null,
    memory,
    photo: photo ? { caption: photo.caption, userNote: photo.userNote } : null,
    voiceBlock: "",
    examples: [],
    stats: voice.stats,
  });
  return lintPost(body, voice.stats, { facts: memory ? facts : undefined, neverSay: extractNeverSay(voice.manualRules) });
}
