import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Optional single-password gate for "self-hosted online" deployments.
 * Set SOCIALBOOST_PASSWORD to turn it on; when unset (local use) everything is open.
 * The session cookie holds an HMAC of the password, so changing the password logs everyone out.
 */
export const AUTH_COOKIE = "sb_session";

export function authEnabled(): boolean {
  return Boolean(process.env.SOCIALBOOST_PASSWORD);
}

export function sessionToken(): string {
  return createHmac("sha256", process.env.SOCIALBOOST_PASSWORD ?? "").update("socialboost:session").digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkPassword(candidate: string): boolean {
  const expected = process.env.SOCIALBOOST_PASSWORD ?? "";
  return Boolean(expected) && safeEqual(candidate, expected);
}

const MAX_LOCK_MS = 60_000;
const FORGET_AFTER_MS = 15 * 60_000;

/**
 * Sign-in throttle shared by every client. Each wrong password locks the form for a growing window
 * (0.5 s, 1 s, 2 s … up to a minute), and attempts inside the window are refused before the password
 * is even compared, so opening many connections doesn't multiply the guessing rate. Callers must not
 * await between `retryAfter()` and `fail()`/`succeed()` so concurrent requests can't slip in between.
 */
export class LoginThrottle {
  private failures = 0;
  private lockedUntil = 0;

  /** Milliseconds until the next attempt is allowed; 0 means now. */
  retryAfter(now = Date.now()): number {
    return Math.max(0, this.lockedUntil - now);
  }

  fail(now = Date.now()): void {
    // A typo from long ago shouldn't make today's sign-in wait.
    if (this.failures && now - this.lockedUntil > FORGET_AFTER_MS) this.failures = 0;
    this.failures = Math.min(this.failures + 1, 20);
    this.lockedUntil = now + Math.min(250 * 2 ** this.failures, MAX_LOCK_MS);
  }

  succeed(): void {
    this.failures = 0;
    this.lockedUntil = 0;
  }
}

/**
 * Where to send the browser after signing in: a path on this site, or "/". Parsed with the same URL
 * rules browsers use, so "/\evil.example" or "/<tab>/evil.example" can't turn into another site.
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  try {
    const base = "http://sb.invalid";
    const u = new URL(value, base);
    return u.origin === base ? u.pathname + u.search + u.hash : "/";
  } catch {
    return "/";
  }
}
