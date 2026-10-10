import "server-only";
import { logActivity } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { createPost, getMemory, getPhoto, getPost, getStrategy, listPhotos, listPosts, updatePost } from "@/lib/repo";
import type { Memory, Photo, Post, PostStatus } from "@/lib/types";
import { hookOf, parseAngleField } from "./angles";
import { lintForPost } from "./context";
import { findPillar } from "./pillars";
import { relint } from "./quality";
import { statusAfterHumanEdit } from "./status";
import { getStructure, recommendStructures } from "./structures";
import type { PhotoLite, PostDetail } from "./types";
import { saveHumanVersion } from "./versions";

/** The post, if it belongs to the active profile. 404 otherwise (never leak other profiles). */
export function requirePost(profileId: string, id: string): Post {
  const post = getPost(id);
  if (!post || post.profileId !== profileId) throw new HttpError(404, "Post not found", "It may have been deleted. Go back to the Studio.");
  return post;
}

export function requireMemory(profileId: string, id: string): Memory {
  const m = getMemory(id);
  if (!m || m.profileId !== profileId) throw new HttpError(404, "Memory not found");
  return m;
}

/** Short, human label for logs and cards. */
export function postLabel(post: Post, memory?: Memory | null): string {
  const hook = hookOf(post.body) || parseAngleField(post.angle).selected?.hook || memory?.title || "Untitled post";
  return hook.length > 80 ? hook.slice(0, 77) + "…" : hook;
}

export function createPostFromMemory(profileId: string, input: { memoryId: string; pillar?: string | null; format?: string | null; reuseEmpty?: boolean; scheduledAt?: string | null }): { post: Post; reused: boolean } {
  const memory = requireMemory(profileId, input.memoryId);
  if (input.reuseEmpty) {
    const empty = listPosts(profileId, { memoryId: memory.id, status: "idea" }).find((p) => !p.body.trim());
    if (empty) return { post: empty, reused: true };
  }
  const strategy = getStrategy(profileId);
  const pillar = input.pillar ?? findPillar(strategy, memory.pillar)?.id ?? memory.pillar;
  const structure = getStructure(recommendStructures(memory, { hasPhoto: !!memory.coverPhotoId })[0]);
  const post = createPost({
    profileId,
    memoryId: memory.id,
    photoId: memory.coverPhotoId ?? null,
    pillar,
    format: input.format ?? structure?.format ?? "story",
    status: "idea",
    scheduledAt: input.scheduledAt ?? null,
  });
  logActivity("post", `New post idea from "${memory.title}"`, { profileId, refId: post.id });
  return { post, reused: false };
}

export function createBlankPost(profileId: string, input: { body: string; pillar?: string | null; format?: string | null }): Post {
  const body = input.body.trim();
  let post = createPost({ profileId, pillar: input.pillar ?? null, format: input.format ?? "story", body, status: body ? "draft" : "idea" });
  if (body) post = applyHumanEdit(post, body);
  logActivity("post", `New post: ${postLabel(post)}`, { profileId, refId: post.id });
  return post;
}

/** Save a hand edit: version it (coalesced), re-lint, keep the critique (marked stale). */
export function applyHumanEdit(post: Post, body: string, note?: string): Post {
  const lint = lintForPost(post, body);
  if (body.trim()) saveHumanVersion(post.id, body, note);
  const quality = relint(post.quality, body, lint.issues, lint.score);
  return updatePost(post.id, { body, quality, status: statusAfterHumanEdit(post.status, body) });
}

const lite = (p: Photo): PhotoLite => ({ id: p.id, memoryId: p.memoryId, width: p.width, height: p.height, caption: p.caption, userNote: p.userNote, isCandid: p.isCandid, createdAt: p.createdAt });

/** Post plus everything the editor shows around it. */
export function postDetail(post: Post): PostDetail {
  const memory = post.memoryId ? getMemory(post.memoryId) : null;
  const photo = post.photoId ? getPhoto(post.photoId) : null;
  const memoryPhotos = memory ? listPhotos(post.profileId, { memoryId: memory.id }) : [];
  const inMemory = new Set(memoryPhotos.map((p) => p.id));
  const libraryPhotos = listPhotos(post.profileId)
    .filter((p) => !inMemory.has(p.id))
    .slice(0, 60);
  return { post, memory, photo: photo ? lite(photo) : null, memoryPhotos: memoryPhotos.map(lite), libraryPhotos: libraryPhotos.map(lite) };
}

export function parseStatuses(raw: string | null): PostStatus[] | undefined {
  if (!raw) return undefined;
  const all = ["idea", "draft", "review", "approved", "scheduled", "published", "archived"];
  const xs = raw.split(",").map((s) => s.trim()).filter((s) => all.includes(s)) as PostStatus[];
  return xs.length ? xs : undefined;
}
