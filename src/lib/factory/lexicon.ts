/**
 * AI-tell lexicon (versioned). Pure data — safe to import on the client.
 *
 * Source: research 02 §7.1 (Wikipedia "Signs of AI writing", blader/humanizer, Kobak et al.,
 * LinkedIn-specific slop lists). 126 entries:
 *   Tier A (86) — hard ban: words (40) + phrases (46). Severity "error".
 *   Tier B (40) — filler / flag: words (25) + phrases (15). Severity "warn".
 *
 * Patterns are regex *sources* written in a small dialect expanded by `compileEntry`:
 *   - a straight apostrophe `'` also matches the curly one `’`
 *   - a literal space matches any run of whitespace
 *   - word boundaries are Unicode-aware and added automatically
 *
 * The user's own corpus overrides the list: if a signature phrase or common opener/closer of the
 * user contains a match, the hit is skipped ("the sample overrides the other rules").
 */

export const LEXICON_VERSION = "2026-10";

export type LexiconTier = "A" | "B";

export type LexiconEntry = {
  /** Stable id, used in tests and for de-duplication. */
  id: string;
  /** Regex source in the dialect described above. */
  pattern: string;
  tier: LexiconTier;
  /** Lint rule id the hit is reported under. */
  rule: string;
  /** A plainer alternative to suggest, when there is an obvious one. */
  suggest?: string;
  /** Overrides the default message. `{m}` is replaced with the matched text. */
  message?: string;
};

const A_WORD = "ai-phrase";
const B_WORD = "filler-phrase";

/* ------------------------------------------------------------------ */
/* Tier A — words (40)                                                 */
/* ------------------------------------------------------------------ */

const TIER_A_WORDS: LexiconEntry[] = [
  { id: "delve", pattern: "delv(?:e|es|ed|ing)", suggest: "look at, dig into" },
  { id: "tapestry", pattern: "tapestr(?:y|ies)" },
  { id: "testament", pattern: "testaments?", suggest: "proof" },
  { id: "realm", pattern: "realms?", suggest: "world, field" },
  { id: "embark", pattern: "embark(?:s|ed|ing)?", suggest: "start" },
  { id: "beacon", pattern: "beacons?" },
  { id: "labyrinth", pattern: "labyrinth(?:s|ine)?", suggest: "maze" },
  { id: "symphony", pattern: "symphony of" },
  { id: "treasure-trove", pattern: "treasure troves?" },
  { id: "multifaceted", pattern: "multi-?faceted" },
  { id: "intricate", pattern: "intricac(?:y|ies)|intricate(?:ly)?", suggest: "detailed, messy" },
  { id: "meticulous", pattern: "meticulous(?:ly)?", suggest: "careful" },
  { id: "underscore", pattern: "underscor(?:e|es|ed|ing)", suggest: "show" },
  { id: "showcase", pattern: "showcas(?:e|es|ed|ing)", suggest: "show" },
  { id: "boasts", pattern: "boast(?:s|ed|ing)", suggest: "has" },
  { id: "bolster", pattern: "bolster(?:s|ed|ing)?", suggest: "support" },
  { id: "garner", pattern: "garner(?:s|ed|ing)?", suggest: "get" },
  { id: "interplay", pattern: "interplay" },
  { id: "nestled", pattern: "nestled" },
  { id: "groundbreaking", pattern: "ground-?breaking", suggest: "new" },
  { id: "revolutionary", pattern: "revolutionary|revolutioni[sz](?:e|es|ed|ing)" },
  { id: "cutting-edge", pattern: "cutting[- ]edge", suggest: "new, latest" },
  { id: "game-changer", pattern: "game[- ]?chang(?:er|ers|ing)" },
  { id: "paradigm", pattern: "paradigm(?:s| shift| shifts)?" },
  { id: "synergy", pattern: "synerg(?:y|ies|istic)" },
  { id: "unleash", pattern: "unleash(?:es|ed|ing)?" },
  {
    id: "unlock",
    pattern: "unlock(?:s|ed|ing)? (?:the |your |our |their |its |new |real |true |full )*(?:potential|power|value|growth|opportunit(?:y|ies)|success|secrets?|insights?|possibilit(?:y|ies))",
  },
  { id: "harness", pattern: "harness(?:es|ed|ing)? (?:the )?(?:full )?(?:power|potential|energy|strength) of" },
  { id: "elevate", pattern: "elevat(?:e|es|ed|ing)", suggest: "improve, raise" },
  { id: "empower", pattern: "empower(?:s|ed|ing|ment)?", suggest: "help, let" },
  { id: "seamless", pattern: "seamless(?:ly)?", suggest: "smooth" },
  { id: "transformative", pattern: "transformative" },
  { id: "holistic", pattern: "holistic(?:ally)?", suggest: "whole" },
  { id: "ever-evolving", pattern: "ever[- ]evolving" },
  { id: "fast-paced", pattern: "fast[- ]paced" },
  { id: "enduring-legacy", pattern: "enduring (?:legacy|impact)" },
  { id: "vibrant", pattern: "vibrant", suggest: "lively" },
  { id: "indelible", pattern: "indelible" },
  { id: "pivotal", pattern: "pivotal", suggest: "important, big" },
  { id: "crucible", pattern: "crucibles?" },
].map((e) => ({ ...e, tier: "A" as const, rule: A_WORD }));

