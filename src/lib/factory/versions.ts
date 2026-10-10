import "server-only";
import { getDb } from "@/lib/db";
import { addPostVersion, listPostVersions } from "@/lib/repo";

/** Human edits within this window update the same version instead of piling up autosaves. */
const COALESCE_MS = 10 * 60_000;

type VersionRow = { id: string; body: string; source: string; created_at: string };

function latestVersion(postId: string): VersionRow | undefined {
  return getDb().prepare(`SELECT id, body, source, created_at FROM post_versions WHERE post_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`).get(postId) as VersionRow | undefined;
}

/**
 * Record a human edit. The editor autosaves every second or so while typing; one editing session
 * becomes one "You" version in the history, refreshed as the user keeps typing.
 */
export function saveHumanVersion(postId: string, body: string, note = "Edited by you") {
  const last = latestVersion(postId);
  if (last && last.body === body) return;
  const age = last ? Date.now() - Date.parse(last.created_at) : Infinity;
  if (last && last.source === "human" && age < COALESCE_MS) {
    getDb().prepare(`UPDATE post_versions SET body = ?, note = ?, created_at = ? WHERE id = ?`).run(body, note, new Date().toISOString(), last.id);
    return;
  }
  addPostVersion(postId, body, "human", note);
}

/** Save a generated version (skips exact repeats). */
export function saveGeneratedVersion(postId: string, body: string, source: "ai" | "revision", note: string) {
  const last = latestVersion(postId);
  if (last && last.body === body && last.source === source) return;
  addPostVersion(postId, body, source, note);
}

/**
 * Before the model rewrites the post, make sure the text the user is looking at is in the
 * history, so "Restore" can always bring it back.
 */
export function snapshotBeforeGeneration(postId: string, body: string) {
  if (!body.trim()) return;
  const last = latestVersion(postId);
  if (last && last.body === body) return;
  addPostVersion(postId, body, "human", "Your text before the rewrite");
}

export function getVersion(postId: string, versionId: string) {
  return listPostVersions(postId).find((v) => v.id === versionId) ?? null;
}
