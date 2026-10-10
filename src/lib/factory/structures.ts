/**
 * Post structures library. Pure data + heuristics — safe on the client.
 *
 * "Stretch the story over a proven structure" is how the reference agency works (research 01 §5.3,
 * §6). Each structure is a *form*, never content: the writer fills it only with facts from the
 * memory. Sources: research 01 §6 (Templates A–D from the reference creator) and research 02 §5.2
 * (SLAY, Dicks transformation arc, ABT, failure post, customer story, contrarian, photo-led).
 */

import type { PostFormat } from "@/lib/types";

export const STRUCTURE_IDS = [
  "scene-lesson",
  "result-lessons",
  "discovery",
  "credential-reasons",
  "hot-take-bet",
  "meeting",
  "mistake-fix",
  "before-after",
  "how-i-do",
  "photo-micro",
] as const;
export type StructureId = (typeof STRUCTURE_IDS)[number];

export type Structure = {
  id: StructureId;
  name: string;
  /** One line for pickers and for the angle prompt. */
  summary: string;
  whenToUse: string;
  /** What the story needs for this form to work (shown in the UI). */
  needs: string[];
  /** Numbered skeleton handed to the writer. */
  skeleton: string[];
  /** Target length in words when the user's own posts don't give us a baseline. */
  words: [number, number];
  usesList: boolean;
  format: PostFormat;
};

