/**
 * Prompt builders for the post factory. Pure — unit-tested, no I/O.
 *
 * Written for 7-14B local models first (research 02 §10, brief rule 5), and tested on a 3B model:
 *  - multi-turn: the notes arrive in their own message and are acknowledged, the task comes last.
 *    One big message with the story at the top makes small models copy the story back verbatim.
 *  - the chosen hook is given as the exact first line, which pulls the model into writing a post.
 *  - numbered hard rules at the END (small models weight recent text most), one task per call,
 *    no tool calling, no JSON for prose.
 *  - bad-pattern examples use generic content so no fact can leak from them into the post.
 */

import type { Critique, LintIssue, Memory, Pillar, Strategy, VoiceStats } from "@/lib/types";
import { HOOK_TYPE_LABELS, HOOK_TYPES, type Angle } from "./angles";
import { L } from "./labels";
import { PROMPT_BANNED } from "./lexicon";
import { STRUCTURES, getStructure, type Structure, type StructureId } from "./structures";

export type PromptMemory = Pick<Memory, "title" | "summary" | "story" | "when" | "place" | "people" | "emotions" | "details" | "quotes" | "lesson">;

export type PromptContext = {
  author: { name: string; headline: string };
  /** ISO-ish language code for the post (strategy language, else profile language). */
  language: string;
  strategy: Strategy | null;
  pillar: Pillar | null;
  memory: PromptMemory | null;
  photo: { caption: string; userNote: string } | null;
  /** Compact style guide from the Voice module. */
  voiceBlock: string;
  /** The user's own posts most similar to this story. */
  examples: string[];
  stats: VoiceStats | null;
};

export type PromptMessage = { role: "user" | "assistant"; content: string };
export type Prompt = { system: string; messages: PromptMessage[] };

const LANGUAGES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  de: "German",
  fr: "French",
  pt: "Portuguese",
  it: "Italian",
  nl: "Dutch",
  pl: "Polish",
  ru: "Russian",
  uk: "Ukrainian",
  sv: "Swedish",
  da: "Danish",
  no: "Norwegian",
  fi: "Finnish",
  tr: "Turkish",
  ca: "Catalan",
  ro: "Romanian",
  cs: "Czech",
  ja: "Japanese",
  zh: "Chinese",
  ko: "Korean",
  ar: "Arabic",
  hi: "Hindi",
};

export function languageName(code: string): string {
  const c = (code || "en").toLowerCase().split(/[-_]/)[0];
  return LANGUAGES[c] ?? code;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "the author";
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + " …" : s);
const list = (xs: string[] | undefined, n = 8) => (xs ?? []).map((x) => x.trim()).filter(Boolean).slice(0, n);

/* ------------------------------------------------------------------ */
/* Shared blocks                                                       */
/* ------------------------------------------------------------------ */

export function aboutBlock(ctx: PromptContext): string {
  const s = ctx.strategy;
  const lines = [`${L.name} ${ctx.author.name}`];
  if (ctx.author.headline) lines.push(`${L.headline} ${ctx.author.headline}`);
  if (s?.positioning) lines.push(`${L.purpose} ${s.positioning}`);
  if (s?.audience.who) lines.push(`${L.audience} ${s.audience.who}`);
  if (list(s?.audience.pains, 4).length) lines.push(`${L.pains} ${list(s?.audience.pains, 4).join("; ")}`);
  if (list(s?.audience.desires, 4).length) lines.push(`${L.desires} ${list(s?.audience.desires, 4).join("; ")}`);
  if (list(s?.expertise, 5).length) lines.push(`${L.background} ${list(s?.expertise, 5).join("; ")}`);
  if (ctx.pillar) lines.push(`${L.topic} ${ctx.pillar.name}${ctx.pillar.description ? `: ${ctx.pillar.description}` : ""}`);
  if (list(s?.avoidTopics, 6).length) lines.push(`${L.avoid} ${list(s?.avoidTopics, 6).join("; ")}`);
  return lines.join("\n");
}

