/**
 * Pure text helpers for the voice module: normalization, tokenization and the small
 * classifiers (how a post opens, how it ends) shared by the parsers, the stylometry
 * pass and the reference-structure view. No server imports: safe for client and tests.
 */

/* ------------------------------------------------------------------ */
/* Normalization                                                       */
/* ------------------------------------------------------------------ */

/** Unify line endings and invisible characters that LinkedIn copy/paste and exports carry. */
export function normalizeText(raw: string): string {
  return raw
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[   ]/g, " ")
    .replace(/[​⁠﻿]/g, "")
    .replace(/[ \t]+$/gm, "");
}

/** LinkedIn renders hashtags as "hashtag#AI" when copied, and as {hashtag|\#|AI} in its "little" text format. */
export function normalizeHashtags(text: string): string {
  return text.replace(/\{hashtag\|\\?#\|([^}]+)\}/gi, "#$1").replace(/\bhashtag#(?=\p{L})/giu, "#");
}

/** Strip LinkedIn "little" text markup from exports: @[Name](urn:li:person:x) mentions and backslash escapes. */
export function normalizeLittleText(text: string): string {
  return normalizeHashtags(text)
    .replace(/@\[([^\]]+)\]\(urn:li:[^)]+\)/g, "$1")
    .replace(/\\([()[\]{}@#*_~<>|\\])/g, "$1");
}

/** Collapse runs of blank lines to one and trim the ends. */
export function tidyBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

/** Words; "don't", "co-founder" and "40,000" each count once. */
const WORD_RE = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+|(?<=\d)[.,]\d+)*/gu;

export function wordsOf(text: string): string[] {
  return text.match(WORD_RE) ?? [];
}

export function wordCount(text: string): number {
  return wordsOf(text).length;
}

/** Non-empty lines, trimmed. */
export function linesOf(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Paragraphs = blocks separated by blank lines; each paragraph is a list of its non-empty lines. */
export function paragraphsOf(text: string): string[][] {
  return text
    .split(/\n[ \t]*\n/)
    .map(linesOf)
    .filter((p) => p.length > 0);
}

const SENTENCE_END = /[.!?…]+["'”’»)\]]*(?=\s|$)/g;

/** Sentences of one line (a line break always ends a sentence on LinkedIn). */
export function sentencesOfLine(raw: string): string[] {
  // A list marker ("3. ", "- ") is not a sentence of its own.
  const line = raw.replace(/^\s*(?:\d{1,2}\s*[.)/]|[-•*–▪►→>✓✔])\s+/, "");
  const out: string[] = [];
  let last = 0;
  for (const m of line.matchAll(SENTENCE_END)) {
    const end = (m.index ?? 0) + m[0].length;
    const s = line.slice(last, end).trim();
    if (wordCount(s) > 0) out.push(s);
    last = end;
  }
  const rest = line.slice(last).trim();
  if (wordCount(rest) > 0) out.push(rest);
  return out;
}

export function sentencesOf(text: string): string[] {
  return linesOf(text).flatMap(sentencesOfLine);
}

/* ------------------------------------------------------------------ */
/* Marks: emojis, hashtags, dashes, lists                              */
/* ------------------------------------------------------------------ */

/** One emoji, including ZWJ sequences and variation selectors. ©®™ are not emojis here. */
export const EMOJI_RE = /(?![©®™‼⁉])\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*/gu;
export const HASHTAG_RE = /(?<![\p{L}\p{N}_&/#])#\p{L}[\p{L}\p{N}_]*/gu;
/** Em dashes, spaced en dashes and spaced double hyphens used as connectors. */
export const EM_DASH_RE = /—|(?<=\s)–(?=\s)|(?<=\s)--(?=\s)/g;
/** A plain hyphen used as a dash between words ("he said - because"). */
export const SPACED_HYPHEN_RE = /(?<=\S) - (?=\S)/g;
export const ELLIPSIS_RE = /…|(?<!\.)\.{2,3}(?!\.)/g;
export const LINK_RE = /\bhttps?:\/\/\S+|\bwww\.\S+|\blnkd\.in\/\S+/gi;

export const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

export const NUMBERED_LINE_RE = /^\s*\d{1,2}\s*[.)/]\s+\S/;
export const BULLET_LINE_RE = /^\s*(?:[-•*–▪►→>✓✔]|\p{Extended_Pictographic}️?)\s+\S/u;

export function isListLine(line: string): boolean {
  return NUMBERED_LINE_RE.test(line) || BULLET_LINE_RE.test(line);
}

export type ListInfo = { kind: "numbered" | "bulleted"; items: number; endsAt: number };

/** The longest list in a post (2+ consecutive-ish list lines). `endsAt` is the line index after it. */
export function findList(text: string): ListInfo | null {
  const lines = linesOf(text);
  let best: ListInfo | null = null;
  let run: { kind: ListInfo["kind"]; items: number; start: number } | null = null;
  const close = (i: number) => {
    if (run && run.items >= 2 && (!best || run.items > best.items)) best = { kind: run.kind, items: run.items, endsAt: i };
    run = null;
  };
  lines.forEach((line, i) => {
    const kind = NUMBERED_LINE_RE.test(line) ? "numbered" : BULLET_LINE_RE.test(line) ? "bulleted" : null;
    if (kind) {
      if (run && run.kind === kind) run.items++;
      else {
        close(i);
        run = { kind, items: 1, start: i };
      }
    } else if (run) {
      // A list item may carry a few lines of explanation below it; keep the run open while
      // the next list line is near.
      const next = lines.slice(i + 1, i + 4).findIndex((l) => (run!.kind === "numbered" ? NUMBERED_LINE_RE : BULLET_LINE_RE).test(l));
      if (next < 0) close(i);
    }
  });
  close(lines.length);
  return best;
}

/** The last line that isn't hashtags-only (hashtag footers don't count as the ending). */
export function closingLine(text: string): string {
  const lines = linesOf(text);
  for (let i = lines.length - 1; i >= 0; i--) {
    const stripped = lines[i].replace(HASHTAG_RE, "").trim();
    if (wordCount(stripped) > 0) return lines[i];
  }
  return "";
}

/* ------------------------------------------------------------------ */
/* Openers & closers                                                   */
/* ------------------------------------------------------------------ */

export const OPENER_TYPES = ["scene", "credential", "number", "question", "quote", "claim"] as const;
export type OpenerType = (typeof OPENER_TYPES)[number];

export const CLOSER_TYPES = ["question", "invite", "bet", "lesson", "statement"] as const;
export type CloserType = (typeof CLOSER_TYPES)[number];

export const OPENER_LABEL: Record<OpenerType, string> = {
  scene: "A scene (time or place)",
  credential: "Experience or credential",
  number: "A number or result",
  question: "A question",
  quote: "A quote",
  claim: "A flat claim",
};

export const CLOSER_LABEL: Record<CloserType, string> = {
  question: "A question",
  invite: "An invitation (DM, comment, link)",
  bet: "A bet or prediction",
  lesson: "The lesson, spelled out",
  statement: "A quiet last line",
};

const SCENE_RE =
  /^(?:yesterday|today|tonight|this (?:morning|week|weekend|summer|winter|spring|autumn|fall)|last (?:night|week|weekend|month|year|summer|winter|spring|autumn|fall|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|the (?:train|plane|way|phone|bus|call))|at (?:\d|the |a |an |my |our )|in (?:\d{4}|(?:january|february|march|april|may|june|july|august|september|october|november|december))|(?:\d{1,2}[:.]\d{2}|\d{1,2}\s?(?:am|pm))\b|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}|(?:ayer|hoy|anoche|la semana pasada|gestern|heute|letzte woche|hier|aujourd'hui|la semaine dernière|ontem|hoje|ieri|oggi)\b)/i;
const CREDENTIAL_RE =
  /^(?:i(?:['’]ve| have)? (?:spent|worked|built|run|ran|led|hired|taught|founded|started|coached|helped|interviewed|written|shipped|sold|raised|managed|advised|trained|won)\b|after (?:\d+|two|three|four|five|six|seven|eight|nine|ten|\w+ years)|for (?:\d+|the (?:past|last)) (?:years?|months?|decades?)|over the (?:past|last) \d+|i(?:['’]m| am) (?:a|an|the) \w+ (?:who|with|at|for)|as (?:a|an|the) \w+)/i;
const NUMBER_RE = /(?:\d|[$€£¥₹%])/;
const QUOTE_START_RE = /^["“«„'‘]/;

export function classifyOpener(hook: string): OpenerType {
  const h = hook.trim();
  if (!h) return "claim";
  if (QUOTE_START_RE.test(h)) return "quote";
  if (/\?\s*$/.test(h)) return "question";
  if (SCENE_RE.test(h)) return "scene";
  if (CREDENTIAL_RE.test(h)) return "credential";
  if (NUMBER_RE.test(h)) return "number";
  return "claim";
}

const INVITE_RE =
  /\b(?:dm me|message me|write to me|send me|reach out|comment (?:below|"|“)|let me know|link (?:in|below)|in the comments|follow (?:me|along)|subscribe|sign up|book a|grab (?:a|your)|join (?:me|us)|schreib(?:t)? mir|escr[ií]beme|écrivez-moi|me escreva|scrivimi)\b/i;
const BET_RE = /\b(?:i bet|my bet|i(?:['’]m| am) betting|i predict|my prediction|mark my words|we(?:['’]ll| will) see|by \d{4},?|in \d+ (?:years|months))\b/i;
const LESSON_RE =
  /^(?:so[,:]?\s|the (?:lesson|moral|takeaway|point)\b|lesson:|moral:|takeaway:|in short\b|that(?:['’]s| is) (?:why|how|what|the)\b|bottom line\b|what i learned\b|the moral is\b|long story short\b)/i;

export function classifyCloser(line: string): CloserType {
  const l = line.trim();
  if (!l) return "statement";
  if (/\?["'”’)]*\s*$/.test(l)) return "question";
  if (INVITE_RE.test(l)) return "invite";
  if (BET_RE.test(l)) return "bet";
  if (LESSON_RE.test(l)) return "lesson";
  return "statement";
}

/* ------------------------------------------------------------------ */
/* Pronouns & stopwords (stylometry)                                   */
/* ------------------------------------------------------------------ */

const FIRST_PERSON: Record<string, string[]> = {
  en: ["i", "me", "my", "mine", "myself", "i'm", "i’m", "i've", "i’ve", "i'd", "i’d", "i'll", "i’ll"],
  es: ["yo", "me", "mi", "mis", "mío", "mía", "conmigo"],
  de: ["ich", "mich", "mir", "mein", "meine", "meinen", "meinem", "meiner"],
  fr: ["je", "j'", "j’", "moi", "mon", "ma", "mes"],
  pt: ["eu", "me", "meu", "minha", "meus", "minhas", "comigo"],
  it: ["io", "mi", "mio", "mia", "miei", "mie"],
};
const FIRST_PERSON_PLURAL: Record<string, string[]> = {
  en: ["we", "us", "our", "ours", "we're", "we’re", "we've", "we’ve"],
  es: ["nosotros", "nuestro", "nuestra", "nos"],
  de: ["wir", "uns", "unser", "unsere"],
  fr: ["nous", "notre", "nos"],
  pt: ["nós", "nosso", "nossa"],
  it: ["noi", "nostro", "nostra", "ci"],
};

export function langKey(language?: string | null): string {
  const k = (language ?? "en").toLowerCase().slice(0, 2);
  return k in FIRST_PERSON ? k : "en";
}

export function hasFirstPerson(sentence: string, language?: string | null, plural = false): boolean {
  const set = new Set((plural ? FIRST_PERSON_PLURAL : FIRST_PERSON)[langKey(language)]);
  const lower = sentence.toLowerCase();
  if (langKey(language) === "fr" && /\bj['’]/.test(lower)) return !plural;
  return wordsOf(lower).some((w) => set.has(w));
}

const STOP: Record<string, string> = {
  en: "a an the and or but so if of to in on at by for from with as is are was were be been being am do does did have has had it its it's this that these those there here what which who whom whose when where why how i me my we us our you your he him his she her they them their not no yes just very really can could would should will shall may might must also than then too more most some any all each every one two about into over under again out up down off only own same such both few other just now get got go going like",
  es: "el la los las un una unos unas y o pero si de del a al en con por para que como es son era fue ser estar está están este esta estos estas eso esa ese lo le les se su sus mi mis tu tus yo me te nos no sí muy más ya también hay",
  de: "der die das den dem des ein eine einen einem einer und oder aber wenn von zu im in an am auf mit für aus als ist sind war waren sein bin hat haben hatte es ich mich mir wir uns du sie er nicht kein keine sehr auch noch schon nur so wie was wer dass",
  fr: "le la les un une des et ou mais si de du à au aux en dans sur avec pour par que qui comme est sont était être ai a ont ce cet cette ces je me moi nous vous il elle ils elles ne pas plus très aussi déjà",
  pt: "o a os as um uma e ou mas se de do da dos das em no na nos nas com por para que como é são era foi ser estar está este esta isso esse essa eu me nós não sim muito mais já também",
  it: "il lo la i gli le un una e o ma se di del della a al in nel con per da che come è sono era essere questo questa quello io mi noi non sì molto più già anche",
};

const stopCache = new Map<string, Set<string>>();
export function stopwords(language?: string | null): Set<string> {
  const k = langKey(language);
  let s = stopCache.get(k);
  if (!s) {
    s = new Set([...STOP.en.split(" "), ...(k === "en" ? [] : STOP[k].split(" "))]);
    stopCache.set(k, s);
  }
  return s;
}
