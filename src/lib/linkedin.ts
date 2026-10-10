import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getDb, logActivity, UPLOAD_DIR } from "./db";
import { HttpError } from "./http";
import { getSetting, setSetting } from "./settings";
import { getMemory, getPhoto, getPost, updateMemory, updatePost } from "./repo";
import type { Post } from "./types";
import type { LinkedInAccountView, LinkedInSettings } from "./calendar/types";
import {
  LINKEDIN_API,
  LINKEDIN_API_VERSION_DEFAULT,
  LINKEDIN_MAX_CHARS,
  LINKEDIN_MAX_IMAGE_BYTES,
  LINKEDIN_TOKEN_URL,
  PUBLISHING_MARKER,
  STALE_PUBLISH_MS,
  VERIFY_MESSAGE,
  altTextFor,
  buildAuthorizeUrl,
  buildPostBody,
  describeLinkedInError,
  isValidApiVersion,
  normalizeLinkedInPostUrl,
  personUrn,
  postUrlFromUrn,
  publishingMarker,
  publishingSince,
  tokenStatus,
  urnFromPostUrl,
  type LinkedInErrorInfo,
} from "./calendar/linkedin-format";

/**
 * LinkedIn: OAuth (3-legged, confidential client), the member's connection, and publishing via
 * the Posts + Images APIs. See research 05.
 *
 * Config comes from Settings → LinkedIn (settings key "linkedin"), falling back to
 * LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET / LINKEDIN_REDIRECT_URI / LINKEDIN_API_VERSION.
 * Tokens live in linkedin_accounts, one per profile. Without a connection everything still works:
 * scheduled posts become "Due" reminders with copy + open-LinkedIn.
 */

/* ================================================================== */
/* Config                                                              */
/* ================================================================== */

export type LinkedInConfig = { clientId: string; clientSecret: string; redirectUri: string; apiVersion: string };
type StoredConfig = Partial<LinkedInConfig>;

const CONFIG_KEY = "linkedin";
const OAUTH_KEY = "linkedin:oauth";