export const STRUCTURES: Structure[] = [
  {
    id: "scene-lesson",
    name: "Scene → turn → lesson",
    summary: "Drop the reader into one moment, show what changed, land the lesson in your words.",
    whenToUse: "A single vivid moment with a clear before and after.",
    needs: ["when and where", "what was at stake", "the moment it changed", "the lesson in your words"],
    skeleton: [
      "Hook: the scene in one sentence (when, where, what was happening).",
      "Tension: what I wanted and what could go wrong, in the first third.",
      "The turn: the few seconds when it changed. Use the exact words said, if there are any.",
      "What changed after: concrete, with a number or a detail.",
      "The lesson in one or two plain sentences, as I would say it to a friend.",
      "Close: one short question the reader can answer from their own life, or stop on the last detail.",
    ],
    words: [170, 280],
    usesList: false,
    format: "story",
  },
  {
    id: "result-lessons",
    name: "Result + lessons + one more",
    summary: "Open on a concrete result, then 3-4 lessons, each proven by a moment, plus a personal bonus.",
    whenToUse: "A win, a milestone or a finished project with several learnings.",
    needs: ["a concrete result with a number", "3 or more lessons", "a proof moment for each"],
    skeleton: [
      "Hook: the result or credential in one sentence with a number.",
      'Promise line that names the count, e.g. "Three things I learned the hard way."',
      "Numbered items 1. 2. 3. Each: a short claim, then one or two sentences of proof from the story.",
      '"And one more:" a bonus item, the most personal one.',
      "Close: one quiet line that lands it, or a short question.",
    ],
    words: [180, 320],
    usesList: true,
    format: "list",
  },
  {
    id: "discovery",
    name: "Surprising discovery → what I do now",
    summary: "Something you didn't expect, the evidence, and how you work differently since.",
    whenToUse: "Reality turned out different from what you (or most people) expected.",
    needs: ["what I expected", "what I found instead", "a quote or moment as evidence", "what I do differently now"],
    skeleton: [
      'Hook: the discovery in one sentence ("My biggest surprise when ... was ...").',
      "What I expected before, in one or two sentences.",
      "The evidence: one quote or one concrete moment from the story.",
      "What I do now because of it, concretely.",
      "What it changed, in human terms.",
      "Close: an honest, slightly open ending. No moral.",
    ],
    words: [140, 240],
    usesList: false,
    format: "lesson",
  },
  {
    id: "credential-reasons",
    name: "Insider view + reasons + bonus",
    summary: "Your vantage point, then the numbered reasons you've seen from the inside, plus a bonus reason.",
    whenToUse: "You have first-hand experience of why something works or fails.",
    needs: ["my credential or vantage point", "3 or more reasons", "a real example for each"],
    skeleton: [
      "Hook: my vantage point plus the claim, with a number if the story has one.",
      'Promise line: "N reasons ..., from what I have seen inside."',
      "Numbered reasons. Each: the reason in a few words, then one real example from the story.",
      '"And one bonus reason:" the most personal one.',
      "Close: a specific question to people in the same situation.",
    ],
    words: [180, 320],
    usesList: true,
    format: "list",
  },
  {
    id: "hot-take-bet",
    name: "Hot take + evidence + bet",
    summary: "A contrarian claim, the evidence you've seen, why you think it happens, and a bet.",
    whenToUse: "You hold a belief your peers would argue with, and you have a story that backs it.",
    needs: ["the belief", "evidence with dates or numbers", "my personal stake"],
    skeleton: [
      "Hook: the contrarian claim in one sentence, slightly hedged in my way of talking.",
      "Evidence: what I saw, with dates or numbers from the story.",
      "My inside signal: where I see this from.",
      '"Why, I think:" one to three short numbered reasons.',
      "When the common view is actually right (one line of nuance).",
      "Close: my bet or prediction, then a short question.",
    ],
    words: [150, 260],
    usesList: true,
    format: "contrarian",
  },
  {
    id: "meeting",
    name: "Meeting someone → insight → thanks",
    summary: "Who you met, the one question you asked, their answer, and what you're changing.",
    whenToUse: "A conversation with someone that changed how you think.",
    needs: ["who I met and why they matter", "the question I asked", "their answer, ideally word for word"],
    skeleton: [
      "Hook: who I met and one concrete reason they matter.",
      "The one question I asked them.",
      "What I believed or saw before.",
      "Their answer, with the exact words if the story has them, plus one example.",
      "What I am changing because of it.",
      "Close: thanks to them, or a short question.",
    ],
    words: [150, 260],
    usesList: false,
    format: "story",
  },
  {
    id: "mistake-fix",
    name: "Mistake → cost → the rule I use now",
    summary: "Own a mistake, show what it cost, and the rule you follow since.",
    whenToUse: "Something went wrong and you changed how you work.",
    needs: ["the mistake as a scene", "what it cost (numbers help)", "the rule I follow now"],
    skeleton: [
      "Hook: the confession in one sentence.",
      "The scene of the mistake: when, where, what I did.",
      "The cost, with numbers from the story if there are any.",
      "What I missed at the time (what I was thinking).",
      "The rule I use now, in my words.",
      "Close: a closed or either/or question to the reader.",
    ],
    words: [160, 270],
    usesList: false,
    format: "lesson",
  },
  {
    id: "before-after",
    name: "Before / after",
    summary: "The old way, the moment it broke, the new way, and the difference in numbers.",
    whenToUse: "A change in how you (or a client) work, with a visible difference.",
    needs: ["the old way, specifically", "the moment it broke", "the new way", "the difference"],
    skeleton: [
      "Hook: the difference in one line (before vs after, with a number if possible).",
      "Before: how it worked, specifically.",
      "The moment it broke.",
      "After: what we do now.",
      "The difference, concretely.",
      "Close: who should try it, or a short question.",
    ],
    words: [150, 260],
    usesList: false,
    format: "lesson",
  },
  {
    id: "how-i-do",
    name: "How I actually did it",
    summary: "A real result, then the 3-5 steps you actually took, each with a detail.",
    whenToUse: "A process or method you used on a real case.",
    needs: ["the result", "the steps I really took", "a detail per step"],
    skeleton: [
      "Hook: the result in one sentence.",
      "The situation in two or three sentences.",
      "Numbered steps I actually took, each with one concrete detail.",
      "What I would do differently next time.",
      "Close: a specific question.",
    ],
    words: [170, 300],
    usesList: true,
    format: "list",
  },
  {
    id: "photo-micro",
    name: "Photo-led micro-story",
    summary: "What's in the photo, the moment behind it, one observation. Short.",
    whenToUse: "The photo itself is the story, or a small moment worth one observation.",
    needs: ["a real photo", "the moment behind it", "one observation"],
    skeleton: [
      "Hook: what is in the photo, in one sentence.",
      "The moment behind it, in two or three sentences.",
      "One observation or lesson, in my words.",
      "Stop. No summary, no moral.",
    ],
    words: [100, 170],
    usesList: false,
    format: "behind-the-scenes",
  },
];

const BY_ID = new Map(STRUCTURES.map((s) => [s.id, s]));

export function getStructure(id: string | null | undefined): Structure | null {
  return id ? (BY_ID.get(id as StructureId) ?? null) : null;
}

