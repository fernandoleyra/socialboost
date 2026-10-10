/**
 * Import parsers for the voice corpus. Pure (runs in the browser for the import preview
 * and on the server for the actual import), unit-tested.
 *
 *  - parsePastedPosts: free text pasted from LinkedIn or a doc, split into posts, UI junk removed
 *  - parseSharesCsv:   Shares.csv from LinkedIn's "Get a copy of your data" export
 *  - parseHelperJson:  JSON from the browser helper ([{text, url, postedAt, reactions, …}])
 */
import Papa from "papaparse";
import { normalizeHashtags, normalizeLittleText, normalizeText, tidyBlankLines, wordCount } from "./text";

export type ParsedPost = {
  text: string;
  url?: string;
  postedAt?: string | null;
  impressions?: number | null;
  reactions?: number | null;
  comments?: number | null;
  reposts?: number | null;
  /** The text ends where LinkedIn cut it ("…see more"), so part of the post is missing. */
  truncated?: boolean;
};

export type ParseResult = { posts: ParsedPost[]; skipped: number; warnings: string[] };

export class ImportFormatError extends Error {
  constructor(
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = "ImportFormatError";
  }
}

/** Same floor as the repository: shorter texts teach nothing about voice. */
export const MIN_POST_CHARS = 40;

/* ------------------------------------------------------------------ */
/* Numbers & dates                                                     */
/* ------------------------------------------------------------------ */

