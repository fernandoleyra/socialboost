import { describe, expect, it } from "vitest";
import {
  addDaysToKey,
  buildWeek,
  computeNextActions,
  greetingFor,
  hookOf,
  localDayKey,
  localParts,
  neediestPillar,
  openSlots,
  parseDbDate,
  pillarBalance,
  pipelineStats,
  readyUnusedMemories,
  safeTimezone,
  slotWeekdays,
  storyBufferTarget,
  timeToMinutes,
  weekdayOfKey,
  type DashboardSnapshot,
  type SnapshotMemory,
  type SnapshotPost,
} from "./dashboard";

// Saturday 10 Oct 2026, 09:00 in Zurich (07:00 UTC).
const NOW = new Date("2026-10-10T07:00:00Z");
const TZ = "Europe/Zurich";

function mem(id: string, over: Partial<SnapshotMemory> = {}): SnapshotMemory {
  return { id, title: `Story ${id}`, status: "ready", pillar: null, photoCount: 1, ...over };
}

function post(id: string, over: Partial<SnapshotPost> = {}): SnapshotPost {
  return {
    id,
    status: "idea",
    memoryId: null,
    pillar: null,
    photoId: null,
    body: "",
    angle: "",
    scheduledAt: null,
    publishedAt: null,
    metricsUpdatedAt: null,
    reactions: null,
    impressions: null,
    ...over,
  };
}

function snap(over: Partial<DashboardSnapshot> = {}): DashboardSnapshot {
  return {
    now: NOW,
    timezone: TZ,
    hasStrategy: true,
    cadence: { postsPerWeek: 3, days: [2, 3, 4], time: "08:30" },
    pillars: [
      { id: "a", name: "Building with AI", weight: 50, color: "blue" },
      { id: "b", name: "Founder lessons", weight: 30, color: "purple" },
      { id: "c", name: "Swiss tech", weight: 20, color: "orange" },
    ],
    activePositioningInterviewId: null,
    activeStoryInterviewId: null,
    voice: { ownSamples: 12, analyzed: true },
    memories: [],
    posts: [],
    ...over,
  };
}

