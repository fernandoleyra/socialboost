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

/** Polite tails allowed after an English done phrase ("that's it for now, thanks"). */
const DONE_TAIL = String.raw`(?:[,.!]*\s*(?:for (?:now|today)|thanks?|thank you|really|i think|i guess|from me|here|now))*$`;
const done = (body: string) => new RegExp(`^${body}${DONE_TAIL}`);

/**
 * English patterns are anchored to the whole message so answers like "No more than ten
 * people", "I'm good at sales" or "Not really, it was just me" keep the story going.
 */
const DONE_PATTERNS = [
  done(String.raw`(?:no,? )?(?:i think )?that'?s (?:it|all|about it|everything|all i (?:have|got|remember|can think of))`),
  done(String.raw`(?:i'?m|i am|we'?re) (?:done|finished|all done)`),
  done(String.raw`(?:done|all done|finished|nothing (?:else|more)(?: to add)?|no more|that'?s enough)`),
  done(String.raw`(?:let'?s|can we|i want to|i'?d like to) (?:finish|wrap(?: it| this)? up|stop|end|save)(?: (?:it|this|the story|the interview))?`),
  done(String.raw`(?:wrap(?: it| this)? up|finish(?: it)?|save (?:it|the story))`),
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
  /^(no|nope|nothing|none|n\/a|nah|not really|nothing really|no one|nobody|-|\?)$/,
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

/** Cut at the last sentence end before `max` chars (falls back to a hard cut). */
function capLength(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const cut = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("? "), slice.lastIndexOf("! "), slice.lastIndexOf("\n"));
  return (cut > max * 0.4 ? slice.slice(0, cut + 1) : slice).trim();
}

const visibleText = (raw: string) => stripMarkup(stripPrefixes(raw.replace(/<think>[\s\S]*?(<\/think>|$)/gi, "")));

