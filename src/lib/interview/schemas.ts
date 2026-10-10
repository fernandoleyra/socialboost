/**
 * zod schemas for interview API bodies and structured model output. Kept flat and
 * small so local models (Ollama `format`) can fill them reliably.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* API bodies                                                          */
/* ------------------------------------------------------------------ */

export const CreateInterviewBody = z.object({
  kind: z.enum(["positioning", "story"]),
  pillar: z.string().max(80).nullish(),
  seed: z.string().trim().max(600).nullish(),
  theme: z.string().max(40).nullish(),
  /** "I already know the story": becomes the user's first message. */
  knownStory: z.string().trim().max(4000).nullish(),
});

export const PatchInterviewBody = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  status: z.enum(["active", "abandoned"]).optional(),
  pillar: z.string().max(80).nullable().optional(),
});

export const ReplyBody = z.object({
  content: z.string().max(8000).default(""),
  photoIds: z.array(z.string().min(1).max(80)).max(10).default([]),
  intent: z.enum(["photo-later"]).optional(),
});

export const FinishBody = z.object({
  /** Photos added in the "one more thing" sheet; linked to the last story. */
  photoIds: z.array(z.string().min(1).max(80)).max(10).default([]),
});

/* ------------------------------------------------------------------ */
/* Model output                                                        */
/* ------------------------------------------------------------------ */

const str = () => z.string().default("");
const list = () => z.array(z.string()).default([]);

/** One story card. `pillar` is constrained to the user's pillar names when there are any. */
export function storyCardSchema(pillarNames: string[]) {
  const names = [...new Set(pillarNames.map((n) => n.trim()).filter(Boolean))];
  return z.object({
    title: z.string(),
    summary: str(),
    story: str(),
    when: str(),
    place: str(),
    people: list(),
    emotions: list(),
    details: list(),
    quotes: list(),
    lesson: str(),
    pillar: names.length ? z.enum(["", ...names]).default("") : str(),
    tags: list(),
    angles: list(),
    strength: z.number().default(3),
  });
}
export type StoryCard = z.infer<ReturnType<typeof storyCardSchema>>;

export const ExtractedPillarSchema = z.object({
  name: z.string(),
  description: str(),
  storyPrompts: list(),
});
export type ExtractedPillar = z.infer<typeof ExtractedPillarSchema>;

export const PositioningExtractSchema = z.object({
  positioning: str(),
  goals: list(),
  audienceWho: str(),
  audiencePains: list(),
  audienceDesires: list(),
  expertise: list(),
  offers: list(),
  beliefs: list(),
  contrarianTakes: list(),
  pillars: z.array(ExtractedPillarSchema).default([]),
  avoidTopics: list(),
  cta: str(),
  postsPerWeek: z.number().default(0),
  notes: str(),
});
export type PositioningExtract = z.infer<typeof PositioningExtractSchema>;

/** First finish call: everything but the pillars (kept small so slow machines stay fast). */
export const PositioningCoreSchema = PositioningExtractSchema.omit({ pillars: true });

export const PillarsOnlySchema = z.object({ pillars: z.array(ExtractedPillarSchema).default([]) });

export const StoryCoverageCheckSchema = z.object({
  scene: z.boolean(),
  people: z.boolean(),
  stakes: z.boolean(),
  turning: z.boolean(),
  details: z.boolean(),
  feelings: z.boolean(),
  lesson: z.boolean(),
});

export const PositioningCoverageCheckSchema = z.object({
  goals: z.boolean(),
  audience: z.boolean(),
  problems: z.boolean(),
  offer: z.boolean(),
  expertise: z.boolean(),
  beliefs: z.boolean(),
  origin: z.boolean(),
  boundaries: z.boolean(),
  rhythm: z.boolean(),
});