describe("time helpers", () => {
  it("parses SQLite and ISO timestamps as UTC", () => {
    expect(parseDbDate("2026-10-10 08:30:00")?.toISOString()).toBe("2026-10-10T08:30:00.000Z");
    expect(parseDbDate("2026-10-10T08:30:00.000Z")?.toISOString()).toBe("2026-10-10T08:30:00.000Z");
    expect(parseDbDate("")).toBeNull();
    expect(parseDbDate("not a date")).toBeNull();
    expect(parseDbDate(null)).toBeNull();
  });

  it("computes local day keys across timezones", () => {
    const lateUtc = new Date("2026-10-10T23:30:00Z");
    expect(localDayKey(lateUtc, "UTC")).toBe("2026-10-10");
    expect(localDayKey(lateUtc, "Europe/Zurich")).toBe("2026-10-11");
    expect(localDayKey(lateUtc, "America/Los_Angeles")).toBe("2026-10-10");
  });

  it("reports local wall-clock parts", () => {
    const p = localParts(NOW, TZ);
    expect(p).toMatchObject({ year: 2026, month: 10, day: 10, hour: 9, minute: 0, weekday: 6 });
  });

  it("falls back to UTC for unknown timezones", () => {
    expect(safeTimezone("Mars/Olympus")).toBe("UTC");
    expect(safeTimezone("")).toBe("UTC");
    expect(safeTimezone("Asia/Tokyo")).toBe("Asia/Tokyo");
    expect(localDayKey(NOW, "Mars/Olympus")).toBe("2026-10-10");
  });

  it("does calendar math on day keys, across month and DST boundaries", () => {
    expect(addDaysToKey("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysToKey("2026-10-24", 7)).toBe("2026-10-31");
    expect(addDaysToKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(weekdayOfKey("2026-10-10")).toBe(6);
    expect(weekdayOfKey("2026-10-13")).toBe(2);
  });

  it("parses posting times", () => {
    expect(timeToMinutes("08:30")).toBe(510);
    expect(timeToMinutes("7:05")).toBe(425);
    expect(timeToMinutes("garbage")).toBe(510);
  });

  it("greets by local hour", () => {
    expect(greetingFor(3)).toBe("Good evening");
    expect(greetingFor(9)).toBe("Good morning");
    expect(greetingFor(14)).toBe("Good afternoon");
    expect(greetingFor(20)).toBe("Good evening");
  });
});

describe("cadence", () => {
  it("caps slot days to posts per week, Monday first", () => {
    expect([...slotWeekdays({ postsPerWeek: 3, days: [1, 2, 3, 4, 5], time: "08:30" })]).toEqual([1, 2, 3]);
    expect([...slotWeekdays({ postsPerWeek: 2, days: [0, 6, 1], time: "08:30" })]).toEqual([1, 6]);
    expect(slotWeekdays({ postsPerWeek: 5, days: [2, 4], time: "08:30" }).size).toBe(2);
  });

  it("targets two weeks of stories", () => {
    expect(storyBufferTarget({ postsPerWeek: 3, days: [2, 3, 4], time: "08:30" })).toBe(6);
    expect(storyBufferTarget({ postsPerWeek: 4, days: [], time: "08:30" })).toBe(8);
  });

  it("finds open slots in the next 14 days and skips taken days", () => {
    const s = snap({
      posts: [post("p1", { status: "approved", scheduledAt: "2026-10-13T06:30:00.000Z" })],
    });
    // Tue 13 is taken → Wed 14, Thu 15, Tue 20, Wed 21, Thu 22 remain.
    expect(openSlots(s)).toEqual(["2026-10-14", "2026-10-15", "2026-10-20", "2026-10-21", "2026-10-22"]);
  });

  it("ignores archived posts and drops today once the posting time has passed", () => {
    const thursday = new Date("2026-10-15T10:00:00Z"); // 12:00 in Zurich, after 08:30
    const s = snap({
      now: thursday,
      posts: [post("p1", { status: "archived", scheduledAt: "2026-10-20T06:30:00.000Z" })],
    });
    const slots = openSlots(s);
    expect(slots).not.toContain("2026-10-15");
    expect(slots).toContain("2026-10-20");
  });
});

describe("memories", () => {
  it("treats memories claimed by live posts as used", () => {
    const s = snap({
      memories: [mem("m1"), mem("m2"), mem("m3", { status: "used" })],
      posts: [post("p1", { memoryId: "m1" }), post("p2", { memoryId: "m2", status: "archived" })],
    });
    expect(readyUnusedMemories(s).map((m) => m.id)).toEqual(["m2"]);
  });
});

describe("pillar balance", () => {
  it("compares ready stories with pillar weights", () => {
    const s = snap({
      memories: [mem("1", { pillar: "a" }), mem("2", { pillar: "a" }), mem("3", { pillar: "b" }), mem("4", { pillar: "zzz" })],
    });
    const rows = pillarBalance(s);
    expect(rows.map((r) => r.ready)).toEqual([2, 1, 0]);
    expect(rows[0].targetShare).toBeCloseTo(0.5);
    expect(rows[0].storyShare).toBeCloseTo(2 / 3);
    expect(rows[2].state).toBe("empty");
    // need = 6 → targets 3 / 1.8 / 1.2 → gaps 1 / 0.8 / 1.2
    expect(neediestPillar(rows)?.id).toBe("c");
  });

  it("splits evenly when all weights are zero", () => {
    const s = snap({ pillars: [{ id: "a", name: "A", weight: 0, color: "blue" }, { id: "b", name: "B", weight: 0, color: "red" }] });
    expect(pillarBalance(s).map((r) => r.targetShare)).toEqual([0.5, 0.5]);
  });

  it("returns nothing without pillars", () => {
    expect(pillarBalance(snap({ pillars: [] }))).toEqual([]);
    expect(neediestPillar([])).toBeNull();
  });
});

describe("next best actions", () => {
  it("walks a brand-new profile through setup in funnel order", () => {
    const s = snap({ hasStrategy: false, pillars: [], voice: { ownSamples: 0, analyzed: false } });
    const kinds = computeNextActions(s).map((a) => a.kind);
    expect(kinds).toEqual(["positioning", "voice-import", "story", "plan"]);
    expect(computeNextActions(s)[0].href).toBe("/interviews/new?kind=positioning&auto=1");
  });

  it("resumes an unfinished positioning interview", () => {
    const s = snap({ hasStrategy: false, activePositioningInterviewId: "iv_1" });
    expect(computeNextActions(s).find((a) => a.kind === "positioning")?.href).toBe("/interviews/iv_1");
  });

  it("asks to analyze voice once enough posts are imported", () => {
    const s = snap({ voice: { ownSamples: 5, analyzed: false } });
    expect(computeNextActions(s).map((a) => a.kind)).toContain("voice-analyze");
    expect(computeNextActions(snap({ voice: { ownSamples: 2, analyzed: false } })).map((a) => a.kind)).not.toContain("voice-analyze");
  });

  it("flags stories without photos and targets the thinnest pillar", () => {
    const s = snap({ memories: [mem("1", { pillar: "a", photoCount: 0 }), mem("2", { pillar: "a" })] });
    const actions = computeNextActions(s);
    const photos = actions.find((a) => a.kind === "photos");
    expect(photos?.title).toBe('"Story 1" needs a photo');
    expect(photos?.href).toBe("/memories?filter=needs-photo");
    const story = actions.find((a) => a.kind === "story");
    expect(story?.title).toBe("Find 4 more stories");
    expect(story?.href).toBe("/interviews/new?kind=story&pillar=b");
  });

  it("prefers resuming an active story interview over starting a new one", () => {
    const s = snap({ activeStoryInterviewId: "iv_9" });
    const kinds = computeNextActions(s).map((a) => a.kind);
    expect(kinds).toContain("resume-story");
    expect(kinds).not.toContain("story");
  });

  it("puts posts due today first", () => {
    const s = snap({
      voice: { ownSamples: 0, analyzed: false },
      posts: [
        post("due", { status: "scheduled", scheduledAt: "2026-10-10T06:30:00.000Z", body: "I lost a client on a Tuesday.\n\nMore." }),
        post("later", { status: "scheduled", scheduledAt: "2026-10-10T15:00:00.000Z", body: "Later today" }),
        post("idea", { status: "idea", scheduledAt: "2026-10-10T16:00:00.000Z", angle: "Hackathon lessons" }),
        post("rev", { status: "review", body: "Draft" }),
      ],
    });
    const actions = computeNextActions(s);
    expect(actions.slice(0, 3).map((a) => a.id)).toEqual(["due-due", "today-later", "unready-idea"]);
    expect(actions[0].title).toBe("Post due at 8:30 AM");
    expect(actions[0].detail).toContain("I lost a client on a Tuesday.");
    expect(actions[2].cta).toBe("Write it");
    expect(actions[3].kind).toBe("voice-import");
    expect(actions.find((a) => a.kind === "review")?.href).toBe("/studio/rev");
  });

  it("reports overdue scheduled posts from earlier days", () => {
    const s = snap({ posts: [post("old", { status: "scheduled", scheduledAt: "2026-10-08T06:30:00.000Z", body: "Hook" })] });
    expect(computeNextActions(s)[0].title).toBe("Overdue since Thursday");
  });

  it("asks for metrics on posts published more than 48h ago", () => {
    const s = snap({
      posts: [
        post("p1", { status: "published", publishedAt: "2026-10-06T07:00:00.000Z" }),
        post("p2", { status: "published", publishedAt: "2026-10-09T07:00:00.000Z" }),
        post("p3", { status: "published", publishedAt: "2026-10-05T07:00:00.000Z", reactions: 30, metricsUpdatedAt: "2026-10-07T00:00:00Z" }),
      ],
    });
    const metrics = computeNextActions(s).find((a) => a.kind === "metrics");
    expect(metrics?.title).toBe("Add numbers for 1 post");
  });

  it("is quiet when everything is on track", () => {
    const memories = Array.from({ length: 6 }, (_, i) => mem(`m${i}`, { pillar: ["a", "b", "c"][i % 3] }));
    const scheduled = ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-20", "2026-10-21", "2026-10-22"].map((d, i) =>
      post(`s${i}`, { status: "scheduled", scheduledAt: `${d}T06:30:00.000Z`, memoryId: null }),
    );
    expect(computeNextActions(snap({ memories, posts: scheduled }))).toEqual([]);
  });
});

describe("pipeline stats and week", () => {
  it("counts the pipeline", () => {
    const s = snap({
      memories: [mem("1"), mem("2", { photoCount: 0 }), mem("3", { status: "raw", photoCount: 0 }), mem("4", { status: "used", photoCount: 0 })],
      posts: [
        post("a", { status: "draft", memoryId: "1" }),
        post("b", { status: "review" }),
        post("c", { status: "approved", scheduledAt: "2026-10-13T06:30:00.000Z" }),
        post("d", { status: "idea", scheduledAt: "2026-10-14T06:30:00.000Z" }),
        post("e", { status: "scheduled", scheduledAt: "2026-11-30T06:30:00.000Z" }),
      ],
    });
    expect(pipelineStats(s)).toEqual({
      ready: 2,
      readyUnused: 1,
      needPhoto: 2,
      drafts: 2,
      inReview: 1,
      scheduledNext14: 2,
      approvedNext14: 1,
      storyTarget: 6,
    });
  });

  it("builds seven local days with slots and posts", () => {
    const s = snap({
      posts: [
        post("p", { status: "scheduled", scheduledAt: "2026-10-13T06:30:00.000Z", body: "First line\nSecond", pillar: "a" }),
        post("x", { status: "archived", scheduledAt: "2026-10-14T06:30:00.000Z" }),
        post("pub", { status: "published", publishedAt: "2026-10-10T06:00:00.000Z", scheduledAt: "2026-10-09T06:00:00.000Z" }),
      ],
    });
    const week = buildWeek(s);
    expect(week.map((d) => d.key)).toEqual(["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
    expect(week[0]).toMatchObject({ isToday: true, weekday: "Sat", dayNumber: 10, isSlot: false });
    expect(week[0].posts.map((p) => p.id)).toEqual(["pub"]);
    expect(week[3]).toMatchObject({ weekday: "Tue", isSlot: true, open: false });
    expect(week[3].posts[0]).toMatchObject({ hook: "First line", time: "8:30 AM", pillar: "a" });
    expect(week[4]).toMatchObject({ weekday: "Wed", isSlot: true, open: true, posts: [] });
  });

  it("previews hooks from the first non-empty line", () => {
    expect(hookOf({ body: "\n\nHello there\nmore", angle: "" })).toBe("Hello there");
    expect(hookOf({ body: "", angle: "An angle" })).toBe("An angle");
    expect(hookOf({ body: "x".repeat(200), angle: "" }, 10)).toBe("xxxxxxxxx…");
  });
});