export function defaultRedirectUri(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/api/linkedin/callback`;
}

/** Effective config: values saved in Settings win, then env vars, then defaults. */
export function getLinkedInConfig(origin: string): LinkedInConfig & { env: { clientId: boolean; clientSecret: boolean; redirectUri: boolean; apiVersion: boolean } } {
  const stored = getSetting<StoredConfig>(CONFIG_KEY, {});
  const env = {
    clientId: process.env.LINKEDIN_CLIENT_ID?.trim() || "",
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET?.trim() || "",
    redirectUri: process.env.LINKEDIN_REDIRECT_URI?.trim() || "",
    apiVersion: process.env.LINKEDIN_API_VERSION?.trim() || "",
  };
  return {
    clientId: stored.clientId?.trim() || env.clientId,
    clientSecret: stored.clientSecret?.trim() || env.clientSecret,
    redirectUri: stored.redirectUri?.trim() || env.redirectUri || defaultRedirectUri(origin),
    apiVersion: linkedInApiVersion(),
    env: { clientId: !!env.clientId, clientSecret: !!env.clientSecret, redirectUri: !!env.redirectUri, apiVersion: !!env.apiVersion },
  };
}

/** The LinkedIn-Version header value for REST calls. */
export function linkedInApiVersion(): string {
  const stored = getSetting<StoredConfig>(CONFIG_KEY, {}).apiVersion?.trim() || process.env.LINKEDIN_API_VERSION?.trim() || "";
  return stored && isValidApiVersion(stored) ? stored : LINKEDIN_API_VERSION_DEFAULT;
}

export function saveLinkedInConfig(patch: { clientId?: string; clientSecret?: string; redirectUri?: string; apiVersion?: string }) {
  const cur = getSetting<StoredConfig>(CONFIG_KEY, {});
  const next: StoredConfig = { ...cur };
  if (patch.clientId !== undefined) next.clientId = patch.clientId.trim();
  // An empty secret means "keep the saved one" (the form never shows it back).
  if (patch.clientSecret) next.clientSecret = patch.clientSecret.trim();
  if (patch.redirectUri !== undefined) next.redirectUri = patch.redirectUri.trim();
  if (patch.apiVersion !== undefined) {
    const v = patch.apiVersion.trim();
    if (v && !isValidApiVersion(v)) throw new HttpError(400, "The API version should look like 202609 (year and month).");
    next.apiVersion = v;
  }
  if (next.redirectUri) {
    try {
      const u = new URL(next.redirectUri);
      if (u.hash || (u.protocol !== "http:" && u.protocol !== "https:")) throw new Error("not a web URL");
    } catch {
      throw new HttpError(400, "The redirect URL must be a full URL without a #, like http://localhost:3000/api/linkedin/callback.");
    }
  }
  setSetting(CONFIG_KEY, next);
}

/** Everything Settings → LinkedIn shows (never the secret or the token). */
export function linkedInSettingsFor(profileId: string, origin: string): LinkedInSettings {
  const cfg = getLinkedInConfig(origin);
  return {
    config: {
      clientId: cfg.clientId,
      hasSecret: !!cfg.clientSecret,
      redirectUri: cfg.redirectUri,
      apiVersion: cfg.apiVersion,
      env: cfg.env,
      ready: !!cfg.clientId && !!cfg.clientSecret,
    },
    defaultRedirectUri: defaultRedirectUri(origin),
    account: getLinkedInAccount(profileId),
  };
}

/* ================================================================== */
/* Accounts                                                            */
/* ================================================================== */

type AccountRow = { profile_id: string; member_urn: string; name: string; picture: string; access_token: string; expires_at: string; connected_at: string };

function accountRow(profileId: string): AccountRow | null {
  return (getDb().prepare(`SELECT * FROM linkedin_accounts WHERE profile_id = ?`).get(profileId) as AccountRow | undefined) ?? null;
}

/** The connection as the UI may see it (never the token). */
export function getLinkedInAccount(profileId: string, now: Date = new Date()): LinkedInAccountView | null {
  const r = accountRow(profileId);
  if (!r) return null;
  const s = tokenStatus(r.expires_at, now);
  return { memberUrn: r.member_urn, name: r.name, picture: r.picture, expiresAt: r.expires_at, connectedAt: r.connected_at, ...s };
}

export function saveLinkedInAccount(profileId: string, a: { memberUrn: string; name: string; picture: string; accessToken: string; expiresAt: string }) {
  getDb()
    .prepare(
      `INSERT INTO linkedin_accounts (profile_id, member_urn, name, picture, access_token, expires_at, connected_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(profile_id) DO UPDATE SET member_urn = excluded.member_urn, name = excluded.name, picture = excluded.picture,
       access_token = excluded.access_token, expires_at = excluded.expires_at, connected_at = excluded.connected_at`,
    )
    .run(profileId, a.memberUrn, a.name, a.picture, a.accessToken, a.expiresAt, new Date().toISOString());
  logActivity("linkedin", `Connected LinkedIn as ${a.name || a.memberUrn}`, { profileId });
}

export function deleteLinkedInAccount(profileId: string) {
  getDb().prepare(`DELETE FROM linkedin_accounts WHERE profile_id = ?`).run(profileId);
  logActivity("linkedin", "Disconnected LinkedIn", { profileId });
}

/** After a 401 the token is useless: make the UI say "reconnect". */
function expireToken(profileId: string) {
  getDb().prepare(`UPDATE linkedin_accounts SET expires_at = ? WHERE profile_id = ?`).run(new Date().toISOString(), profileId);
}

/* ================================================================== */
/* HTTP                                                                */
/* ================================================================== */

export class LinkedInApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly info: LinkedInErrorInfo,
    public readonly code?: string,
  ) {
    super(info.message);
    this.name = "LinkedInApiError";
  }
}

async function apiError(res: Response, version?: string): Promise<LinkedInApiError> {
  let body: { code?: string; message?: string; error?: string; error_description?: string; serviceErrorCode?: number } = {};
  try {
    const text = await res.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    /* not JSON */
  }
  const code = body.code ?? body.error;
  const info = describeLinkedInError(res.status, code, body.message ?? body.error_description, version);
  return new LinkedInApiError(res.status, info, code);
}

async function send(url: string, init: RequestInit, timeoutMs = 30_000): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new LinkedInApiError(0, { message: `Couldn't reach LinkedIn (${msg}).`, hint: "Check the internet connection of the machine running SocialBoost.", reconnect: false, retryable: true });
  }
}

