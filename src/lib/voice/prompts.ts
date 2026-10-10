/**
 * Prompts and text blocks for the voice module. Pure, so they're unit-tested and stay small
 * enough for 7-14B local models: short instructions, numbered rules, measured facts stated
 * as facts.
 */
import type { VoiceGuide, VoiceStats } from "@/lib/types";
import { CLOSER_LABEL, OPENER_LABEL, classifyOpener, stopwords, type CloserType, type OpenerType } from "./text";
import type { VoiceExtras } from "./types";

const pct = (r: number) => `${Math.round(r * 100)}%`;
const fmt = (n: number) => (Math.abs(n) >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10));
const quoteList = (xs: string[], max: number) =>
  xs
    .slice(0, max)
    .map((x) => `"${x}"`)
    .join(", ");

function dominant<T extends string>(dist: Record<T, number>): [T, number] | null {
  const entries = Object.entries(dist) as [T, number][];
  const top = entries.sort((a, b) => b[1] - a[1])[0];
  return top && top[1] > 0 ? top : null;
}

/* ------------------------------------------------------------------ */
/* Measured rules (shared by the analysis prompt and the writer block)  */
/* ------------------------------------------------------------------ */

/** Turn the numbers into short, imperative style rules. */
export function statRules(stats: VoiceStats, extras: VoiceExtras | null): string[] {
  const r: string[] = [];
  const range = extras && extras.wordsP75 > extras.wordsP25 ? ` (most of my posts run ${extras.wordsP25}-${extras.wordsP75})` : "";
  r.push(`Length: about ${Math.round(stats.medianWords)} words${range}.`);

  const varied = extras && stats.avgSentenceWords > 0 ? extras.sentenceWordsSd / stats.avgSentenceWords >= 0.55 : true;
  r.push(`Sentences: about ${fmt(stats.avgSentenceWords)} words on average; ${varied ? "mix very short sentences with longer ones" : "keep them fairly even"}.`);

  if (stats.avgParagraphLines <= 1.25) r.push(`Paragraphs: mostly one line each, separated by a blank line (${pct(stats.oneLineParagraphRatio)} are a single sentence).`);
  else r.push(`Paragraphs: ${fmt(stats.avgParagraphLines)} lines on average; ${pct(stats.oneLineParagraphRatio)} are a single sentence. Don't stack one-liners.`);

  if (stats.emojiPerPost < 0.15) r.push("No emojis.");
  else r.push(`Emojis: about ${fmt(stats.emojiPerPost)} per post${stats.topEmojis.length ? ` (${stats.topEmojis.slice(0, 3).join(" ")})` : ""}, never as bullets.`);

  if (stats.hashtagsPerPost < 0.15) r.push("No hashtags.");
  else r.push(`Hashtags: about ${Math.max(1, Math.round(stats.hashtagsPerPost))}, only at the very end.`);

  if (stats.emDashPerPost < 0.1) {
    const hyphen = extras && extras.spacedHyphenPerPost >= 0.3 ? ', a comma or a spaced hyphen (" - ")' : " or a comma";
    r.push(`No em dashes (—). Use a period${hyphen}.`);
  } else r.push(`Em dashes: at most ${Math.max(1, Math.round(stats.emDashPerPost))} per post.`);

  if (stats.exclamationPerPost < 0.25) r.push("Almost never use exclamation marks.");
  else r.push(`Exclamation marks: about ${fmt(stats.exclamationPerPost)} per post.`);

  if (stats.bulletRatio >= 0.25) {
    const numbered = !extras || extras.numberedListRatio >= extras.bulletListRatio;
    const items = extras && extras.listItemsMax >= 2 ? ` of ${extras.listItemsMin === extras.listItemsMax ? extras.listItemsMin : `${extras.listItemsMin}-${extras.listItemsMax}`} items` : "";
    r.push(`Lists: ${pct(stats.bulletRatio)} of my posts have one ${numbered ? "numbered" : "bulleted"} list${items}. Use one only when the content really is a list.`);
  } else if (stats.bulletRatio < 0.1) r.push("I rarely use lists. Write in paragraphs.");

  if (extras) {
    const q = extras.closerTypes.question;
    if (q >= 0.3) r.push(`About ${pct(q)} of my posts end with one short question to the reader.`);
    else if (q <= 0.1) r.push("I rarely end with a question.");
    if (extras.closerTypes.statement >= 0.5) r.push("Most of my posts end on a plain last line: no moral, no call to action.");
  }
  if (stats.firstPersonRatio >= 0.25) r.push("Write in the first person singular.");
  if (extras && extras.linkRatio < 0.1) r.push("No links in the post.");

  const hook = extras ? dominant(extras.openerTypes) : null;
  r.push(`First line: about ${stats.avgHookChars} characters${hook && hook[1] >= 0.4 ? `, usually ${OPENER_LABEL[hook[0] as OpenerType].toLowerCase()}` : ""}.`);
  if (stats.commonOpeners.length) r.push(`Openings I reuse: ${quoteList(stats.commonOpeners, 4)}.`);
  if (stats.commonClosers.length) r.push(`Closings I reuse: ${quoteList(stats.commonClosers, 4)}.`);
  if (stats.signaturePhrases.length) r.push(`Phrases that are mine (use at most one or two, only where they fit): ${quoteList(stats.signaturePhrases, 6)}.`);
  return r;
}