/* ------------------------------------------------------------------ */
/* Tier A — phrases (46)                                               */
/* ------------------------------------------------------------------ */

const TIER_A_PHRASES: LexiconEntry[] = [
  { id: "in-todays-world", pattern: "in today's (?:fast[- ]paced |digital |modern |competitive |ever[- ]changing |rapidly changing )?(?:world|age|era|economy|market|environment)" },
  { id: "in-todays-landscape", pattern: "in today's (?:ever[- ]evolving |ever[- ]changing |rapidly evolving )?landscape" },
  { id: "ever-evolving-world-of", pattern: "in the ever[- ](?:evolving|changing) (?:world|landscape|realm) of" },
  { id: "navigating-complexities", pattern: "navigat(?:e|es|ed|ing) the complexit(?:y|ies) of" },
  { id: "important-to-note", pattern: "it's important to (?:note|remember|understand|recognize|recognise)" },
  { id: "worth-noting", pattern: "it's worth (?:noting|mentioning|remembering)" },
  { id: "plays-a-role", pattern: "play(?:s|ed|ing)? an? (?:pivotal|crucial|vital|key|critical|significant) role" },
  { id: "stands-as", pattern: "stand(?:s|ing)? as an?", suggest: "is" },
  { id: "serves-as", pattern: "serv(?:es|ed|ing) as (?:a |an )?(?:powerful |stark |gentle )?(?:reminder|testament|catalyst|bridge|foundation|cornerstone)", suggest: "is" },
  { id: "rich-tapestry", pattern: "a rich (?:tapestry|history|heritage) of" },
  { id: "forefront", pattern: "at the forefront of" },
  { id: "harness-the-power", pattern: "harness the power" },
  { id: "unlock-the-potential", pattern: "unlock the (?:full )?(?:potential|power)" },
  { id: "lets-dive-in", pattern: "let's (?:dive|jump) (?:in|into|deep|right in)" },
  { id: "deep-dive", pattern: "deep[- ]dives?" },
  { id: "without-further-ado", pattern: "without further ado" },
  { id: "in-conclusion", pattern: "in conclusion" },
  { id: "in-summary", pattern: "in summary" },
  { id: "in-essence", pattern: "in essence" },
  { id: "end-of-the-day", pattern: "at the end of the day" },
  { id: "let-that-sink-in", pattern: "let that sink in" },
  { id: "read-that-again", pattern: "read that again" },
  { id: "heres-the-kicker", pattern: "here's the kicker" },
  { id: "heres-the-thing", pattern: "here's the thing" },
  { id: "buckle-up", pattern: "buckle up" },
  { id: "spoiler-alert", pattern: "spoiler alert" },
  { id: "plot-twist", pattern: "plot twist" },
  { id: "fast-forward", pattern: "fast[- ]forward (?:to|a few|\\d+|two|three|six|ten)" },
  { id: "little-did-i-know", pattern: "little did (?:i|we) know" },
  {
    id: "thrilled-to-announce",
    pattern: "(?:i'm|i am|we're|we are) (?:so |very |incredibly |beyond |truly )?(?:thrilled|excited|humbled|honou?red|delighted|proud) (?:and (?:humbled|honou?red|proud) )?to (?:announce|share)",
    rule: "humblebrag",
    message: '"{m}" reads as a template announcement. Say what happened and why it matters to you.',
  },
  { id: "agree-closer", pattern: "agree\\?(?=\\s*$)", rule: "generic-cta", message: '"Agree?" is engagement bait readers skim past. Ask something only your story can prompt.' },
  { id: "thoughts-closer", pattern: "thoughts\\?(?=\\s*$)", rule: "generic-cta", message: '"Thoughts?" is a generic closer. Ask a specific question tied to the story, or just stop.' },
  { id: "repost-bait", pattern: "(?:♻️?\\s*)?repost (?:this|to|if|so)", rule: "engagement-bait", message: '"{m}" is engagement bait. LinkedIn now downranks it.' },
  { id: "follow-me", pattern: "follow (?:me )?for more", rule: "engagement-bait", message: '"{m}" is a growth-hack footer. LinkedIn readers tune it out.' },
  { id: "comment-for", pattern: "comment (?:(?:\"|“|')\\p{L}+(?:\"|”|')|below) (?:and|to get|for|if)", rule: "engagement-bait", message: '"{m}" is comment-for-lead bait. LinkedIn now downranks it.' },
  { id: "changes-everything", pattern: "this changes everything" },
  { id: "future-is-here", pattern: "the future is (?:here|now)" },
  { id: "next-level", pattern: "(?:take|taking|took|takes) (?:it|this|things|your \\p{L}+) to the next level" },
  { id: "move-the-needle", pattern: "mov(?:e|es|ed|ing) the needle" },
  { id: "hope-this-helps", pattern: "i hope this helps", rule: "chatbot", message: '"{m}" is chatbot residue. Cut it.' },
  { id: "certainly", pattern: "(?:certainly|of course|great question|absolutely)!", rule: "chatbot", message: '"{m}" is chatbot residue. Cut it.' },
  { id: "real-win", pattern: "that's the real (?:win|lesson|secret|magic|story|flex)" },
  { id: "setting-the-stage", pattern: "set(?:ting|s)? the stage for" },
  { id: "pivotal-moment", pattern: "a (?:key|pivotal|defining|watershed) (?:turning point|moment)" },
  { id: "evolving-landscape", pattern: "(?:evolving|digital|business|competitive|ever[- ]changing|shifting) landscape" },
  { id: "seamlessly-integrate", pattern: "seamlessly integrat(?:e|es|ed|ing)" },
].map((e) => ({ tier: "A" as const, rule: A_WORD, ...e }));