/** "1,234" → 1234, "1.234" → 1234, "1.2K" → 1200, "12 comments" → 12. Null when there's no number. */
export function parseCount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  if (typeof value !== "string") return null;
  const m = value.replace(/\s/g, "").match(/(\d[\d.,]*)([kKmM]|tsd\.?|mil)?/);
  if (!m) return null;
  const [, num, suffix] = m;
  if (suffix) {
    const n = parseFloat(num.replace(",", "."));
    if (!Number.isFinite(n)) return null;
    return Math.round(n * (/^m$/i.test(suffix) ? 1_000_000 : 1_000));
  }
  const n = parseInt(num.replace(/[.,]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

/** Dates as LinkedIn exports write them ("2025-01-03 10:00:00 UTC", "2024-05-12 08:15:31") or anything Date can read. */
export function parseExportDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const v = value.trim();
  // "2025-01-03 10:00:00 UTC" has no ISO "T" and no offset; it's UTC. Anything with a T/offset goes to Date.
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?(?:\s*UTC)?$/i);
  if (m) {
    const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
    const t = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/* ------------------------------------------------------------------ */
/* LinkedIn UI junk                                                    */
/* ------------------------------------------------------------------ */

const SEE_MORE = String.raw`(?:see more|more|see less|show more|show less|mehr anzeigen|weniger anzeigen|mehr|ver más|ver menos|voir plus|voir moins|ver mais|mostrar mais|altro|mostra meno)`;
const SEE_MORE_LINE = new RegExp(String.raw`^(?:…|\.\.\.)?\s*${SEE_MORE}$`, "i");
const SEE_MORE_TAIL = new RegExp(String.raw`\s*(?:…|\.\.\.)\s*${SEE_MORE}\s*$`, "i");
/** A "…see more" button line left in a copied post means LinkedIn cut the text there. */
const CUT_MARKER_LINE = /^(?:…|\.\.\.)?\s*(?:see more|more|show more|mehr anzeigen|ver más|voir plus|ver mais|altro)$/i;

const ACTIONS = "like|comment|repost|send|share|reply|react|gefällt mir|kommentieren|teilen|senden|recomendar|comentar|compartir|enviar|j[’']aime|commenter|republier|partager|envoyer|gostei|compartilhar|consiglia|commenta|diffondi|invia";
const ACTION_LINE = new RegExp(`^(?:(?:${ACTIONS})\\s*){1,4}$`, "i");
const COUNT_WORDS =
  "comments?|reposts?|reactions?|likes?|impressions?|views?|shares?|kommentare?|reaktionen|impressionen|comentarios?|reacciones|compartidos?|commentaires?|réactions|partages?|comentários?|reações|commenti|reazioni|diffusioni";
const COUNT_LINE = new RegExp(`^(?:[\\d.,]+\\s*[kKmM]?\\s+(?:${COUNT_WORDS})(?:\\s*[·•,]\\s*)?)+$`, "i");
const TIME_AGO_LINE = /^[•·]?\s*\d{1,3}\s?(?:s|m|h|d|w|mo|yr|y|min|hr|std|tg|sem|j|g)\.?\s*(?:[•·]\s*(?:edited|bearbeitet|editado|modifié|modificato)?\s*)*(?:\p{Extended_Pictographic}️?)?\s*$/iu;
const OTHERS_LINE = /^.{1,80}\s+(?:and|und|y|et|e)\s+[\d.,]+\s*[kKmM]?\s+(?:others?|weitere|otras? personas|autres?|outras? pessoas|altri)$/i;
/** Reaction counts show up as bare numbers right above the action bar; only trusted near the end of a chunk. */
const BARE_NUMBER_LINE = /^[\d.,\s]+[kKmM]?$/;
const JUNK_LINES = [
  /^[•·]\s*(?:you|1st|2nd|3rd\+?|follow|following|edited|du|tú|vous|você|tu)$/i,
  /^(?:edited|bearbeitet|editado|modifié|modificato|promoted|gesponsert|promocionado|sponsorisé|patrocinado|sponsorizzato)$/i,
  /^\+?\s*(?:follow|following|connect|folgen|seguir|suivre|segui)$/i,
  /^visible to anyone on or off linkedin$/i,
  /^(?:view analytics|analytics|view post analytics|boost|boost post|repost successful)$/i,
  /^feed post(?: number \d+)?$/i,
  /^activate to view larger image,?$/i,
  /^no alternative text description for this image$/i,
  /^(?:show|see) (?:translation|original)$/i,
  /^(?:like\s*·\s*reply|load more comments|most relevant|most recent|add a comment…?|open emoji keyboard|report this post|copy link to post)$/i,
  /^(?:verified|premium|author|creator|top voice)$/i,
  /^(?:play|pause|unmute|mute|loaded: [\d.]+%|media player modal window)$/i,
  /^(?:your document has finished loading|document|pdf)$/i,
];

const HEADER_END = new RegExp(`${TIME_AGO_LINE.source}|^[•·]\\s*(?:you|1st|2nd|3rd\\+?)$|^visible to anyone`, "iu");

function isJunkLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  return SEE_MORE_LINE.test(t) || ACTION_LINE.test(t) || COUNT_LINE.test(t) || TIME_AGO_LINE.test(t) || OTHERS_LINE.test(t) || JUNK_LINES.some((re) => re.test(t));
}

/**
 * Clean one post: strip LinkedIn UI lines (action bars, counts, "…see more", "1w •"), header lines
 * matching the author's name/headline, normalize hashtags, tidy blank lines. Hashtag-only lines stay:
 * they're part of how the person writes.
 */
export function cleanPostText(raw: string, opts: { headerLines?: string[] } = {}): { text: string; truncated: boolean } {
  let text = normalizeHashtags(normalizeText(raw));
  let truncated = false;
  if (SEE_MORE_TAIL.test(text)) {
    text = text.replace(SEE_MORE_TAIL, "");
    truncated = true;
  }
  const header = (opts.headerLines ?? []).map((h) => h.trim().toLowerCase()).filter((h) => h.length >= 2);
  const lines = text.split("\n");
  if (lines.some((l) => CUT_MARKER_LINE.test(l.trim()))) truncated = true;
  // A post copied from the feed starts with the author block (name, "• You", headline, "1w •").
  // It always ends on the time/visibility line, so drop everything up to the last such line.
  let start = 0;
  const head = lines.slice(0, 8);
  for (let i = head.length - 1; i >= 0; i--) {
    if (HEADER_END.test(head[i].trim()) && head.slice(0, i).every((l) => l.trim().length < 120)) {
      start = i + 1;
      break;
    }
  }
  while (start < lines.length && start < 10) {
    const t = lines[start].trim().toLowerCase();
    if (!t || isJunkLine(t) || header.some((h) => t === h || t.startsWith(h + " •") || t.startsWith(h + " ·"))) start++;
    else break;
  }
  const kept = lines.slice(start).filter((l) => !isJunkLine(l));
  // Reaction counts trail the post as bare numbers; numbers inside the post stay.
  while (kept.length && (!kept[kept.length - 1].trim() || BARE_NUMBER_LINE.test(kept[kept.length - 1].trim()))) kept.pop();
  return { text: tidyBlankLines(kept.join("\n")), truncated };
}

/* ------------------------------------------------------------------ */
/* Pasted text                                                         */
/* ------------------------------------------------------------------ */

const SEPARATOR_LINE = /^\s*(?:-{3,}|\*{3,}|={3,}|_{3,}|—{2,}|(?:\*\s*){3,})\s*$/;
/** Splitting on 2+ blank lines only kicks in for long pastes, so one post with airy paragraphs stays whole. */
const LONG_PASTE_CHARS = 1200;

function splitChunks(text: string): string[] {
  const lines = text.split("\n");
  if (lines.some((l) => SEPARATOR_LINE.test(l))) {
    const chunks: string[][] = [[]];
    for (const l of lines) {
      if (SEPARATOR_LINE.test(l)) chunks.push([]);
      else chunks[chunks.length - 1].push(l);
    }
    return chunks.map((c) => c.join("\n"));
  }
  // A copy of the feed: every post ends with its action bar ("Like Comment Repost Send").
  const isAction = (l: string) => ACTION_LINE.test(l.trim());
  const actionBars = lines.filter((l, i) => isAction(l) && !isAction(lines[i + 1] ?? "")).length;
  if (actionBars >= 2) {
    const chunks: string[][] = [[]];
    lines.forEach((l, i) => {
      if (isAction(l)) {
        if (!isAction(lines[i + 1] ?? "")) chunks.push([]);
      } else chunks[chunks.length - 1].push(l);
    });
    return chunks.map((c) => c.join("\n"));
  }
  if (text.length > LONG_PASTE_CHARS && /\n[ \t]*\n[ \t]*\n/.test(text)) return text.split(/\n(?:[ \t]*\n){2,}/);
  return [text];
}

function finish(found: ParsedPost[], skippedBefore = 0): ParseResult {
  const seen = new Set<string>();
  const posts: ParsedPost[] = [];
  let skipped = skippedBefore;
  for (const post of found) {
    const key = post.text.replace(/\s+/g, " ").trim().toLowerCase();
    if (post.text.length < MIN_POST_CHARS || wordCount(post.text) < 5 || seen.has(key)) {
      if (post.text.trim()) skipped++;
      continue;
    }
    seen.add(key);
    posts.push(post);
  }
  const warnings: string[] = [];
  const cut = posts.filter((p) => p.truncated).length;
  if (cut) {
    warnings.push(
      `${cut} ${cut === 1 ? "post looks" : "posts look"} cut off at "…see more". Click "see more" on LinkedIn before copying, or the writer only learns from the first lines.`,
    );
  }
  return { posts, skipped, warnings };
}

export function parsePastedPosts(raw: string, opts: { headerLines?: string[] } = {}): ParseResult {
  const text = normalizeHashtags(normalizeText(raw));
  const posts = splitChunks(text).map((c): ParsedPost => {
    const { text: cleaned, truncated } = cleanPostText(c, opts);
    return { text: cleaned, ...(truncated ? { truncated } : {}) };
  });
  return finish(posts);
}

/* ------------------------------------------------------------------ */
/* Shares.csv                                                          */
/* ------------------------------------------------------------------ */

const normHeader = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const SHARES_ALIASES = {
  date: ["date", "sharedate", "createdat", "publishedat"],
  link: ["sharelink", "shareurl", "sharepermalink", "postlink", "permalink", "postlinkurl"],
  text: ["sharecommentary", "commentary", "sharetext", "posttext"],
} as const;

/** Some exports double-escape quotes inside the commentary (`""word""`). Undo that only when no single quote char is left. */
function undoubleQuotes(text: string): string {
  return /""/.test(text) && !/(?<!")"(?!")/.test(text) ? text.replace(/""/g, '"') : text;
}

export function parseSharesCsv(csv: string): ParseResult {
  const input = normalizeText(csv);
  if (!input.trim()) throw new ImportFormatError("The file is empty.");
  if (input.startsWith("PK")) throw new ImportFormatError("That's a ZIP archive, not a CSV.", "Unzip the LinkedIn export and choose the Shares.csv file inside it.");
  const parsed = Papa.parse<string[]>(input, { header: false, skipEmptyLines: "greedy" });
  const rows = parsed.data.filter((r) => Array.isArray(r));
  if (rows.length === 0) throw new ImportFormatError("No rows found in that file.");
  const header = rows[0].map(normHeader);
  const idx = Object.fromEntries(
    Object.entries(SHARES_ALIASES).map(([role, aliases]) => [role, header.findIndex((h) => (aliases as readonly string[]).includes(h))]),
  ) as Record<keyof typeof SHARES_ALIASES, number>;
  if (idx.text < 0) {
    throw new ImportFormatError(
      `This doesn't look like Shares.csv: there's no ShareCommentary column (found: ${rows[0].slice(0, 8).join(", ") || "nothing"}).`,
      "In the LinkedIn export, pick the file called Shares.csv. Comments.csv and Connections.csv won't work here.",
    );
  }
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  let skipped = 0;
  const posts: ParsedPost[] = [];
  for (const r of rows.slice(1)) {
    const raw = cell(r, idx.text);
    if (!raw) {
      // Bare reposts have no commentary: nothing in the person's own words.
      skipped++;
      continue;
    }
    const text = tidyBlankLines(normalizeLittleText(undoubleQuotes(raw)));
    const url = cell(r, idx.link);
    posts.push({ text, ...(url ? { url } : {}), postedAt: parseExportDate(cell(r, idx.date)) });
  }
  if (posts.length === 0 && skipped > 0) {
    throw new ImportFormatError("Every row in that file is a repost without your own words.", "Write a few posts of your own first, or paste posts you wrote elsewhere.");
  }
  return finish(posts, skipped);
}

/* ------------------------------------------------------------------ */
/* Browser helper JSON                                                 */
/* ------------------------------------------------------------------ */

type HelperItem = Record<string, unknown>;

export function parseHelperJson(raw: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw.trim());
  } catch {
    throw new ImportFormatError("That isn't valid JSON.", "Run the browser helper again and use its Copy button, then paste here without changing anything.");
  }
  const list = Array.isArray(data) ? data : data && typeof data === "object" && Array.isArray((data as { posts?: unknown }).posts) ? (data as { posts: unknown[] }).posts : null;
  if (!list) throw new ImportFormatError("Expected a list of posts.", "Paste exactly what the browser helper copied: it starts with [ and ends with ].");
  if (list.length > 5000) throw new ImportFormatError("That's more than 5,000 posts. Import them in smaller batches.");
  let skipped = 0;
  const posts: ParsedPost[] = [];
  for (const it of list as HelperItem[]) {
    const rawText = typeof it?.text === "string" ? it.text : typeof it?.commentary === "string" ? it.commentary : "";
    if (!rawText.trim()) {
      skipped++;
      continue;
    }
    const { text, truncated } = cleanPostText(rawText);
    const url = typeof it.url === "string" && /^https?:\/\//.test(it.url) ? it.url : undefined;
    posts.push({
      text,
      ...(url ? { url } : {}),
      postedAt: parseExportDate(it.postedAt ?? it.date),
      impressions: parseCount(it.impressions),
      reactions: parseCount(it.reactions),
      comments: parseCount(it.comments),
      reposts: parseCount(it.reposts),
      ...(truncated ? { truncated } : {}),
    });
  }
  return finish(posts, skipped);
}

/** Dispatch on the import format. Throws ImportFormatError with a user-facing message. */
export function parseImport(format: "text" | "csv" | "json", content: string, opts: { headerLines?: string[] } = {}): ParseResult {
  if (format === "csv") return parseSharesCsv(content);
  if (format === "json") return parseHelperJson(content);
  return parsePastedPosts(content, opts);
}
