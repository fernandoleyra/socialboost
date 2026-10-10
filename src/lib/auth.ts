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

function hmac(purpose: string): string {
  return createHmac("sha256", process.env.SOCIALBOOST_PASSWORD ?? "").update(`socialboost:${purpose}`).digest("hex");
}

export function sessionToken(): string {
  return hmac("session");
}

/** Read-only key for calendar apps that subscribe to the ICS feed (they can't send cookies). */
export function icsKey(): string {
  return hmac("ics").slice(0, 32);
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
