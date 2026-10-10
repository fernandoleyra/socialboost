/**
 * AI-tell linter for LinkedIn posts. Pure and deterministic — runs in the browser on every
 * keystroke and on the server after every generation.
 *
 * Rules come from research 02 §7 (lexicon §7.1, structural rules R01–R24, LinkedIn slop list §7.3)
 * and research 01 §6.5 (why the reference creator's posts read as human). The user's own posts
 * override the defaults: their em-dash / emoji / hashtag / exclamation rates and their signature
 * phrases raise the thresholds ("the sample overrides the other rules").
 */

import type { LintIssue, VoiceStats } from "@/lib/types";
import { compiledLexicon, compilePattern, escapeRegex } from "./lexicon";
import { stripUnicodeStyling } from "./clean";

export type LintSeverity = LintIssue["severity"];
export type LintHit = LintIssue & { start?: number; end?: number; fixable?: boolean };
export type LintResult = { issues: LintHit[]; score: number };
export type LintOptions = {
  /** Everything the post may state as fact (memory, photo note, profile). Enables provenance checks. */
  facts?: string;
  /** Words or phrases the user never says (from voice manual rules). Always an error. */
  neverSay?: string[];
  /** Extra phrases that are the user's own and must not be flagged. */
  allow?: string[];
  /** The story text from the interview. Enables the "copied notes" check. */
  notes?: string;
};

export const LINKEDIN_MAX_CHARS = 3000;
export const MIN_CHARS = 600;
export const HOOK_DESKTOP_CHARS = 210;
export const HOOK_MOBILE_CHARS = 140;

export const RULE_LABELS: Record<string, string> = {
  "ai-phrase": "AI phrasing",
  "filler-phrase": "Filler words",
  humblebrag: "Announcement cliché",
  "engagement-bait": "Engagement bait",
  "generic-cta": "Generic closer",
  "dm-cta": "DM request",
  chatbot: "Chatbot residue",
  "never-say": "Your never-say list",
  "em-dash": "Em dashes",
  "negative-parallelism": "“It's not X, it's Y”",
  triplet: "Lists of three",
  staircase: "One-line staircase",
  "emoji-bullet": "Emoji bullets",
  emoji: "Emojis",
  hashtags: "Hashtags",
  "hook-length": "Hook vs. the fold",
  "question-hook": "Question as hook",
  "cliche-opener": "Cliché opener",
  length: "Length",
  "voice-length": "Length vs. your posts",
  link: "Link in the post",
  exclamation: "Exclamation marks",
  "unicode-styling": "Unicode bold/italic",
  markdown: "Markdown symbols",
  "double-space": "Double spaces",
  "ing-rider": "Trailing “-ing” clause",
  "vague-attribution": "Vague source",
  "staged-runup": "Staged run-up",
  "repeated-openers": "Same sentence start",
  "hedge-stack": "Stacked hedges",
  "generic-moral": "Moral at the end",
  mentions: "Too many tags",
  "multiple-lists": "More than one list",
  "question-density": "Too many questions",
  "uniform-rhythm": "Same-length sentences",
  "unverified-number": "Number not in the story",
  "unverified-quote": "Quote not in the story",
  "copied-notes": "Copied from your notes",
};

export const FIXABLE_RULES = ["em-dash", "double-space", "unicode-styling", "markdown"] as const;
const FIXABLE = new Set<string>(FIXABLE_RULES);

const SEVERITY_RANK: Record<LintSeverity, number> = { error: 3, warn: 2, info: 1 };
const PENALTY: Record<LintSeverity, number> = { error: 12, warn: 5, info: 1 };
const RULE_CAP: Record<LintSeverity, number> = { error: 30, warn: 12, info: 3 };

/** 0-100. Each rule's penalty is capped so one repeated habit can't zero the score on its own. */
export function scoreFromLint(issues: Pick<LintIssue, "rule" | "severity">[]): number {
  const perRule = new Map<string, { sev: LintSeverity; total: number }>();
  for (const i of issues) {
    const cur = perRule.get(i.rule) ?? { sev: i.severity, total: 0 };
    if (SEVERITY_RANK[i.severity] > SEVERITY_RANK[cur.sev]) cur.sev = i.severity;
    cur.total += PENALTY[i.severity];
    perRule.set(i.rule, cur);
  }
  let penalty = 0;
  for (const { sev, total } of perRule.values()) penalty += Math.min(total, RULE_CAP[sev]);
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

/* ------------------------------------------------------------------ */
/* Text structure helpers                                              */
/* ------------------------------------------------------------------ */

type Line = { text: string; start: number; end: number };
type Sentence = { text: string; start: number };

const LIST_LINE = /^\s*(?:\d{1,2}[.)]|[-–•*▪●◦→>])\s+|^\s*\p{Extended_Pictographic}/u;

