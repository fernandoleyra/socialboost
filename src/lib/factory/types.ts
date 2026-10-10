/**
 * Shapes the Studio API returns and the editor consumes. Pure types — safe on the client.
 */

import type { Memory, Photo, Post } from "@/lib/types";

export type PhotoLite = Pick<Photo, "id" | "memoryId" | "width" | "height" | "caption" | "userNote" | "isCandid" | "createdAt">;

export type PostDetail = {
  post: Post;
  memory: Memory | null;
  photo: PhotoLite | null;
  /** Photos attached to the post's memory. */
  memoryPhotos: PhotoLite[];
  /** Recent photos from the rest of the library. */
  libraryPhotos: PhotoLite[];
};

export type PostVersion = { id: string; body: string; source: string; note: string; createdAt: string };