function restHeaders(token: string, version: string, extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${token}`, "LinkedIn-Version": version, "X-Restli-Protocol-Version": "2.0.0", "Content-Type": "application/json", ...extra };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry calls that can't create a duplicate post (uploads) on transient failures: 1 s, 2 s. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!(err instanceof LinkedInApiError) || !err.info.retryable || i === attempts - 1) throw err;
      await sleep(1000 * 2 ** i);
    }
  }
  throw last;
}

/* ================================================================== */
/* OAuth                                                               */
/* ================================================================== */

type OAuthState = { state: string; profileId: string; redirectUri: string; expiresAt: string };

/** Start the authorize flow for a profile. Returns the LinkedIn URL to send the browser to. */
export function beginLinkedInAuth(profileId: string, origin: string): string {
  const cfg = getLinkedInConfig(origin);
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new HttpError(400, "Add your LinkedIn app's Client ID and Client Secret first.", "Follow the setup steps on this page.");
  }
  const state = crypto.randomUUID().replace(/-/g, "");
  setSetting(OAUTH_KEY, { state, profileId, redirectUri: cfg.redirectUri, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() } satisfies OAuthState);
  return buildAuthorizeUrl({ clientId: cfg.clientId, redirectUri: cfg.redirectUri, state });
}

/** The pending state, if `state` matches and hasn't expired. Consumed on read. */
export function takeOAuthState(state: string | null): OAuthState | null {
  const s = getSetting<OAuthState | null>(OAUTH_KEY, null);
  if (!s || !state || s.state !== state) return null;
  setSetting(OAUTH_KEY, null);
  if (Date.parse(s.expiresAt) < Date.now()) return null;
  return s;
}

type UserInfo = { sub: string; name?: string; given_name?: string; family_name?: string; picture?: string };

async function fetchUserInfo(token: string): Promise<UserInfo> {
  const res = await send(`${LINKEDIN_API}/v2/userinfo`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw await apiError(res);
  const info = (await res.json()) as UserInfo;
  if (!info.sub) throw new LinkedInApiError(500, { message: "LinkedIn didn't return your member id.", hint: "Make sure the app has the Sign In with LinkedIn using OpenID Connect product.", reconnect: true, retryable: false });
  return info;
}

async function storeConnection(profileId: string, token: string, expiresInSeconds: number) {
  const info = await fetchUserInfo(token);
  const name = info.name || [info.given_name, info.family_name].filter(Boolean).join(" ");
  saveLinkedInAccount(profileId, {
    memberUrn: personUrn(info.sub),
    name,
    picture: info.picture ?? "",
    accessToken: token,
    expiresAt: new Date(Date.now() + Math.max(60, expiresInSeconds) * 1000).toISOString(),
  });
  return getLinkedInAccount(profileId)!;
}

/** Exchange the callback code for a token and remember who connected. */
export async function completeLinkedInAuth(state: OAuthState, code: string, origin: string): Promise<LinkedInAccountView> {
  const cfg = getLinkedInConfig(origin);
  const res = await send(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: state.redirectUri }),
  });
  if (!res.ok) {
    const err = await apiError(res);
    if (res.status === 400 || res.status === 401) {
      throw new LinkedInApiError(res.status, {
        message: `LinkedIn rejected the sign-in (${err.code ?? res.status}).`,
        hint: "Check the Client Secret and that the redirect URL in your LinkedIn app matches exactly.",
        reconnect: true,
        retryable: false,
      });
    }
    throw err;
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new LinkedInApiError(500, { message: "LinkedIn didn't return an access token.", reconnect: true, retryable: false });
  return storeConnection(state.profileId, json.access_token, json.expires_in ?? 5_184_000);
}

/**
 * Use a token minted with LinkedIn's developer Token Generator (scopes openid, profile,
 * w_member_social). Handy when the redirect flow can't reach this machine.
 */
export async function connectWithToken(profileId: string, token: string, expiresInDays = 60): Promise<LinkedInAccountView> {
  try {
    return await storeConnection(profileId, token.trim(), expiresInDays * 86_400);
  } catch (err) {
    if (err instanceof LinkedInApiError && err.status === 401) {
      throw new HttpError(400, "LinkedIn didn't accept that token.", "Generate a new one with the scopes openid, profile and w_member_social.");
    }
    throw err;
  }
}

/* ================================================================== */
/* Publishing                                                          */
/* ================================================================== */

async function initializeImageUpload(token: string, owner: string, version: string): Promise<{ uploadUrl: string; image: string }> {
  const res = await send(`${LINKEDIN_API}/rest/images?action=initializeUpload`, {
    method: "POST",
    headers: restHeaders(token, version),
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  });
  if (!res.ok) throw await apiError(res, version);
  const json = (await res.json()) as { value?: { uploadUrl?: string; image?: string } };
  if (!json.value?.uploadUrl || !json.value.image) throw new LinkedInApiError(502, { message: "LinkedIn didn't return an upload URL for the photo.", reconnect: false, retryable: true });
  return { uploadUrl: json.value.uploadUrl, image: json.value.image };
}

async function uploadImageBytes(token: string, uploadUrl: string, bytes: Uint8Array) {
  // Image uploads require the OAuth header (video uploads must not send it).
  const res = await send(uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" }, body: bytes as unknown as BodyInit }, 60_000);
  if (!(res.status === 200 || res.status === 201)) throw await apiError(res);
}

/** Read the photo file and make sure it fits LinkedIn's 5 MB limit. */
async function photoBytes(photoId: string): Promise<{ bytes: Uint8Array; altText: string } | null> {
  const photo = getPhoto(photoId);
  if (!photo) return null;
  const safe = /^[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(photo.filename) ? photo.filename : `${photo.id.replace(/[^A-Za-z0-9_-]/g, "")}.jpg`;
  let buf: Buffer;
  try {
    buf = await fs.readFile(path.join(UPLOAD_DIR, safe));
  } catch {
    throw new HttpError(409, "The post's photo file is missing.", "Pick the photo again in the Studio, or remove it and publish text only.");
  }
  if (buf.length > LINKEDIN_MAX_IMAGE_BYTES || !/\.jpe?g$/i.test(safe)) {
    buf = await sharp(buf).rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  }
  return { bytes: new Uint8Array(buf), altText: altTextFor(photo) };
}

const PUBLISHABLE_MANUAL = ["approved", "scheduled"] as const;

/**
 * Claim a post for publishing by writing the in-flight marker, compare-and-swap on the current
 * error value so two runners can never both send it.
 */
function claim(post: Post, statuses: readonly string[]): boolean {
  const info = getDb()
    .prepare(`UPDATE posts SET error = ?, updated_at = datetime('now') WHERE id = ? AND status IN (${statuses.map(() => "?").join(",")}) AND COALESCE(error, '') = ?`)
    .run(publishingMarker(), post.id, ...statuses, post.error ?? "");
  return info.changes === 1;
}

function markMemoryUsed(post: Post) {
  if (!post.memoryId) return;
  const m = getMemory(post.memoryId);
  if (m && (m.status === "ready" || m.status === "raw")) updateMemory(m.id, { status: "used" });
}

function hookOf(body: string) {
  const line = (body.split("\n").find((l) => l.trim()) ?? "").trim();
  return line.length > 80 ? line.slice(0, 79) + "…" : line || "Untitled post";
}

/**
 * Publish a post to LinkedIn now. Manual runs accept approved or scheduled posts; the scheduler
 * only scheduled ones. Failures are written to post.error and rethrown as HttpError.
 */
export async function publishToLinkedIn(profileId: string, postId: string, opts: { trigger: "manual" | "scheduler"; retryUnconfirmed?: boolean }): Promise<Post> {
  const post = getPost(postId);
  if (!post || post.profileId !== profileId) throw new HttpError(404, "Post not found");
  if (post.status === "published") throw new HttpError(409, "This post is already published.");
  const allowed: readonly string[] = opts.trigger === "scheduler" ? ["scheduled"] : PUBLISHABLE_MANUAL;
  if (!allowed.includes(post.status)) {
    throw new HttpError(409, "Approve the post before publishing it.", "Only approved or scheduled posts go to LinkedIn. You decide what goes out.");
  }
  const text = post.body.trim();
  if (!text) throw new HttpError(400, "The post is empty.");
  if (text.length > LINKEDIN_MAX_CHARS) throw new HttpError(400, `The post is ${text.length.toLocaleString("en")} characters.`, "LinkedIn allows 3,000. Shorten it in the Studio.");

  const since = publishingSince(post.error);
  if (since && Date.now() - since.getTime() < STALE_PUBLISH_MS) throw new HttpError(409, "This post is being published right now.");
  if ((since || post.error === VERIFY_MESSAGE) && !opts.retryUnconfirmed) {
    throw new HttpError(409, "We couldn't confirm whether the last attempt went out.", "Check your LinkedIn feed first. If the post isn't there, choose Try again.");
  }

  const row = accountRow(profileId);
  if (!row) throw new HttpError(409, "LinkedIn isn't connected.", "Connect it in Settings → LinkedIn, or copy the post and publish it by hand.");
  if (tokenStatus(row.expires_at).expired) throw new HttpError(409, "Your LinkedIn connection expired.", "Reconnect in Settings → LinkedIn. LinkedIn tokens last 60 days.");

  if (!claim(post, allowed)) throw new HttpError(409, "This post changed or is already being published. Refresh and try again.");

  const version = linkedInApiVersion();
  const token = row.access_token;
  let image: { urn: string; altText: string } | null = null;
  try {
    if (post.photoId) {
      const photo = await photoBytes(post.photoId);
      if (photo) {
        const up = await withRetry(() => initializeImageUpload(token, row.member_urn, version));
        await withRetry(() => uploadImageBytes(token, up.uploadUrl, photo.bytes));
        image = { urn: up.image, altText: photo.altText };
        // Images are processed asynchronously; a post created too early can end up invisible (research 05 §5).
        await sleep(4000);
      }
    }
  } catch (err) {
    return fail(post, err, profileId);
  }

  const body = buildPostBody({ author: row.member_urn, text, image });
  let res: Response;
  try {
    res = await send(`${LINKEDIN_API}/rest/posts`, { method: "POST", headers: restHeaders(token, version), body: JSON.stringify(body) }, 45_000);
    if (res.status === 429) {
      await sleep(3000);
      res = await send(`${LINKEDIN_API}/rest/posts`, { method: "POST", headers: restHeaders(token, version), body: JSON.stringify(body) }, 45_000);
    }
  } catch {
    // The request may have reached LinkedIn. Never retry blindly: ask the person to check.
    return unconfirmed(post, profileId, text, "LinkedIn didn't answer in time.");
  }
  // A 5xx on create is ambiguous too: a gateway can fail after the post was created (research 05 §8).
  if (res.status >= 500) return unconfirmed(post, profileId, text, `LinkedIn had a problem on their side (${res.status}) and didn't confirm the post.`);
  if (res.status !== 201 && res.status !== 200) return fail(post, await apiError(res, version), profileId);

  const urn = res.headers.get("x-restli-id") ?? res.headers.get("x-linkedin-id");
  const published = updatePost(post.id, {
    status: "published",
    publishedAt: new Date().toISOString(),
    linkedinUrn: urn,
    linkedinUrl: urn ? postUrlFromUrn(urn) : null,
    error: null,
  });
  markMemoryUsed(published);
  logActivity("publish", `${opts.trigger === "scheduler" ? "Published on schedule" : "Published"} on LinkedIn: ${hookOf(text)}`, { profileId, refId: post.id });
  return published;
}