/* ------------------------------------------------------------------ */
/* Tier B — words (25)                                                 */
/* ------------------------------------------------------------------ */

const TIER_B_WORDS: LexiconEntry[] = [
  { id: "crucial", pattern: "crucial(?:ly)?", suggest: "important" },
  { id: "vital", pattern: "vital(?:ly)?", suggest: "important" },
  { id: "key-intensifier", pattern: "key (?:takeaways?|insights?|lessons?|factors?|drivers?|ingredients?|components?|learnings?)" },
  { id: "landscape", pattern: "landscapes?" },
  { id: "journey", pattern: "(?<!(?:train|bus|car|road|flight|plane|ferry|boat|taxi|hour|day|night|long|short|bike|\\d) )journeys?" },
  {
    id: "navigate",
    pattern:
      "navigat(?:e|es|ed|ing) (?:the |this |these |those |our |your |my |a |an )?(?:new |difficult |tough |complex )?(?:complexit(?:y|ies)|challenges?|uncertaint(?:y|ies)|changes?|landscape|world|journey|markets?|chaos|transitions?|careers?|waters)",
  },
  { id: "leverage", pattern: "leverag(?:e|es|ed|ing)", suggest: "use" },
  { id: "robust", pattern: "robust", suggest: "solid" },
  { id: "dynamic", pattern: "dynamic" },
  { id: "comprehensive", pattern: "comprehensive", suggest: "full, complete" },
  { id: "foster", pattern: "foster(?:s|ed|ing)?", suggest: "build, grow" },
  { id: "resonate", pattern: "resonat(?:e|es|ed|ing)", suggest: "land, hit home" },
  { id: "align-with", pattern: "align(?:s|ed|ing)? with", suggest: "match, fit" },
  { id: "enhance", pattern: "enhanc(?:e|es|ed|ing|ement)", suggest: "improve" },
  { id: "highlight", pattern: "highlight(?:s|ed|ing)?", suggest: "show, point out" },
  { id: "additionally", pattern: "additionally", suggest: "also" },
  { id: "moreover", pattern: "moreover", suggest: "also" },
  { id: "furthermore", pattern: "furthermore", suggest: "also" },
  { id: "notably", pattern: "notably" },
  { id: "arguably", pattern: "arguably" },
  { id: "undoubtedly", pattern: "undoubtedly" },
  { id: "catalyst", pattern: "catalysts?", suggest: "trigger" },
  { id: "impactful", pattern: "impactful" },
  { id: "actionable-insights", pattern: "actionable (?:insights?|takeaways?|tips?)" },
  { id: "valuable-insights", pattern: "valuable (?:insights?|lessons?|takeaways?)" },
].map((e) => ({ ...e, tier: "B" as const, rule: B_WORD }));

