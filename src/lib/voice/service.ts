import "server-only";
import { getDb, logActivity } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { chatJson, embed } from "@/lib/llm";
import {
  getProfile,
  getVoiceProfile,
  getVoiceSample,
  hashText,
  insertVoiceSamples,
  listVoiceSamples,
  saveVoiceProfile,
  setVoiceEmbedding,
  deleteVoiceSample,
  type Profile,
  type VoiceSample,
} from "@/lib/repo";
import { getRoute, getSetting, setSetting } from "@/lib/settings";
import { VoiceGuideSchema, type VoiceProfile } from "@/lib/types";
import { ImportFormatError, parseImport, type ParsedPost } from "./parse";
import { ANALYSIS_SYSTEM, analysisBudget, buildAnalysisPrompt, buildVoicePromptBlock, groundGuide, reconcileGuide, sanitizeGuide } from "./prompts";
import { selectForAnalysis } from "./rank";
import { computeVoiceExtras, computeVoiceStats } from "./stylometry";
import {
  MIN_POSTS_FOR_ANALYSIS,
  type ImportOrigin,
  type ImportRequest,
  type ImportResult,
  type ProfileUpdate,
  type SampleUpdate,
  type VoiceExtras,
  type VoiceMeta,
  type VoiceState,
} from "./types";

/* ------------------------------------------------------------------ */
/* Analysis metadata (kept in settings: the shared profile schema has no slot for it) */
/* ------------------------------------------------------------------ */

const metaKey = (profileId: string) => `voice.meta.${profileId}`;
const EMPTY_META: VoiceMeta = { analyzedAt: null, guideSampleCount: 0, postsRead: 0 };

function getMeta(profileId: string): VoiceMeta {
  return { ...EMPTY_META, ...getSetting<Partial<VoiceMeta>>(metaKey(profileId), {}) };
}

/* ------------------------------------------------------------------ */
/* Voice-sample table helpers the shared repository doesn't have       */
/* ------------------------------------------------------------------ */

type ExistingRow = {
  id: string;
  kind: "own" | "reference";
  hash: string;
  url: string;
  posted_at: string | null;
  impressions: number | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
};

function existingByHash(profileId: string): Map<string, ExistingRow> {
  const rows = getDb()
    .prepare(`SELECT id, kind, hash, url, posted_at, impressions, reactions, comments, reposts FROM voice_samples WHERE profile_id = ?`)
    .all(profileId) as ExistingRow[];
  return new Map(rows.map((r) => [r.hash, r]));
}

/** Fill in what a re-import knows and the stored copy doesn't (newer counts win; link and date only when missing). */
function mergeInto(row: ExistingRow, p: ParsedPost): boolean {
  const next = {
    url: row.url || p.url || "",
    posted_at: row.posted_at ?? p.postedAt ?? null,
    impressions: p.impressions ?? row.impressions,
    reactions: p.reactions ?? row.reactions,
    comments: p.comments ?? row.comments,
    reposts: p.reposts ?? row.reposts,
  };
  const changed = (Object.keys(next) as (keyof typeof next)[]).some((k) => next[k] !== row[k]);
  if (!changed) return false;
  getDb()
    .prepare(`UPDATE voice_samples SET url = ?, posted_at = ?, impressions = ?, reactions = ?, comments = ?, reposts = ? WHERE id = ?`)
    .run(next.url, next.posted_at, next.impressions, next.reactions, next.comments, next.reposts, row.id);
  return true;
}

function indexedCount(profileId: string): number {
  const r = getDb().prepare(`SELECT COUNT(*) AS n FROM voice_samples WHERE profile_id = ? AND kind = 'own' AND embedding IS NOT NULL`).get(profileId) as { n: number };
  return r.n;
}

function unembeddedIds(profileId: string): string[] {
  const rows = getDb().prepare(`SELECT id FROM voice_samples WHERE profile_id = ? AND kind = 'own' AND embedding IS NULL`).all(profileId) as { id: string }[];
  return rows.map((r) => r.id);
}

function requireSample(profileId: string, id: string): VoiceSample {
  const s = getVoiceSample(id);
  if (!s || s.profileId !== profileId) throw new HttpError(404, "That post isn't in your voice library anymore.");
  return s;
}

/* ------------------------------------------------------------------ */
/* Stats & state                                                       */
/* ------------------------------------------------------------------ */

function languageOf(profileId: string) {
  return getProfile(profileId)?.language ?? "en";
}

function extrasFor(own: VoiceSample[], language: string): VoiceExtras | null {
  return own.length >= MIN_POSTS_FOR_ANALYSIS ? computeVoiceExtras(own.map((s) => s.text), { language }) : null;
}