/** Split the story into sentences (quotes stay attached to their sentence). */
export function storyFacts(story: string): string[] {
  return (story.replace(/\s+/g, " ").match(/(?:[^.!?]|[.,](?=\d))+(?:[.!?]+["”’')]*|$)/g) ?? []).map((x) => x.trim()).filter((x) => /[\p{L}\p{N}]/u.test(x));
}

/** The memory as interview notes. Every fact the post may use is in here. */
export function storyBlock(ctx: PromptContext): string {
  const m = ctx.memory;
  if (!m) return "(No notes for this post. Use only facts that are already in the current post.)";
  const lines: string[] = [`${L.title} ${m.title}`];
  if (m.when) lines.push(`${L.when} ${m.when}`);
  if (m.place) lines.push(`${L.where} ${m.place}`);
  if (list(m.people).length) lines.push(`${L.people} ${list(m.people).join(", ")}`);
  // One fact per line instead of a ready-made paragraph: small models copy prose verbatim.
  lines.push(`${L.happened}\n${storyFacts(clip(m.story || m.summary, 3500)).map((f) => `- ${f}`).join("\n")}`);
  if (list(m.details, 12).length) lines.push(`${L.details}\n${list(m.details, 12).map((d) => `- ${d}`).join("\n")}`);
  if (list(m.quotes, 6).length) lines.push(`${L.quotes}\n${list(m.quotes, 6).map((q) => `- "${q.replace(/^["“]|["”]$/g, "")}"`).join("\n")}`);
  if (list(m.emotions, 5).length) lines.push(`${L.felt} ${list(m.emotions, 5).join(", ")}`);
  if (m.lesson) lines.push(`${L.learned} ${m.lesson}`);
  const photo = [ctx.photo?.caption, ctx.photo?.userNote].map((s) => s?.trim()).filter(Boolean);
  if (photo.length) lines.push(`${L.photo} ${photo.join(" ")}`);
  return lines.join("\n");
}

/** Everything a post may state as fact. Fed to the linter's provenance check. */
export function factsText(ctx: PromptContext): string {
  const m = ctx.memory;
  const s = ctx.strategy;
  return [
    ctx.author.name,
    ctx.author.headline,
    s?.positioning,
    ...(s?.expertise ?? []),
    ...(s?.offers ?? []),
    s?.cta,
    m?.title,
    m?.summary,
    m?.story,
    m?.when,
    m?.place,
    ...(m?.people ?? []),
    ...(m?.details ?? []),
    ...(m?.quotes ?? []),
    m?.lesson,
    ctx.photo?.caption,
    ctx.photo?.userNote,
  ]
    .filter(Boolean)
    .join("\n");
}

function voiceSection(ctx: PromptContext): string {
  const block = ctx.voiceBlock.trim();
  if (block) return block;
  return "No samples of my writing yet. Write plainly: everyday words, contractions, short paragraphs, first person.";
}

export function targetWords(ctx: PromptContext, structure: Structure): [number, number] {
  const median = ctx.stats?.medianWords ?? 0;
  if (ctx.stats && ctx.stats.sampleCount >= 3 && median >= 40) {
    const lo = Math.round(median * 0.8);
    const hi = Math.round(median * 1.2);
    // Keep the structure's shape in play: a list post needs room, a photo micro-story less.
    return [Math.max(60, Math.min(lo, structure.words[1])), Math.max(hi, Math.min(structure.words[0] + 40, 450))];
  }
  return structure.words;
}

function emojiRule(stats: VoiceStats | null): string {
  if (stats && stats.emojiPerPost >= 0.5) return `Use at most ${Math.round(stats.emojiPerPost)} emoji, only where I would put one. Never as bullets.`;
  return "No emojis.";
}

function hashtagRule(stats: VoiceStats | null): string {
  if (stats && stats.hashtagsPerPost >= 0.5) return `At most ${Math.min(3, Math.round(stats.hashtagsPerPost))} hashtags, only on the last line.`;
  return "No hashtags.";
}

function dashRule(stats: VoiceStats | null): string {
  if (stats && stats.emDashPerPost >= 0.5) return `Use dashes sparingly (at most ${Math.round(stats.emDashPerPost)}).`;
  return "Do not use em dashes (—) or en dashes (–). Use a period or a comma instead.";
}

/** Whether a post already has a numbered list (two or more "1." / "2)" lines). */
export function hasNumberedList(body: string): boolean {
  return (body.match(/^\s*\d{1,2}[.)]\s+\S/gm) ?? []).length >= 2;
}

function formattingRule(structure: Structure | null, keepList: boolean): string {
  if (structure?.usesList) return "Plain text only: no markdown, no bold, no headings. Use a numbered list (1. 2. 3.) only for the list part of the structure, never bullet symbols.";
  if (keepList) return "Plain text only: no markdown, no bold, no headings, no bullet symbols. Keep the numbered list (1. 2. 3.) the post already has.";
  return "Plain text only: no markdown, no bold, no headings, no lists, no bullet symbols.";
}

/**
 * Numbered hard rules. Kept short: small models follow ~12 rules, not 40.
 * `keepList`: a rewrite of a post that already has a numbered list keeps it (a "no lists" rule
 * would make small models flatten it on every revision).
 */
export function writingRules(ctx: PromptContext, structure: Structure | null, opts: { keepList?: boolean } = {}): string[] {
  const s = ctx.stats;
  const words = structure ? targetWords(ctx, structure) : null;
  const rules = [
    ctx.memory
      ? "Use only facts from my notes. Do not invent names, numbers, dates, places, quotes or events. If a detail is missing, leave it out."
      : "Use only facts that are already in the current post. Do not invent names, numbers, dates, places, quotes or events.",
    ctx.memory ? "Retell the story in new sentences. Do not copy whole sentences from my notes, and never repeat the note labels." : "Keep my wording wherever it already works.",
    `Write as me, ${firstName(ctx.author.name)}, in first person ("I"). Sound like I talk, not like a press release.`,
    "The first line is the hook: one concrete sentence under 140 characters with a real detail (a time, a place, a number or exact words). Do not open with a question.",
    "Paragraphs of 1 to 3 sentences with one blank line between them. Mix short and long sentences. Never more than 3 one-line paragraphs in a row.",
    formattingRule(structure, !!opts.keepList),
    `${emojiRule(s)} ${hashtagRule(s)}`,
    dashRule(s),
    'Never write "it\'s not X, it\'s Y", "not just X, but Y", or lists of three adjectives.',
    `Never use these words or phrases: ${PROMPT_BANNED.join(", ")}.`,
    'Do not end with a moral, a slogan or a summary. End with one short, specific question the reader can answer from their own experience (either/or questions work well), or simply stop on the last concrete detail. Never "What do you think?", "Agree?" or "Thoughts?".',
    'No sales pitch, no links, no "follow me", no "repost".',
  ];
  if (words) rules.push(`Length: about ${words[0]} to ${words[1]} words.`);
  rules.push(`Write in ${languageName(ctx.language)}.`);
  return rules;
}

const numbered = (xs: string[]) => xs.map((x, i) => `${i + 1}. ${x}`).join("\n");

const AI_SOUNDING = [
  '- "It wasn\'t just a meeting. It was a turning point."',
  '- "Here\'s the thing: growth is a journey, not a destination."',
  '- "Fast. Simple. Effective."',
];

export function writerSystem(ctx: PromptContext): string {
  const first = firstName(ctx.author.name);
  return [
    `You are a LinkedIn ghostwriter for ${ctx.author.name}. You turn real stories ${first} told you into posts written as ${first}, in first person.`,
    "You never invent facts. You write plain, specific, human sentences, the way the author talks.",
    "When you write a post you output only the post text: no title, no preface, no notes, no quotation marks around it.",
  ].join(" ");
}

/** The notes and the author's own posts, each in its own acknowledged turn. */
function contextTurns(ctx: PromptContext, maxExamples: number, exampleChars: number): PromptMessage[] {
  const turns: PromptMessage[] = [
    {
      role: "user",
      content: [
        "Here are my notes about a real moment from my work. In a moment I'll ask you for a LinkedIn post built on them.",
        "",
        L.notesOpen,
        storyBlock(ctx),
        L.notesClose,
        "",
        L.about,
        aboutBlock(ctx),
      ].join("\n"),
    },
    { role: "assistant", content: "Thanks. I'll use only the facts in your notes and retell them in fresh sentences instead of copying the notes." },
  ];
  const ex = ctx.examples.map((e) => e.trim()).filter(Boolean).slice(0, maxExamples);
  if (ex.length) {
    turns.push(
      {
        role: "user",
        content: [
          "Here are posts I wrote myself. Study the tone, rhythm, sentence length, paragraph length and formatting. Don't reuse what they are about.",
          "",
          ...ex.map((e, i) => `<example ${i + 1}>\n${clip(e, exampleChars)}\n</example ${i + 1}>`),
        ].join("\n"),
      },
      { role: "assistant", content: "Got it. I'll write the way you write, without borrowing anything from those posts." },
    );
  }
  return turns;
}

/* ------------------------------------------------------------------ */
/* Angles                                                              */
/* ------------------------------------------------------------------ */

export function anglesPrompt(ctx: PromptContext, recommended: StructureId[]): Prompt {
  const audience = ctx.strategy?.audience.who || "my audience";
  const structures = STRUCTURES.map((s) => `- ${s.id}: ${s.name}. Use when: ${s.whenToUse}`).join("\n");
  const hookTypes = HOOK_TYPES.map((h) => `- ${h}: ${HOOK_TYPE_LABELS[h].hint}`).join("\n");
  const user = [
    L.about,
    aboutBlock(ctx),
    "",
    "My notes (the only facts you may use):",
    L.notesOpen,
    storyBlock(ctx),
    L.notesClose,
    "",
    "Post structures:",
    structures,
    `Good fits for this story: ${recommended.slice(0, 3).join(", ")}.`,
    "",
    "Hook types:",
    hookTypes,
    "",
    "Task: suggest 3 different angles for one LinkedIn post built on my notes.",
    numbered([
      "hook: the first line of the post. One concrete sentence under 140 characters that drops the reader into the moment, using a real detail from my notes. Not a summary of the story. No question, no emojis, no hashtags, no em dashes.",
      "hookType: one of the hook types above. Use a different hook type for each angle.",
      "structureId: the structure that fits this angle best (one of the ids above).",
      `takeaway: the one thing ${audience} should take away, in plain words, at most 20 words.`,
      `whyItWorks: one short sentence on why this angle will land with ${audience}.`,
      `Use only facts from my notes. Write in ${languageName(ctx.language)}.`,
    ]),
  ].join("\n");
  return {
    system: `You plan LinkedIn posts for ${ctx.author.name}. You find the most interesting, honest way to tell a real story to a specific audience. You never invent facts.`,
    messages: [{ role: "user", content: user }],
  };
}

/* ------------------------------------------------------------------ */
/* Draft                                                               */
/* ------------------------------------------------------------------ */

export function draftPrompt(ctx: PromptContext, angle: Angle | null, structureId: StructureId): Prompt {
  const structure = getStructure(structureId) ?? STRUCTURES[0];
  const task: string[] = ["Now write the post."];
  if (angle?.hook) task.push("", `${L.firstLine} "${angle.hook.replace(/^["“]|["”]$/g, "")}"`);
  if (angle?.takeaway) task.push(`${L.point} ${angle.takeaway}`);
  task.push("", `${L.structure} (${structure.name}). Write one short paragraph for each step:`, numbered(structure.skeleton));
  task.push("", L.voice, voiceSection(ctx));
  task.push("", L.aiSounding, ...AI_SOUNDING);
  task.push("", L.rules, numbered(writingRules(ctx, structure)));
  task.push("", "Write the post now. Output only the post text.");
  return { system: writerSystem(ctx), messages: [...contextTurns(ctx, 3, 1200), { role: "user", content: task.join("\n") }] };
}

/* ------------------------------------------------------------------ */
/* Revise                                                              */
/* ------------------------------------------------------------------ */

export const REVISE_PRESETS = [
  { id: "shorter", label: "Shorter", instruction: "Cut it to about two thirds of its length. Keep the hook, the key moment and the ending. Remove repetition and warm-up sentences." },
  {
    id: "specific",
    label: "More specific",
    instruction: "Replace every vague phrase with a concrete detail from my notes: numbers, names, places, times, exact words. Do not add anything that is not in my notes.",
  },
  { id: "warmer", label: "Warmer", instruction: "Make it warmer and more personal: show what I felt and thought in the moment, using only what is in my notes. Keep it understated, no gushing." },
  {
    id: "hook",
    label: "Punchier hook",
    instruction:
      "Rewrite only the first line so it is concrete and makes people want to read on: a scene, a number or something someone said, taken from my notes. Under 140 characters. Keep the rest of the post exactly the same.",
  },
  {
    id: "rough",
    label: "Less polished",
    instruction: "Make it sound like I talk: plainer words, contractions, a few short fragments, less symmetry. Remove anything that sounds like a press release or a slogan.",
  },
  {
    id: "question",
    label: "Add a question at the end",
    instruction: 'End with one short, specific question readers can answer from their own experience (an either/or question works well). Not "What do you think?" or "Agree?".',
  },
  { id: "nolist", label: "Remove list", instruction: "Turn any numbered or bulleted list into normal paragraphs. Keep every fact." },
  { id: "cta", label: "Soft call to action", instruction: "Add one short, low-key last line that mentions: {cta}. No hard sell, no link." },
] as const;
export type RevisePresetId = (typeof REVISE_PRESETS)[number]["id"];

export function presetInstruction(id: RevisePresetId, strategy: Strategy | null): string | null {
  const p = REVISE_PRESETS.find((x) => x.id === id);
  if (!p) return null;
  if (p.id === "cta") return strategy?.cta ? p.instruction.replace("{cta}", strategy.cta) : null;
  return p.instruction;
}

/** Whether the requested changes ask to get rid of a list ("Remove list", "turn the list into prose"). */
function asksToRemoveList(changes: string[]): boolean {
  return changes.some((c) => /\b(?:remove|drop|cut|no|without|get rid of|turn)\b[^.\n]{0,40}\blists?\b/i.test(c));
}

export function revisePrompt(ctx: PromptContext, body: string, changes: string[]): Prompt {
  const keepList = hasNumberedList(body) && !asksToRemoveList(changes);
  const task = [
    "Here is the current post:",
    L.postOpen,
    body.trim(),
    L.postClose,
    "",
    L.changes,
    numbered(changes),
    "",
    "Keep everything else that already works: the facts, my voice, the shape.",
    "",
    L.voice,
    voiceSection(ctx),
    "",
    L.rules,
    numbered(writingRules(ctx, null, { keepList })),
    "",
    "Write the new version now. Output only the post text.",
  ];
  return { system: writerSystem(ctx), messages: [...contextTurns(ctx, 2, 900), { role: "user", content: task.join("\n") }] };
}

/** Turn lint findings into concrete edit instructions for the writer. Info-level hits are skipped. */
export function instructionsFromLint(issues: LintIssue[]): string[] {
  const by = new Map<string, LintIssue[]>();
  for (const i of issues) {
    if (i.severity === "info") continue;
    by.set(i.rule, [...(by.get(i.rule) ?? []), i]);
  }
  const quote = (xs: LintIssue[], n = 6) => [...new Set(xs.map((x) => x.match?.trim()).filter(Boolean) as string[])].slice(0, n).map((m) => `"${clip(m, 80)}"`).join(", ");
  const out: string[] = [];
  const phrases = [...(by.get("ai-phrase") ?? []), ...(by.get("filler-phrase") ?? []), ...(by.get("never-say") ?? []), ...(by.get("humblebrag") ?? []), ...(by.get("chatbot") ?? []), ...(by.get("staged-runup") ?? [])];
  if (phrases.length) out.push(`Replace these with plain words, or cut them: ${quote(phrases, 10)}.`);
  if (by.has("copied-notes")) out.push("Don't paste my notes. Start with a one-line hook, then retell the moment in new sentences, following a clear shape: the moment, what was at stake, what changed, what I learned.");
  if (by.has("em-dash")) out.push("Remove every em dash and en dash. Use a period or a comma instead.");
  if (by.has("negative-parallelism")) out.push(`Rewrite as direct statements (no "it's not X, it's Y"): ${quote(by.get("negative-parallelism")!)}.`);
  if (by.has("triplet")) out.push("Break up the lists of three and the clipped three-word sentences. Keep at most one list of three.");
  if (by.has("staircase")) out.push("Join one-line paragraphs into paragraphs of 2 to 3 sentences.");
  if (by.has("emoji") || by.has("emoji-bullet")) out.push("Remove the emojis.");
  if (by.has("hashtags")) out.push("Remove the extra hashtags. Keep hashtags only if I normally use them, at the end.");
  if (by.has("hook-length")) out.push("Make the first line one short sentence under 140 characters, then start a new paragraph.");
  if (by.has("question-hook")) out.push("Make the first line a concrete statement from the story, not a question.");
  if (by.has("cliche-opener")) out.push("Start inside the moment instead of with a stock opener.");
  for (const l of by.get("length") ?? []) out.push(/LinkedIn stops/.test(l.message) ? "Cut it to under 2,800 characters." : "Make it longer by adding concrete details from my notes. Do not invent anything.");
  if (by.has("link")) out.push("Remove the link.");
  if (by.has("exclamation")) out.push("Use at most one exclamation mark.");
  if (by.has("markdown") || by.has("unicode-styling")) out.push("Plain text only: no bold, no markdown symbols.");
  if (by.has("ing-rider")) out.push(`End these sentences earlier, without the explaining "-ing" clause: ${quote(by.get("ing-rider")!)}.`);
  if (by.has("vague-attribution")) out.push('Remove "studies show"-style claims, or say what I saw myself.');
  if (by.has("repeated-openers")) out.push("Vary how sentences start.");
  if (by.has("hedge-stack")) out.push('Remove stacked hedges like "could potentially".');
  if (by.has("generic-moral")) out.push("Replace the moral at the end with a concrete detail or a specific question.");
  if (by.has("generic-cta") || by.has("engagement-bait")) out.push("Replace the closing line with a specific question tied to the story, or end on the last concrete detail. No bait.");
  if (by.has("unverified-number")) out.push(`These numbers are not in my notes. Remove them or use the real ones from my notes: ${quote(by.get("unverified-number")!)}.`);
  if (by.has("unverified-quote")) out.push(`Remove quotes that are not word for word in my notes: ${quote(by.get("unverified-quote")!, 3)}.`);
  if (by.has("mentions")) out.push("Tag only the people who are in the story.");
  return out;
}

export function instructionsFromCritique(c: Critique): string[] {
  const out: string[] = [];
  for (const issue of c.issues.slice(0, 5)) {
    if (/^invented\b/i.test(issue.trim())) out.push(`Remove this invented detail: ${issue.replace(/^invented\s*:?\s*/i, "")}`);
  }
  out.push(...c.suggestions.map((s) => s.trim()).filter(Boolean).slice(0, 4));
  return out;
}

/* ------------------------------------------------------------------ */
/* Critique                                                            */
/* ------------------------------------------------------------------ */

export function critiquePrompt(ctx: PromptContext, body: string, lint: LintIssue[]): Prompt {
  const found = lint.filter((i) => i.severity !== "info").slice(0, 12);
  const ex = ctx.examples.map((e) => e.trim()).filter(Boolean)[0];
  const parts = [
    "The author's notes (the facts the post may use):",
    L.notesOpen,
    storyBlock(ctx),
    L.notesClose,
    "",
    "How the author writes:",
    voiceSection(ctx),
  ];
  if (ex) parts.push("", "One post the author wrote:", `<example>\n${clip(ex, 900)}\n</example>`);
  parts.push("", "Automatic checks found:", found.length ? found.map((i) => `- ${i.message}`).join("\n") : "- nothing", "");
  parts.push("The draft:", L.postOpen, body.trim(), L.postClose, "");
  parts.push(
    "Task: score the draft from 1 to 10 on each:",
    numbered([
      'humanness: 10 = reads like a person talking, natural rhythm, no AI phrasing. 1 = obvious AI text (buzzwords, "it\'s not X, it\'s Y", slogans, a moral at the end).',
      "specificity: 10 = several concrete details from the notes (numbers, names, places, exact words). 1 = vague, could be anyone's post.",
      "voiceMatch: 10 = sounds exactly like the author's own posts. 1 = generic LinkedIn voice.",
      'hook: 10 = the first line is short, specific and makes you want to tap "see more". 1 = generic, a cliché, or a long block of text.',
    ]),
    "Be strict: a typical LinkedIn post scores 5. Give 8 or more only when it is genuinely good. Lower humanness by 1 for each automatic check above.",
    "If the draft mostly repeats the notes sentence by sentence, without a short hook and a clear shape, give hook and humanness 4 or less.",
    'issues: up to 5 problems. Quote the exact words in quotes, then say what is wrong. Numbers and quotes were already checked automatically; write Invented: "<the words>" only for a fact that is clearly not in the notes.',
    'suggestions: up to 4 specific edits, one sentence each, saying what to change and how, e.g. Replace "a lot of money" with the real amount from the notes. Every edit must make the post plainer, more specific or more like the author. Never suggest more formal or more polished wording.',
  );
  return {
    system: "You are a strict LinkedIn editor. You check a ghostwritten draft against the real notes and the author's voice. You are honest, specific and brief.",
    messages: [{ role: "user", content: parts.join("\n") }],
  };
}

/* ------------------------------------------------------------------ */
/* Hook alternatives                                                   */
/* ------------------------------------------------------------------ */

export function hooksPrompt(ctx: PromptContext, body: string): Prompt {
  const hookTypes = HOOK_TYPES.map((h) => `- ${h}: ${HOOK_TYPE_LABELS[h].hint}`).join("\n");
  const task = [
    "Here is my current post:",
    L.postOpen,
    body.trim(),
    L.postClose,
    "",
    "Hook types:",
    hookTypes,
    "",
    "Task: write 5 alternative first lines (hooks) for this post.",
    numbered([
      'Each hook is one sentence under 140 characters that makes a reader tap "see more".',
      "Each uses a real detail from my notes. Do not invent anything.",
      "Use a different hook type for each.",
      "No questions, no emojis, no hashtags, no em dashes, no clichés.",
      `Write in ${languageName(ctx.language)}, in first person, the way I talk.`,
    ]),
  ].join("\n");
  return { system: writerSystem(ctx), messages: [...contextTurns(ctx, 1, 700), { role: "user", content: task }] };
}
