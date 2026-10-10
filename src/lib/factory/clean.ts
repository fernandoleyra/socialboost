/**
 * Clean raw model output into post text. Pure — the editor also runs it on the live stream so the
 * user never sees "Here's your post:" flash by.
 *
 * Small local models wrap answers in preambles, quotes, markdown and sign-offs. We strip what is
 * unambiguously wrapper and leave everything else to the linter (we never rewrite the user's words).
 */

import { ALL_LABELS, L, LIST_LABELS } from "./labels";

const PREAMBLE = [
  /^(?:sure|okay|ok|certainly|absolutely|of course|great|alright)[!,.]?\s+(?:here(?:'s| is)\b[^\n]*)?\n+/i,
  /^here(?:'s| is| are)\s+(?:a|an|the|your|my)\s+[^\n]{0,60}?\b(?:post|posts|draft|version|rewrite|revision|text)\b[^\n]{0,60}?:[ \t]*\n+/i,
  /^(?:revised|rewritten|updated|final|new)\s+(?:post|version|draft)\s*:[ \t]*\n*/i,
  /^(?:post|linkedin post|draft)\s*:[ \t]*\n*/i,
];

const SIGNOFF = [
  /\n+(?:---+\s*\n+)?(?:let me know if you(?:'d| would)? (?:like|want|need) (?:me|any|changes|a |another|it)|i hope (?:this|you) (?:helps|works|like)|feel free to (?:adjust|edit|tweak|change)|would you like (?:me|any)|if you(?:'d| would) like (?:me|any|a)|this (?:version|draft|rewrite|revision) (?:keeps|uses|follows|is|has|removes|cuts)|changes made\s*:|what i changed\s*:|\(?word count)[\s\S]*$/i,
  /\n+---+\s*\n+(?:notes?|changes|explanation|why this works)\s*:[\s\S]*$/i,
  /\n+\*{0,2}(?:character|word) count\*{0,2}\s*:[\s\S]*$/i,
];

/**
 * Remove an echo of our own prompt: lines that start with the section labels, plus the bullet
 * lists that follow list labels. Only when at least two different labels show up, so a single
 * legitimate "Details:" line in a real post survives.
 */
export function stripPromptEcho(text: string): string {
  const lines = text.split("\n");
  const hit = (l: string) => {
    const t = l.trim().toLowerCase();
    return ALL_LABELS.find((lab) => t.startsWith(lab.toLowerCase()));
  };
  const found = new Set(lines.map(hit).filter(Boolean));
  const tags = /^\s*<\/?(?:notes|post|example(?: \d+)?)>\s*$/i;
  if (found.size < 2 && !lines.some((l) => tags.test(l))) return text;
  const out: string[] = [];
  let dropList = false;
  for (const line of lines) {
    if (tags.test(line)) continue;
    const label = hit(line);
    if (label && found.size >= 2) {
      dropList = LIST_LABELS.includes(label);
      // "Title: The proxy fix" → drop; "What happened (…):" may carry text on the same line after it.
      const rest = line.trim().slice(label.length).trim();
      if (rest && label === L.happened) out.push(rest);
      continue;
    }
    if (dropList && /^\s*(?:[-•*]|\d{1,2}[.)])\s+/.test(line)) continue;
    dropList = false;
    out.push(line);
  }
  return out.join("\n");
}

/**
 * Step names from the structure skeletons ("Hook: …", "Close: …") that small models print in
 * front of paragraphs. Only removed when it is clearly an echo: the post opens with "Hook:", or
 * two different step names start lines. "Before:" / "After:" are left alone; people write those.
 */
const STEP_LABEL = /^[ \t]*(hook|tension|the turn|close|closing(?: line| question)?|promise(?: line)?|the evidence|evidence|my inside signal|the scene of the mistake|what changed after|the lesson|takeaway|call to action|cta|intro(?:duction)?|conclusion)[ \t]*:[ \t]*/i;

export function stripStepLabels(text: string): string {
  const lines = text.split("\n");
  const labels = lines.map((l) => STEP_LABEL.exec(l)?.[1].toLowerCase() ?? null);
  const firstContent = lines.findIndex((l) => l.trim());
  const opensWithHook = firstContent >= 0 && labels[firstContent] === "hook";
  if (!opensWithHook && new Set(labels.filter(Boolean)).size < 2) return text;
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (!labels[i]) return void out.push(line);
    const rest = line.replace(STEP_LABEL, "");
    if (rest.trim()) out.push(rest);
  });
  return out.join("\n");
}

/** Unicode "mathematical" bold/italic letters → plain letters (screen readers choke on them). */
export function stripUnicodeStyling(text: string): string {
  return text.replace(/[\u{1D400}-\u{1D7FF}]/gu, (ch) => ch.normalize("NFKC"));
}

export function cleanPost(raw: string): string {
  let t = raw.replace(/\r\n?/g, "\n");

  // Reasoning blocks (closed, or still open while streaming).
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<think>[\s\S]*$/i, "");
  t = t.trim();

  // Code fences around the whole thing.
  t = t.replace(/^```[a-z]*\s*\n([\s\S]*?)\n?```\s*$/i, "$1").trim();

  for (let pass = 0; pass < 2; pass++) for (const re of PREAMBLE) t = t.replace(re, "").trimStart();
  for (const re of SIGNOFF) t = t.replace(re, "");

  t = stripPromptEcho(t);

  // Horizontal rules used as separators.
  t = t.replace(/^\s*(?:-{3,}|\*{3,}|_{3,}|={3,})\s*$/gm, "");

  // Markdown emphasis and headings (LinkedIn shows the symbols literally).
  t = t.replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/__([^_\n]+)__/g, "$1");
  t = t.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1$2");
  t = t.replace(/^#{1,6}\s+/gm, "");

  t = stripStepLabels(t);
  t = stripUnicodeStyling(t);

  // Whole post wrapped in quotes.
  const trimmed = t.trim();
  if (/^["“].*["”]$/s.test(trimmed) && (trimmed.match(/["“”]/g) ?? []).length === 2) t = trimmed.slice(1, -1);

  // Whitespace: trailing spaces, at most one blank line between paragraphs.
  t = t
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return t.trim();
}

/** Plain-text post for the clipboard / LinkedIn composer. */
export function toClipboard(body: string): string {
  return body.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