/** Recompute the deterministic fingerprint (cheap, no model) after the corpus changes. */
function refreshStats(profileId: string) {
  const own = listVoiceSamples(profileId, "own");
  const cur = getVoiceProfile(profileId);
  const stats = own.length >= MIN_POSTS_FOR_ANALYSIS ? computeVoiceStats(own.map((s) => s.text), { language: languageOf(profileId) }) : null;
  saveVoiceProfile(profileId, { ...cur, stats });
}

export function getVoiceState(profileId: string): VoiceState {
  const samples = listVoiceSamples(profileId);
  const own = samples.filter((s) => s.kind === "own");
  const profile = getVoiceProfile(profileId);
  const extras = extrasFor(own, languageOf(profileId));
  return {
    samples,
    profile,
    extras,
    meta: getMeta(profileId),
    promptBlock: buildVoicePromptBlock({ stats: profile.stats, guide: profile.guide, manualRules: profile.manualRules, extras }),
    counts: { own: own.length, reference: samples.length - own.length, indexed: indexedCount(profileId) },
    embeddingsConfigured: getRoute("embedding") !== null,
  };
}

/* ------------------------------------------------------------------ */
/* Embeddings for example retrieval                                    */
/* ------------------------------------------------------------------ */

const EMBED_BATCH = 16;
const EMBED_MAX_PER_RUN = 600;
const inflight = new Map<string, Promise<number>>();

/**
 * Embed own posts that have no vector yet (new imports, or all of them after the embedding
 * model changed: Settings clears old vectors then). Best effort: returns how many were
 * embedded, 0 when no embedding model answers. One run per profile at a time.
 */
export function embedPending(profileId: string): Promise<number> {
  const running = inflight.get(profileId);
  if (running) return running;
  const job = (async () => {
    const missing = new Set(unembeddedIds(profileId));
    const queue = listVoiceSamples(profileId, "own").filter((s) => missing.has(s.id));
    let done = 0;
    while (queue.length && done < EMBED_MAX_PER_RUN) {
      const batch = queue.splice(0, EMBED_BATCH);
      const vectors = await embed(batch.map((s) => s.text.slice(0, 2000)), { kind: "document" });
      if (!vectors || vectors.length !== batch.length) break;
      batch.forEach((s, i) => setVoiceEmbedding(s.id, vectors[i]));
      done += batch.length;
    }
    return done;
  })().finally(() => inflight.delete(profileId));
  inflight.set(profileId, job);
  return job;
}

