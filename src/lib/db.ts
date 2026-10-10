import "server-only";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * Single SQLite database for the whole app. Everything lives under DATA_DIR
 * (default ./data): the database file and uploaded photos. Back up that folder
 * and you have backed up everything.
 */
export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.SOCIALBOOST_DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "data"));
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const MIGRATIONS: string[] = [
  // 1 — core schema
  `
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- A person whose LinkedIn we ghostwrite. Supports teams ("us").
  CREATE TABLE profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    headline TEXT NOT NULL DEFAULT '',
    linkedin_url TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT 'en',
    timezone TEXT NOT NULL DEFAULT 'UTC',
    avatar_photo_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Output of the positioning interview. JSON blob validated by zod (see lib/types.ts StrategySchema).
  CREATE TABLE strategies (
    profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE interviews (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('positioning','story','voice')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','abandoned')),
    title TEXT NOT NULL DEFAULT '',
    pillar TEXT,
    prompt_seed TEXT,
    summary TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  );
  CREATE INDEX idx_interviews_profile ON interviews(profile_id, created_at);

  CREATE TABLE interview_messages (
    id TEXT PRIMARY KEY,
    interview_id TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('assistant','user','system')),
    content TEXT NOT NULL,
    photo_ids TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_messages_interview ON interview_messages(interview_id, created_at);

  -- The memory bank: real stories extracted from interviews (or added manually).
  CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    interview_id TEXT REFERENCES interviews(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    story TEXT NOT NULL DEFAULT '',
    when_text TEXT NOT NULL DEFAULT '',
    place TEXT NOT NULL DEFAULT '',
    people TEXT NOT NULL DEFAULT '[]',
    emotions TEXT NOT NULL DEFAULT '[]',
    details TEXT NOT NULL DEFAULT '[]',
    quotes TEXT NOT NULL DEFAULT '[]',
    lesson TEXT NOT NULL DEFAULT '',
    pillar TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    angles TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('raw','ready','used','archived')),
    strength INTEGER NOT NULL DEFAULT 3,
    embedding TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_memories_profile ON memories(profile_id, created_at);

  CREATE TABLE photos (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    memory_id TEXT REFERENCES memories(id) ON DELETE SET NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL DEFAULT '',
    mime TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    caption TEXT NOT NULL DEFAULT '',
    user_note TEXT NOT NULL DEFAULT '',
    is_candid INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_photos_profile ON photos(profile_id, created_at);
  CREATE INDEX idx_photos_memory ON photos(memory_id);

  -- The user's own past LinkedIn posts (tone source) + reference posts from creators they admire.
  CREATE TABLE voice_samples (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'own' CHECK (kind IN ('own','reference')),
    author TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '',
    posted_at TEXT,
    impressions INTEGER,
    reactions INTEGER,
    comments INTEGER,
    reposts INTEGER,
    source TEXT NOT NULL DEFAULT 'paste',
    hash TEXT NOT NULL,
    embedding TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(profile_id, hash)
  );

  -- Deterministic stats + LLM-written style guide. JSON validated by VoiceProfileSchema.
  CREATE TABLE voice_profiles (
    profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE posts (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    memory_id TEXT REFERENCES memories(id) ON DELETE SET NULL,
    photo_id TEXT REFERENCES photos(id) ON DELETE SET NULL,
    pillar TEXT,
    format TEXT NOT NULL DEFAULT 'story',
    angle TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'idea' CHECK (status IN ('idea','draft','review','approved','scheduled','published','archived')),
    scheduled_at TEXT,
    published_at TEXT,
    linkedin_urn TEXT,
    linkedin_url TEXT,
    quality TEXT,
    impressions INTEGER,
    reactions INTEGER,
    comments INTEGER,
    reposts INTEGER,
    metrics_updated_at TEXT,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_posts_profile ON posts(profile_id, status);
  CREATE INDEX idx_posts_schedule ON posts(status, scheduled_at);

  CREATE TABLE post_versions (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('ai','human','revision')),
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_versions_post ON post_versions(post_id, created_at);

  CREATE TABLE linkedin_accounts (
    profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    member_urn TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    picture TEXT NOT NULL DEFAULT '',
    access_token TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    connected_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Append-only activity log shown on the dashboard and useful for debugging the factory.
  CREATE TABLE activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT,
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    ref_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `,
  // 2 — approval audit trail. AI-assisted posts are published only after a person approves them
  // (EU AI Act Art. 50 human-review exemption, LinkedIn Developer AI policy); record when.
  `
  ALTER TABLE posts ADD COLUMN approved_at TEXT;
  `,
];

type DB = Database.Database;

const globalForDb = globalThis as unknown as { __socialboostDb?: DB };

function migrate(db: DB) {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  const row = db.prepare(`SELECT MAX(version) AS v FROM _migrations`).get() as { v: number | null };
  const current = row.v ?? 0;
  for (let i = current; i < MIGRATIONS.length; i++) {
    const tx = db.transaction(() => {
      db.exec(MIGRATIONS[i]);
      db.prepare(`INSERT INTO _migrations (version) VALUES (?)`).run(i + 1);
    });
    tx();
  }
}

export function getDb(): DB {
  if (globalForDb.__socialboostDb) return globalForDb.__socialboostDb;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "socialboost.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  globalForDb.__socialboostDb = db;
  return db;
}

export function newId(prefix = ""): string {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return prefix ? `${prefix}_${id}` : id;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Parse a JSON column, falling back when null/corrupt. */
export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value === "") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function logActivity(kind: string, message: string, opts: { profileId?: string | null; refId?: string | null } = {}) {
  getDb()
    .prepare(`INSERT INTO activity (profile_id, kind, message, ref_id) VALUES (?, ?, ?, ?)`)
    .run(opts.profileId ?? null, kind, message, opts.refId ?? null);
}
