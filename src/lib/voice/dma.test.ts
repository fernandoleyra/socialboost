import { describe, expect, it } from "vitest";
import { DMA_API_VERSION, DmaError, cleanToken, dmaErrorFor, errorMessageOf, fetchShareSnapshot, readSnapshotPage, snapshotUrl, type FetchLike } from "./dma";

const row = (n: number) => ({ Date: `2025-01-0${n} 10:00:00`, ShareLink: `https://www.linkedin.com/feed/update/urn:li:share:${n}`, ShareCommentary: `Post number ${n}, long enough to keep.` });

const page = (start: number, rows: unknown[], next = true) => ({
  paging: { start, count: 10, links: next ? [{ type: "application/json", rel: "next", href: `/rest/memberSnapshotData?q=criteria&domain=MEMBER_SHARE_INFO&start=${start + 1}` }] : [], total: 2 },
  elements: [{ snapshotDomain: "MEMBER_SHARE_INFO", snapshotData: rows }],
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const NO_DATA = { status: 404, serviceErrorCode: 0, message: "No data found for this memberId" };

/** A fake LinkedIn: answers by the `start` page index and records every request. */
function fakeLinkedIn(answer: (start: number) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return answer(Number(new URL(url).searchParams.get("start")));
  };
  return { fetch, calls };
}

describe("token and URL", () => {
  it("cleans what people paste", () => {
    expect(cleanToken('  "Bearer AQX12\n34_-.abc"  ')).toBe("AQX1234_-.abc");
    expect(cleanToken("bearer   tok")).toBe("tok");
    expect(cleanToken("   ")).toBe("");
  });

  it("asks for one page of the share snapshot", () => {
    expect(snapshotUrl(3)).toBe("https://api.linkedin.com/rest/memberSnapshotData?q=criteria&domain=MEMBER_SHARE_INFO&start=3");
  });
});

describe("readSnapshotPage", () => {
  it("reads the rows and follows the next link", () => {
    const body = { ...page(0, [row(1), row(2)]), paging: { links: [{ rel: "next", href: "/rest/memberSnapshotData?q=criteria&start=4&domain=MEMBER_SHARE_INFO" }] } };
    expect(readSnapshotPage(body, 0)).toEqual({ rows: [row(1), row(2)], next: 4 });
  });

  it("falls back to the following page, ignores other domains and junk", () => {
    const body = {
      elements: [
        { snapshotDomain: "MEMBER_SHARE_INFO", snapshotData: [row(1), "junk", null, [1]] },
        { snapshotDomain: "INSTANT_REPOSTS", snapshotData: [{ Date: "x" }] },
      ],
      paging: { links: [{ rel: "prev", href: "/rest/memberSnapshotData?start=0" }] },
    };
    expect(readSnapshotPage(body, 2)).toEqual({ rows: [row(1)], next: 3 });
    expect(readSnapshotPage(null, 0)).toEqual({ rows: [], next: 1 });
    // A next link that doesn't move forward can't loop us forever.
    expect(readSnapshotPage({ elements: [], paging: { links: [{ rel: "next", href: "?start=1" }] } }, 5).next).toBe(6);
  });
});

describe("errors", () => {
  it("maps LinkedIn statuses to what the person should do", () => {
    expect(dmaErrorFor(401)).toMatchObject({ status: 401, hint: expect.stringContaining("r_dma_portability_self_serve") });
    expect(dmaErrorFor(403)).toMatchObject({ status: 403, hint: expect.stringMatching(/EEA or Switzerland.*Shares\.csv/) });
    expect(dmaErrorFor(426)).toMatchObject({ status: 502, hint: expect.stringContaining(DMA_API_VERSION) });
    expect(dmaErrorFor(429).status).toBe(429);
    expect(dmaErrorFor(503).message).toMatch(/503/);
    expect(dmaErrorFor(400, "Invalid param").message).toBe("LinkedIn answered with an error (400): Invalid param.");
    expect(dmaErrorFor(400, "Invalid param.").message).toBe("LinkedIn answered with an error (400): Invalid param.");
  });

  it("reads LinkedIn's error message, never HTML", () => {
    expect(errorMessageOf(JSON.stringify(NO_DATA))).toBe("No data found for this memberId");
    expect(errorMessageOf("<html><body>Bad gateway</body></html>")).toBe("");
    expect(errorMessageOf("x".repeat(500))).toHaveLength(200);
  });
});

describe("fetchShareSnapshot", () => {
  it("pages until LinkedIn says there's no more data, with the fixed version header", async () => {
    const li = fakeLinkedIn((start) => (start === 0 ? json(200, page(0, [row(1), row(2)])) : start === 1 ? json(200, page(1, [row(2), row(3)])) : json(404, NO_DATA)));
    const r = await fetchShareSnapshot("tok123", { fetch: li.fetch });
    expect(r).toEqual({ rows: [row(1), row(2), row(3)], pages: 2, capped: false, interrupted: null });
    expect(li.calls.map((c) => new URL(c.url).searchParams.get("start"))).toEqual(["0", "1", "2"]);
    expect(li.calls[0].init.headers).toMatchObject({ Authorization: "Bearer tok123", "LinkedIn-Version": "202312", "X-Restli-Protocol-Version": "2.0.0" });
    expect(li.calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it("stops on an empty page and on 'No data found' sent with another status", async () => {
    const empty = fakeLinkedIn((start) => json(200, page(start, start === 0 ? [row(1)] : [])));
    expect((await fetchShareSnapshot("t", { fetch: empty.fetch })).rows).toHaveLength(1);
    expect(empty.calls).toHaveLength(2);

    const noData = fakeLinkedIn((start) => (start === 0 ? json(200, page(0, [row(1)])) : json(400, { message: "No data found for this memberId" })));
    expect(await fetchShareSnapshot("t", { fetch: noData.fetch })).toMatchObject({ pages: 1, interrupted: null });
  });

  it("returns nothing when the snapshot isn't built yet", async () => {
    const li = fakeLinkedIn(() => json(404, NO_DATA));
    expect(await fetchShareSnapshot("t", { fetch: li.fetch })).toEqual({ rows: [], pages: 0, capped: false, interrupted: null });
  });

  it("throws a clear error when the first page fails", async () => {
    for (const [status, expected] of [
      [401, 401],
      [403, 403],
      [426, 502],
    ] as const) {
      const li = fakeLinkedIn(() => json(status, { message: "nope" }));
      const err = await fetchShareSnapshot("t", { fetch: li.fetch }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(DmaError);
      expect((err as DmaError).status).toBe(expected);
    }
  });

  it("keeps the pages it got when a later one fails", async () => {
    const li = fakeLinkedIn((start) => (start === 0 ? json(200, page(0, [row(1)])) : json(500, { message: "Internal error" })));
    const r = await fetchShareSnapshot("t", { fetch: li.fetch });
    expect(r.rows).toEqual([row(1)]);
    expect(r.interrupted?.message).toMatch(/500/);
  });

  it("stops at the page cap", async () => {
    const li = fakeLinkedIn((start) => json(200, page(start, [row((start % 9) + 1)])));
    const r = await fetchShareSnapshot("t", { fetch: li.fetch, maxPages: 3 });
    expect(r).toMatchObject({ pages: 3, capped: true });
    expect(li.calls).toHaveLength(3);
  });

  it("reports network failures, timeouts and cancellation", async () => {
    const down: FetchLike = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(fetchShareSnapshot("t", { fetch: down })).rejects.toMatchObject({ status: 502, message: "Couldn't reach LinkedIn." });

    const slow: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("timed out", "TimeoutError"))));
    await expect(fetchShareSnapshot("t", { fetch: slow, timeoutMs: 20 })).rejects.toMatchObject({ status: 504 });

    const ctrl = new AbortController();
    const pending = fetchShareSnapshot("t", { fetch: slow, signal: ctrl.signal });
    ctrl.abort();
    await expect(pending).rejects.toMatchObject({ status: 499 });
  });

  it("rejects an answer that isn't JSON", async () => {
    const li = fakeLinkedIn(() => new Response("<html>oops</html>", { status: 200 }));
    await expect(fetchShareSnapshot("t", { fetch: li.fetch })).rejects.toMatchObject({ status: 502 });
  });
});
