import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Strategy — produced by the positioning interview, editable by hand  */
/* ------------------------------------------------------------------ */

export const PillarSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  /** Relative share of posts this pillar should get (0-100). Tuned by analytics. */
  weight: z.number().min(0).max(100).default(33),
  /** Kinds of stories that belong here — used to steer story interviews. */
  storyPrompts: z.array(z.string()).default([]),
  color: z.string().default("blue"),
});
export type Pillar = z.infer<typeof PillarSchema>;

export const StrategySchema = z.object({
  /** One-sentence positioning: "I help X do Y by Z". */
  positioning: z.string().default(""),
  /** What the person wants LinkedIn to do for them (clients, hiring, fundraising, authority...). */
  goals: z.array(z.string()).default([]),
  audience: z
    .object({
      who: z.string().default(""),
      pains: z.array(z.string()).default([]),
      desires: z.array(z.string()).default([]),
    })
    .default({ who: "", pains: [], desires: [] }),
  expertise: z.array(z.string()).default([]),
  offers: z.array(z.string()).default([]),
  beliefs: z.array(z.string()).default([]),
  contrarianTakes: z.array(z.string()).default([]),
  pillars: z.array(PillarSchema).default([]),
  avoidTopics: z.array(z.string()).default([]),
  cta: z.string().default(""),
  cadence: z
    .object({
      postsPerWeek: z.number().int().min(1).max(14).default(3),
      /** 0 = Sunday ... 6 = Saturday */
      days: z.array(z.number().int().min(0).max(6)).default([2, 3, 4]),
      time: z.string().default("08:30"),
    })
    .default({ postsPerWeek: 3, days: [2, 3, 4], time: "08:30" }),
  language: z.string().default("en"),
  notes: z.string().default(""),
});
export type Strategy = z.infer<typeof StrategySchema>;

/* ------------------------------------------------------------------ */
/* Voice profile — how the person writes                               */
/* ------------------------------------------------------------------ */

export const VoiceStatsSchema = z.object({
  sampleCount: z.number(),
  avgWords: z.number(),
  medianWords: z.number(),
  avgSentenceWords: z.number(),
  avgParagraphLines: z.number(),
  oneLineParagraphRatio: z.number(),
  emojiPerPost: z.number(),
  hashtagsPerPost: z.number(),
  questionRatio: z.number(),
  exclamationPerPost: z.number(),
  emDashPerPost: z.number(),
  bulletRatio: z.number(),
  firstPersonRatio: z.number(),
  avgHookChars: z.number(),
  topEmojis: z.array(z.string()),
  commonOpeners: z.array(z.string()),
  commonClosers: z.array(z.string()),
  signaturePhrases: z.array(z.string()),
});
export type VoiceStats = z.infer<typeof VoiceStatsSchema>;

export const VoiceGuideSchema = z.object({
  summary: z.string().default(""),
  tone: z.array(z.string()).default([]),
  hookPatterns: z.array(z.string()).default([]),
  structure: z.array(z.string()).default([]),
  formatting: z.array(z.string()).default([]),
  vocabulary: z.array(z.string()).default([]),
  signatureMoves: z.array(z.string()).default([]),
  neverDoes: z.array(z.string()).default([]),
});
export type VoiceGuide = z.infer<typeof VoiceGuideSchema>;

export const VoiceProfileSchema = z.object({
  stats: VoiceStatsSchema.nullable().default(null),
  guide: VoiceGuideSchema.default({
    summary: "",
    tone: [],
    hookPatterns: [],
    structure: [],
    formatting: [],
    vocabulary: [],
    signatureMoves: [],
    neverDoes: [],
  }),
  /** Free-form notes the user adds ("I never use emojis", "I say 'folks'"). Always respected. */
  manualRules: z.array(z.string()).default([]),
});
export type VoiceProfile = z.infer<typeof VoiceProfileSchema>;

/* ------------------------------------------------------------------ */
/* Memories (story bank)                                               */
/* ------------------------------------------------------------------ */