/** The outcome of the create call is unknown: park the post until a person checks the feed. */
function unconfirmed(post: Post, profileId: string, text: string, message: string): never {
  updatePost(post.id, { error: VERIFY_MESSAGE });
  logActivity("publish", `Unconfirmed LinkedIn publish: ${hookOf(text)}`, { profileId, refId: post.id });
  throw new HttpError(504, message, "Check your feed before trying again, so the post doesn't go out twice.");
}

function fail(post: Post, err: unknown, profileId: string): never {
  const info: LinkedInErrorInfo =
    err instanceof LinkedInApiError
      ? err.info
      : err instanceof HttpError
        ? { message: err.message, hint: err.hint, reconnect: false, retryable: false }
        : { message: err instanceof Error ? err.message : "Publishing failed.", reconnect: false, retryable: false };
  if (err instanceof LinkedInApiError && err.status === 401) expireToken(profileId);
  updatePost(post.id, { error: info.hint ? `${info.message} ${info.hint}` : info.message });
  logActivity("publish", `LinkedIn publish failed: ${info.message}`, { profileId, refId: post.id });
  throw new HttpError(502, info.message, info.hint);
}

/** The person posted it themselves: record that, with the post's link when they have it. */
export function markPostedByHand(profileId: string, postId: string, input: { url?: string | null; publishedAt?: string | null }): Post {
  const post = getPost(postId);
  if (!post || post.profileId !== profileId) throw new HttpError(404, "Post not found");
  if (post.status === "archived") throw new HttpError(409, "This post is archived.", "Restore it in the Studio first.");
  const url = input.url?.trim() ? normalizeLinkedInPostUrl(input.url) : null;
  if (input.url?.trim() && !url) throw new HttpError(400, "That doesn't look like a LinkedIn link.", "Copy the post's link from LinkedIn (… menu → Copy link to post).");
  if (publishingNow(post)) throw new HttpError(409, "This post is being published right now.");

  if (post.status === "published") {
    if (!url) return post;
    return updatePost(post.id, { linkedinUrl: url, linkedinUrn: urnFromPostUrl(url) ?? post.linkedinUrn });
  }
  if (!post.body.trim()) throw new HttpError(400, "The post is empty.", "Write or paste the text you posted first.");
  let publishedAt = new Date().toISOString();
  if (input.publishedAt) {
    const t = Date.parse(input.publishedAt);
    if (Number.isNaN(t) || t > Date.now() + 5 * 60_000) throw new HttpError(400, "The posting time can't be in the future.");
    publishedAt = new Date(t).toISOString();
  }
  const updated = updatePost(post.id, {
    status: "published",
    publishedAt,
    linkedinUrl: url,
    linkedinUrn: url ? urnFromPostUrl(url) : null,
    error: null,
  });
  markMemoryUsed(updated);
  logActivity("publish", `Posted by hand: ${hookOf(updated.body)}`, { profileId, refId: post.id });
  return updated;
}

function publishingNow(post: Post): boolean {
  const s = publishingSince(post.error);
  return !!s && Date.now() - s.getTime() < STALE_PUBLISH_MS;
}

/** Whether `error` holds the scheduler's in-flight marker. */
export function isPublishingMarker(error: string | null): boolean {
  return !!error && error.startsWith(PUBLISHING_MARKER);
}

/** Raw token for the scheduler's checks. */
export function hasUsableConnection(profileId: string): { connected: boolean; expired: boolean } {
  const r = accountRow(profileId);
  if (!r) return { connected: false, expired: false };
  return { connected: true, expired: tokenStatus(r.expires_at).expired };
}
