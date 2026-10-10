/**
 * Deterministic stylometry over a person's own posts. Two outputs:
 *  - VoiceStats (shared schema, stored in the voice profile; the linter reads it as the baseline)
 *  - VoiceExtras (richer, recomputed on demand for the UI and the writer's rule block)
 * Pure: no I/O.
 */
import type { VoiceStats } from "@/lib/types";
import {
  CLOSER_TYPES,
  ELLIPSIS_RE,
  EMOJI_RE,
  EM_DASH_RE,
  HASHTAG_RE,
  LINK_RE,
  OPENER_TYPES,
  SPACED_HYPHEN_RE,
  classifyCloser,
  classifyOpener,
  closingLine,
  count,
  findList,
  hasFirstPerson,
  isListLine,
  linesOf,
  paragraphsOf,
  sentencesOf,
  sentencesOfLine,
  stopwords,
  wordCount,
  wordsOf,
  type CloserType,
  type OpenerType,
} from "./text";
import type { VoiceExtras } from "./types";

type Opts = { language?: string | null };

/* ------------------------------------------------------------------ */
/* Small math                                                          */
/* ------------------------------------------------------------------ */

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
const round = (n: number, d = 1) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

export function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1));
}

/* ------------------------------------------------------------------ */
/* Recurring phrases                                                   */
/* ------------------------------------------------------------------ */

type Tally = Map<string, { docs: number; display: string; n: number }>;

function tallyOncePerPost(tally: Tally, seen: Set<string>, tokens: string[], n: number) {
  const key = tokens.map((t) => t.toLowerCase()).join(" ");
  if (seen.has(key)) return;
  seen.add(key);
  const cur = tally.get(key);
  if (cur) cur.docs++;
  else tally.set(key, { docs: 1, display: tokens.join(" "), n });
}

/** Minimum number of posts a phrase must appear in to count as a habit. */
function minDocs(posts: number) {
  return posts >= 12 ? Math.max(2, Math.ceil(posts * 0.15)) : 2;
}

/** Keep the longest phrases; drop a shorter one when a longer phrase containing it is about as frequent. */
function pickPhrases(tally: Tally, threshold: number, limit: number, accept: (key: string, v: { docs: number; display: string; n: number }) => boolean): string[] {
  const cands = [...tally.entries()]
    .filter(([key, v]) => v.docs >= threshold && accept(key, v))
    .sort((a, b) => b[1].docs * (1 + 0.5 * (b[1].n - 2)) - a[1].docs * (1 + 0.5 * (a[1].n - 2)) || b[1].n - a[1].n);
  const chosen: [string, { docs: number; display: string; n: number }][] = [];
  for (const c of cands) {
    if (chosen.some(([k, v]) => (` ${k} `.includes(` ${c[0]} `) && v.docs >= c[1].docs - 1) || (` ${c[0]} `.includes(` ${k} `) && c[1].docs >= v.docs - 1))) continue;
    chosen.push(c);
    if (chosen.length >= limit) break;
  }
  return chosen.map(([, v]) => v.display);
}

const firstWords = (line: string, n: number) => wordsOf(line).slice(0, n);
/** A phrase ending on one of these is a fragment of a longer one ("do you see the"). */
const DANGLING = new Set(["the", "a", "an", "of", "to", "in", "on", "at", "for", "with", "and", "or", "but", "my", "your", "our", "this", "that"]);

function commonOpeners(texts: string[], language?: string | null): string[] {
  const tally: Tally = new Map();
  for (const t of texts) {
    const seen = new Set<string>();
    const hook = linesOf(t)[0] ?? "";
    for (const n of [2, 3, 4]) {
      const w = firstWords(hook, n);
      if (w.length === n) tallyOncePerPost(tally, seen, w, n);
    }
  }
  return pickPhrases(tally, minDocs(texts.length), 5, (key, v) => !carriesFacts(key, v.display, stopwords(language)));
}

