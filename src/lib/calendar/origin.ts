/**
 * The public origin the browser used to reach us (behind a reverse proxy too). Pure.
 * Used for the default LinkedIn redirect URL and the calendar feed link.
 */
export function requestOrigin(headers: Pick<Headers, "get">, fallbackUrl?: string): string {
  const first = (v: string | null) => (v ? v.split(",")[0].trim() : "");
  const host = first(headers.get("x-forwarded-host")) || first(headers.get("host"));
  let proto = first(headers.get("x-forwarded-proto"));
  if (!proto && fallbackUrl) {
    try {
      proto = new URL(fallbackUrl).protocol.replace(":", "");
    } catch {
      /* ignore */
    }
  }
  if (host) return `${proto || "http"}://${host}`;
  if (fallbackUrl) {
    try {
      return new URL(fallbackUrl).origin;
    } catch {
      /* ignore */
    }
  }
  return "http://localhost:3000";
}