/* ------------------------------------------------------------------ */
/* Writer block                                                        */
/* ------------------------------------------------------------------ */

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/**
 * The compact block injected into writer prompts (under "HOW I WRITE"). Empty when we know
 * nothing yet, so the writer falls back to its plain defaults.
 */
export function buildVoicePromptBlock(input: { stats: VoiceStats | null; guide: VoiceGuide; manualRules: string[]; extras: VoiceExtras | null }): string {
  const parts: string[] = [];
  if (input.stats && input.stats.sampleCount > 0) {
    parts.push(`Measured from ${input.stats.sampleCount} of my real posts:`, ...statRules(input.stats, input.extras).map((x) => `- ${x}`));
  }
  const g = input.guide;
  const guideLines: string[] = [];
  if (g.summary.trim()) guideLines.push(`- Overall: ${clip(g.summary.trim(), 320)}`);
  const list = (label: string, xs: string[], max: number, joiner = "; ") => {
    // Items are joined on one line, so their own end punctuation goes ("No emojis.; No hashtags.").
    const items = xs.map((x) => clip(x.trim().replace(/[.;,]+$/, ""), 140)).filter(Boolean).slice(0, max);
    if (items.length) guideLines.push(`- ${label}: ${items.join(joiner)}`);
  };
  list("Tone", g.tone, 6, ", ");
  // Hook examples are real first lines; the writer gets the pattern only, so it can't borrow their facts.
  list("Hooks", g.hookPatterns.map((x) => x.replace(/\s*[:,(]?\s*(?:e\.g\.|like)?\s*["“][^"”]*["”]\)?\.?/g, "").trim()), 3);
  list("Structure", g.structure, 3);
  list("Formatting", g.formatting, 4);
  list("Words I use", g.vocabulary, 8, ", ");
  list("Signature moves", g.signatureMoves, 4);
  list("I never", g.neverDoes, 6);
  const gap = () => (parts.length ? [""] : []);
  if (guideLines.length) parts.push(...gap(), "My style:", ...guideLines);
  const rules = input.manualRules.map((x) => x.trim()).filter(Boolean);
  if (rules.length) parts.push(...gap(), "My own rules (always follow these; they override everything above):", ...rules.slice(0, 30).map((x) => `- ${clip(x, 200)}`));
  return parts.join("\n").trim();
}

/* ------------------------------------------------------------------ */
/* Style analysis prompt                                               */
/* ------------------------------------------------------------------ */

export const ANALYSIS_SYSTEM = [
  "You are a writing-style analyst for a LinkedIn ghostwriter.",
  "You study one person's posts and describe HOW they write so the ghostwriter can sound exactly like them.",
  "You describe style, never topics. You never invent: every point must be visible in the posts.",
].join(" ");

export function buildAnalysisPrompt(input: { name: string; posts: { text: string }[]; stats: VoiceStats; extras: VoiceExtras | null }): string {
  const { name, posts, stats, extras } = input;
  const facts = statRules(stats, extras).map((x) => `- ${x}`);
  if (extras) {
    const opener = dominant(extras.openerTypes);
    const closer = dominant(extras.closerTypes);
    if (opener) facts.push(`- Most common opening: ${OPENER_LABEL[opener[0] as OpenerType].toLowerCase()} (${pct(opener[1])} of posts).`);
    if (closer) facts.push(`- Most common ending: ${CLOSER_LABEL[closer[0] as CloserType].toLowerCase()} (${pct(closer[1])} of posts).`);
  }
  const who = name.trim() || "this person";
  return [
    posts.length === 1 ? `Below is 1 LinkedIn post written by ${who}.` : `Below are ${posts.length} LinkedIn posts written by ${who}.`,
    "",
    ...posts.flatMap((p, i) => [`<post ${i + 1}>`, p.text.trim(), `</post ${i + 1}>`, ""]),
    `MEASURED FACTS about these posts, counted by code across ${stats.sampleCount} posts and written as ${who} would say them ("I", "my posts"). Trust them over your impression:`,
    ...facts,
    "",
    "Write a style guide with these fields:",
    "1. summary: 2 sentences on how this person sounds (not what they write about).",
    '2. tone: 3 to 6 short words, e.g. "dry", "direct", "self-deprecating".',
    '3. hookPatterns: 2 to 4 patterns for the first line. Name the pattern, then a short quoted example: Opens on a time and place: "Monday, 7 a.m., ward 4."',
    "4. structure: 2 to 4 patterns for how a post is built from top to bottom.",
    "5. formatting: 2 to 5 habits: paragraphs, lists, line breaks, punctuation, emojis, hashtags.",
    "6. vocabulary: 3 to 8 short phrases this person repeats or would say out loud, in double quotes. Not topic words.",
    "7. signatureMoves: 2 to 5 moves a reader would recognise, e.g. a bonus point after a list.",
    '8. neverDoes: 3 to 6 things that NEVER appear in these posts. Each starts with "No" or "Never".',
    "",
    "Example for a different writer (a nurse; do not copy it):",
    '{"summary":"Warm and quick. Talks like she is telling a friend about her shift.","tone":["warm","playful","plain"],"hookPatterns":["Opens on a time and place: \\"Monday, 7 a.m., ward 4.\\""],"structure":["Scene, then what a patient said, then one line on what it taught her"],"formatting":["Short paragraphs of one or two sentences","Numbered lists only for real steps"],"vocabulary":["\\"honestly\\"","\\"here is the thing about night shifts\\""],"signatureMoves":["Ends by asking other nurses what they would have done"],"neverDoes":["No hashtags","Never names a patient"]}',
    "",
    "Rules:",
    "- Base every point on the posts above. Copy quoted phrases exactly.",
    "- Describe style only, never topics.",
    "- Each item is one line under 20 words.",
    "- Write in English; keep quotes in the language of the posts.",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Guide clean-up                                                      */
/* ------------------------------------------------------------------ */

const LIST_KEYS = ["tone", "hookPatterns", "structure", "formatting", "vocabulary", "signatureMoves", "neverDoes"] as const;
const LIMITS: Record<(typeof LIST_KEYS)[number], number> = { tone: 6, hookPatterns: 4, structure: 4, formatting: 5, vocabulary: 8, signatureMoves: 5, neverDoes: 6 };

/** Trim, de-duplicate, strip list markers and cap what a small model returns. */
export function sanitizeGuide(g: VoiceGuide): VoiceGuide {
  const clean = (s: string) =>
    s
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
  const out: VoiceGuide = { ...g, summary: clean(g.summary).slice(0, 600) };
  for (const k of LIST_KEYS) {
    const seen = new Set<string>();
    out[k] = (g[k] ?? [])
      .map((x) => clean(String(x)))
      .filter((x) => x.length > 1 && x.length <= 240)
      .filter((x) => {
        const key = x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, LIMITS[k]);
  }
  return out;
}

const NEGATION = /\b(?:no|never|not|none|without|zero|avoids?|doesn['’]t|does not|don['’]t|isn['’]t|won['’]t)\b/i;
const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const unquote = (s: string) => s.replace(/^["“'‘]+|["”'’.]+$/g, "").trim();

/**
 * Hold the guide to the posts. Small local models tend to paste whole first lines in as "hook
 * patterns", list topic nouns as "vocabulary", and fill "never does" with things the person
 * plainly does. Fix what can be checked against the posts; fall back to measured patterns.
 */
export function groundGuide(g: VoiceGuide, texts: string[], stats: VoiceStats): VoiceGuide {
  const corpus = ` ${squash(texts.join("\n"))} `;
  const firstLines = new Set(texts.map((t) => squash(t.split("\n").find((l) => l.trim()) ?? "")));
  const inPosts = (s: string) => {
    const q = squash(unquote(s));
    return q.length > 0 && corpus.includes(` ${q} `);
  };
  // Every quote in the guide must be the person's own words (small models copy the prompt's example).
  const quotesReal = (item: string) => [...item.matchAll(/["“]([^"”]{2,160})["”]/g)].every((m) => inPosts(m[1]));
  const stop = stopwords("en");
  const keep = (xs: string[]) => xs.filter(quotesReal);

  // "Never does" must say what's absent, and can't be something the posts contain.
  const neverDoes = g.neverDoes.filter((x) => NEGATION.test(x) && !inPosts(x));

  // A bare first line is an example, not a pattern; keep only items that describe something.
  let hookPatterns = keep(g.hookPatterns).filter((x) => !firstLines.has(squash(unquote(x))));
  if (hookPatterns.length < 2) {
    const byType = new Map<OpenerType, { line: string; n: number }>();
    for (const t of texts) {
      const line = t.split("\n").find((l) => l.trim())?.trim() ?? "";
      if (!line) continue;
      const type = classifyOpener(line);
      const cur = byType.get(type);
      byType.set(type, { line: cur?.line ?? line, n: (cur?.n ?? 0) + 1 });
    }
    const measured = [...byType.entries()].sort((a, b) => b[1].n - a[1].n).map(([type, { line }]) => `${OPENER_LABEL[type]}: "${clip(line.replace(/["“”]/g, "'"), 80)}"`);
    hookPatterns = [...hookPatterns, ...measured].slice(0, 3);
  }

  // Vocabulary is phrases the person says; single topic nouns ("warehouse") teach nothing about voice.
  const own = stats.signaturePhrases.map((p) => `"${p}"`);
  // Quoted, short, really in the posts, and not just function words ("the same"). Unquoted
  // whole sentences are content, and would hand the writer facts from old posts.
  const said = keep(g.vocabulary).filter((x) => {
    const words = squash(unquote(x)).split(" ").filter(Boolean);
    return /^["“]/.test(x.trim()) && words.length >= 1 && words.length <= 6 && !words.every((w) => stop.has(w)) && inPosts(x);
  });
  const vocabulary: string[] = [];
  for (const x of [...own, ...said]) if (!vocabulary.some((v) => squash(v) === squash(x))) vocabulary.push(x);

  return { ...g, neverDoes, hookPatterns, vocabulary: vocabulary.slice(0, 8), structure: keep(g.structure), formatting: keep(g.formatting), signatureMoves: keep(g.signatureMoves) };
}

type Habit = { re: RegExp; uses: (s: VoiceStats, e: VoiceExtras | null) => boolean; absent: (s: VoiceStats, e: VoiceExtras | null) => boolean; never: string };
const HABITS: Habit[] = [
  { re: /emoji/i, uses: (s) => s.emojiPerPost >= 0.3, absent: (s) => s.emojiPerPost === 0, never: "No emojis." },
  { re: /hashtag/i, uses: (s) => s.hashtagsPerPost >= 0.3, absent: (s) => s.hashtagsPerPost === 0, never: "No hashtags." },
  { re: /em[ -]?dash|—/i, uses: (s) => s.emDashPerPost >= 0.2, absent: (s) => s.emDashPerPost === 0, never: "No em dashes." },
  { re: /exclamation/i, uses: (s) => s.exclamationPerPost >= 0.5, absent: (s) => s.exclamationPerPost === 0, never: "No exclamation marks." },
  { re: /\b(?:list|bullet)s?\b/i, uses: (s) => s.bulletRatio >= 0.2, absent: (s) => s.bulletRatio === 0, never: "No lists." },
  { re: /\blinks?\b|\burls?\b/i, uses: (_s, e) => (e?.linkRatio ?? 0) >= 0.2, absent: (_s, e) => e !== null && e.linkRatio === 0, never: "No links in the post." },
];
/** "Never uses emojis as bullets" is a narrower claim than "never uses emojis"; leave those alone. */
const QUALIFIED = /bullet|more than|too many|excess|overus|heav|middle|inline|at the (?:start|beginning)|instead/i;

/**
 * Make the guide agree with the numbers: drop "never does" items the posts contradict (small
 * models hallucinate these), and add habits the numbers prove are absent (with enough posts).
 */
export function reconcileGuide(g: VoiceGuide, stats: VoiceStats, extras: VoiceExtras | null): VoiceGuide {
  let never = g.neverDoes.filter((item) => QUALIFIED.test(item) || !HABITS.some((h) => h.re.test(item) && h.uses(stats, extras)));
  if (stats.sampleCount >= 5) {
    for (const h of HABITS) if (h.absent(stats, extras) && !never.some((item) => h.re.test(item))) never = [...never, h.never];
  }
  return { ...g, neverDoes: never.slice(0, 8) };
}

/* ------------------------------------------------------------------ */
/* Context budget                                                      */
/* ------------------------------------------------------------------ */

/**
 * How many characters of posts fit the extractor's context. Local models get numCtx minus room
 * for instructions, the JSON schema and the answer; hosted models get a generous fixed budget.
 */
export function analysisBudget(opts: { providerKind: "ollama" | "openai" | "anthropic"; numCtx: number }): { budgetChars: number; maxPosts: number; maxCharsPerPost: number } {
  if (opts.providerKind === "anthropic") return { budgetChars: 60_000, maxPosts: 25, maxCharsPerPost: 2_400 };
  const reservedTokens = 2_800;
  const charsPerToken = 3.3;
  const budgetChars = Math.max(3_500, Math.floor((opts.numCtx - reservedTokens) * charsPerToken));
  return { budgetChars, maxPosts: 25, maxCharsPerPost: 1_800 };
}
