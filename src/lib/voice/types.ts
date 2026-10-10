/**
 * Voice module types shared by the API, the server service and the client UI. Pure.
 */
import { z } from "zod";
import type { VoiceSample } from "@/lib/repo";
import type { VoiceGuide, VoiceProfile } from "@/lib/types";
import type { CloserType, OpenerType } from "./text";

/** Richer, recomputable stylometry that doesn't live in the shared VoiceStats schema. */
export type VoiceExtras = {
  sampleCount: number;
  wordsP25: number;
  wordsP75: number;
  charsMedian: number;
  /** Spread of sentence length in words (burstiness); human writing varies, AI is even. */
  sentenceWordsSd: number;
  paragraphsPerPost: number;
  numberedListRatio: number;
  bulletListRatio: number;
  listItemsMin: number;
  listItemsMax: number;
  spacedHyphenPerPost: number;
  ellipsisPerPost: number;
  linkRatio: number;
  weRatio: number;
  openerTypes: Record<OpenerType, number>;
  closerTypes: Record<CloserType, number>;
};

/** When the style guide was last written by the model, and from how many posts. */
export type VoiceMeta = {
  analyzedAt: string | null;
  /** Own posts that existed when the guide was written. */
  guideSampleCount: number;
  /** Posts the model actually read (the rest didn't fit the context window). */
  postsRead: number;
};

export type VoiceState = {
  samples: VoiceSample[];
  profile: VoiceProfile;
  extras: VoiceExtras | null;
  meta: VoiceMeta;
  /** The exact block injected into writer prompts. */
  promptBlock: string;
  counts: { own: number; reference: number; indexed: number };
  embeddingsConfigured: boolean;
};

export type ImportResult = {
  /** Posts found in what was pasted/uploaded. */
  found: number;
  inserted: number;
  /** Already-imported posts whose missing numbers (reactions, date, link) were filled in. */
  updated: number;
  /** Duplicates, empty rows (bare reposts) and posts too short to teach anything. */
  skipped: number;
  warnings: string[];
  state: VoiceState;
};

/** Minimum own posts before stats and the style guide are computed. */
export const MIN_POSTS_FOR_ANALYSIS = 3;
/** Posts that give a good analysis. */
export const GOOD_POST_COUNT = 10;

export const IMPORT_KINDS = ["own", "reference"] as const;
export const IMPORT_FORMATS = ["text", "csv", "json"] as const;
export const IMPORT_ORIGINS = ["paste", "export", "helper"] as const;
export type ImportOrigin = (typeof IMPORT_ORIGINS)[number];

export const ImportRequestSchema = z
  .object({
    kind: z.enum(IMPORT_KINDS).default("own"),
    format: z.enum(IMPORT_FORMATS),
    content: z.string().min(1, "Nothing to import").max(15_000_000, "That file is too large (15 MB max)"),
    author: z.string().trim().max(120).optional(),
    /** Where the content came from originally (the UI previews pasted text and sends the kept posts as JSON). */
    origin: z.enum(IMPORT_ORIGINS).optional(),
  })
  .refine((r) => r.kind === "own" || !!r.author, { message: "Add the creator's name", path: ["author"] });
export type ImportRequest = z.infer<typeof ImportRequestSchema>;

const item = z.string().trim().min(1).max(300);
export const ProfileUpdateSchema = z.object({
  manualRules: z.array(item).max(60).optional(),
  guide: z
    .object({
      summary: z.string().trim().max(1200),
      tone: z.array(item).max(12),
      hookPatterns: z.array(item).max(12),
      structure: z.array(item).max(12),
      formatting: z.array(item).max(12),
      vocabulary: z.array(item).max(16),
      signatureMoves: z.array(item).max(12),
      neverDoes: z.array(item).max(16),
    })
    .partial()
    .optional(),
});
export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>;

const count = z.number().int().min(0).max(1_000_000_000).nullable();
export const SampleUpdateSchema = z.object({
  impressions: count.optional(),
  reactions: count.optional(),
  comments: count.optional(),
  reposts: count.optional(),
});
export type SampleUpdate = z.infer<typeof SampleUpdateSchema>;

/** Guide sections in display order. */
export const GUIDE_SECTIONS = [
  { key: "tone", label: "Tone", hint: "How you sound, in a few words." },
  { key: "hookPatterns", label: "How you open", hint: "What your first line usually does." },
  { key: "structure", label: "How a post is built", hint: "The usual shape from top to bottom." },
  { key: "formatting", label: "Formatting", hint: "Paragraphs, lists, punctuation, emojis, hashtags." },
  { key: "vocabulary", label: "Words you use", hint: "Real words and phrases from your posts." },
  { key: "signatureMoves", label: "Signature moves", hint: "Things readers would recognise as you." },
  { key: "neverDoes", label: "Never does", hint: "What never shows up in your posts." },
] as const satisfies readonly { key: keyof VoiceGuide; label: string; hint: string }[];
export type GuideListKey = (typeof GUIDE_SECTIONS)[number]["key"];
