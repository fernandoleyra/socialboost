import "server-only";
import { z } from "zod";
import { getDb, logActivity, parseJson } from "./db";
import { HttpError } from "./http";
import { LLMError, chatJson, cosine, embed } from "./llm";
import { createMemory, getMemory, getStrategy, getProfile, listMemories, listPosts, memoryEmbeddingText, updateMemory, updatePhoto, getPhoto } from "./repo";
import type { Memory, Pillar, Post } from "./types";
import {
  blendScore,
  cleanList,
  countMemories,
  deriveSummary,
  deriveTitle,
  keepVerbatimQuotes,
  keywordScore,
  memoryDepth,
  memoryMatchesFilter,
  pillarMatches,
  rankHits,
  strengthFromScore,
  type MemoryCounts,
  type MemoryFilter,
  type MemoryListItem,
} from "./memory-core";

/**
 * Memory Bank: listing, hybrid search (embeddings + keywords), manual stories with
 * optional AI structuring, and edits that keep the search index fresh.
 */

/* ------------------------------------------------------------------ */
/* Embeddings                                                          */
/* ------------------------------------------------------------------ */

function storedEmbeddings(profileId: string): Map<string, number[]> {
  const rows = getDb().prepare(`SELECT id, embedding FROM memories WHERE profile_id = ? AND embedding IS NOT NULL`).all(profileId) as { id: string; embedding: string }[];
  const out = new Map<string, number[]>();
  for (const r of rows) {
    const v = parseJson<number[]>(r.embedding, []);
    if (v.length) out.set(r.id, v);
  }
  return out;
}

function setEmbedding(id: string, embedding: number[] | null) {
  // Direct write: re-indexing must not bump updated_at.
  getDb().prepare(`UPDATE memories SET embedding = ? WHERE id = ?`).run(embedding ? JSON.stringify(embedding) : null, id);
}

/** Embed one memory's text; null when no embedding model is available. */
export async function embedMemory(m: Pick<Memory, "title" | "summary" | "story" | "lesson" | "tags">): Promise<number[] | null> {
  const vecs = await embed([memoryEmbeddingText(m)]);
  return vecs?.[0] ?? null;
}

/**
 * Cosine similarity of every memory to the query. Memories with no vector, or a vector
 * from a different embedding model (dimension mismatch), are re-embedded on the fly so
 * the index heals itself after Ollama was down or the model changed.
 */
async function semanticScores(profileId: string, query: string, memories: Memory[]): Promise<Map<string, number> | null> {
  const q = (await embed([query]))?.[0];
  if (!q || q.length === 0) return null;
  const stored = storedEmbeddings(profileId);
  const stale = memories.filter((m) => stored.get(m.id)?.length !== q.length).slice(0, 64);
  if (stale.length) {
    const vecs = await embed(stale.map((m) => memoryEmbeddingText(m)));
    if (vecs && vecs.length === stale.length) {
      stale.forEach((m, i) => {
        setEmbedding(m.id, vecs[i]);
        stored.set(m.id, vecs[i]);
      });
    }
  }
  const scores = new Map<string, number>();
  for (const m of memories) {
    const v = stored.get(m.id);
    if (v && v.length === q.length) scores.set(m.id, cosine(q, v));
  }
  return scores;
}

/* ------------------------------------------------------------------ */
/* Listing & search                                                    */
/* ------------------------------------------------------------------ */

export function postCountsByMemory(profileId: string): Map<string, number> {
  const rows = getDb()
    .prepare(`SELECT memory_id, COUNT(*) AS n FROM posts WHERE profile_id = ? AND memory_id IS NOT NULL AND status != 'archived' GROUP BY memory_id`)
    .all(profileId) as { memory_id: string; n: number }[];
  return new Map(rows.map((r) => [r.memory_id, r.n]));
}

function pillarFilter(profileId: string, pillar: string | null | undefined): ((m: Memory) => boolean) | null {
  if (!pillar) return null;
  const known = getStrategy(profileId)?.pillars.find((p) => p.id === pillar || p.name.toLowerCase() === pillar.toLowerCase());
  const target: Pick<Pillar, "id" | "name"> = known ?? { id: pillar, name: pillar };
  return (m) => pillarMatches(m.pillar, target);
}

export type MemoryQuery = { q?: string | null; pillar?: string | null; filter?: MemoryFilter | null };
export type MemoryQueryResult = { memories: MemoryListItem[]; counts: MemoryCounts; mode: "list" | "keyword" | "semantic" };

/** Everything the Memory Bank page needs for one view: filtered, optionally searched, plus tab counts. */
export async function queryMemories(profileId: string, query: MemoryQuery = {}): Promise<MemoryQueryResult> {
  const all = listMemories(profileId);
  const byPillar = pillarFilter(profileId, query.pillar);
  const scoped = byPillar ? all.filter(byPillar) : all;
  const counts = countMemories(scoped);
  const filter = query.filter ?? "all";
  const pool = scoped.filter((m) => memoryMatchesFilter(m, filter));
  const postCounts = postCountsByMemory(profileId);
  const q = query.q?.trim() ?? "";

  if (!q) {
    return { memories: pool.map((m) => ({ ...m, postCount: postCounts.get(m.id) ?? 0 })), counts, mode: "list" };
  }
  const sem = await semanticScores(profileId, q, pool);
  const hits = pool.map((m) => ({ ...m, postCount: postCounts.get(m.id) ?? 0, score: blendScore(keywordScore(m, q), sem?.get(m.id) ?? (sem ? 0 : null)) }));
  return { memories: rankHits(hits), counts, mode: sem ? "semantic" : "keyword" };
}

