/**
 * Clean raw model output into post text. Pure — the editor also runs it on the live stream so the
 * user never sees "Here's your post:" flash by.
 *
 * Small local models wrap answers in preambles, quotes, markdown and sign-offs. We strip what is
 * unambiguously wrapper and leave everything else to the linter (we never rewrite the user's words).
 */

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

  // Horizontal rules used as separators.
  t = t.replace(/^\s*(?:-{3,}|\*{3,}|_{3,}|={3,})\s*$/gm, "");

  // Markdown emphasis and headings (LinkedIn shows the symbols literally).
  t = t.replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/__([^_\n]+)__/g, "$1");
  t = t.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1$2");
  t = t.replace(/^#{1,6}\s+/gm, "");

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
