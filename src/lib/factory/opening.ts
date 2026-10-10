/**
 * Keeping the first line short. Pure and unit-tested.
 *
 * LinkedIn shows about 210 characters before "…see more", so line 1 has to land on its own.
 * Small models rewriting a post sometimes glue the hook to the next paragraph (a 300-character
 * opening). These helpers undo that without another model call when they can: split the long
 * line after its first sentence(s), or put the previous version's short first line back.
 */

import { HOOK_DESKTOP_CHARS } from "./lint";

type Opening = { index: number; line: string };

function opening(lines: string[]): Opening | null {
  const index = lines.findIndex((l) => l.trim());
  return index < 0 ? null : { index, line: lines[index].trim() };
}

/** Length of the first non-empty line. */
export function firstLineLength(text: string): number {
  return opening(text.split("\n"))?.line.length ?? 0;
}

export function openingTooLong(text: string, limit = HOOK_DESKTOP_CHARS): boolean {
  return firstLineLength(text) > limit;
}

/**
 * Sentences of one line, keeping their punctuation. A boundary is . ! ? … (plus closing quotes)
 * followed by a space and a capital, a digit or an opening quote, so "8 a.m. with Marta" and
 * "1.5x" stay whole.
 */
export function lineSentences(line: string): string[] {
  const out: string[] = [];
  const re = /[.!?…]+["”’')\]]*\s+(?=[\p{Lu}\p{N}"“‘'¿¡])/gu;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const end = m.index + m[0].trimEnd().length;
    out.push(line.slice(start, end).trim());
    start = m.index + m[0].length;
  }
  const rest = line.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/**
 * Split an over-long first line after its opening sentence(s): as many whole sentences as fit
 * in `target` characters (at least one, if it fits under `limit`), then a blank line and the rest.
 * Null when the first line is already short or has no usable sentence break.
 */
export function splitOpening(text: string, target: number, limit = HOOK_DESKTOP_CHARS): string | null {
  const lines = text.split("\n");
  const first = opening(lines);
  if (!first || first.line.length <= limit) return null;
  const sentences = lineSentences(first.line);
  if (sentences.length < 2) return null;
  let take = 0;
  let len = 0;
  for (const s of sentences.slice(0, -1)) {
    const next = len ? len + 1 + s.length : s.length;
    if (next > target && take > 0) break;
    if (next > limit) break;
    take++;
    len = next;
  }
  if (take === 0) return null;
  const hook = sentences.slice(0, take).join(" ");
  const rest = sentences.slice(take).join(" ");
  lines.splice(first.index, 1, hook, "", rest);
  return lines.join("\n");
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * Put the previous version's first line back when the rewrite's first line runs past the fold
 * and the previous one didn't. The rewrite's long line stays as the next paragraph (minus the old
 * hook, if the model only glued it on), so no fact from the rewrite is lost.
 */
export function restoreOpening(text: string, before: string | null | undefined, limit = HOOK_DESKTOP_CHARS): string | null {
  if (!before) return null;
  const lines = text.split("\n");
  const first = opening(lines);
  const old = opening(before.split("\n"));
  if (!first || !old || first.line.length <= limit || old.line.length > limit) return null;
  let rest = first.line;
  const oldNorm = norm(old.line);
  if (oldNorm && norm(rest).startsWith(oldNorm)) {
    // The model glued the old hook onto the next paragraph: drop the duplicate words.
    const words = oldNorm.split(" ").length;
    const m = new RegExp(String.raw`^(?:[^\p{L}\p{N}]*[\p{L}\p{N}]+){${words}}[^\p{L}\p{N}]*`, "u").exec(rest);
    rest = m ? rest.slice(m[0].length).trim() : rest;
    if (rest) rest = rest[0].toUpperCase() + rest.slice(1);
  }
  lines.splice(first.index, 1, old.line, ...(rest ? ["", rest] : []));
  return lines.join("\n");
}