/**
 * For other modules (Studio, Interviews, Calendar): the k memories most relevant to a
 * query, best first, with a 0..1 relevance score. Archived memories are excluded.
 * Uses embeddings when available, keyword relevance otherwise.
 */
export async function searchMemories(profileId: string, query: string, k = 8): Promise<(Memory & { score: number })[]> {
  const pool = listMemories(profileId, { status: "active" });
  const q = query.trim();
  if (!q || pool.length === 0) return [];
  const sem = await semanticScores(profileId, q, pool);
  return pool
    .map((m) => ({ ...m, score: blendScore(keywordScore(m, q), sem?.get(m.id) ?? (sem ? 0 : null)) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, k));
}

/* ------------------------------------------------------------------ */
/* Detail                                                              */
/* ------------------------------------------------------------------ */

export function requireOwnedMemory(profileId: string, id: string): Memory {
  const m = getMemory(id);
  if (!m || m.profileId !== profileId) throw new HttpError(404, "Story not found", "It may have been deleted.");
  return m;
}

export type MemoryPostRef = Pick<Post, "id" | "status" | "scheduledAt" | "publishedAt" | "linkedinUrl" | "updatedAt"> & { hook: string };

export function memoryPosts(profileId: string, memoryId: string): MemoryPostRef[] {
  return listPosts(profileId, { memoryId }).map((p) => ({
    id: p.id,
    status: p.status,
    scheduledAt: p.scheduledAt,
    publishedAt: p.publishedAt,
    linkedinUrl: p.linkedinUrl,
    updatedAt: p.updatedAt,
    hook: p.body.split("\n").map((l) => l.trim()).find(Boolean) ?? "",
  }));
}

/* ------------------------------------------------------------------ */
/* Create (by hand) & edit                                             */
/* ------------------------------------------------------------------ */

export const MemoryFieldsSchema = z.object({
  title: z.string().trim().max(200),
  summary: z.string().trim().max(600),
  story: z.string().trim().max(20000),
  when: z.string().trim().max(200),
  place: z.string().trim().max(200),
  people: z.array(z.string().max(200)).max(40),
  emotions: z.array(z.string().max(80)).max(20),
  details: z.array(z.string().max(600)).max(60),
  quotes: z.array(z.string().max(600)).max(30),
  lesson: z.string().trim().max(1000),
  pillar: z.string().max(80).nullable(),
  tags: z.array(z.string().max(60)).max(20),
  angles: z.array(z.string().max(400)).max(20),
  status: z.enum(["raw", "ready", "used", "archived"]),
  strength: z.number().int().min(1).max(5),
});
export type MemoryFields = z.infer<typeof MemoryFieldsSchema>;

export const ManualMemorySchema = MemoryFieldsSchema.partial().extend({
  story: z.string().trim().min(40, "Tell the story in at least a couple of sentences.").max(20000),
  photoIds: z.array(z.string()).max(20).optional(),
  /** Let the extractor model pull people, numbers, quotes, lesson, tags and angles out of the text. */
  enrich: z.boolean().default(true),
});
export type ManualMemoryInput = z.infer<typeof ManualMemorySchema>;

/** What the extractor fills in for a hand-written story. The story text itself stays the person's own. */
const StoryCardSchema = z.object({
  title: z.string(),
  summary: z.string(),
  when: z.string().default(""),
  place: z.string().default(""),
  people: z.array(z.string()).default([]),
  emotions: z.array(z.string()).default([]),
  details: z.array(z.string()).default([]),
  quotes: z.array(z.string()).default([]),
  lesson: z.string().default(""),
  tags: z.array(z.string()).default([]),
  angles: z.array(z.string()).default([]),
  strength: z.number().int().min(1).max(5).catch(3),
  pillar: z.string().nullable().default(null),
});

const STRUCTURE_SYSTEM =
  "You turn a person's own story into a structured story card for their LinkedIn ghostwriter. Use only facts that are in the text. Never invent names, numbers, places, dates or quotes.";

function structurePrompt(story: string, pillars: Pillar[], language: string): string {
  const pillarLines = pillars.length ? pillars.map((p) => `- ${p.id}: ${p.name}${p.description ? ` (${p.description})` : ""}`).join("\n") : "(none yet, use null)";
  return `Content pillars (pick the best fit by id, or null):
${pillarLines}

My story, in my own words:
"""
${story.slice(0, 12000)}
"""

Fill in the story card:
1. title: 3-8 words, specific, no clickbait. Example: "The client who fired us on a Friday".
2. summary: one sentence: what happened and why it matters.
3. when, place: only if the text says it. Otherwise "".
4. people: names or roles mentioned, e.g. "my co-founder Anna".
5. emotions: 1-3 feelings I mention or clearly show.
6. details: concrete specifics from the text (numbers, objects, what could be seen or heard). Copy them, do not summarize.
7. quotes: up to 3 sentences copied EXACTLY, word for word, from the text: things someone said or thought.
8. lesson: the lesson in my words if I state one; otherwise one plain sentence the story supports.
9. tags: 2-5 lowercase topic words.
10. angles: 2-3 possible LinkedIn post angles, one short sentence each.
11. strength: 1-5. 5 = clear scene, stakes, a turning point, numbers and exact words. 1 = vague.
12. pillar: an id from the list, or null.
Write title, summary, lesson and angles in ${language === "en" ? "English" : `the same language as the story (profile language: ${language})`}.`;
}

/** Run the extractor over a hand-written story. Returns null (with the reason) if the model is unavailable. */
async function structureStory(profileId: string, story: string): Promise<{ card: z.infer<typeof StoryCardSchema> | null; warning?: string }> {
  const strategy = getStrategy(profileId);
  const language = strategy?.language || getProfile(profileId)?.language || "en";
  try {
    const card = await chatJson(StoryCardSchema, {
      task: "extractor",
      system: STRUCTURE_SYSTEM,
      messages: [{ role: "user", content: structurePrompt(story, strategy?.pillars ?? [], language) }],
      temperature: 0.2,
    });
    return { card };
  } catch (err) {
    const msg = err instanceof LLMError ? [err.message, err.hint].filter(Boolean).join(" ") : err instanceof Error ? err.message : String(err);
    return { card: null, warning: `Saved without AI details: ${msg}` };
  }
}

export async function createManualMemory(profileId: string, input: ManualMemoryInput): Promise<{ memory: Memory; warning?: string }> {
  const story = input.story.trim();
  const pillars = getStrategy(profileId)?.pillars ?? [];
  const { card, warning } = input.enrich ? await structureStory(profileId, story) : { card: null, warning: undefined };

  const pick = (own: string | undefined, ai: string | undefined) => (own && own.trim() ? own.trim() : (ai ?? "").trim());
  const merge = (own: string[] | undefined, ai: string[] | undefined, max = 30) => cleanList([...(own ?? []), ...(ai ?? [])], max);
  const pillarId = input.pillar ?? (card?.pillar ? (pillars.find((p) => pillarMatches(card.pillar, p))?.id ?? null) : null);

  const draft = {
    title: pick(input.title, card?.title) || deriveTitle(story),
    summary: pick(input.summary, card?.summary) || deriveSummary(story),
    story,
    when: pick(input.when, card?.when),
    place: pick(input.place, card?.place),
    people: merge(input.people, card?.people, 20),
    emotions: merge(input.emotions, card?.emotions, 6),
    details: merge(input.details, card?.details, 20),
    quotes: cleanList([...(input.quotes ?? []), ...keepVerbatimQuotes(card?.quotes ?? [], story)], 8),
    lesson: pick(input.lesson, card?.lesson),
    pillar: pillarId,
    tags: merge(input.tags, card?.tags?.map((t) => t.toLowerCase()), 8),
    angles: merge(input.angles, card?.angles, 5),
  };
  const photoIds = (input.photoIds ?? []).filter((id) => getPhoto(id)?.profileId === profileId);
  const depth = memoryDepth({ ...draft, photoCount: photoIds.length });
  const strength = input.strength ?? (card ? Math.round((card.strength + strengthFromScore(depth.score)) / 2) : strengthFromScore(depth.score));

  const embedding = await embedMemory(draft);
  let memory = createMemory(profileId, { ...draft, strength }, { embedding });
  if (input.status && input.status !== memory.status) memory = updateMemory(memory.id, { status: input.status });
  for (const id of photoIds) updatePhoto(id, { memoryId: memory.id });
  if (photoIds.length) memory = getMemory(memory.id)!;
  return { memory, warning };
}

const TEXT_FIELDS = ["title", "summary", "story", "lesson", "tags"] as const;

/** Apply an edit; re-embed when the searchable text changed (null vector = re-indexed on next search). */
export async function patchMemory(current: Memory, patch: Partial<MemoryFields>): Promise<Memory> {
  const clean: Partial<MemoryFields> = { ...patch };
  for (const key of ["people", "emotions", "details", "quotes", "tags", "angles"] as const) {
    if (clean[key]) clean[key] = cleanList(clean[key], key === "details" || key === "quotes" ? 60 : 40);
  }
  if (clean.title !== undefined && !clean.title.trim()) throw new HttpError(400, "A story needs a title.");
  const next = { ...current, ...clean };
  const textChanged = TEXT_FIELDS.some((k) => JSON.stringify(next[k]) !== JSON.stringify(current[k]));
  const embedding = textChanged ? await embedMemory(next) : undefined;
  const updated = updateMemory(current.id, clean, textChanged ? embedding : undefined);
  if (clean.status && clean.status !== current.status && clean.status === "archived") {
    logActivity("memory", `Archived “${current.title}”`, { profileId: current.profileId, refId: current.id });
  }
  return updated;
}
