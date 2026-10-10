import "server-only";
import { embed } from "@/lib/llm";
import { getProfile, getVoiceProfile, listVoiceEmbeddings, listVoiceSamples, type VoiceSample } from "@/lib/repo";
import { buildVoicePromptBlock } from "./prompts";
import { rankExamples } from "./rank";
import { computeVoiceExtras } from "./stylometry";
import { MIN_POSTS_FOR_ANALYSIS } from "./types";

/**
 * Retrieval for the writer (used by the Studio pipeline).
 *
 * pickVoiceExamples: the person's own posts closest to what's being written (embedding
 * similarity blended with engagement, recency and typical length; near-duplicates skipped).
 * Without an embedding model it falls back to their best-performing recent posts.
 */
export async function pickVoiceExamples(profileId: string, query: string, k = 3): Promise<VoiceSample[]> {
  const samples = listVoiceSamples(profileId, "own");
  if (samples.length === 0 || k <= 0) return [];
  const vectors = new Map(listVoiceEmbeddings(profileId, "own").map((e) => [e.id, e.embedding]));
  let q: number[] | null = null;
  if (vectors.size > 0 && query.trim()) {
    try {
      q = (await embed([query.slice(0, 2000)]))?.[0] ?? null;
    } catch {
      q = null;
    }
  }
  const ranked = rankExamples(
    samples.map((s) => ({ ...s, embedding: vectors.get(s.id) ?? null })),
    q,
    k,
  );
  const byId = new Map(samples.map((s) => [s.id, s]));
  return ranked.map((c) => byId.get(c.id)).filter((s): s is VoiceSample => !!s);
}

/**
 * The compact "how I write" block for writer prompts: measured rules from the person's posts,
 * the style guide, and their own rules (which win). Empty string when nothing is known yet.
 */
export function voicePromptBlock(profileId: string): string {
  const profile = getVoiceProfile(profileId);
  const own = listVoiceSamples(profileId, "own");
  const extras = own.length >= MIN_POSTS_FOR_ANALYSIS ? computeVoiceExtras(own.map((s) => s.text), { language: getProfile(profileId)?.language }) : null;
  return buildVoicePromptBlock({ stats: profile.stats, guide: profile.guide, manualRules: profile.manualRules, extras });
}