function splitLines(text: string): Line[] {
  const out: Line[] = [];
  let start = 0;
  for (const raw of text.split("\n")) {
    out.push({ text: raw, start, end: start + raw.length });
    start += raw.length + 1;
  }
  return out;
}

function sentencesOf(line: Line): Sentence[] {
  const out: Sentence[] = [];
  const re = /(?:[^.!?]|[.,](?=\d))+(?:[.!?]+["”’')\]]*|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line.text))) {
    const t = m[0];
    const trimmedStart = t.length - t.trimStart().length;
    const s = t.trim();
    if (s && /[\p{L}\p{N}]/u.test(s)) out.push({ text: s, start: line.start + m.index + trimmedStart });
  }
  return out;
}

const wordsOf = (s: string) => s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];

/* ------------------------------------------------------------------ */
/* Numbers & quotes provenance (R22)                                   */
/* ------------------------------------------------------------------ */

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
  dozen: 12, half: 0.5,
};

type NumToken = { raw: string; value: number; start: number; end: number; small: boolean };

const NUM_RE = /(?<![\p{L}\p{N}])([$€£¥₹]\s?)?(\d{1,3}(?:[,'’ ]\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?)(\s?(?:%|k|m|bn|x)(?![\p{L}]))?/giu;

function parseNumber(core: string): number {
  // "1,400" / "8 500" / "1’000" → thousands; "1.5" / "2,5" → decimal.
  if (/^\d{1,3}(?:[,'’ ]\d{3})+(?:\.\d+)?$/.test(core)) return Number(core.replace(/[,'’ ]/g, ""));
  if (/^\d+,\d{1,2}$/.test(core)) return Number(core.replace(",", "."));
  if (/^\d{1,3}(?:\.\d{3})+$/.test(core)) return Number(core.replace(/\./g, ""));
  return Number(core.replace(/,/g, ""));
}

export function extractNumbers(text: string): NumToken[] {
  const out: NumToken[] = [];
  NUM_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NUM_RE.exec(text))) {
    const [raw, currency, core, suffixRaw] = m;
    let value = parseNumber(core);
    const suffix = (suffixRaw ?? "").trim().toLowerCase();
    if (suffix === "k") value *= 1e3;
    else if (suffix === "m") value *= 1e6;
    else if (suffix === "bn") value *= 1e9;
    const small = !currency && !suffix && Number.isInteger(value) && value < 10;
    out.push({ raw: raw.trim(), value, start: m.index, end: m.index + raw.length, small });
  }
  return out;
}

function factNumbers(facts: string): Set<number> {
  const set = new Set<number>();
  for (const n of extractNumbers(facts)) {
    set.add(n.value);
    // "84k" might be written as "84" + "thousand" in the story; keep the bare core too.
    set.add(parseNumber(n.raw.replace(/[^\d.,'’ ]/g, "").trim() || "0"));
  }
  for (const w of facts.toLowerCase().match(/\p{L}+/gu) ?? []) if (w in NUMBER_WORDS) set.add(NUMBER_WORDS[w]);
  // Compound number words ("two hundred", "three thousand").
  const re = /\b(one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-]+(hundred|thousand)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(facts))) set.add(NUMBER_WORDS[m[1].toLowerCase()] * NUMBER_WORDS[m[2].toLowerCase()]);
  return set;
}

export const normalizeForMatch = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Whether a phrase is (nearly) word for word in the facts: substring, or ≥ 75% of its words. */
export function matchesFacts(text: string, facts: string): boolean {
  const q = normalizeForMatch(text);
  if (!q) return true;
  const factsNorm = normalizeForMatch(facts);
  if (factsNorm.includes(q)) return true;
  const toks = q.split(" ").filter(Boolean);
  if (toks.length < 3) return false;
  const factTokens = new Set(factsNorm.split(" "));
  return toks.filter((t) => factTokens.has(t)).length / toks.length >= 0.75;
}

/* ------------------------------------------------------------------ */
/* Lint                                                                */
/* ------------------------------------------------------------------ */

type Ctx = {
  text: string;
  issues: LintHit[];
  allow: string[];
};

function push(ctx: Ctx, rule: string, severity: LintSeverity, message: string, start?: number, end?: number) {
  const match = start !== undefined && end !== undefined ? ctx.text.slice(start, end) : undefined;
  ctx.issues.push({ rule, severity, message, ...(match !== undefined ? { match, start, end } : {}), ...(FIXABLE.has(rule) ? { fixable: true } : {}) });
}

function allowed(ctx: Ctx, match: string): boolean {
  const m = match.toLowerCase().trim();
  if (!m) return false;
  return ctx.allow.some((a) => a.includes(m) || (a.length >= 6 && m.includes(a)));
}

function eachMatch(text: string, re: RegExp, fn: (m: RegExpExecArray) => void) {
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = r.exec(text))) {
    if (m[0].length === 0) {
      r.lastIndex++;
      continue;
    }
    fn(m);
  }
}

export function lintPost(text: string, voiceStats?: VoiceStats | null, opts: LintOptions = {}): LintResult {
  const ctx: Ctx = {
    text,
    issues: [],
    allow: [...(opts.allow ?? []), ...(voiceStats?.signaturePhrases ?? []), ...(voiceStats?.commonOpeners ?? []), ...(voiceStats?.commonClosers ?? [])]
      .map((a) => a.toLowerCase().trim())
      .filter((a) => a.length >= 3),
  };
  const body = text.trim();
  if (!body) return { issues: [], score: 100 };

  const lines = splitLines(text);
  const content = lines.filter((l) => l.text.trim());
  const nonList = content.filter((l) => !LIST_LINE.test(l.text));
  const hook = content[0];
  const lastBlockStart = (() => {
    // Start offset of the last paragraph (after the last blank line).
    for (let i = lines.length - 1; i > 0; i--) if (!lines[i].text.trim() && lines.slice(i + 1).some((l) => l.text.trim())) return lines[i].end;
    return 0;
  })();

  /* ---- Lexicon (Tier A / B) ---- */
  for (const e of compiledLexicon()) {
    eachMatch(text, e.re, (m) => {
      if (allowed(ctx, m[0])) return;
      const sev: LintSeverity = e.rule === "generic-cta" ? (e.id === "agree-closer" ? "warn" : "info") : e.tier === "A" ? "error" : "warn";
      const quoted = m[0].trim();
      const msg = e.message
        ? e.message.replace("{m}", quoted)
        : e.tier === "A"
          ? `"${quoted}" is a classic AI tell.${e.suggest ? ` Try "${e.suggest}".` : " Say it the way you'd say it out loud."}`
          : `"${quoted}" is filler AI overuses.${e.suggest ? ` Try "${e.suggest}",` : ""} keep it only if it's literal or truly yours.`;
      push(ctx, e.rule, sev, msg, m.index, m.index + m[0].length);
    });
  }

  /* ---- Never-say list from the user's manual rules ---- */
  for (const term of opts.neverSay ?? []) {
    const t = term.trim();
    if (t.length < 2) continue;
    eachMatch(text, compilePattern(escapeRegex(t).replace(/\\ /g, " ")), (m) => push(ctx, "never-say", "error", `You said you never say "${t}".`, m.index, m.index + m[0].length));
  }

  /* ---- R01 Em dashes ---- */
  {
    const hits: { start: number; end: number }[] = [];
    eachMatch(text, /\s*—\s*|(?<!\d)\s+–\s+(?!\d)|\s--\s/g, (m) => {
      const lead = m[0].length - m[0].trimStart().length;
      const s = m.index + lead;
      hits.push({ start: s, end: s + m[0].trim().length });
    });
    const baseline = voiceStats?.emDashPerPost ?? 0;
    const allowedCount = Math.round(baseline);
    if (hits.length > allowedCount) {
      const sev: LintSeverity = baseline < 0.5 && hits.length >= 3 ? "error" : "warn";
      const msg =
        baseline < 0.5
          ? `Em dashes read as AI on LinkedIn${voiceStats ? " and you don't use them" : ""}. Use a period or a comma.`
          : `${hits.length} dashes; you usually use about ${allowedCount}. Use a period or a comma.`;
      for (const h of hits) push(ctx, "em-dash", sev, msg, h.start, h.end);
    }
  }

  /* ---- R02 Negative parallelism ---- */
  const negPatterns = [
    /\b(?:it|this|that|he|she|they|we|you)(?:['’]s|['’]re| is| are| was| were)\s+not\s+[^.!?\n]{1,80}?[,;:.—–]\s*(?:it|this|that|he|she|they|we|you)(?:['’]s|['’]re| is| are| was| were)\b/gi,
    /\b(?:it|this|that)\s+(?:isn['’]t|wasn['’]t|aren['’]t|weren['’]t)\s+[^.!?\n]{1,80}?[,;:.—–]\s*(?:it|this|that)(?:['’]s| is| was)\b/gi,
    /\bnot\s+(?:just|only|merely|simply)\s+[^.!?\n]{1,80}?,?\s+but\b/gi,
    /\bno\s+[\p{L}-]+(?:\s+[\p{L}-]+)?,\s*no\s+[\p{L}-]+(?:\s+[\p{L}-]+)?,\s*(?:just|only)\b/giu,
    /\bless about\b[^.!?\n]{1,60}\bmore about\b/gi,
  ];
  for (const re of negPatterns)
    eachMatch(text, re, (m) =>
      push(ctx, "negative-parallelism", "error", `"It's not X, it's Y" is the most recognised AI pattern. Just say what it is.`, m.index, m.index + m[0].length),
    );

  /* ---- R03 Triplets ---- */
  {
    // Single-word items closing a clause ("fast, cheap, and simple.") — the AI-style adjective triad.
    // Real lists of things ("banks, retail chains and family companies") have multi-word items.
    const item = "\\p{Ll}[\\p{L}'’-]*";
    const triad = new RegExp(`(?<![\\p{L}])\\p{L}[\\p{L}'’-]*,\\s+${item},?\\s+(?:and|or)\\s+${item}(?=\\s*(?:[.,!?;:\\n]|$))`, "gu");
    const triads: { start: number; end: number }[] = [];
    eachMatch(text, triad, (m) => triads.push({ start: m.index, end: m.index + m[0].length }));
    if (triads.length >= 2)
      for (const t of triads) push(ctx, "triplet", "warn", `${triads.length} lists of three in one post. Keep at most one, and only when there really are three things.`, t.start, t.end);
    // "Fast. Simple. Effective." — three clipped sentences in a row.
    for (const line of nonList) {
      const s = sentencesOf(line);
      for (let i = 0; i + 2 < s.length; i++) {
        if ([s[i], s[i + 1], s[i + 2]].every((x) => wordsOf(x.text).length <= 3)) {
          const end = s[i + 2].start + s[i + 2].text.length;
          push(ctx, "triplet", "warn", "Three clipped sentences in a row is a slogan rhythm. Merge them into one real sentence.", s[i].start, end);
          break;
        }
      }
    }
  }

  /* ---- R04 Staircase / broetry ---- */
  {
    const baseline = voiceStats?.oneLineParagraphRatio ?? 0;
    const lenient = baseline >= 0.6;
    const isOneLiner = (l: Line) => sentencesOf(l).length <= 1 && l.text.trim().length < 120;
    const oneLiners = nonList.filter(isOneLiner);
    const ratio = nonList.length ? oneLiners.length / nonList.length : 0;
    if (nonList.length > 8 && ratio > (lenient ? Math.min(0.95, baseline + 0.2) : 0.7)) {
      push(ctx, "staircase", "warn", `${Math.round(ratio * 100)}% of lines are single sentences. Group related sentences into short paragraphs.`);
    }
    const limit = lenient ? 8 : 4;
    let run: Line[] = [];
    const flush = () => {
      if (run.length >= limit) push(ctx, "staircase", "warn", `${run.length} one-line paragraphs in a row. Join a few into a paragraph of 2-3 sentences.`, run[0].start, run[run.length - 1].end);
      run = [];
    };
    for (const l of content) {
      if (!LIST_LINE.test(l.text) && isOneLiner(l)) run.push(l);
      else flush();
    }
    flush();
  }

  /* ---- R12 Emojis ---- */
  {
    for (const l of content)
      if (/^\s*\p{Extended_Pictographic}/u.test(l.text)) {
        const m = l.text.match(/\p{Extended_Pictographic}️?/u)!;
        const s = l.start + l.text.indexOf(m[0]);
        push(ctx, "emoji-bullet", "warn", "Emoji bullets are a template look. Use plain sentences or a numbered list.", s, s + m[0].length);
      }
    const emojis: { start: number; end: number }[] = [];
    eachMatch(text, /(?![©®™])\p{Extended_Pictographic}️?/gu, (m) => emojis.push({ start: m.index, end: m.index + m[0].length }));
    const allowedCount = voiceStats ? Math.round(voiceStats.emojiPerPost) : 1;
    if (emojis.length > allowedCount) {
      const msg = voiceStats ? `You usually use ${allowedCount === 0 ? "no" : `about ${allowedCount}`} emoji per post; this has ${emojis.length}.` : `${emojis.length} emojis. Keep it to one at most, unless that's really how you write.`;
      for (const e of emojis.slice(allowedCount)) push(ctx, "emoji", "warn", msg, e.start, e.end);
    }
  }

  /* ---- R21 Hashtags ---- */
  {
    const tags: { start: number; end: number }[] = [];
    eachMatch(text, /(?<![\p{L}\p{N}_&/#])#\p{L}[\p{L}\p{N}_]*/gu, (m) => tags.push({ start: m.index, end: m.index + m[0].length }));
    const limit = voiceStats ? Math.max(0, Math.round(voiceStats.hashtagsPerPost)) : 3;
    if (tags.length > limit) {
      const msg = voiceStats && limit < 3 ? `You usually use ${limit === 0 ? "no hashtags" : `about ${limit} hashtags`}; this has ${tags.length}.` : `${tags.length} hashtags. Keep 0 to 3, at the end.`;
      for (const t of tags.slice(limit)) push(ctx, "hashtags", "warn", msg, t.start, t.end);
    }
    const inline = tags.filter((t) => t.start < lastBlockStart);
    if (inline.length && tags.length <= limit)
      for (const t of inline) push(ctx, "hashtags", "info", "Hashtags in the middle of sentences break the reading flow. Move them to the end.", t.start, t.end);
  }

  /* ---- Hook (R24 fold, question hooks, clichéd openers) ---- */
  if (hook) {
    const h = hook.text.trim();
    const hs = hook.start + (hook.text.length - hook.text.trimStart().length);
    if (h.length > HOOK_DESKTOP_CHARS) push(ctx, "hook-length", "warn", `The first line is ${h.length} characters; LinkedIn cuts at about ${HOOK_DESKTOP_CHARS}. Make the hook land before "see more".`, hs, hs + h.length);
    else if (h.length > HOOK_MOBILE_CHARS) push(ctx, "hook-length", "info", `The first line is ${h.length} characters; on phones the cut is around ${HOOK_MOBILE_CHARS}.`, hs, hs + h.length);
    if (/\?\s*$/.test(h) && !/^["“'«]/.test(h)) push(ctx, "question-hook", "warn", "Questions as hooks are overused. Open on the scene, a number or a flat claim from the story.", hs, hs + h.length);
    const opener = h.match(/^(?:in today['’]s|in a world (?:where|of|full)|imagine (?:a|if|this)|picture this|let['’]s talk about|have you ever|ever wondered|did you know|let me tell you|i want to (?:talk|share)|today i want to|there['’]s no denying|we all know|so,? here['’]s)\b/i);
    if (opener) push(ctx, "cliche-opener", "warn", `"${opener[0]}" is a stock opener. Start inside the moment instead.`, hs, hs + opener[0].length);
  }

  /* ---- Length ---- */
  {
    const chars = body.length;
    const words = wordsOf(body).length;
    if (chars > LINKEDIN_MAX_CHARS) push(ctx, "length", "error", `${chars.toLocaleString("en")} characters. LinkedIn stops at ${LINKEDIN_MAX_CHARS.toLocaleString("en")}.`);
    else if (chars < MIN_CHARS) {
      const shortVoice = (voiceStats?.medianWords ?? 999) < 110;
      push(ctx, "length", shortVoice ? "info" : "warn", `${chars} characters. Posts under ${MIN_CHARS} reach fewer people. Add the moment it changed or one concrete detail.`);
    }
    const median = voiceStats?.medianWords ?? 0;
    if (median >= 40) {
      if (words > median * 1.6) push(ctx, "voice-length", "info", `${words} words. Your posts usually run about ${Math.round(median)}.`);
      else if (words < median * 0.5) push(ctx, "voice-length", "info", `${words} words. Your posts usually run about ${Math.round(median)}.`);
    }
  }

  /* ---- Links ---- */
  eachMatch(text, /\bhttps?:\/\/[^\s]+|\bwww\.[^\s]+/gi, (m) =>
    push(ctx, "link", "warn", "Links in the post can cut reach. Keep it only if clicks are the goal; otherwise use your Featured section.", m.index, m.index + m[0].length),
  );

  /* ---- Exclamations ---- */
  {
    const bangs: number[] = [];
    eachMatch(text, /!+/g, (m) => bangs.push(m.index));
    const limit = voiceStats ? Math.max(2, Math.round(voiceStats.exclamationPerPost) + 1) : 2;
    if (bangs.length > limit) for (const b of bangs.slice(limit)) push(ctx, "exclamation", "warn", `${bangs.length} exclamation marks. Let the story carry the energy.`, b, b + 1);
  }

  /* ---- Formatting: unicode bold, markdown, double spaces ---- */
  eachMatch(text, /[\u{1D400}-\u{1D7FF}]+/gu, (m) => push(ctx, "unicode-styling", "error", "Unicode bold/italic breaks screen readers and search. Use plain text.", m.index, m.index + m[0].length));
  eachMatch(text, /\*\*[^*\n]+\*\*|__[^_\n]+__|^#{1,6}\s+/gm, (m) => push(ctx, "markdown", "error", "LinkedIn shows markdown symbols literally.", m.index, m.index + m[0].length));
  eachMatch(text, /(?<=\S) {2,}(?=\S)/g, (m) => push(ctx, "double-space", "info", "Double space.", m.index, m.index + m[0].length));

  /* ---- R08 -ing riders, R10 vague sources, R06 run-ups, R17 hedges, R18 chatbot ---- */
  const simple: [RegExp, string, LintSeverity, string][] = [
    [
      /,\s+(?:highlighting|underscoring|reflecting|ensuring|fostering|showcasing|emphasi[sz]ing|demonstrating|illustrating|signal(?:l)?ing|cementing|solidifying|paving the way|contributing to|marking|reinforcing)\b/gi,
      "ing-rider",
      "warn",
      'Trailing "-ing" clauses that explain the meaning are an AI habit. End the sentence, or say it plainly.',
    ],
    [
      /\b(?:studies|research|experts?|science|statistics|surveys?|reports?|data)\s+(?:show|shows|suggest|suggests|say|says|prove|proves|indicate|indicates|agree)\b|\bmany (?:people|experts|leaders) (?:believe|say|think)\b|\bindustry reports\b/gi,
      "vague-attribution",
      "warn",
      "Name the source, or say what you saw yourself.",
    ],
    [/\b(?:let me explain|here['’]s what you need to know|here['’]s the deal|guess what|let me be (?:clear|honest)|i['’]ll be honest)\b/gi, "staged-runup", "warn", "Staged run-up. Cut it and say the thing."],
    [/\b(?:could|might|may)\s+(?:potentially|possibly|perhaps)\b|\bpotentially possibly\b/gi, "hedge-stack", "warn", "Stacked hedges. Pick one, or commit."],
    [/\bas an ai\b|\bhere(?:['’]s| is) (?:a|the|your) (?:linkedin )?post\b|\blet me know if you(?:['’]d| would) like\b/gi, "chatbot", "error", "Chatbot residue. Cut it."],
    [/\b[Cc]omment\s+[A-Z]{2,}\b/g, "engagement-bait", "error", 'Comment-for-reward bait. LinkedIn now downranks "comment YES" posts.'],
    [/\btag (?:a|someone|a friend|a colleague|\d+ (?:people|friends))\b/gi, "engagement-bait", "error", "Tag-someone bait. LinkedIn now downranks it."],
    [/\b(?:dm|message) me\b|\bsend me a dm\b/gi, "dm-cta", "info", "Asking for DMs pulls attention away from comments. Fine once in a while."],
  ];
  for (const [re, rule, sev, msg] of simple) eachMatch(text, re, (m) => push(ctx, rule, sev, msg, m.index, m.index + m[0].length));

  /* ---- Generic closers and morals (last paragraph) ---- */
  {
    const tail = text.slice(lastBlockStart);
    const off = lastBlockStart;
    eachMatch(tail, /\bwhat do you think\??|\blet me know (?:your thoughts|in the comments|what you think)\b|\bdrop (?:a|your) (?:comment|thoughts)\b|\bshare your thoughts\b/gi, (m) => {
      if (!allowed(ctx, m[0])) push(ctx, "generic-cta", "info", `"${m[0]}" is a generic closer. A specific, easy-to-answer question gets more comments.`, off + m.index, off + m.index + m[0].length);
    });
    eachMatch(
      tail,
      /\b(?:and )?that['’]?s (?:what|the) [^.!?\n]{0,40}(?:is all about|really matters|truly matters)\b|\bthat['’]s the power of\b|^(?:remember|the lesson|the takeaway)\s*[:,]|\bthe lesson is simple\b|\bnever (?:give up|stop learning|stop growing)\b|\b(?:success|leadership|growth|life|business) is (?:not about|all about|a marathon|a journey)\b/gim,
      (m) => push(ctx, "generic-moral", "warn", "Moral-of-the-story ending. End on a concrete detail, an honest open thought, or a specific question.", off + m.index, off + m.index + m[0].length),
    );
  }

  /* ---- R14 Repeated openers, R16 rhythm, R15 questions ---- */
  {
    const sents = nonList.flatMap(sentencesOf);
    let i = 0;
    while (i < sents.length) {
      const first = (s: Sentence) => (wordsOf(s.text)[0] ?? "").toLowerCase();
      const w = first(sents[i]);
      let j = i + 1;
      while (j < sents.length && w && first(sents[j]) === w) j++;
      if (j - i >= 3) {
        const end = sents[j - 1].start + sents[j - 1].text.length;
        push(ctx, "repeated-openers", w === "i" ? "info" : "warn", `${j - i} sentences in a row start with "${wordsOf(sents[i].text)[0]}". Vary the rhythm.`, sents[i].start, end);
      }
      i = j;
    }
    const lens = sents.map((s) => wordsOf(s.text).length).filter((n) => n > 0);
    if (lens.length >= 8) {
      const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
      const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
      if (mean > 0 && sd / mean < 0.3) push(ctx, "uniform-rhythm", "info", "Sentences are all about the same length. Mix a few short ones with longer ones, the way people talk.");
    }
    const questions = sents.filter((s) => /\?["”’)]*$/.test(s.text) && s.start < lastBlockStart);
    if (questions.length > 2) push(ctx, "question-density", "info", `${questions.length} questions before the ending. Rhetorical questions pile up fast; answer them with the story instead.`);
  }

  /* ---- Mentions, lists ---- */
  {
    let mentions = 0;
    eachMatch(text, /(?<![\p{L}\p{N}])@\p{L}[\p{L}\p{N}_.-]*/gu, () => mentions++);
    if (mentions >= 5) push(ctx, "mentions", "warn", `${mentions} people tagged. Tagging many people reads as reach-hacking. Tag only who's in the story.`);
    let blocks = 0;
    let inList = false;
    for (const l of lines) {
      const isList = LIST_LINE.test(l.text);
      if (isList && !inList) blocks++;
      if (l.text.trim()) inList = isList;
    }
    if (blocks > 1) push(ctx, "multiple-lists", "info", `${blocks} separate lists. One list per post at most.`);
  }

  /* ---- R22 Provenance: numbers and quotes must come from the story ---- */
  if (opts.facts && opts.facts.trim()) {
    const known = factNumbers(opts.facts);
    const listMarkers = new Set(lines.map((l) => l.text.match(/^\s*\d{1,2}[.)]/)).filter(Boolean).map((m) => m!.index! + m![0].search(/\d/)));
    for (const n of extractNumbers(text)) {
      if (n.small) continue;
      const lineStart = lines.find((l) => n.start >= l.start && n.start <= l.end)?.start ?? -1;
      if (listMarkers.has(n.start - lineStart) && /^\s*\d{1,2}[.)]/.test(text.slice(lineStart, n.end + 1))) continue;
      if (known.has(n.value)) continue;
      push(ctx, "unverified-number", "warn", `"${n.raw}" isn't in the story. Make sure it's real, or cut it.`, n.start, n.end);
    }
    const facts = opts.facts;
    eachMatch(text, /["“]([^"“”\n]{8,})["”]/g, (m) => {
      if (normalizeForMatch(m[1]).split(" ").filter(Boolean).length < 4) return;
      if (matchesFacts(m[1], facts)) return;
      push(ctx, "unverified-quote", "warn", "This quote isn't in the story. Quotes must be words someone actually said.", m.index, m.index + m[0].length);
    });
  }

  /* ---- Copied notes: the interview notes pasted back instead of a post ---- */
  if (opts.notes && opts.notes.trim()) {
    const notesNorm = normalizeForMatch(opts.notes);
    const sents = nonList.flatMap(sentencesOf).filter((s) => wordsOf(s.text).length >= 8);
    if (sents.length >= 3) {
      const copied = sents.filter((s) => notesNorm.includes(normalizeForMatch(s.text)));
      const ratio = copied.length / sents.length;
      if (ratio >= 0.4) {
        const first = copied[0];
        push(
          ctx,
          "copied-notes",
          ratio >= 0.6 && sents.length >= 4 ? "error" : "warn",
          `${copied.length} of ${sents.length} sentences are copied word for word from your notes. Keep the facts, but give the post a hook and its own shape.`,
          first.start,
          first.start + first.text.length,
        );
      }
    }
  }

  const issues = dedupe(ctx.issues);
  return { issues, score: scoreFromLint(issues) };
}

/** Rules that flag wording. When two of them hit nested spans we keep only one. */
const LEXICAL = new Set(["ai-phrase", "filler-phrase", "humblebrag", "generic-cta", "engagement-bait", "chatbot", "cliche-opener", "staged-runup", "generic-moral", "never-say", "dm-cta"]);

const spanLen = (i: LintHit) => i.end! - i.start!;
const contains = (a: LintHit, b: LintHit) => a.start! <= b.start! && a.end! >= b.end!;

/**
 * Drop exact duplicates, and for nested wording hits keep the more severe (then the longer) one,
 * so "a pivotal moment" isn't reported twice. Errors first, then by position.
 */
function dedupe(issues: LintHit[]): LintHit[] {
  const positioned = issues.filter((i) => i.start !== undefined).sort((a, b) => a.start! - b.start! || spanLen(b) - spanLen(a));
  const kept: LintHit[] = [];
  outer: for (const i of positioned) {
    for (let idx = 0; idx < kept.length; idx++) {
      const k = kept[idx];
      if (k.rule === i.rule && k.start === i.start && k.end === i.end) continue outer;
      const nested = contains(k, i) || contains(i, k);
      if (!nested || !LEXICAL.has(k.rule) || !LEXICAL.has(i.rule)) continue;
      const better = SEVERITY_RANK[i.severity] > SEVERITY_RANK[k.severity] || (SEVERITY_RANK[i.severity] === SEVERITY_RANK[k.severity] && spanLen(i) > spanLen(k));
      if (better) kept[idx] = i;
      continue outer;
    }
    kept.push(i);
  }
  const out = [...kept, ...issues.filter((i) => i.start === undefined)];
  return out.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || (a.start ?? 1e9) - (b.start ?? 1e9));
}

/* ------------------------------------------------------------------ */
/* Deterministic fixes                                                 */
/* ------------------------------------------------------------------ */

/** Apply the mechanical fixes (em dashes → commas, double spaces, unicode bold, markdown). */
export function autofix(text: string, rules: readonly string[] = FIXABLE_RULES): string {
  let t = text;
  const on = new Set(rules);
  if (on.has("unicode-styling")) t = stripUnicodeStyling(t);
  if (on.has("markdown")) t = t.replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/__([^_\n]+)__/g, "$1").replace(/^#{1,6}\s+/gm, "");
  if (on.has("em-dash")) {
    t = t
      .replace(/^[ \t]*[—–][ \t]*/gm, "")
      .replace(/[ \t]*—[ \t]*$/gm, ".")
      .replace(/[ \t]*(?:—|(?<!\d)–(?!\d)|\s--\s)[ \t]*/g, ", ")
      .replace(/,\s*([,.;:!?])/g, "$1");
  }
  if (on.has("double-space")) t = t.replace(/(?<=\S) {2,}(?=\S)/g, " ");
  return t;
}

/**
 * Quoted terms: "double" or “curly” quotes, or 'single' quotes that open and close at word
 * edges. The apostrophes in "don't" or "I'd" are not quote marks, so `Don't say 'folks'` yields
 * "folks", and a quoted term may contain one ('don't').
 */
const QUOTED_TERM = /["“]([^"“”\n]{2,40})["”]|(?<![\p{L}\p{N}])['‘]((?:[^'‘’"“”\n]|(?<=\p{L})['’](?=\p{L})){2,40}?)['’](?![\p{L}\p{N}])/gu;

/** Pull quoted terms out of rules like `Never say "synergy"` or `Avoid 'folks', 'peeps'`. */
export function extractNeverSay(rules: string[]): string[] {
  const out = new Set<string>();
  for (const r of rules) {
    if (!/\b(never|don['’]?t|do not|avoid|no|stop|ban|banned|not)\b/i.test(r)) continue;
    for (const m of r.matchAll(QUOTED_TERM)) {
      const term = (m[1] ?? m[2] ?? "").trim();
      if (term.length >= 2) out.add(term);
    }
  }
  return [...out];
}
