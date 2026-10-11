/**
 * Request checks src/proxy.ts runs before anything else. Pure (method + headers in, verdict out),
 * so they're unit-tested without a server.
 */

type HeaderBag = Pick<Headers, "get">;

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Lower-cased host name of a Host header value ("localhost:3000" → "localhost"), or null if it isn't one. */
function hostnameOf(host: string): string | null {
  if (!host || /[\s@/\\?#]/.test(host)) return null;
  try {
    return new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Host names listed in SOCIALBOOST_ALLOWED_HOSTS (comma-separated, e.g. "studio.lan,192.168.1.20"). */
export function allowedHosts(raw: string | undefined = process.env.SOCIALBOOST_ALLOWED_HOSTS): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => hostnameOf(s.trim()))
    .filter((s): s is string => Boolean(s));
}

/**
 * Without a password the studio must only be opened as localhost. Any other Host means someone on the
 * network or a DNS-rebinding page (a site whose name now points at 127.0.0.1), so it's refused unless
 * SOCIALBOOST_ALLOWED_HOSTS lists it.
 */
export function isAllowedLocalHost(host: string | null, extra: string[] = []): boolean {
  const name = host ? hostnameOf(host) : null;
  if (!name) return false;
  return LOOPBACK.has(name) || name.endsWith(".localhost") || extra.includes(name);
}

/**
 * A state-changing request sent by another site's page (CSRF). Browsers mark every request with
 * Sec-Fetch-Site; older ones still send Origin on cross-origin writes. Requests with neither come from
 * scripts and curl, which can't ride on the browser's session or its access to localhost.
 */
export function isCrossSiteWrite(method: string, headers: HeaderBag): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;
  const site = headers.get("sec-fetch-site");
  if (site) return site !== "same-origin" && site !== "none";
  const origin = headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return true; // "null": sandboxed frames, file:// pages
  }
  const first = (v: string | null) => (v ? v.split(",")[0].trim().toLowerCase() : "");
  return originHost !== first(headers.get("host")) && originHost !== first(headers.get("x-forwarded-host"));
}
