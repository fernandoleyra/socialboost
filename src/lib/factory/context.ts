import "server-only";
import { getMemory, getPhoto, getProfile, getStrategy, getVoiceProfile, type VoiceSample } from "@/lib/repo";
import { HttpError } from "@/lib/http";
import { pickVoiceExamples, voicePromptBlock } from "@/lib/voice/examples";
import type { Memory, Post, VoiceProfile } from "@/lib/types";
import { findPillar } from "./pillars";
import { extractNeverSay, lintPost, type LintResult } from "./lint";
import { factsText, type PromptContext } from "./prompts";

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

/** Inputs for linting a post without loading voice examples (cheap: used on every save). */
export function lintInputs(post: Pick<Post, "profileId" | "memoryId" | "photoId">): { facts?: string; neverSay: string[]; stats: VoiceProfile["stats"] } {
  const strategy = getStrategy(post.profileId);
  const profile = getProfile(post.profileId);
  const memory = post.memoryId ? getMemory(post.memoryId) : null;
  const photo = post.photoId ? getPhoto(post.photoId) : null;
  const voice = getVoiceProfile(post.profileId);
  const facts = memory
    ? factsText({
        author: { name: profile?.name ?? "", headline: profile?.headline ?? "" },
        language: strategy?.language || profile?.language || "en",
        strategy,
        pillar: null,
        memory,
        photo: photo ? { caption: photo.caption, userNote: photo.userNote } : null,
        voiceBlock: "",
        examples: [],
        stats: voice.stats,
      })
    : undefined;
  return { facts, neverSay: extractNeverSay(voice.manualRules), stats: voice.stats };
}

export function lintForPost(post: Post, body: string): LintResult {
  const { facts, neverSay, stats } = lintInputs(post);
  return lintPost(body, stats, { facts, neverSay });
}