/** Start indexing own posts that have no vector yet, without waiting (after an import or an embedding-model change). */
export function indexInBackground(profileId: string) {
  if (!getRoute("embedding") || unembeddedIds(profileId).length === 0) return;
  void embedPending(profileId).catch((err) => console.warn("[voice] embedding failed:", err instanceof Error ? err.message : err));
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

const NOTHING_FOUND_HINT: Record<ImportRequest["format"], string> = {
  text: "Paste the full text of at least one post (40+ characters). Separate posts with a line of three dashes (---).",
  csv: "Open Shares.csv from your LinkedIn export. If it only has reposts, there's nothing in your own words to learn from yet.",
  json: "Run the browser helper on your own activity page, click Copy posts, and paste the result here.",
};

export async function importVoice(profile: Profile, req: ImportRequest): Promise<ImportResult> {
  const headerLines = req.kind === "own" ? [profile.name, profile.headline] : req.author ? [req.author] : [];
  const origin: ImportOrigin = req.origin ?? (req.format === "csv" ? "export" : req.format === "json" ? "helper" : "paste");
  let parsed;
  try {
    // The import preview sends Shares.csv posts back as JSON; their text has no LinkedIn UI to strip.
    parsed = parseImport(req.format, req.content, { headerLines, clean: !(req.format === "json" && origin === "export") });
  } catch (err) {
    if (err instanceof ImportFormatError) throw new HttpError(400, err.message, err.hint);
    throw err;
  }
  if (parsed.posts.length === 0) throw new HttpError(400, "We couldn't find any posts in that.", NOTHING_FOUND_HINT[req.format]);

  const existing = existingByHash(profile.id);
  let updated = 0;
  const fresh: Parameters<typeof insertVoiceSamples>[1] = [];
  for (const p of parsed.posts) {
    const row = existing.get(hashText(p.text));
    if (row) {
      if (row.kind === req.kind && mergeInto(row, p)) updated++;
      continue;
    }
    fresh.push({
      text: p.text,
      kind: req.kind,
      author: req.kind === "reference" ? req.author : "",
      url: p.url ?? "",
      postedAt: p.postedAt ?? null,
      impressions: p.impressions ?? null,
      reactions: p.reactions ?? null,
      comments: p.comments ?? null,
      reposts: p.reposts ?? null,
      source: origin,
    });
  }
  const inserted = fresh.length ? insertVoiceSamples(profile.id, fresh) : 0;
  const skipped = parsed.skipped + (parsed.posts.length - inserted - updated);

  const warnings = [...parsed.warnings];
  if (req.kind === "own") {
    refreshStats(profile.id);
    // Index the new posts for example retrieval without making the person wait.
    if (inserted > 0) indexInBackground(profile.id);
    if (origin === "export" && inserted > 0) {
      warnings.push("LinkedIn's export has no reactions or comments. Add the numbers to your best posts below so the writer learns from those first.");
    }
  }
  if (inserted > 0) {
    const what = req.kind === "own" ? (inserted === 1 ? "1 of your posts" : `${inserted} of your posts`) : `${inserted} ${inserted === 1 ? "post" : "posts"} by ${req.author}`;
    logActivity("voice", `Imported ${what}`, { profileId: profile.id });
  }
  return { found: parsed.posts.length, inserted, updated, skipped, warnings, state: getVoiceState(profile.id) };
}

/* ------------------------------------------------------------------ */
/* Samples                                                             */
/* ------------------------------------------------------------------ */

export function removeSample(profileId: string, id: string): VoiceState {
  const s = requireSample(profileId, id);
  deleteVoiceSample(id);
  if (s.kind === "own") refreshStats(profileId);
  return getVoiceState(profileId);
}

export function updateSampleMetrics(profileId: string, id: string, patch: SampleUpdate): VoiceSample {
  const s = requireSample(profileId, id);
  const n = { ...s, ...patch };
  getDb().prepare(`UPDATE voice_samples SET impressions = ?, reactions = ?, comments = ?, reposts = ? WHERE id = ?`).run(n.impressions, n.reactions, n.comments, n.reposts, id);
  return getVoiceSample(id)!;
}

/* ------------------------------------------------------------------ */
/* Profile edits                                                       */
/* ------------------------------------------------------------------ */

export function updateVoiceProfile(profileId: string, patch: ProfileUpdate): VoiceState {
  const cur = getVoiceProfile(profileId);
  const next: VoiceProfile = { ...cur };
  if (patch.guide) next.guide = { ...cur.guide, ...patch.guide };
  if (patch.manualRules) {
    const seen = new Set<string>();
    next.manualRules = patch.manualRules.filter((r) => {
      const key = r.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  saveVoiceProfile(profileId, next);
  return getVoiceState(profileId);
}

/* ------------------------------------------------------------------ */
/* Analysis                                                            */
/* ------------------------------------------------------------------ */

/**
 * Measure the posts, index them for retrieval, and have the extractor model write the style
 * guide from the best/most recent posts that fit its context. Manual rules are kept.
 */
export async function analyzeVoice(profile: Profile, signal?: AbortSignal): Promise<VoiceState> {
  const own = listVoiceSamples(profile.id, "own");
  if (own.length < MIN_POSTS_FOR_ANALYSIS) {
    throw new HttpError(400, `Add at least ${MIN_POSTS_FOR_ANALYSIS} of your own posts first.`, "Paste posts or upload Shares.csv. 10 or more gives the best result.");
  }
  const language = profile.language;
  const texts = own.map((s) => s.text);
  const stats = computeVoiceStats(texts, { language });
  const extras = computeVoiceExtras(texts, { language });

  try {
    await embedPending(profile.id);
  } catch (err) {
    console.warn("[voice] embedding failed:", err instanceof Error ? err.message : err);
  }

  const route = getRoute("extractor");
  const budget = analysisBudget({ providerKind: route?.provider.kind ?? "ollama", numCtx: route?.numCtx ?? 8192 });
  const posts = selectForAnalysis(own, budget);
  // Model errors (no model configured, Ollama down, invalid JSON twice) surface as LLMError with a hint.
  const raw = await chatJson(VoiceGuideSchema, {
    task: "extractor",
    system: ANALYSIS_SYSTEM,
    messages: [{ role: "user", content: buildAnalysisPrompt({ name: profile.name, posts, stats, extras }) }],
    temperature: 0.2,
    maxTokens: 1200,
    signal,
  });
  const guide = reconcileGuide(groundGuide(sanitizeGuide(raw), texts, stats), stats, extras);

  // Posts may have been added or removed while the model was thinking; keep the numbers current.
  saveVoiceProfile(profile.id, { ...getVoiceProfile(profile.id), guide });
  refreshStats(profile.id);
  setSetting(metaKey(profile.id), { analyzedAt: new Date().toISOString(), guideSampleCount: own.length, postsRead: posts.length } satisfies VoiceMeta);
  logActivity("voice", `Learned your voice from ${own.length} posts`, { profileId: profile.id });
  return getVoiceState(profile.id);
}

/** Parse a JSON request body, answering 400 (not 500) when it isn't JSON. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Expected a JSON body.");
  }
}
