/**
 * Shapes the calendar and insights APIs send to the browser. Types only — safe to import from
 * client components.
 */

import type { Post } from "@/lib/types";
import type { MetricsMiss } from "./metrics-import";
import type { PlanGap } from "./plan";
import type { Slot } from "./slots";
import type { DayKey } from "./time";
import type { DisplayState } from "./view";

export type CalendarPillar = { id: string; name: string; color: string; weight: number };

export type CalendarPost = {
  id: string;
  status: Post["status"];
  state: DisplayState;
  pillar: string | null;
  hook: string;
  body: string;
  photoId: string | null;
  memoryId: string | null;
  memoryTitle: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  /** The instant that places the post on the calendar (publish time for published posts). */
  at: string | null;
  day: DayKey | null;
  time: string | null;
  linkedinUrl: string | null;
  error: string | null;
  score: number | null;
  format: string;
  impressions: number | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
};

export type LinkedInStatus = { connected: boolean; name: string; picture: string; expired: boolean; expiringSoon: boolean; daysLeft: number; expiresAt: string | null };

export type CalendarData = {
  timezone: string;
  todayKey: DayKey;
  now: string;
  from: DayKey;
  to: DayKey;
  posts: CalendarPost[];
  unscheduled: CalendarPost[];
  slots: Slot[];
  cadence: { days: number[]; postingDays: number[]; time: string; postsPerWeek: number; note: string | null };
  pillars: CalendarPillar[];
  hasStrategy: boolean;
  linkedin: LinkedInStatus;
  icsPath: string;
};

export type PlanPreviewItem = {
  at: string;
  day: DayKey;
  time: string;
  memoryId: string;
  memoryTitle: string;
  pillar: string | null;
  photoId: string | null;
  needsPhoto: boolean;
  reason: string;
};

export type PlanPreview = {
  weeks: number;
  from: string;
  to: string;
  openSlots: number;
  items: PlanPreviewItem[];
  gaps: PlanGap[];
  unfilled: { at: string; day: DayKey; time: string }[];
  needsPhoto: number;
  messages: string[];
  readyStories: number;
  weightsFrom: "strategy" | "insights";
};

export type ImportPreview = {
  matches: { postId: string; hook: string; publishedAt: string | null; by: "url" | "date"; line: number; impressions: number | null; reactions: number | null; comments: number | null; reposts: number | null }[];
  unmatched: MetricsMiss[];
  errors: string[];
  applied: number;
};


export type LinkedInAccountView = {
  memberUrn: string;
  name: string;
  picture: string;
  expiresAt: string;
  connectedAt: string;
  expired: boolean;
  expiringSoon: boolean;
  daysLeft: number;
};

export type LinkedInSettings = {
  config: {
    clientId: string;
    hasSecret: boolean;
    redirectUri: string;
    apiVersion: string;
    env: { clientId: boolean; clientSecret: boolean; redirectUri: boolean; apiVersion: boolean };
    ready: boolean;
  };
  defaultRedirectUri: string;
  account: LinkedInAccountView | null;
};