function commonClosers(texts: string[], language?: string | null): string[] {
  const tally: Tally = new Map();
  for (const t of texts) {
    const seen = new Set<string>();
    const last = closingLine(t);
    const sentences = sentencesOfLine(last);
    const final = sentences[sentences.length - 1] ?? "";
    const finalWords = wordsOf(final);
    // Whole short closing lines ("Thoughts?") and the first words of longer ones ("Do you see...").
    if (finalWords.length > 0 && finalWords.length <= 6) tallyOncePerPost(tally, seen, finalWords, Math.max(2, finalWords.length));
    for (const n of [2, 3, 4]) if (finalWords.length > n) tallyOncePerPost(tally, seen, finalWords.slice(0, n), n);
  }
  return pickPhrases(tally, minDocs(texts.length), 5, (key, v) => !DANGLING.has(key.split(" ").pop() ?? "") && !carriesFacts(key, v.display, stopwords(language)));
}

const DETERMINERS = new Set(["the", "a", "an", "this", "that", "these", "those", "my", "our", "your", "their", "his", "her", "its"]);
const PREPOSITIONS = new Set(["in", "on", "at", "for", "with", "from", "to", "of", "by", "about", "into", "over", "after", "before"]);
const NUMBER_WORDS = new Set(["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "twenty", "thirty", "fifty", "hundred", "thousand", "million"]);
const PRONOUN_I = /^i(?:['’](?:m|ve|d|ll))?$/i;

/**
 * Phrases the writer may reuse must not smuggle in facts from old posts: quantities ("two years",
 * "40,000"), names, places and acronyms ("in Hamburg", "AI"). The first word may be capitalised.
 */
function carriesFacts(key: string, display: string, stop: Set<string>): boolean {
  const toks = key.split(" ");
  const shown = display.split(" ");
  if (toks.some((x) => /^\d/.test(x))) return true;
  if (shown.slice(1).some((x) => /\p{Lu}/u.test(x) && !PRONOUN_I.test(x)) || /^\p{Lu}{2,}/u.test(shown[0])) return true;
  return toks.some((x, i) => NUMBER_WORDS.has(x) && i + 1 < toks.length && !stop.has(toks[i + 1]));
}

/**
 * Verbal habits ("And one more", "I think", "by feel"). They live at sentence edges and in
 * short standalone sentences; the middle of sentences is mostly topic. Phrases that name topics
 * (capitalised words, acronyms) or carry quantities ("two years") are left out: the writer must
 * never pick up facts from here.
 */
function signaturePhrases(texts: string[], language?: string | null): string[] {
  const stop = stopwords(language);
  const tally: Tally = new Map();
  for (const t of texts) {
    const seen = new Set<string>();
    for (const s of sentencesOf(t.replace(HASHTAG_RE, " "))) {
      const w = wordsOf(s);
      if (w.length >= 2 && w.length <= 6) tallyOncePerPost(tally, seen, w, w.length);
      for (let n = 2; n <= Math.min(5, w.length - 1); n++) {
        tallyOncePerPost(tally, seen, w.slice(0, n), n);
        tallyOncePerPost(tally, seen, w.slice(w.length - n), n);
      }
    }
  }
  const threshold = minDocs(texts.length);
  return pickPhrases(tally, threshold, 6, (key, v) => {
    const toks = key.split(" ");
    if (carriesFacts(key, v.display, stop)) return false;
    if (DANGLING.has(toks[toks.length - 1])) return false;
    if (v.n === 2 && (DETERMINERS.has(toks[0]) || PREPOSITIONS.has(toks[0]))) return false;
    if (v.n === 3 && PREPOSITIONS.has(toks[0]) && DETERMINERS.has(toks[1])) return false;
    // All function words ("and it was") needs to be a strong habit to count.
    if (toks.every((x) => stop.has(x))) return v.docs >= Math.max(3, threshold);
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Per-post features                                                   */
/* ------------------------------------------------------------------ */

type PostFeatures = {
  words: number;
  chars: number;
  sentenceWords: number[];
  paragraphs: string[][];
  emojis: string[];
  hashtags: number;
  hasQuestion: boolean;
  exclamations: number;
  emDashes: number;
  spacedHyphens: number;
  ellipses: number;
  list: ReturnType<typeof findList>;
  hasLink: boolean;
  firstPersonSentences: number;
  weSentences: number;
  sentenceCount: number;
  hookChars: number;
  opener: OpenerType;
  closer: CloserType;
};

function features(text: string, language?: string | null): PostFeatures {
  const sentences = sentencesOf(text);
  const lines = linesOf(text);
  return {
    words: wordCount(text),
    chars: text.trim().length,
    sentenceWords: sentences.map(wordCount),
    paragraphs: paragraphsOf(text),
    emojis: text.match(EMOJI_RE) ?? [],
    hashtags: count(text, HASHTAG_RE),
    hasQuestion: sentences.some((s) => /\?["'”’)]*$/.test(s)),
    exclamations: count(text, /!+/g),
    emDashes: count(text, EM_DASH_RE),
    spacedHyphens: count(text, SPACED_HYPHEN_RE),
    ellipses: count(text, ELLIPSIS_RE),
    list: findList(text),
    hasLink: count(text, LINK_RE) > 0,
    firstPersonSentences: sentences.filter((s) => hasFirstPerson(s, language)).length,
    weSentences: sentences.filter((s) => hasFirstPerson(s, language, true)).length,
    sentenceCount: sentences.length,
    hookChars: (lines[0] ?? "").length,
    opener: classifyOpener(lines[0] ?? ""),
    closer: classifyCloser(closingLine(text)),
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function computeVoiceStats(texts: string[], opts: Opts = {}): VoiceStats {
  const posts = texts.map((t) => t.trim()).filter(Boolean);
  const f = posts.map((t) => features(t, opts.language));
  const n = f.length || 1;
  const allSentenceWords = f.flatMap((x) => x.sentenceWords);
  const paragraphs = f.flatMap((x) => x.paragraphs).filter((p) => !p.every(isListLine));
  const oneLine = paragraphs.filter((p) => p.length === 1 && sentencesOfLine(p[0]).length <= 1).length;
  const emojiCounts = new Map<string, number>();
  for (const e of f.flatMap((x) => x.emojis)) emojiCounts.set(e, (emojiCounts.get(e) ?? 0) + 1);
  const totalSentences = sum(f.map((x) => x.sentenceCount));

  return {
    sampleCount: posts.length,
    avgWords: round(mean(f.map((x) => x.words))),
    medianWords: round(quantile(f.map((x) => x.words), 0.5)),
    avgSentenceWords: round(mean(allSentenceWords)),
    avgParagraphLines: round(mean(paragraphs.map((p) => p.length)), 2),
    oneLineParagraphRatio: round(paragraphs.length ? oneLine / paragraphs.length : 0, 2),
    emojiPerPost: round(sum(f.map((x) => x.emojis.length)) / n, 2),
    hashtagsPerPost: round(sum(f.map((x) => x.hashtags)) / n, 2),
    questionRatio: round(f.filter((x) => x.hasQuestion).length / n, 2),
    exclamationPerPost: round(sum(f.map((x) => x.exclamations)) / n, 2),
    emDashPerPost: round(sum(f.map((x) => x.emDashes)) / n, 2),
    bulletRatio: round(f.filter((x) => x.list).length / n, 2),
    firstPersonRatio: round(totalSentences ? sum(f.map((x) => x.firstPersonSentences)) / totalSentences : 0, 2),
    avgHookChars: Math.round(mean(f.map((x) => x.hookChars))),
    topEmojis: [...emojiCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([e]) => e),
    commonOpeners: commonOpeners(posts, opts.language),
    commonClosers: commonClosers(posts, opts.language),
    signaturePhrases: signaturePhrases(posts, opts.language),
  };
}

export function computeVoiceExtras(texts: string[], opts: Opts = {}): VoiceExtras {
  const posts = texts.map((t) => t.trim()).filter(Boolean);
  const f = posts.map((t) => features(t, opts.language));
  const n = f.length || 1;
  const words = f.map((x) => x.words);
  const sentenceWords = f.flatMap((x) => x.sentenceWords);
  const totalSentences = sum(f.map((x) => x.sentenceCount));
  const lists = f.map((x) => x.list).filter((l) => l !== null);
  const share = <T extends string>(keys: readonly T[], pick: (x: PostFeatures) => T) =>
    Object.fromEntries(keys.map((k) => [k, round(f.filter((x) => pick(x) === k).length / n, 2)])) as Record<T, number>;

  return {
    sampleCount: posts.length,
    wordsP25: Math.round(quantile(words, 0.25)),
    wordsP75: Math.round(quantile(words, 0.75)),
    charsMedian: Math.round(quantile(f.map((x) => x.chars), 0.5)),
    sentenceWordsSd: round(stdev(sentenceWords)),
    paragraphsPerPost: round(mean(f.map((x) => x.paragraphs.length))),
    numberedListRatio: round(lists.filter((l) => l.kind === "numbered").length / n, 2),
    bulletListRatio: round(lists.filter((l) => l.kind === "bulleted").length / n, 2),
    listItemsMin: lists.length ? Math.min(...lists.map((l) => l.items)) : 0,
    listItemsMax: lists.length ? Math.max(...lists.map((l) => l.items)) : 0,
    spacedHyphenPerPost: round(sum(f.map((x) => x.spacedHyphens)) / n, 2),
    ellipsisPerPost: round(sum(f.map((x) => x.ellipses)) / n, 2),
    linkRatio: round(f.filter((x) => x.hasLink).length / n, 2),
    weRatio: round(totalSentences ? sum(f.map((x) => x.weSentences)) / totalSentences : 0, 2),
    openerTypes: share(OPENER_TYPES, (x) => x.opener),
    closerTypes: share(CLOSER_TYPES, (x) => x.closer),
  };
}

/* ------------------------------------------------------------------ */
/* Structure skeleton (reference creators)                              */
/* ------------------------------------------------------------------ */

export type PostSkeleton = {
  opener: OpenerType;
  closer: CloserType;
  paragraphs: number;
  words: number;
  list: { kind: "numbered" | "bulleted"; items: number } | null;
  /** Something after the list before the end ("And one more:"), a classic twist slot. */
  afterList: boolean;
};

export function postSkeleton(text: string): PostSkeleton {
  const list = findList(text);
  const lines = linesOf(text);
  const tail = list ? lines.slice(list.endsAt).filter((l) => wordCount(l.replace(HASHTAG_RE, "")) > 0) : [];
  return {
    opener: classifyOpener(lines[0] ?? ""),
    closer: classifyCloser(closingLine(text)),
    paragraphs: paragraphsOf(text).length,
    words: wordCount(text),
    list: list ? { kind: list.kind, items: list.items } : null,
    afterList: tail.length >= 2,
  };
}

const OPENER_SHORT: Record<OpenerType, string> = {
  scene: "Scene hook",
  credential: "Credential hook",
  number: "Number hook",
  question: "Question hook",
  quote: "Quote hook",
  claim: "Claim hook",
};
const CLOSER_SHORT: Record<CloserType, string> = {
  question: "ends on a question",
  invite: "ends with an invitation",
  bet: "ends on a bet",
  lesson: "ends on the lesson",
  statement: "quiet ending",
};

/** "Number hook → 6 paragraphs → numbered list of 4 → twist after the list → ends on a question" */
export function skeletonSteps(s: PostSkeleton): string[] {
  const steps = [OPENER_SHORT[s.opener], `${s.paragraphs} ${s.paragraphs === 1 ? "paragraph" : "paragraphs"}`];
  if (s.list) steps.push(`${s.list.kind} list of ${s.list.items}`);
  if (s.list && s.afterList) steps.push("twist after the list");
  steps.push(CLOSER_SHORT[s.closer]);
  return steps;
}