export const ExtractedMemorySchema = z.object({
  title: z.string(),
  summary: z.string(),
  /** The story retold in first person, using the user's own words wherever possible. */
  story: z.string(),
  when: z.string().default(""),
  place: z.string().default(""),
  people: z.array(z.string()).default([]),
  emotions: z.array(z.string()).default([]),
  /** Concrete sensory details, numbers, objects — the stuff that makes it real. */
  details: z.array(z.string()).default([]),
  /** Verbatim lines the user said, worth quoting. */
  quotes: z.array(z.string()).default([]),
  lesson: z.string().default(""),
  pillar: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  /** Possible post angles this story could support. */
  angles: z.array(z.string()).default([]),
  /** 1-5: how vivid/complete the story is. */
  strength: z.number().int().min(1).max(5).default(3),
});
export type ExtractedMemory = z.infer<typeof ExtractedMemorySchema>;

export type Memory = {
  id: string;
  profileId: string;
  interviewId: string | null;
  title: string;
  summary: string;
  story: string;
  when: string;
  place: string;
  people: string[];
  emotions: string[];
  details: string[];
  quotes: string[];
  lesson: string;
  pillar: string | null;
  tags: string[];
  angles: string[];
  status: "raw" | "ready" | "used" | "archived";
  strength: number;
  createdAt: string;
  updatedAt: string;
  photoCount?: number;
  coverPhotoId?: string | null;
};

export type Photo = {
  id: string;
  profileId: string;
  memoryId: string | null;
  filename: string;
  originalName: string;
  mime: string;
  width: number | null;
  height: number | null;
  caption: string;
  userNote: string;
  isCandid: boolean | null;
  createdAt: string;
};

/* ------------------------------------------------------------------ */
/* Posts                                                               */
/* ------------------------------------------------------------------ */

export const POST_STATUSES = ["idea", "draft", "review", "approved", "scheduled", "published", "archived"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const POST_FORMATS = ["story", "lesson", "contrarian", "behind-the-scenes", "list", "question"] as const;
export type PostFormat = (typeof POST_FORMATS)[number];

export const LintIssueSchema = z.object({
  rule: z.string(),
  severity: z.enum(["error", "warn", "info"]),
  message: z.string(),
  match: z.string().optional(),
});
export type LintIssue = z.infer<typeof LintIssueSchema>;

export const CritiqueSchema = z.object({
  humanness: z.number().min(1).max(10),
  specificity: z.number().min(1).max(10),
  voiceMatch: z.number().min(1).max(10),
  hook: z.number().min(1).max(10),
  issues: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([]),
});
export type Critique = z.infer<typeof CritiqueSchema>;

export type PostQuality = {
  lint: LintIssue[];
  critique: Critique | null;
  score: number;
  checkedAt: string;
};

export type Post = {
  id: string;
  profileId: string;
  memoryId: string | null;
  photoId: string | null;
  pillar: string | null;
  format: PostFormat | string;
  angle: string;
  body: string;
  status: PostStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  /** When a person approved this exact text for publishing (cleared if the text changes afterwards). */
  approvedAt?: string | null;
  linkedinUrn: string | null;
  linkedinUrl: string | null;
  quality: PostQuality | null;
  impressions: number | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
  metricsUpdatedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

/* ------------------------------------------------------------------ */
/* Model routing                                                       */
/* ------------------------------------------------------------------ */

export const PROVIDER_KINDS = ["ollama", "openai", "anthropic"] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export const ProviderConfigSchema = z.object({
  id: z.string(),
  kind: z.enum(PROVIDER_KINDS),
  label: z.string(),
  baseUrl: z.string(),
  apiKey: z.string().default(""),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const MODEL_TASKS = ["interviewer", "extractor", "writer", "critic", "vision", "embedding", "transcription"] as const;
export type ModelTask = (typeof MODEL_TASKS)[number];

export const ModelRouteSchema = z.object({
  providerId: z.string(),
  model: z.string(),
  temperature: z.number().min(0).max(2).optional(),
});
export type ModelRoute = z.infer<typeof ModelRouteSchema>;

export const AISettingsSchema = z.object({
  providers: z.array(ProviderConfigSchema),
  routes: z.record(z.enum(MODEL_TASKS), ModelRouteSchema.nullable()),
  /** Context window to request from Ollama (num_ctx). */
  numCtx: z.number().int().default(8192),
});
export type AISettings = z.infer<typeof AISettingsSchema>;
