/**
 * LinkedIn Member Data Portability (Member) API: the official way for members in the EEA and
 * Switzerland to pull their own posts (EU Digital Markets Act). One call per page of the
 * MEMBER_SHARE_INFO snapshot, with a token the person creates in LinkedIn's OAuth Token Tool and
 * pastes for one import; it is never stored.
 *
 * No server-only import so the pagination loop can be unit-tested with a fake fetch; only the
 * voice service calls it.
 */

export const DMA_SNAPSHOT_URL = "https://api.linkedin.com/rest/memberSnapshotData";
/** The snapshot endpoint answers only this version; any other returns 426 NONEXISTENT_VERSION. */
export const DMA_API_VERSION = "202312";
export const DMA_SCOPE = "r_dma_portability_self_serve";
export const DMA_SHARES_DOMAIN = "MEMBER_SHARE_INFO";
/** A safety stop: real histories fit in far fewer pages. */
export const DMA_MAX_PAGES = 100;
/** Per request. */
export const DMA_TIMEOUT_MS = 20_000;

/** A failed portability call, with a status for our own API and a user-facing message and hint. */
export class DmaError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = "DmaError";
  }
}

export type SnapshotRow = Record<string, unknown>;

export type SnapshotResult = {
  /** Distinct rows across all pages (pages can repeat rows). */
  rows: SnapshotRow[];
  /** Pages that held data. */
  pages: number;
  /** Stopped at DMA_MAX_PAGES with LinkedIn still answering. */
  capped: boolean;
  /** A later page failed: rows holds what came before it. */
  interrupted: DmaError | null;
};

/** What people paste: "Bearer xyz", quoted, or with stray whitespace and line breaks. */
export function cleanToken(raw: string): string {
  return raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^bearer\s+/i, "")
    .replace(/\s+/g, "");
}

export function snapshotUrl(start: number, domain = DMA_SHARES_DOMAIN): string {
  return `${DMA_SNAPSHOT_URL}?q=criteria&domain=${encodeURIComponent(domain)}&start=${start}`;
}

/** LinkedIn's way of saying the snapshot has no (more) pages, or isn't built yet. */
export const isNoDataMessage = (message: string) => /no data found/i.test(message);

/**
 * One page of the snapshot. `start` is a page index ("determines which page you want to fetch"):
 * follow the `next` link when LinkedIn gives one, otherwise ask for the following page. LinkedIn
 * says `total` can undercount, so it's ignored; the loop ends on "No data found" or an empty page.
 */
export function readSnapshotPage(body: unknown, start: number, domain = DMA_SHARES_DOMAIN): { rows: SnapshotRow[]; next: number } {
  const b = (body && typeof body === "object" ? body : {}) as {
    elements?: unknown;
    paging?: { links?: { rel?: unknown; href?: unknown }[] };
  };
  const elements = Array.isArray(b.elements) ? (b.elements as { snapshotDomain?: unknown; snapshotData?: unknown }[]) : [];
  const rows = elements
    .filter((e) => e && typeof e === "object" && (e.snapshotDomain === undefined || e.snapshotDomain === domain))
    .flatMap((e) => (Array.isArray(e.snapshotData) ? e.snapshotData : []))
    .filter((r): r is SnapshotRow => !!r && typeof r === "object" && !Array.isArray(r));
  const href = (Array.isArray(b.paging?.links) ? b.paging.links : []).find((l) => l?.rel === "next")?.href;
  const linked = typeof href === "string" ? Number(href.match(/[?&]start=(\d+)/)?.[1]) : NaN;
  return { rows, next: Number.isInteger(linked) && linked > start ? linked : start + 1 };
}

/** LinkedIn's error message from an error body ({ message, serviceErrorCode, status }), shortened. */
export function errorMessageOf(body: string): string {
  let message = "";
  try {
    const data = JSON.parse(body) as { message?: unknown };
    if (typeof data?.message === "string") message = data.message;
  } catch {
    message = /^\s*</.test(body) ? "" : body;
  }
  message = message.replace(/\s+/g, " ").trim();
  return message.length > 200 ? `${message.slice(0, 199)}…` : message;
}

