/**
 * Server-render smoke test for the Calendar, Insights and LinkedIn settings client components:
 * catches crashes on realistic data (empty, due, idea, insights with and without results).
 */
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CalendarBoard } from "@/components/calendar/calendar-board";
import { InsightsBoard } from "@/components/insights/insights-board";
import { LinkedInSetup } from "@/app/(app)/settings/linkedin/linkedin-setup";
import { computeInsights, type InsightPost } from "./insights";
import type { CalendarData, CalendarPost } from "./types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: () => {}, refresh: () => {} }), usePathname: () => "/calendar" }));

const basePost: CalendarPost = {
  id: "p1",
  status: "scheduled",
  state: "due",
  pillar: "a",
  hook: "We refunded €84k in one afternoon.",
  body: "We refunded €84k in one afternoon.\n\nHere is the story.",
  photoId: null,
  memoryId: "m1",
  memoryTitle: "The refund",
  scheduledAt: "2026-10-10T06:30:00Z",
  publishedAt: null,
  at: "2026-10-10T06:30:00Z",
  day: "2026-10-10",
  time: "08:30",
  linkedinUrl: null,
  error: null,
  score: 82,
  format: "story",
  impressions: null,
  reactions: null,
  comments: null,
  reposts: null,
};

const idea: CalendarPost = { ...basePost, id: "p2", status: "idea", state: "idea", pillar: "b", hook: "", body: "", photoId: "ph1", scheduledAt: "2026-10-14T06:30:00Z", at: "2026-10-14T06:30:00Z", day: "2026-10-14", score: null };

const data: CalendarData = {
  timezone: "Europe/Zurich",
  todayKey: "2026-10-10",
  now: "2026-10-10T08:00:00Z",
  from: "2026-09-28",
  to: "2026-11-02",
  posts: [basePost, idea],
  unscheduled: [{ ...basePost, id: "p3", status: "approved", state: "approved", scheduledAt: null, at: null, day: null, time: null }],
  due: [basePost],
  slots: [{ at: "2026-10-15T06:30:00Z", day: "2026-10-15", time: "08:30", taken: false, postId: null }],
  cadence: { days: [2, 3, 4], postingDays: [2, 3, 4], time: "08:30", postsPerWeek: 3, note: null },
  pillars: [
    { id: "a", name: "Founder lessons", color: "blue", weight: 50 },
    { id: "b", name: "Hiring", color: "green", weight: 50 },
  ],
  hasStrategy: true,
  linkedin: { connected: false, name: "", picture: "", expired: false, expiringSoon: false, daysLeft: 0, expiresAt: null, scheduledAfterExpiry: 0 },
  icsPath: "/api/calendar/ics?profile=x&token=y",
};

const profile = { name: "Ana Silva", headline: "Founder" };

describe("calendar UI", () => {
  it("renders the month with the due banner, tray and pills", () => {
    const html = renderToString(createElement(CalendarBoard, { initial: data, initialView: "month", profile }));
    expect(html).toContain("October 2026");
    expect(html).toContain("A post is due");
    expect(html).toContain("Approved, waiting for a day");
    expect(html.replace(/<!-- -->/g, "")).toContain("Open · 08:30");
  });

  it("renders the week view", () => {
    const html = renderToString(createElement(CalendarBoard, { initial: data, initialView: "week", profile }));
    expect(html.replace(/<!-- -->/g, "")).toContain("5–11 October 2026");
    expect(html).toContain("Rest day");
  });
});

describe("insights UI", () => {
  const pillars = [
    { id: "a", name: "Founder lessons", color: "blue", weight: 50 },
    { id: "b", name: "Hiring", color: "green", weight: 50 },
  ];

  it("shows the empty state before anything is published", () => {
    const empty = computeInsights([], { pillars, timezone: "UTC" });
    expect(renderToString(createElement(InsightsBoard, { initial: { insights: empty, pillars, timezone: "UTC" } }))).toContain("Nothing published yet");
  });

  it("renders stats, findings, weights and the table", () => {
    const posts: InsightPost[] = Array.from({ length: 6 }, (_, i) => ({
      id: `p${i}`,
      body: `Line ${i}\n\nbody`,
      pillar: i % 2 ? "a" : "b",
      format: "story",
      angle: "",
      photoId: i % 2 ? "x" : null,
      publishedAt: `2026-09-${10 + i}T07:00:00Z`,
      linkedinUrl: null,
      impressions: 1000,
      reactions: 10 * (i + 1),
      comments: i,
      reposts: 0,
    }));
    const insights = computeInsights(posts, { pillars, timezone: "UTC" });
    const html = renderToString(createElement(InsightsBoard, { initial: { insights, pillars, timezone: "UTC" } }));
    expect(html).toContain("Suggested pillar mix");
    expect(html).toContain("Published posts");
  });
});

describe("LinkedIn settings UI", () => {
  it("renders the setup guide when nothing is configured", () => {
    const html = renderToString(
      createElement(LinkedInSetup, {
        initial: {
          config: { clientId: "", hasSecret: false, redirectUri: "http://localhost:3000/api/linkedin/callback", apiVersion: "202609", env: { clientId: false, clientSecret: false, redirectUri: false, apiVersion: false }, ready: false },
          defaultRedirectUri: "http://localhost:3000/api/linkedin/callback",
          account: null,
        },
        profileName: "Ana Silva",
        timezone: "Europe/Zurich",
        connected: false,
        error: null,
      }),
    );
    expect(html).toContain("Set up your LinkedIn app");
    expect(html).toContain("http://localhost:3000/api/linkedin/callback");
  });

  it("shows the connection's expiry day in the profile's time zone", () => {
    const html = renderToString(
      createElement(LinkedInSetup, {
        initial: {
          config: { clientId: "c", hasSecret: true, redirectUri: "http://localhost:3000/api/linkedin/callback", apiVersion: "202609", env: { clientId: false, clientSecret: false, redirectUri: false, apiVersion: false }, ready: true },
          defaultRedirectUri: "http://localhost:3000/api/linkedin/callback",
          account: { memberUrn: "urn:li:person:abc", name: "Ana Silva", picture: "", expiresAt: "2026-12-08T23:30:00.000Z", connectedAt: "2026-10-09T23:30:00.000Z", expired: false, expiringSoon: false, daysLeft: 59 },
        },
        profileName: "Ana Silva",
        timezone: "Europe/Zurich",
        connected: false,
        error: null,
      }),
    );
    expect(html).toMatch(/Connected as (<!-- -->)?Ana Silva/);
    expect(html).toContain("9 December 2026");
  });
});
