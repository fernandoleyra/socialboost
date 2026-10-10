import "server-only";
import { getDb, newId, parseJson, logActivity } from "./db";
import { getActiveProfileId, setActiveProfileId } from "./settings";
import { HttpError } from "./http";
import {
  StrategySchema,
  VoiceProfileSchema,
  type Memory,
  type Photo,
  type Post,
  type PostQuality,
  type PostStatus,
  type Strategy,
  type VoiceProfile,
  type ExtractedMemory,
} from "./types";

/* ================================================================== */
/* Profiles                                                            */
/* ================================================================== */

export type Profile = {
  id: string;
  name: string;
  headline: string;
  linkedinUrl: string;
  language: string;
  timezone: string;
  avatarPhotoId: string | null;
  createdAt: string;
};

type ProfileRow = { id: string; name: string; headline: string; linkedin_url: string; language: string; timezone: string; avatar_photo_id: string | null; created_at: string };
const toProfile = (r: ProfileRow): Profile => ({
  id: r.id,
  name: r.name,
  headline: r.headline,
  linkedinUrl: r.linkedin_url,
  language: r.language,
  timezone: r.timezone,
  avatarPhotoId: r.avatar_photo_id,
  createdAt: r.created_at,
});

export function listProfiles(): Profile[] {
  return (getDb().prepare(`SELECT * FROM profiles ORDER BY created_at`).all() as ProfileRow[]).map(toProfile);
}

export function getProfile(id: string): Profile | null {
  const r = getDb().prepare(`SELECT * FROM profiles WHERE id = ?`).get(id) as ProfileRow | undefined;
  return r ? toProfile(r) : null;
}