/* ------------------------------------------------------------------ */
/* Tier B — phrases (15)                                               */
/* ------------------------------------------------------------------ */

const TIER_B_PHRASES: LexiconEntry[] = [
  { id: "the-truth-is", pattern: "the truth is" },
  { id: "heres-why", pattern: "here's why" },
  { id: "nobody-tells-you", pattern: "here's what (?:nobody|no one) (?:tells|told) you" },
  { id: "most-people-dont-realize", pattern: "most people (?:don't|do not|never) (?:realize|realise|know|understand|see)" },
  { id: "unpopular-opinion", pattern: "unpopular opinion" },
  { id: "hot-take", pattern: "hot take" },
  { id: "the-result-q", pattern: "the (?:result|outcome|answer|catch|problem|best part|twist)\\?" },
  { id: "the-lesson-q", pattern: "the (?:lesson|takeaway|moral)\\?" },
  { id: "honestly-q", pattern: "honestly\\?" },
  { id: "and-thats-okay", pattern: "and that's (?:okay|ok|fine|alright)" },
  { id: "not-because", pattern: "not because [^.!?\\n]{1,60}[.!] because" },
  { id: "real-question", pattern: "the real question is" },
  { id: "at-its-core", pattern: "at (?:its|it's|the) core" },
  { id: "its-clear-that", pattern: "it's clear that" },
  { id: "as-we-navigate", pattern: "as we navigate" },
].map((e) => ({ ...e, tier: "B" as const, rule: B_WORD }));

export const LEXICON: LexiconEntry[] = [...TIER_A_WORDS, ...TIER_A_PHRASES, ...TIER_B_WORDS, ...TIER_B_PHRASES];

/** Words and phrases the writer prompt names explicitly (small models can't hold all 126). */
export const PROMPT_BANNED = [
  "delve",
  "tapestry",
  "testament",
  "realm",
  "embark",
  "unlock",
  "harness",
  "elevate",
  "empower",
  "seamless",
  "transformative",
  "game-changer",
  "pivotal",
  "crucial",
  "journey",
  "landscape",
  "navigate",
  "leverage",
  "foster",
  "resonate",
  "synergy",
  "robust",
  "vibrant",
  "showcase",
  "underscore",
  "Here's the thing",
  "Let that sink in",
  "In today's fast-paced world",
  "At the end of the day",
  "Fast forward to today",
];

const BOUNDARY_START = "(?<![\\p{L}\\p{N}_])";
const BOUNDARY_END = "(?![\\p{L}\\p{N}_])";

/** Expand the pattern dialect and add Unicode word boundaries. */
export function compilePattern(pattern: string, flags = "giu"): RegExp {
  const src = pattern.replace(/'/g, "['’]").replace(/ /g, "\\s+");
  return new RegExp(`${BOUNDARY_START}(?:${src})${BOUNDARY_END}`, flags);
}

export type CompiledEntry = LexiconEntry & { re: RegExp };

let compiled: CompiledEntry[] | null = null;

export function compiledLexicon(): CompiledEntry[] {
  if (!compiled) compiled = LEXICON.map((e) => ({ ...e, re: compilePattern(e.pattern) }));
  return compiled;
}

/** Escape a literal string for use inside a RegExp. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