/** Normalise a finished reply for storage: labels, markdown, wrapping quotes, whitespace. */
export function cleanReply(raw: string, maxChars = 900): string {
  let t = visibleText(raw).trim();
  t = capLength(t, maxChars);
  t = t.replace(/^["\u201c\u00ab]+/, "").replace(/(?<=[?.!])["\u201d\u00bb]+$/, "");
  return t
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const QUESTION_END = /[?\uff1f]["'\u201d\u2019)\]]*$/;

/**
 * Split off complete sentences from `text` starting at `from`. A sentence ends at . ! ? …
 * (plus closing quotes) followed by whitespace, or at a newline. With `final`, the rest
 * counts as a sentence too.
 */
export function takeSentences(text: string, from: number, final: boolean): { sentences: string[]; end: number } {
  const sentences: string[] = [];
  let start = from;
  let i = from;
  while (i < text.length) {
    const c = text[i];
    if (c === "\n") {
      const s = text.slice(start, i).trim();
      if (s) sentences.push(s);
      start = i + 1;
    } else if (/[.!?\u2026\uff1f\u3002\uff01]/.test(c)) {
      let j = i + 1;
      while (j < text.length && /[.!?"'\u201d\u2019)\]]/.test(text[j])) j++;
      if (j < text.length && /\s/.test(text[j])) {
        const s = text.slice(start, j).trim();
        if (s) sentences.push(s);
        start = j;
        i = j;
        continue;
      }
      i = j - 1;
    }
    i++;
  }
  if (final) {
    const s = text.slice(start).trim();
    if (s) sentences.push(s);
    start = text.length;
  }
  return { sentences, end: start };
}

const FILLER =
  /^(great|good|ok(ay)?|got it|understood|i see|interesting( scenario| story)?|nice|wow|cool|perfect|sure|right|absolutely|of course|thanks?( for sharing( that)?)?|thank you( for sharing( that)?)?|that'?s (great|interesting|impressive|amazing|fascinating|powerful|wonderful|fantastic|really interesting|a great (story|example|point|answer)|a powerful (moment|story|example))|love (it|that)|fascinating|amazing|impressive|makes sense|sounds good|great (story|answer|point|example)|let'?s (dive|get started|begin|start)( in)?)[.!]*$/i;

const PRAISE =
  /^(that'?s|that is|what|this is|sounds like|it sounds like) (a |an |such a |really |so )?(great|good|interesting|powerful|amazing|impressive|fascinating|valuable|important|wonderful|brilliant|incredible|fantastic|remarkable|inspiring)\b|^(great|good|glad|nice|happy) to hear\b/i;

/** Generic praise or filler that adds nothing ("Great!", "That's a great lesson.", "Got it."). */
export function isFiller(sentence: string): boolean {
  const t = sentence.trim();
  return (wordCount(t) <= 6 && FILLER.test(t)) || (wordCount(t) <= 8 && PRAISE.test(t));
}

function tidySentence(s: string): string {
  let t = s.trim();
  const quotes = (t.match(/["\u201c\u201d]/g) ?? []).length;
  if (quotes % 2 === 1) t = t.replace(/^["\u201c]/, "").replace(/["\u201d]$/, "");
  return t;
}

export type TurnFilterOptions = {
  /** "question": short reaction, then exactly one question. "statement": short reaction, no question. "free": only clean up. */
  mode: "question" | "statement" | "free";
  /** Reaction sentences allowed (filler like "Great!" never counts). */
  maxStatements: number;
  maxChars: number;
  /** Question mode: is the model's question on target? Off-target questions are replaced. */
  accept?: (question: string) => boolean;
  /** Question mode: asked instead of an off-target or missing question. */
  fallbackQuestion?: string;
};

/**
 * Sentence-level filter over the streamed model output. Small local models add labels,
 * praise, summaries and extra questions; this keeps at most `maxStatements` reaction
 * sentences and (in question mode) exactly one question, swapping in the fallback when the
 * model's question misses the target. `onStop` fires when the model is cut off early so
 * the caller can abort the upstream request.
 */
export async function* filterTurn(source: AsyncIterable<string>, opts: TurnFilterOptions, onStop?: () => void): AsyncGenerator<string> {
  if (opts.mode === "free") {
    let raw = "";
    for await (const piece of source) raw += piece;
    const out = cleanReply(raw, opts.maxChars);
    if (out) yield out;
    return;
  }
  let raw = "";
  let consumed = 0;
  let statements = 0;
  let emittedChars = 0;
  let asked = false;
  let stop = false;
  const pieces: string[] = [];
  const emit = (s: string) => {
    const piece = (emittedChars ? " " : "") + s;
    emittedChars += piece.length;
    pieces.push(piece);
  };
  const handle = (sentence: string) => {
    const s = tidySentence(sentence);
    if (!s) return;
    if (QUESTION_END.test(s)) {
      if (opts.mode === "question") {
        asked = true;
        emit(opts.accept && opts.fallbackQuestion && !opts.accept(s) ? opts.fallbackQuestion : s);
      }
      stop = true;
      return;
    }
    if (isFiller(s)) return;
    if (statements < opts.maxStatements && emittedChars + s.length <= opts.maxChars) {
      statements++;
      emit(s);
      if (opts.mode === "statement" && statements >= opts.maxStatements) stop = true;
    } else if (opts.mode === "statement") stop = true;
  };

  for await (const piece of source) {
    raw += piece;
    const visible = visibleText(raw);
    // Wait until a label or preamble ("Sure! Here's my question:") can no longer change the start.
    if (consumed === 0 && visible.trimStart().length < 48) continue;
    const { sentences, end } = takeSentences(visible, consumed, false);
    consumed = end;
    for (const s of sentences) {
      handle(s);
      if (stop) break;
    }
    while (pieces.length) yield pieces.shift()!;
    // A runaway sentence with no end in sight: stop listening.
    if (!stop && visible.length - consumed > opts.maxChars) stop = true;
    if (stop) break;
  }
  if (stop) onStop?.();
  else for (const s of takeSentences(visibleText(raw), consumed, true).sentences) if (!stop) handle(s);
  if (opts.mode === "question" && !asked && opts.fallbackQuestion) emit(opts.fallbackQuestion);
  while (pieces.length) yield pieces.shift()!;
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

function dayKey(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * "Today" / "Yesterday" / "Mon, Oct 6" (adds the year when it isn't the current one) in the
 * profile's time zone, so server and browser render the same string.
 */
export function formatDay(value: string | null | undefined, timeZone: string, opts: { relative?: boolean; now?: Date } = {}): string {
  const d = parseDbDate(value);
  if (!d) return "";
  let tz = timeZone || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    tz = "UTC";
  }
  const now = opts.now ?? new Date();
  if (opts.relative !== false) {
    const k = dayKey(d, tz);
    if (k === dayKey(now, tz)) return "Today";
    if (k === dayKey(new Date(now.getTime() - 86_400_000), tz)) return "Yesterday";
  }
  const sameYear = dayKey(d, tz).slice(0, 4) === dayKey(now, tz).slice(0, 4);
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(d);
}