export function createProfile(input: { name: string; headline?: string; linkedinUrl?: string; language?: string; timezone?: string }): Profile {
  const id = newId("pf");
  getDb()
    .prepare(`INSERT INTO profiles (id, name, headline, linkedin_url, language, timezone) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, input.name.trim(), input.headline ?? "", input.linkedinUrl ?? "", input.language ?? "en", input.timezone ?? "UTC");
  setActiveProfileId(id);
  logActivity("profile", `Created profile ${input.name}`, { profileId: id, refId: id });
  return getProfile(id)!;
}

export function updateProfile(id: string, patch: Partial<Omit<Profile, "id" | "createdAt">>) {
  const cur = getProfile(id);
  if (!cur) throw new HttpError(404, "Profile not found");
  const n = { ...cur, ...patch };
  getDb()
    .prepare(`UPDATE profiles SET name=?, headline=?, linkedin_url=?, language=?, timezone=?, avatar_photo_id=? WHERE id=?`)
    .run(n.name, n.headline, n.linkedinUrl, n.language, n.timezone, n.avatarPhotoId, id);
  return getProfile(id)!;
}

export function deleteProfile(id: string) {
  const db = getDb();
  db.transaction(() => {
    // Per-profile/per-interview state that modules keep in the settings table.
    const interviewIds = (db.prepare(`SELECT id FROM interviews WHERE profile_id = ?`).all(id) as { id: string }[]).map((r) => r.id);
    const del = db.prepare(`DELETE FROM settings WHERE key = ?`);
    for (const iv of interviewIds) del.run(`interview-state:${iv}`);
    db.prepare(`DELETE FROM settings WHERE key LIKE ? OR key LIKE ?`).run(`%.${id}`, `%:${id}`);
    db.prepare(`DELETE FROM activity WHERE profile_id = ?`).run(id);
    db.prepare(`DELETE FROM profiles WHERE id = ?`).run(id);
  })();
}

/** The profile currently being worked on. Falls back to the first profile. */
export function getActiveProfile(): Profile | null {
  const id = getActiveProfileId();
  if (id) {
    const p = getProfile(id);
    if (p) return p;
  }
  const first = listProfiles()[0];
  if (first) setActiveProfileId(first.id);
  return first ?? null;
}

/** For API routes: the active profile, or a 409 telling the UI to run onboarding. */
export function requireProfile(): Profile {
  const p = getActiveProfile();
  if (!p) throw new HttpError(409, "No profile yet", "Create your profile on the Welcome screen first.");
  return p;
}

/* ================================================================== */
/* Strategy                                                            */
/* ================================================================== */

export function getStrategy(profileId: string): Strategy | null {
  const r = getDb().prepare(`SELECT data FROM strategies WHERE profile_id = ?`).get(profileId) as { data: string } | undefined;
  if (!r) return null;
  const parsed = StrategySchema.safeParse(parseJson(r.data, {}));
  return parsed.success ? parsed.data : null;
}

export function saveStrategy(profileId: string, strategy: Strategy) {
  const data = JSON.stringify(StrategySchema.parse(strategy));
  getDb()
    .prepare(`INSERT INTO strategies (profile_id, data, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(profile_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
    .run(profileId, data);
}

/* ================================================================== */
/* Interviews                                                          */
/* ================================================================== */

export type InterviewKind = "positioning" | "story" | "voice";
export type Interview = {
  id: string;
  profileId: string;
  kind: InterviewKind;
  status: "active" | "completed" | "abandoned";
  title: string;
  pillar: string | null;
  promptSeed: string | null;
  summary: string | null;
  createdAt: string;
  completedAt: string | null;
  messageCount?: number;
  memoryCount?: number;
};
export type InterviewMessage = { id: string; interviewId: string; role: "assistant" | "user" | "system"; content: string; photoIds: string[]; createdAt: string };

type InterviewRow = { id: string; profile_id: string; kind: InterviewKind; status: Interview["status"]; title: string; pillar: string | null; prompt_seed: string | null; summary: string | null; created_at: string; completed_at: string | null; message_count?: number; memory_count?: number };
const toInterview = (r: InterviewRow): Interview => ({
  id: r.id,
  profileId: r.profile_id,
  kind: r.kind,
  status: r.status,
  title: r.title,
  pillar: r.pillar,
  promptSeed: r.prompt_seed,
  summary: r.summary,
  createdAt: r.created_at,
  completedAt: r.completed_at,
  messageCount: r.message_count,
  memoryCount: r.memory_count,
});

export function listInterviews(profileId: string): Interview[] {
  return (
    getDb()
      .prepare(
        `SELECT i.*, (SELECT COUNT(*) FROM interview_messages m WHERE m.interview_id = i.id) AS message_count,
                (SELECT COUNT(*) FROM memories mm WHERE mm.interview_id = i.id) AS memory_count
         FROM interviews i WHERE i.profile_id = ? ORDER BY i.created_at DESC`,
      )
      .all(profileId) as InterviewRow[]
  ).map(toInterview);
}

export function getInterview(id: string): Interview | null {
  const r = getDb().prepare(`SELECT * FROM interviews WHERE id = ?`).get(id) as InterviewRow | undefined;
  return r ? toInterview(r) : null;
}

export function createInterview(input: { profileId: string; kind: InterviewKind; title?: string; pillar?: string | null; promptSeed?: string | null }): Interview {
  const id = newId("iv");
  getDb()
    .prepare(`INSERT INTO interviews (id, profile_id, kind, title, pillar, prompt_seed) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, input.profileId, input.kind, input.title ?? "", input.pillar ?? null, input.promptSeed ?? null);
  return getInterview(id)!;
}

export function updateInterview(id: string, patch: Partial<Pick<Interview, "status" | "title" | "summary" | "pillar">>) {
  const cur = getInterview(id);
  if (!cur) throw new HttpError(404, "Interview not found");
  const n = { ...cur, ...patch };
  const completedAt = patch.status === "completed" && !cur.completedAt ? new Date().toISOString() : cur.completedAt;
  getDb()
    .prepare(`UPDATE interviews SET status=?, title=?, summary=?, pillar=?, completed_at=? WHERE id=?`)
    .run(n.status, n.title, n.summary, n.pillar, completedAt, id);
  return getInterview(id)!;
}

export function deleteInterview(id: string) {
  getDb().prepare(`DELETE FROM interviews WHERE id = ?`).run(id);
}

type MessageRow = { id: string; interview_id: string; role: InterviewMessage["role"]; content: string; photo_ids: string; created_at: string };
const toMessage = (r: MessageRow): InterviewMessage => ({
  id: r.id,
  interviewId: r.interview_id,
  role: r.role,
  content: r.content,
  photoIds: parseJson<string[]>(r.photo_ids, []),
  createdAt: r.created_at,
});

export function listMessages(interviewId: string): InterviewMessage[] {
  return (getDb().prepare(`SELECT * FROM interview_messages WHERE interview_id = ? ORDER BY created_at, rowid`).all(interviewId) as MessageRow[]).map(toMessage);
}

export function addMessage(interviewId: string, role: InterviewMessage["role"], content: string, photoIds: string[] = []): InterviewMessage {
  const id = newId("msg");
  getDb()
    .prepare(`INSERT INTO interview_messages (id, interview_id, role, content, photo_ids, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, interviewId, role, content, JSON.stringify(photoIds), new Date().toISOString());
  return toMessage(getDb().prepare(`SELECT * FROM interview_messages WHERE id = ?`).get(id) as MessageRow);
}

/* ================================================================== */
/* Memories                                                            */
/* ================================================================== */

type MemoryRow = {
  id: string;
  profile_id: string;
  interview_id: string | null;
  title: string;
  summary: string;
  story: string;
  when_text: string;
  place: string;
  people: string;
  emotions: string;
  details: string;
  quotes: string;
  lesson: string;
  pillar: string | null;
  tags: string;
  angles: string;
  status: Memory["status"];
  strength: number;
  embedding: string | null;
  created_at: string;
  updated_at: string;
  photo_count?: number;
  cover_photo_id?: string | null;
};

const toMemory = (r: MemoryRow): Memory => ({
  id: r.id,
  profileId: r.profile_id,
  interviewId: r.interview_id,
  title: r.title,
  summary: r.summary,
  story: r.story,
  when: r.when_text,
  place: r.place,
  people: parseJson(r.people, []),
  emotions: parseJson(r.emotions, []),
  details: parseJson(r.details, []),
  quotes: parseJson(r.quotes, []),
  lesson: r.lesson,
  pillar: r.pillar,
  tags: parseJson(r.tags, []),
  angles: parseJson(r.angles, []),
  status: r.status,
  strength: r.strength,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  photoCount: r.photo_count,
  coverPhotoId: r.cover_photo_id ?? null,
});

const MEMORY_SELECT = `SELECT m.*,
  (SELECT COUNT(*) FROM photos p WHERE p.memory_id = m.id) AS photo_count,
  (SELECT p.id FROM photos p WHERE p.memory_id = m.id ORDER BY p.created_at LIMIT 1) AS cover_photo_id
  FROM memories m`;

export function listMemories(profileId: string, opts: { status?: Memory["status"] | "active"; pillar?: string } = {}): Memory[] {
  const where = ["m.profile_id = ?"];
  const args: unknown[] = [profileId];
  if (opts.status === "active") where.push(`m.status IN ('raw','ready','used')`);
  else if (opts.status) {
    where.push("m.status = ?");
    args.push(opts.status);
  }
  if (opts.pillar) {
    where.push("m.pillar = ?");
    args.push(opts.pillar);
  }
  return (getDb().prepare(`${MEMORY_SELECT} WHERE ${where.join(" AND ")} ORDER BY m.created_at DESC`).all(...args) as MemoryRow[]).map(toMemory);
}

export function getMemory(id: string): Memory | null {
  const r = getDb().prepare(`${MEMORY_SELECT} WHERE m.id = ?`).get(id) as MemoryRow | undefined;
  return r ? toMemory(r) : null;
}

export function getMemoryEmbedding(id: string): number[] | null {
  const r = getDb().prepare(`SELECT embedding FROM memories WHERE id = ?`).get(id) as { embedding: string | null } | undefined;
  return r?.embedding ? parseJson<number[] | null>(r.embedding, null) : null;
}

export function listMemoryEmbeddings(profileId: string): { id: string; embedding: number[] }[] {
  const rows = getDb().prepare(`SELECT id, embedding FROM memories WHERE profile_id = ? AND embedding IS NOT NULL AND status != 'archived'`).all(profileId) as { id: string; embedding: string }[];
  return rows.map((r) => ({ id: r.id, embedding: parseJson<number[]>(r.embedding, []) })).filter((r) => r.embedding.length > 0);
}

export function createMemory(profileId: string, m: ExtractedMemory, opts: { interviewId?: string | null; embedding?: number[] | null } = {}): Memory {
  const id = newId("mem");
  getDb()
    .prepare(
      `INSERT INTO memories (id, profile_id, interview_id, title, summary, story, when_text, place, people, emotions, details, quotes, lesson, pillar, tags, angles, strength, embedding)
       VALUES (@id, @profile_id, @interview_id, @title, @summary, @story, @when_text, @place, @people, @emotions, @details, @quotes, @lesson, @pillar, @tags, @angles, @strength, @embedding)`,
    )
    .run({
      id,
      profile_id: profileId,
      interview_id: opts.interviewId ?? null,
      title: m.title,
      summary: m.summary,
      story: m.story,
      when_text: m.when,
      place: m.place,
      people: JSON.stringify(m.people),
      emotions: JSON.stringify(m.emotions),
      details: JSON.stringify(m.details),
      quotes: JSON.stringify(m.quotes),
      lesson: m.lesson,
      pillar: m.pillar,
      tags: JSON.stringify(m.tags),
      angles: JSON.stringify(m.angles),
      strength: m.strength,
      embedding: opts.embedding ? JSON.stringify(opts.embedding) : null,
    });
  logActivity("memory", `New memory: ${m.title}`, { profileId, refId: id });
  return getMemory(id)!;
}

export function updateMemory(id: string, patch: Partial<Omit<Memory, "id" | "profileId" | "createdAt" | "updatedAt" | "photoCount" | "coverPhotoId">>, embedding?: number[] | null) {
  const cur = getMemory(id);
  if (!cur) throw new HttpError(404, "Memory not found");
  const n = { ...cur, ...patch };
  getDb()
    .prepare(
      `UPDATE memories SET title=?, summary=?, story=?, when_text=?, place=?, people=?, emotions=?, details=?, quotes=?, lesson=?, pillar=?, tags=?, angles=?, status=?, strength=?, updated_at=datetime('now')
       ${embedding !== undefined ? ", embedding=?" : ""} WHERE id=?`,
    )
    .run(
      n.title,
      n.summary,
      n.story,
      n.when,
      n.place,
      JSON.stringify(n.people),
      JSON.stringify(n.emotions),
      JSON.stringify(n.details),
      JSON.stringify(n.quotes),
      n.lesson,
      n.pillar,
      JSON.stringify(n.tags),
      JSON.stringify(n.angles),
      n.status,
      n.strength,
      ...(embedding !== undefined ? [embedding ? JSON.stringify(embedding) : null] : []),
      id,
    );
  return getMemory(id)!;
}

export function deleteMemory(id: string) {
  getDb().prepare(`DELETE FROM memories WHERE id = ?`).run(id);
}

/** Text used to embed a memory for semantic search. */
export function memoryEmbeddingText(m: Pick<Memory, "title" | "summary" | "story" | "lesson" | "tags">) {
  return [m.title, m.summary, m.lesson, m.tags.join(", "), m.story.slice(0, 1500)].filter(Boolean).join("\n");
}

/* ================================================================== */
/* Photos                                                              */
/* ================================================================== */

type PhotoRow = { id: string; profile_id: string; memory_id: string | null; filename: string; original_name: string; mime: string; width: number | null; height: number | null; caption: string; user_note: string; is_candid: number | null; created_at: string };
const toPhoto = (r: PhotoRow): Photo => ({
  id: r.id,
  profileId: r.profile_id,
  memoryId: r.memory_id,
  filename: r.filename,
  originalName: r.original_name,
  mime: r.mime,
  width: r.width,
  height: r.height,
  caption: r.caption,
  userNote: r.user_note,
  isCandid: r.is_candid === null ? null : r.is_candid === 1,
  createdAt: r.created_at,
});

export function listPhotos(profileId: string, opts: { memoryId?: string | null; unassigned?: boolean } = {}): Photo[] {
  const where = ["profile_id = ?"];
  const args: unknown[] = [profileId];
  if (opts.memoryId) {
    where.push("memory_id = ?");
    args.push(opts.memoryId);
  } else if (opts.unassigned) where.push("memory_id IS NULL");
  return (getDb().prepare(`SELECT * FROM photos WHERE ${where.join(" AND ")} ORDER BY created_at DESC`).all(...args) as PhotoRow[]).map(toPhoto);
}

export function getPhoto(id: string): Photo | null {
  const r = getDb().prepare(`SELECT * FROM photos WHERE id = ?`).get(id) as PhotoRow | undefined;
  return r ? toPhoto(r) : null;
}

export function insertPhoto(p: Omit<Photo, "createdAt">) {
  getDb()
    .prepare(
      `INSERT INTO photos (id, profile_id, memory_id, filename, original_name, mime, width, height, caption, user_note, is_candid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(p.id, p.profileId, p.memoryId, p.filename, p.originalName, p.mime, p.width, p.height, p.caption, p.userNote, p.isCandid === null ? null : p.isCandid ? 1 : 0);
  return getPhoto(p.id)!;
}

export function updatePhoto(id: string, patch: Partial<Pick<Photo, "memoryId" | "caption" | "userNote" | "isCandid">>) {
  const cur = getPhoto(id);
  if (!cur) throw new HttpError(404, "Photo not found");
  const n = { ...cur, ...patch };
  getDb()
    .prepare(`UPDATE photos SET memory_id=?, caption=?, user_note=?, is_candid=? WHERE id=?`)
    .run(n.memoryId, n.caption, n.userNote, n.isCandid === null ? null : n.isCandid ? 1 : 0, id);
  return getPhoto(id)!;
}

export function deletePhotoRow(id: string) {
  getDb().prepare(`DELETE FROM photos WHERE id = ?`).run(id);
}

/* ================================================================== */
/* Voice samples & profile                                             */
/* ================================================================== */

export type VoiceSample = {
  id: string;
  profileId: string;
  kind: "own" | "reference";
  author: string;
  text: string;
  url: string;
  postedAt: string | null;
  impressions: number | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
  source: string;
  createdAt: string;
};
type VoiceRow = { id: string; profile_id: string; kind: "own" | "reference"; author: string; text: string; url: string; posted_at: string | null; impressions: number | null; reactions: number | null; comments: number | null; reposts: number | null; source: string; hash: string; embedding: string | null; created_at: string };
const toVoice = (r: VoiceRow): VoiceSample => ({
  id: r.id,
  profileId: r.profile_id,
  kind: r.kind,
  author: r.author,
  text: r.text,
  url: r.url,
  postedAt: r.posted_at,
  impressions: r.impressions,
  reactions: r.reactions,
  comments: r.comments,
  reposts: r.reposts,
  source: r.source,
  createdAt: r.created_at,
});

export function hashText(text: string): string {
  // FNV-1a over normalized text — good enough for de-duplication.
  const norm = text.replace(/\s+/g, " ").trim().toLowerCase();
  let h = 0x811c9dc5;
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16) + ":" + norm.length;
}

export function listVoiceSamples(profileId: string, kind?: "own" | "reference"): VoiceSample[] {
  const rows = kind
    ? getDb().prepare(`SELECT * FROM voice_samples WHERE profile_id = ? AND kind = ? ORDER BY COALESCE(posted_at, created_at) DESC`).all(profileId, kind)
    : getDb().prepare(`SELECT * FROM voice_samples WHERE profile_id = ? ORDER BY COALESCE(posted_at, created_at) DESC`).all(profileId);
  return (rows as VoiceRow[]).map(toVoice);
}

export function listVoiceEmbeddings(profileId: string, kind: "own" | "reference" = "own"): { id: string; embedding: number[] }[] {
  const rows = getDb().prepare(`SELECT id, embedding FROM voice_samples WHERE profile_id = ? AND kind = ? AND embedding IS NOT NULL`).all(profileId, kind) as { id: string; embedding: string }[];
  return rows.map((r) => ({ id: r.id, embedding: parseJson<number[]>(r.embedding, []) })).filter((r) => r.embedding.length > 0);
}

export function getVoiceSample(id: string): VoiceSample | null {
  const r = getDb().prepare(`SELECT * FROM voice_samples WHERE id = ?`).get(id) as VoiceRow | undefined;
  return r ? toVoice(r) : null;
}

/** Insert samples, skipping duplicates. Returns the number inserted. */
export function insertVoiceSamples(
  profileId: string,
  samples: { text: string; kind?: "own" | "reference"; author?: string; url?: string; postedAt?: string | null; impressions?: number | null; reactions?: number | null; comments?: number | null; reposts?: number | null; source?: string; embedding?: number[] | null }[],
): number {
  const stmt = getDb().prepare(
    `INSERT OR IGNORE INTO voice_samples (id, profile_id, kind, author, text, url, posted_at, impressions, reactions, comments, reposts, source, hash, embedding)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let n = 0;
  const tx = getDb().transaction(() => {
    for (const s of samples) {
      const text = s.text.trim();
      if (text.length < 40) continue;
      const info = stmt.run(
        newId("vs"),
        profileId,
        s.kind ?? "own",
        s.author ?? "",
        text,
        s.url ?? "",
        s.postedAt ?? null,
        s.impressions ?? null,
        s.reactions ?? null,
        s.comments ?? null,
        s.reposts ?? null,
        s.source ?? "paste",
        hashText(text),
        s.embedding ? JSON.stringify(s.embedding) : null,
      );
      n += info.changes;
    }
  });
  tx();
  return n;
}

export function setVoiceEmbedding(id: string, embedding: number[] | null) {
  getDb().prepare(`UPDATE voice_samples SET embedding = ? WHERE id = ?`).run(embedding ? JSON.stringify(embedding) : null, id);
}

export function deleteVoiceSample(id: string) {
  getDb().prepare(`DELETE FROM voice_samples WHERE id = ?`).run(id);
}

export function getVoiceProfile(profileId: string): VoiceProfile {
  const r = getDb().prepare(`SELECT data FROM voice_profiles WHERE profile_id = ?`).get(profileId) as { data: string } | undefined;
  const parsed = VoiceProfileSchema.safeParse(r ? parseJson(r.data, {}) : {});
  return parsed.success ? parsed.data : VoiceProfileSchema.parse({});
}

export function saveVoiceProfile(profileId: string, v: VoiceProfile) {
  getDb()
    .prepare(`INSERT INTO voice_profiles (profile_id, data, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(profile_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
    .run(profileId, JSON.stringify(VoiceProfileSchema.parse(v)));
}

/* ================================================================== */
/* Posts                                                               */
/* ================================================================== */

type PostRow = {
  id: string;
  profile_id: string;
  memory_id: string | null;
  photo_id: string | null;
  pillar: string | null;
  format: string;
  angle: string;
  body: string;
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  approved_at: string | null;
  linkedin_urn: string | null;
  linkedin_url: string | null;
  quality: string | null;
  impressions: number | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
  metrics_updated_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};
const toPost = (r: PostRow): Post => ({
  id: r.id,
  profileId: r.profile_id,
  memoryId: r.memory_id,
  photoId: r.photo_id,
  pillar: r.pillar,
  format: r.format,
  angle: r.angle,
  body: r.body,
  status: r.status,
  scheduledAt: r.scheduled_at,
  publishedAt: r.published_at,
  approvedAt: r.approved_at,
  linkedinUrn: r.linkedin_urn,
  linkedinUrl: r.linkedin_url,
  quality: parseJson<PostQuality | null>(r.quality, null),
  impressions: r.impressions,
  reactions: r.reactions,
  comments: r.comments,
  reposts: r.reposts,
  metricsUpdatedAt: r.metrics_updated_at,
  error: r.error,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export function listPosts(profileId: string, opts: { status?: PostStatus | PostStatus[]; from?: string; to?: string; memoryId?: string } = {}): Post[] {
  const where = ["profile_id = ?"];
  const args: unknown[] = [profileId];
  if (opts.status) {
    const s = Array.isArray(opts.status) ? opts.status : [opts.status];
    where.push(`status IN (${s.map(() => "?").join(",")})`);
    args.push(...s);
  }
  if (opts.from) {
    where.push("COALESCE(scheduled_at, published_at) >= ?");
    args.push(opts.from);
  }
  if (opts.to) {
    where.push("COALESCE(scheduled_at, published_at) < ?");
    args.push(opts.to);
  }
  if (opts.memoryId) {
    where.push("memory_id = ?");
    args.push(opts.memoryId);
  }
  return (getDb().prepare(`SELECT * FROM posts WHERE ${where.join(" AND ")} ORDER BY COALESCE(scheduled_at, published_at, updated_at) DESC`).all(...args) as PostRow[]).map(toPost);
}

export function getPost(id: string): Post | null {
  const r = getDb().prepare(`SELECT * FROM posts WHERE id = ?`).get(id) as PostRow | undefined;
  return r ? toPost(r) : null;
}

export function createPost(input: { profileId: string; memoryId?: string | null; photoId?: string | null; pillar?: string | null; format?: string; angle?: string; body?: string; status?: PostStatus; scheduledAt?: string | null }): Post {
  const id = newId("post");
  getDb()
    .prepare(`INSERT INTO posts (id, profile_id, memory_id, photo_id, pillar, format, angle, body, status, scheduled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, input.profileId, input.memoryId ?? null, input.photoId ?? null, input.pillar ?? null, input.format ?? "story", input.angle ?? "", input.body ?? "", input.status ?? "idea", input.scheduledAt ?? null);
  return getPost(id)!;
}

export function updatePost(id: string, patch: Partial<Omit<Post, "id" | "profileId" | "createdAt" | "updatedAt">>): Post {
  const cur = getPost(id);
  if (!cur) throw new HttpError(404, "Post not found");
  const n = { ...cur, ...patch };
  // Approval audit: stamp the moment a person approves. Editing approved text (only the person does
  // that in the editor) re-stamps it, so approved_at always refers to the text that will go out.
  const APPROVED: Post["status"][] = ["approved", "scheduled", "published"];
  let approvedAt = cur.approvedAt ?? null;
  if (!APPROVED.includes(n.status)) approvedAt = null;
  else if (!APPROVED.includes(cur.status) || (patch.body !== undefined && patch.body !== cur.body && n.status !== "published")) {
    approvedAt = new Date().toISOString();
  }
  getDb()
    .prepare(
      `UPDATE posts SET memory_id=?, photo_id=?, pillar=?, format=?, angle=?, body=?, status=?, scheduled_at=?, published_at=?, approved_at=?, linkedin_urn=?, linkedin_url=?, quality=?,
       impressions=?, reactions=?, comments=?, reposts=?, metrics_updated_at=?, error=?, updated_at=datetime('now') WHERE id=?`,
    )
    .run(
      n.memoryId,
      n.photoId,
      n.pillar,
      n.format,
      n.angle,
      n.body,
      n.status,
      n.scheduledAt,
      n.publishedAt,
      approvedAt,
      n.linkedinUrn,
      n.linkedinUrl,
      n.quality ? JSON.stringify(n.quality) : null,
      n.impressions,
      n.reactions,
      n.comments,
      n.reposts,
      n.metricsUpdatedAt,
      n.error,
      id,
    );
  return getPost(id)!;
}

export function deletePost(id: string) {
  getDb().prepare(`DELETE FROM posts WHERE id = ?`).run(id);
}

export function addPostVersion(postId: string, body: string, source: "ai" | "human" | "revision", note = "") {
  getDb().prepare(`INSERT INTO post_versions (id, post_id, body, source, note, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(newId("pv"), postId, body, source, note, new Date().toISOString());
}

export function listPostVersions(postId: string): { id: string; body: string; source: string; note: string; createdAt: string }[] {
  return (getDb().prepare(`SELECT * FROM post_versions WHERE post_id = ? ORDER BY created_at DESC, rowid DESC`).all(postId) as { id: string; body: string; source: string; note: string; created_at: string }[]).map((r) => ({
    id: r.id,
    body: r.body,
    source: r.source,
    note: r.note,
    createdAt: r.created_at,
  }));
}

/* ================================================================== */
/* Activity                                                            */
/* ================================================================== */

export function listActivity(profileId: string, limit = 20): { id: number; kind: string; message: string; refId: string | null; createdAt: string }[] {
  return (getDb().prepare(`SELECT * FROM activity WHERE profile_id = ? ORDER BY id DESC LIMIT ?`).all(profileId, limit) as { id: number; kind: string; message: string; ref_id: string | null; created_at: string }[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    message: r.message,
    refId: r.ref_id,
    createdAt: r.created_at,
  }));
}
