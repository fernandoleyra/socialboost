/**
 * Text heuristics for interviews: answer classification, story-signal detection,
 * verbatim-quote verification and the streaming reply filter. Pure and unit-tested.
 */

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/* ------------------------------------------------------------------ */
/* Answer classification                                               */
/* ------------------------------------------------------------------ */

const DONE_PATTERNS = [
  /^(no,? )?(i think )?that'?s (it|all|about it|everything|all i (have|got|remember))\b/,
  /^(i'?m|i am|we'?re) (done|finished|good)\b/,
  /^(done|finished|nothing (else|more)|no more|nope|not really|all good)\b/,
  /^(let'?s|can we|i want to|i'?d like to) (finish|wrap( it)? up|stop|end|save)\b/,
  /^(wrap (it )?up|finish( it)?|save (it|the story))\b/,
  // es / pt / it / fr / de
  /^(eso es todo|ya est[aá]|nada m[aá]s|he terminado|es todo)\b/,
  /^([ée] isso|s[oó] isso|terminei|nada mais)\b/,
  /^([èe] tutto|ho finito|niente altro)\b/,
  /^(c'?est tout|j'?ai fini|rien d'?autre)\b/,
  /^(das war'?s|das ist alles|fertig|nichts mehr)\b/,
];

/** The user is signalling they have nothing more to add. Only short messages count. */
export function isDoneSignal(text: string): boolean {
  const t = norm(text).replace(/[.!]+$/, "");
  if (!t || wordCount(t) > 10) return false;
  return DONE_PATTERNS.some((re) => re.test(t));
}

const ACK_RE =
  /^(ok(ay)?|k|thanks?|thank you|ty|great|cool|perfect|sounds good|got it|sure|nice|awesome|will do|yes|yep|yeah|alright|right|gracias|vale|danke|merci|grazie|obrigad[oa]|perfecto|super)\b/;

/** A short acknowledgement ("ok, thanks") — not new content. */
export function isAcknowledgement(text: string): boolean {
  const t = norm(text).replace(/[.!]+$/, "");
  return !!t && wordCount(t) <= 5 && ACK_RE.test(t);
}

const SKIP_PATTERNS = [
  /\b(i )?(don'?t|do not|can'?t|cannot) (really )?(remember|recall|know)\b/,
  /\b(not sure|no idea|no clue|i forget|i forgot|dunno|pass|skip( this| it)?|rather not( say)?|prefer not to)\b/,
  /^(no|nothing|none|n\/a|nah|-|\?)$/,
  /\b(no recuerdo|no s[eé]|n[aã]o lembro|non ricordo|je ne sais pas|wei[ßs] (ich )?nicht)\b/,
];

/** A short non-answer ("I don't remember", "skip"): move on instead of re-asking. */
export function isSkipAnswer(text: string): boolean {
  const t = norm(text).replace(/[.!]+$/, "");
  if (!t) return true;
  if (wordCount(t) > 12) return false;
  return SKIP_PATTERNS.some((re) => re.test(t));
}

/** Enough words to count as an answer to the question that was asked. */
export function isSubstantive(text: string, minWords = 5): boolean {
  return !isSkipAnswer(text) && wordCount(text) >= minWords;
}

const GENERIC_MARKERS =
  /\b(usually|typically|generally|in general|always|often|most (people|companies|clients|teams)|people (tend|always|often|usually)|every time|we tend|tends? to|normally|in most cases)\b/;
const SPECIFIC_MARKERS =
  /\b(yesterday|last (week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday|spring|summer|autumn|fall|winter)|this (week|morning|month)|one (day|time|morning|evening)|once|that (day|morning|night|week)|i (said|told|asked|remember|walked|called|sent|got|was)|we (were|had|lost|won|got|decided)|he said|she said|they said|ago)\b/;

/** An answer about habits or opinions rather than one real instance (Mom Test). */
export function isGenericAnswer(text: string): boolean {
  const t = norm(text);
  if (wordCount(t) < 6) return false;
  if (!GENERIC_MARKERS.test(t)) return false;
  return !SPECIFIC_MARKERS.test(t) && !/\d/.test(t);
}

/* ------------------------------------------------------------------ */
/* Story signals (cheap coverage heuristic, English-first)             */
/* ------------------------------------------------------------------ */

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";
const DAYS = "monday|tuesday|wednesday|thursday|friday|saturday|sunday";
const TIME_RE = new RegExp(
  `\\b(${MONTHS}|${DAYS}|yesterday|today|tonight|last (week|month|year|spring|summer|autumn|fall|winter)|this (week|morning|month|year)|(\\d+|a|one|two|three|few|couple of) (days|weeks|months|years) ago|morning|afternoon|evening|night|midnight|noon|o'?clock|weekend|christmas|quarter|q[1-4]|back in|in (19|20)\\d\\d|(19|20)\\d\\d|\\d{1,2}(:\\d\\d)? ?(am|pm|h)|at \\d{1,2}(:\\d\\d)?)\\b`,
);
const PLACE_RE =
  /\b(in|at|on|inside|outside|from) (the|my|our|his|her|their|a) (office|room|meeting room|conference|kitchen|car|train|plane|flight|airport|hotel|lobby|caf[eé]|coffee shop|restaurant|bar|street|park|home|house|apartment|flat|desk|stage|hall|classroom|campus|factory|warehouse|shop|store|site|hospital|garage|balcony|call|zoom|meeting|event|summit|hackathon|booth|elevator|lift|taxi|bus|station|beach|gym)\b|\b(in|at) [A-Z][a-z]+/;
const PEOPLE_RE =
  /\b(client|customer|boss|manager|ceo|cfo|cto|coo|founder|co-?founder|colleague|coworker|co-worker|team ?mate|my team|employee|intern|engineer|developer|designer|recruiter|investor|vc|mentor|coach|partner|wife|husband|girlfriend|boyfriend|mom|mum|mother|dad|father|son|daughter|brother|sister|friend|stranger|board|director|head of|vp|lawyer|banker|student|teacher|professor|neighbou?r|stewardess|waiter|driver)s?\b/;
const SPEECH_RE = /\b(said|says|told me|asked me|asked|replied|answered|shouted|whispered|texted|wrote|emailed)\b|["“”]/;
const STAKES_RE =
  /\b(wanted|want|needed|need(ed)? to|had to|hoped|goal|deadline|risk|risky|could (lose|have lost)|would (lose|have)|lose|lost|afraid|worried|scared|fear|on the line|at stake|if (we|i) didn'?t|bet|pressure|runway|fired|cost|money|savings|reputation|job was|career|make or break|last chance|desperate)\b/;
const TURNING_RE =
  /\b(realis(e|ed)|realiz(e|ed)|suddenly|that'?s when|it clicked|clicked|the moment|moment|turned out|changed|decided|finally|until|noticed|figured out|dawned on|aha|it hit me|hit me|then i|so i|instead|switched|shifted|for the first time)\b/;
const NUMBER_RE = /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|million|billion|dozen|half|double|triple)\b/;
const SENSORY_RE =
  /\b(smell|smelled|sound|noise|loud|quiet|silence|silent|cold|hot|warm|rain|raining|snow|sun|light|dark|coffee|tea|screen|laptop|whiteboard|slide|email|phone|message|spreadsheet|table|chair|window|door|desk|wall|coat|shirt|suit|menu|cup|glass|beer|wine|car|bag|notebook|paper|printer|badge|lanyard|projector|camera)\b/;
const FEELING_RE =
  /\b(felt|feel|feeling|nervous|anxious|anxiety|angry|furious|mad|happy|proud|embarrass(ed|ing)|ashamed|shame|relieved|relief|excited|frustrat(ed|ing)|sad|terrified|shock(ed)?|surpris(ed|ing)|stunned|panic(ked)?|gutted|thrilled|devastated|overwhelmed|calm|guilty|guilt|confused|lonely|grateful|stressed|stress|heart|stomach|cried|crying|tears|laughed|laughing|numb|exhausted|tired|humbled|humiliated|awkward|thought to myself|i thought|in my head|my mind)\b/;
const LESSON_RE =
  /\b(learn(ed|t)?|lesson|taught me|teaches|since then|ever since|now i|these days|today i|the takeaway|moral|i'?d tell|i would tell|advice|my rule|rule is|never again|what i do now|i stopped|i started|i always|i never|the point is|what matters|if you)\b/;

export type StorySignals = Record<"scene" | "people" | "stakes" | "turning" | "details" | "feelings" | "lesson", boolean>;

/** Which story elements a block of the user's own text appears to contain. */
export function detectStorySignals(text: string): StorySignals {
  const raw = text;
  const t = norm(text);
  const time = TIME_RE.test(t);
  const place = PLACE_RE.test(raw) || PLACE_RE.test(t);
  const detailHits = [NUMBER_RE.test(t), SENSORY_RE.test(t), /["“”]/.test(raw)].filter(Boolean).length;
  return {
    scene: time && place,
    people: PEOPLE_RE.test(t) || (SPEECH_RE.test(raw) && /\b(he|she|they|someone|somebody)\b/.test(t)),
    stakes: STAKES_RE.test(t),
    turning: TURNING_RE.test(t),
    details: detailHits >= 2,
    feelings: FEELING_RE.test(t),
    lesson: LESSON_RE.test(t),
  };
}

/* ------------------------------------------------------------------ */
/* Verbatim quotes                                                     */
/* ------------------------------------------------------------------ */

type Token = { word: string; start: number; end: number };

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const re = /[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ word: m[0].toLowerCase().replace(/’/g, "'"), start: m.index, end: m.index + m[0].length });
  return out;
}

/**
 * Keep only quotes that really appear in what the user said. Matching is fuzzy over
 * words (case, punctuation, curly quotes and ≤ ~10% word differences are tolerated);
 * a kept quote is replaced with the user's exact span so it stays verbatim.
 */
export function keepVerbatimQuotes(quotes: string[], userTexts: string[], minWords = 3): string[] {
  const sources = userTexts.map((text) => ({ text, tokens: tokenize(text) }));
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const q of quotes) {
    const qt = tokenize(q).map((t) => t.word);
    if (qt.length < minWords) continue;
    const allowed = Math.floor(qt.length * 0.1);
    let found: string | null = null;
    for (const src of sources) {
      const st = src.tokens;
      for (let i = 0; i + qt.length <= st.length && !found; i++) {
        let misses = 0;
        for (let j = 0; j < qt.length && misses <= allowed; j++) if (st[i + j].word !== qt[j]) misses++;
        if (misses <= allowed) {
          let end = st[i + qt.length - 1].end;
          // Keep trailing sentence punctuation that belongs to the quote.
          while (end < src.text.length && /[.!?…%‰°€$£]/.test(src.text[end])) end++;
          let start = st[i].start;
          while (start > 0 && /[$\u20ac\u00a3]/.test(src.text[start - 1])) start--;
          found = src.text.slice(start, end).replace(/\s+/g, " ").trim();
        }
      }
      if (found) break;
    }
    if (found && !seen.has(found.toLowerCase())) {
      seen.add(found.toLowerCase());
      kept.push(found);
    }
  }
  return kept;
}

/* ------------------------------------------------------------------ */
/* Reply cleaning (small local models add labels, quotes, extra Qs)    */
/* ------------------------------------------------------------------ */

const PREFIX_RES = [
  /^\s*(?:\*\*|__)?\s*(?:interviewer|assistant|ai|you|me|q|question|next question|reply|response)\s*(?:\*\*|__)?\s*[:：]\s*/i,
  /^\s*(?:sure|okay|ok|great|alright|of course)[!.,]?\s+(?:here'?s|here is)[^:\n]{0,40}[:：]\s*/i,
  /^\s*(?:here'?s|here is) (?:my|the|your) (?:next )?(?:question|reply|response)[^:\n]{0,20}[:：]\s*/i,
  /^\s*["“«]/,
];

function stripPrefixes(text: string): string {
  let t = text;
  for (let i = 0; i < 3; i++) {
    const before = t;
    for (const re of PREFIX_RES) t = t.replace(re, "");
    if (t === before) break;
  }
  return t;
}

const stripMarkup = (t: string) => t.replace(/\*\*|__|^#+\s*/gm, "").replace(/^\s*[-•]\s+/gm, "");

/** Index just after the first question mark (plus closing quotes/brackets), or -1. */
function firstQuestionEnd(text: string, minChars = 8): number {
  const re = /[?？]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index < minChars) continue;
    let end = m.index + 1;
    while (end < text.length && /["'”’)\]]/.test(text[end])) end++;
    return end;
  }
  return -1;
}

/** Cut at the last sentence end before `max` chars (falls back to a hard cut). */
function capLength(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const cut = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("? "), slice.lastIndexOf("! "), slice.lastIndexOf("\n"));
  return (cut > max * 0.4 ? slice.slice(0, cut + 1) : slice).trim();
}

export type ReplyFilterOptions = { singleQuestion: boolean; maxChars: number };

/** Final cleanup of a full interviewer reply. Mirrors what the stream filter emitted. */
export function cleanReply(raw: string, opts: ReplyFilterOptions): string {
  let t = stripMarkup(stripPrefixes(raw.replace(/<think>[\s\S]*?<\/think>/gi, ""))).trim();
  if (opts.singleQuestion) {
    const end = firstQuestionEnd(t);
    if (end > 0) t = t.slice(0, end);
  }
  t = capLength(t, opts.maxChars);
  // Drop wrapping quotes the model put around its whole message.
  t = t.replace(/^["“«]+/, "").replace(/(?<=[?.!])["”»]+$/, "");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Stream wrapper around the model output: removes "Interviewer:" style labels and
 * markdown, stops after the first question when asked to (one question per turn), and
 * caps length. `onStop` fires when we cut the model off early so the caller can abort
 * the upstream request. What is yielded always equals `cleanReply(raw)` at the end.
 */
export async function* filterReply(source: AsyncIterable<string>, opts: ReplyFilterOptions, onStop?: () => void): AsyncGenerator<string> {
  let raw = "";
  let emitted = 0;
  let emittedText = "";
  let stopped = false;
  for await (const piece of source) {
    raw += piece;
    const visible = stripMarkup(stripPrefixes(raw.replace(/<think>[\s\S]*?(<\/think>|$)/gi, "")));
    const trimmedStart = visible.replace(/^\s+/, "");
    // Hold back the opening until a label/preamble could no longer appear.
    if (emitted === 0 && trimmedStart.length < 28 && !/\n/.test(trimmedStart)) continue;
    let limit = trimmedStart.length;
    const qEnd = opts.singleQuestion ? firstQuestionEnd(trimmedStart) : -1;
    if (qEnd > 0) {
      limit = qEnd;
      stopped = true;
    } else if (trimmedStart.length > opts.maxChars) {
      limit = capLength(trimmedStart, opts.maxChars).length;
      stopped = true;
    } else {
      // Keep back characters that may still turn into markup ("*" → "**").
      while (limit > 0 && /[*_\s]/.test(trimmedStart[limit - 1])) limit--;
    }
    if (limit > emitted) {
      const piece = trimmedStart.slice(emitted, limit);
      emittedText += piece;
      emitted = limit;
      yield piece;
    }
    if (stopped) break;
  }
  if (stopped) onStop?.();
  const final = cleanReply(raw, opts);
  // Emit whatever the final cleanup kept that we held back (tail, short replies).
  if (final.length > emittedText.length && final.startsWith(emittedText)) yield final.slice(emittedText.length);
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

/** SQLite `datetime('now')` strings are UTC without a zone marker; ISO strings pass through. */
export function parseDbDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : value.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim();
}