export function isStructureId(id: unknown): id is StructureId {
  return typeof id === "string" && BY_ID.has(id as StructureId);
}

/** The fields of a memory the heuristics look at. */
export type StoryShape = {
  title?: string;
  story?: string;
  lesson?: string;
  details?: string[];
  quotes?: string[];
  people?: string[];
  emotions?: string[];
  tags?: string[];
};

const has = (text: string, re: RegExp) => re.test(text);

/**
 * Rank structures for a story with cheap heuristics. Used to hint the angle prompt, as a fallback
 * when a model returns an unknown structure, and to pre-select a structure for "Draft straight away".
 */
export function recommendStructures(story: StoryShape, opts: { hasPhoto?: boolean } = {}): StructureId[] {
  const text = [story.title, story.story, story.lesson, ...(story.details ?? []), ...(story.tags ?? [])].filter(Boolean).join("\n").toLowerCase();
  const score = new Map<StructureId, number>(STRUCTURE_IDS.map((id) => [id, 0]));
  const add = (id: StructureId, n: number) => score.set(id, (score.get(id) ?? 0) + n);

  add("scene-lesson", 1.5);
  const numbers = (text.match(/\d[\d.,]*\s*(?:%|k\b|m\b|x\b)?/g) ?? []).length;
  const quotes = story.quotes?.length ?? 0;
  const people = story.people?.length ?? 0;
  const storyLen = (story.story ?? "").length;

  if (quotes > 0) add("scene-lesson", 1.5);
  if (people > 0 && has(text, /\b(met|meeting|asked (him|her|them)|dinner|lunch|coffee|conference|summit|event|investor|mentor|interview(ed)?)\b/)) add("meeting", 3);
  if (numbers >= 2) {
    add("result-lessons", 1.5);
    add("before-after", 1.5);
    add("credential-reasons", 1);
  }
  if (has(text, /\b(mistake|failed|failure|wrong|lost|fired|missed|regret|mess(ed)? up|screwed|blew it|almost quit)\b/)) add("mistake-fix", 3);
  if (has(text, /\b(believe|everyone (thinks|says)|most people|myth|overrated|underrated|unpopular|contrarian|disagree|bet|predict)\b/)) {
    add("hot-take-bet", 2.5);
    add("discovery", 0.5);
  }
  if (has(text, /\b(surpris\w*|realis\w*|realiz\w*|discover\w*|expected|turns? out|didn't expect|never thought)\b/)) add("discovery", 3);
  if (has(text, /\b(steps?|process|how i|framework|system|playbook|method|checklist|routine)\b/)) add("how-i-do", 2.5);
  if (has(text, /\b(used to|before|after|now i|now we|switched|changed|no longer|anymore)\b/)) add("before-after", 1.5);
  if (has(text, /\b(lessons|learn(ed|t) (three|four|five|\d))\b/) || /(;|\n\s*\d[.)])/.test(story.lesson ?? "")) add("result-lessons", 2);
  if (has(text, /\b(won|win|launched|shipped|closed|raised|hired|grew|reached|hit)\b/) && numbers >= 1) add("result-lessons", 1.5);
  if (has(text, /\b(reasons?|why (it|they|we) (fail|work)\w*)\b/)) add("credential-reasons", 2);
  if (opts.hasPhoto) add("photo-micro", 1);
  if (storyLen > 0 && storyLen < 500) add("photo-micro", 1.5);
  if (storyLen > 1500) add("photo-micro", -1);

  return [...STRUCTURE_IDS].sort((a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0) || STRUCTURE_IDS.indexOf(a) - STRUCTURE_IDS.indexOf(b));
}

/** Loose lookup for model output ("Scene → turn → lesson", "scene_lesson", "SCENE-LESSON"). */
export function matchStructureId(raw: string | null | undefined): StructureId | null {
  if (!raw) return null;
  const k = raw.toLowerCase().trim().replace(/[_\s]+/g, "-");
  if (isStructureId(k)) return k;
  const byName = STRUCTURES.find((s) => s.name.toLowerCase() === raw.toLowerCase().trim());
  if (byName) return byName.id;
  const partial = STRUCTURES.find((s) => k.includes(s.id) || s.id.includes(k));
  return partial?.id ?? null;
}