/** Turn a failed HTTP answer into what the person should do about it. */
export function dmaErrorFor(status: number, message = ""): DmaError {
  switch (status) {
    case 401:
      return new DmaError(
        401,
        "LinkedIn didn't accept that token.",
        `It has expired, or it was created without the ${DMA_SCOPE} scope. Create a new one in the OAuth Token Tool with that scope ticked.`,
      );
    case 403:
      return new DmaError(
        403,
        "LinkedIn won't share your posts with this token.",
        `This only works for members located in the EEA or Switzerland, with a token from an app that has the "Member Data Portability API (Member)" product. Elsewhere, use the LinkedIn data export (Shares.csv).`,
      );
    case 426:
      return new DmaError(
        502,
        "LinkedIn rejected the API version.",
        `This import asks for version ${DMA_API_VERSION}, the only one LinkedIn's portability API accepts. If LinkedIn has changed that, use the LinkedIn data export (Shares.csv) for now.`,
      );
    case 429:
      return new DmaError(429, "LinkedIn is limiting requests for this token right now.", "Wait a few minutes, then import again. Posts you already have are skipped.");
    default:
      if (status >= 500) return new DmaError(502, `LinkedIn had a problem answering (${status}).`, "Try again in a few minutes.");
      return new DmaError(502, `LinkedIn answered with an error (${status})${message ? `: ${message.replace(/[.\s]+$/, "")}` : ""}.`, "Check the token and try again, or use the LinkedIn data export (Shares.csv) instead.");
  }
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Read every page of the person's MEMBER_SHARE_INFO snapshot. Throws DmaError when the first page
 * fails; a later failure keeps what was read (`interrupted`). An empty `rows` means LinkedIn has
 * nothing yet: it builds the snapshot after consent, and posts can take a day or two.
 */
export async function fetchShareSnapshot(
  token: string,
  opts: { fetch?: FetchLike; signal?: AbortSignal; maxPages?: number; timeoutMs?: number } = {},
): Promise<SnapshotResult> {
  const doFetch: FetchLike = opts.fetch ?? ((url, init) => fetch(url, init));
  const maxPages = opts.maxPages ?? DMA_MAX_PAGES;
  const timeoutMs = opts.timeoutMs ?? DMA_TIMEOUT_MS;
  const seen = new Set<string>();
  const rows: SnapshotRow[] = [];
  let pages = 0;
  let start = 0;

  for (let requests = 0; requests < maxPages; requests++) {
    let page: { rows: SnapshotRow[]; next: number };
    try {
      page = await fetchPage(doFetch, token, start, timeoutMs, opts.signal);
    } catch (err) {
      if (err instanceof DmaError && err.status === 404) break;
      if (pages > 0 && err instanceof DmaError && err.status !== 499) return { rows, pages, capped: false, interrupted: err };
      throw err;
    }
    if (page.rows.length === 0) break;
    pages++;
    for (const row of page.rows) {
      const key = JSON.stringify(row);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
    start = page.next;
    if (requests === maxPages - 1) return { rows, pages, capped: true, interrupted: null };
  }
  return { rows, pages, capped: false, interrupted: null };
}

/** One page, or a DmaError: 404 for "no (more) data", 499 when the caller cancelled. */
async function fetchPage(doFetch: FetchLike, token: string, start: number, timeoutMs: number, signal?: AbortSignal): Promise<{ rows: SnapshotRow[]; next: number }> {
  const timeout = AbortSignal.timeout(timeoutMs);
  let res: Response;
  let body: string;
  try {
    res = await doFetch(snapshotUrl(start), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "LinkedIn-Version": DMA_API_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
        Accept: "application/json",
      },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    body = await res.text();
  } catch {
    if (signal?.aborted) throw new DmaError(499, "Import cancelled.");
    if (timeout.aborted) throw new DmaError(504, "LinkedIn took too long to answer.", "Try again in a minute.");
    throw new DmaError(502, "Couldn't reach LinkedIn.", "Check this computer's internet connection, then try again.");
  }
  if (!res.ok) {
    const message = errorMessageOf(body);
    if (res.status === 404 || isNoDataMessage(message)) throw new DmaError(404, "No data found.");
    throw dmaErrorFor(res.status, message);
  }
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new DmaError(502, "LinkedIn sent an answer we couldn't read.", "Try again in a few minutes.");
  }
  return readSnapshotPage(data, start);
}
