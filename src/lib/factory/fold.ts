/**
 * Where LinkedIn cuts a post with "…see more". Pure — used by the editor's fold line and the preview.
 *
 * LinkedIn doesn't publish the rule. Observed behaviour (research 02 §1.3, linkedinpreview.com):
 * the feed shows about 3 lines, capped at roughly 210 characters on desktop and 140 on mobile.
 * Line breaks count as lines, so an empty line between paragraphs uses one of the three.
 */

export type FoldMode = "desktop" | "mobile";

export const FOLD: Record<FoldMode, { maxChars: number; maxLines: number; charsPerLine: number }> = {
  desktop: { maxChars: 210, maxLines: 3, charsPerLine: 68 },
  mobile: { maxChars: 140, maxLines: 3, charsPerLine: 40 },
};

/** Back off to the previous word boundary so we never cut mid-word. */
function backToWord(text: string, idx: number): number {
  if (idx >= text.length) return text.length;
  if (/\s/.test(text[idx] ?? "")) return idx;
  const space = text.lastIndexOf(" ", idx);
  const nl = text.lastIndexOf("\n", idx);
  const b = Math.max(space, nl);
  return b > 0 ? b : idx;
}

/**
 * Index in `text` where the "…see more" cut happens, or null when the whole post is visible.
 * Trailing whitespace before the cut is trimmed so the ellipsis sits right after the last word.
 */
export function foldIndex(text: string, mode: FoldMode = "desktop"): number | null {
  const { maxChars, maxLines, charsPerLine } = FOLD[mode];
  const body = text.replace(/\s+$/, "");
  if (!body) return null;
  const lines = body.split("\n");
  let pos = 0;
  let used = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const visual = Math.max(1, Math.ceil(line.length / charsPerLine));
    if (used + visual > maxLines) {
      // This line only partly fits: cut after the remaining visual lines' worth of characters.
      const room = (maxLines - used) * charsPerLine;
      const cut = Math.min(pos + room, maxChars);
      return trimEnd(body, backToWord(body, cut));
    }
    used += visual;
    const end = pos + line.length;
    if (end > maxChars) return trimEnd(body, backToWord(body, maxChars));
    pos = end + 1; // the newline
    if (used === maxLines && i < lines.length - 1) return trimEnd(body, end);
  }
  return null;
}

function trimEnd(text: string, idx: number): number | null {
  let i = Math.min(idx, text.length);
  while (i > 0 && /\s/.test(text[i - 1])) i--;
  return i >= text.replace(/\s+$/, "").length ? null : i;
}

/** The part of the post a reader sees before tapping "see more". */
export function aboveFold(text: string, mode: FoldMode = "desktop"): { visible: string; truncated: boolean } {
  const idx = foldIndex(text, mode);
  if (idx === null) return { visible: text.replace(/\s+$/, ""), truncated: false };
  return { visible: text.slice(0, idx), truncated: true };
}
