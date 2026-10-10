/**
 * LinkedIn API details that don't need the network or the database. Pure, unit-tested.
 * Source: research 05 (LinkedIn Developer Platform, state 2026-10).
 *
 *  - Posts API `commentary` uses the "little" text format: 15 reserved characters must be
 *    backslash-escaped or the post is silently cut at the first one (often a parenthesis).
 *  - Versioned REST calls need `LinkedIn-Version: YYYYMM` (202609 is the latest; versions live ~1 year).
 *  - Self-serve apps get 60-day tokens and no refresh token: reconnect by re-running OAuth.
 */

export const LINKEDIN_API_VERSION_DEFAULT = "202609";
export const LINKEDIN_SCOPES = ["openid", "profile", "w_member_social"] as const;
export const LINKEDIN_AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
export const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
export const LINKEDIN_API = "https://api.linkedin.com";
export const LINKEDIN_MAX_CHARS = 3000;
export const LINKEDIN_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/* ------------------------------------------------------------------ */
/* little text                                                         */
/* ------------------------------------------------------------------ */

const LITTLE_RESERVED = /[\\|{}@[\]()<>#*_~]/g;
const escapeChunk = (s: string) => s.replace(LITTLE_RESERVED, (c) => `\\${c}`);
/** "#word" at a word start stays a real hashtag. Must start with a letter so "#1" stays literal text. */
const HASHTAG = /(^|[\s(])#(\p{L}[\p{L}\p{N}]*)/gu;

/**
 * Escape plain post text for the Posts API `commentary` field. Keeps #hashtags clickable.
 * Do not JSON-escape here: JSON.stringify turns "\(" into "\\(" on the wire, which is correct.
 */
export function toLittleText(text: string, opts: { keepHashtags?: boolean } = {}): string {
  const normalized = text.replace(/\r\n?/g, "\n");
  if (opts.keepHashtags === false) return escapeChunk(normalized);
  let out = "";
  let last = 0;
  for (const m of normalized.matchAll(HASHTAG)) {
    const lead = m[1];
    const start = m.index! + lead.length;
    out += escapeChunk(normalized.slice(last, start)) + `#${m[2]}`;
    last = start + 1 + m[2].length;
  }
  return out + escapeChunk(normalized.slice(last));
}

/* ------------------------------------------------------------------ */
/* OAuth                                                               */
/* ------------------------------------------------------------------ */

/** Authorize URL. Built by hand so the space-delimited scope encodes as %20, as the docs ask. */
export function buildAuthorizeUrl(p: { clientId: string; redirectUri: string; state: string; scopes?: readonly string[] }): string {
  const q: [string, string][] = [
    ["response_type", "code"],
    ["client_id", p.clientId],
    ["redirect_uri", p.redirectUri],
    ["state", p.state],
    ["scope", (p.scopes ?? LINKEDIN_SCOPES).join(" ")],
  ];
  return `${LINKEDIN_AUTHORIZE_URL}?${q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}

export function personUrn(sub: string): string {
  return `urn:li:person:${sub}`;
}

export function isValidApiVersion(v: string): boolean {
  if (!/^\d{6}$/.test(v)) return false;
  const month = Number(v.slice(4));
  const year = Number(v.slice(0, 4));
  return month >= 1 && month <= 12 && year >= 2023;
}

/** Days left on a token and whether it's time to nudge a reconnect (T-7 days, research 05 §8). */
export function tokenStatus(expiresAt: string | null | undefined, now: Date = new Date()): { expired: boolean; daysLeft: number; expiringSoon: boolean } {
  const t = expiresAt ? Date.parse(expiresAt) : NaN;
  if (Number.isNaN(t)) return { expired: true, daysLeft: 0, expiringSoon: false };
  const msLeft = t - now.getTime();
  const daysLeft = Math.max(0, Math.floor(msLeft / 86_400_000));
  return { expired: msLeft <= 0, daysLeft, expiringSoon: msLeft > 0 && daysLeft < 7 };
}

/* ------------------------------------------------------------------ */
/* Posts                                                               */
/* ------------------------------------------------------------------ */

export type LinkedInPostBody = {
  author: string;
  commentary: string;
  visibility: "PUBLIC";
  distribution: { feedDistribution: "MAIN_FEED"; targetEntities: []; thirdPartyDistributionChannels: [] };
  content?: { media: { id: string; altText?: string } };
  lifecycleState: "PUBLISHED";
  isReshareDisabledByAuthor: false;
};

export function buildPostBody(p: { author: string; text: string; image?: { urn: string; altText?: string } | null }): LinkedInPostBody {
  const body: LinkedInPostBody = {
    author: p.author,
    commentary: toLittleText(p.text.trim()),
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (p.image) {
    const alt = p.image.altText?.trim();
    body.content = { media: { id: p.image.urn, ...(alt ? { altText: alt } : {}) } };
  }
  return body;
}

/** Public URL of a post from its URN (urn:li:share:… or urn:li:ugcPost:…). */
export function postUrlFromUrn(urn: string): string {
  return `https://www.linkedin.com/feed/update/${urn}/`;
}

/** Alt text for the photo: the user's note first, else the vision caption. Under 120 chars as LinkedIn recommends. */
export function altTextFor(photo: { caption?: string | null; userNote?: string | null } | null | undefined): string {
  const raw = (photo?.userNote?.trim() || photo?.caption?.trim() || "").replace(/\s+/g, " ");
  if (raw.length <= 120) return raw;
  const cut = raw.slice(0, 119);
  const space = cut.lastIndexOf(" ");
  return (space > 60 ? cut.slice(0, space) : cut).replace(/[,;:.\s]+$/, "") + "…";
}

/**
 * Numeric post ids found in a LinkedIn URL or URN. Share, ugcPost and activity ids can differ for
 * the same post, so callers match on any shared id.
 */
export function extractPostIds(value: string | null | undefined): string[] {
  if (!value) return [];
  let text = value;
  try {
    text = decodeURIComponent(value);
  } catch {
    /* keep raw */
  }
  const ids = new Set<string>();
  for (const m of text.matchAll(/(?:urn:li:(?:share|ugcPost|activity):|activity[-:]|ugcPost[-:]|share[-:])(\d{10,25})/gi)) ids.add(m[1]);
  return [...ids];
}

/** Accept only linkedin.com URLs for "mark as posted". Returns the cleaned URL or null. */
export function normalizeLinkedInPostUrl(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
  } catch {
    return null;
  }
  if (!/(^|\.)linkedin\.com$/i.test(u.hostname) && !/^lnkd\.in$/i.test(u.hostname)) return null;
  u.protocol = "https:";
  u.hash = "";
  for (const k of [...u.searchParams.keys()]) if (/^utm_|^trk|^rcm$/i.test(k)) u.searchParams.delete(k);
  return u.toString();
}

/** The URN to store for a URL pasted by hand, when it contains one. */
export function urnFromPostUrl(url: string): string | null {
  let text = url;
  try {
    text = decodeURIComponent(url);
  } catch {
    /* keep raw */
  }
  const urn = /urn:li:(share|ugcPost|activity):(\d{10,25})/.exec(text);
  if (urn) return `urn:li:${urn[1]}:${urn[2]}`;
  const activity = /activity-(\d{10,25})/.exec(text);
  return activity ? `urn:li:activity:${activity[1]}` : null;
}

/** LinkedIn's composer with the text pre-filled; the text is also copied, since the parameter can be ignored. */
export function linkedinComposerUrl(text: string): string {
  const base = "https://www.linkedin.com/feed/?shareActive=true";
  return text.length > 2500 ? base : `${base}&text=${encodeURIComponent(text)}`;
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export type LinkedInErrorInfo = { message: string; hint?: string; reconnect: boolean; retryable: boolean };

/** Turn an API failure into words a person can act on. */
export function describeLinkedInError(status: number, code?: string | null, detail?: string | null, version?: string): LinkedInErrorInfo {
  const d = (detail ?? "").slice(0, 200);
  if (status === 401) {
    return { message: "LinkedIn didn't accept the connection. The token expired or was revoked.", hint: "Reconnect in Settings → LinkedIn.", reconnect: true, retryable: false };
  }
  if (status === 403) {
    return {
      message: "LinkedIn refused the request. The app may be missing the \"Share on LinkedIn\" product.",
      hint: "In the LinkedIn developer portal, add Share on LinkedIn to your app, then reconnect.",
      reconnect: true,
      retryable: false,
    };
  }
  if (status === 426 || code === "NONEXISTENT_VERSION") {
    return {
      message: `LinkedIn retired API version ${version ?? "in use"}.`,
      hint: "Set a newer version (YYYYMM) in Settings → LinkedIn.",
      reconnect: false,
      retryable: false,
    };
  }
  if (status === 429) return { message: "LinkedIn's rate limit was hit.", hint: "Try again in a few minutes.", reconnect: false, retryable: true };
  if (code === "FIELD_LENGTH_TOO_LONG") return { message: "LinkedIn says the post is too long.", hint: "Shorten it below 3,000 characters.", reconnect: false, retryable: false };
  if (status >= 500) return { message: `LinkedIn had a problem on their side (${status}).`, hint: "Try again in a few minutes.", reconnect: false, retryable: true };
  return { message: `LinkedIn returned ${status}${code ? ` ${code}` : ""}${d ? `: ${d}` : "."}`, reconnect: false, retryable: false };
}

/* ------------------------------------------------------------------ */
/* Publish state stored on posts.error                                 */
/* ------------------------------------------------------------------ */

/**
 * While a publish is in flight we claim the post by writing this marker into posts.error.
 * A marker that sticks around means the outcome is unknown (crash, timeout): the person must check
 * LinkedIn before retrying, because a blind retry could post twice (research 05 §8).
 */
export const PUBLISHING_MARKER = "Publishing to LinkedIn";
export const STALE_PUBLISH_MS = 5 * 60_000;

export function publishingMarker(now: Date = new Date()): string {
  return `${PUBLISHING_MARKER} (started ${now.toISOString()})`;
}

export function publishingSince(error: string | null | undefined): Date | null {
  if (!error || !error.startsWith(PUBLISHING_MARKER)) return null;
  const m = /started (\S+?)\)/.exec(error);
  const d = m ? new Date(m[1]) : null;
  return d && !Number.isNaN(d.getTime()) ? d : new Date(0);
}

export const VERIFY_MESSAGE = "LinkedIn didn't confirm this post. Check your feed before trying again, so it doesn't go out twice.";
export const MISSED_MESSAGE = "This post missed its time while SocialBoost wasn't running. Post it now or pick a new time.";
