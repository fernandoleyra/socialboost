import "server-only";
import { getDb, logActivity } from "./db";
import { getSetting, setSetting } from "./settings";
import { hasUsableConnection, isPublishingMarker, publishToLinkedIn } from "./linkedin";
import { MISSED_MESSAGE, VERIFY_MESSAGE } from "./calendar/linkedin-format";

/**
 * Background publisher. Started once per server process from src/instrumentation.ts.
 *
 * Every minute: find posts with status "scheduled" whose time has come.
 *  - LinkedIn connected and the token valid → publish (the person approved and scheduled the
 *    exact text, which is the human-in-the-loop gate LinkedIn's AI policy asks for).
 *  - Not connected → leave it; the calendar shows "Due, post it now" with copy + open LinkedIn.
 *  - Later than the grace window (the machine was asleep) → don't post hours late; mark it
 *    missed so the person decides (research 05 §8).
 * Each scheduled time is attempted at most once: a failure stays on the post for a human, and
 * rescheduling to a new time makes it eligible again. Double runs are prevented by a process
 * flag plus a per-post claim in the database (see publishToLinkedIn).
 */

const TICK_MS = 60_000;
const FIRST_TICK_MS = 15_000;
const ATTEMPTS_KEY = "scheduler:attempts";

function graceMs(): number {
  const minutes = Number(process.env.SOCIALBOOST_PUBLISH_GRACE_MINUTES);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 120) * 60_000;
}

type SchedulerState = { timer: ReturnType<typeof setInterval>; running: boolean; startedAt: string };
const g = globalThis as unknown as { __socialboostScheduler?: SchedulerState };

export function schedulerDisabled(): boolean {
  return process.env.SOCIALBOOST_DISABLE_SCHEDULER === "1";
}

export function startScheduler() {
  if (schedulerDisabled() || g.__socialboostScheduler) return;
  const state: SchedulerState = {
    timer: setInterval(() => void runTick(), TICK_MS),
    running: false,
    startedAt: new Date().toISOString(),
  };
  state.timer.unref?.();
  g.__socialboostScheduler = state;
  setTimeout(() => void runTick(), FIRST_TICK_MS).unref?.();
}

async function runTick() {
  const state = g.__socialboostScheduler;
  if (!state || state.running) return;
  state.running = true;
  try {
    await schedulerTick();
  } catch (err) {
    console.error("[scheduler]", err);
  } finally {
    state.running = false;
  }
}

type DueRow = { id: string; profile_id: string; scheduled_at: string; error: string | null };

/** One pass over due posts. Exported for tests and manual triggering. */
export async function schedulerTick(now: Date = new Date()): Promise<{ published: number; failed: number; missed: number; waiting: number }> {
  const rows = getDb().prepare(`SELECT id, profile_id, scheduled_at, error FROM posts WHERE status = 'scheduled' AND scheduled_at IS NOT NULL`).all() as DueRow[];
  const attempts = getSetting<Record<string, string>>(ATTEMPTS_KEY, {});
  const live = new Set(rows.map((r) => r.id));
  const nextAttempts: Record<string, string> = Object.fromEntries(Object.entries(attempts).filter(([id]) => live.has(id)));
  const result = { published: 0, failed: 0, missed: 0, waiting: 0 };

  const due = rows
    .map((r) => ({ ...r, t: Date.parse(r.scheduled_at) }))
    .filter((r) => !Number.isNaN(r.t) && r.t <= now.getTime())
    .sort((a, b) => a.t - b.t);

  for (const row of due) {
    if (nextAttempts[row.id] === row.scheduled_at) continue;
    // In flight, or an earlier attempt may have gone out: a human has to look first.
    if (isPublishingMarker(row.error) || row.error === VERIFY_MESSAGE) continue;
    const conn = hasUsableConnection(row.profile_id);
    if (!conn.connected) {
      result.waiting++;
      continue;
    }
    nextAttempts[row.id] = row.scheduled_at;
    setSetting(ATTEMPTS_KEY, nextAttempts);

    if (now.getTime() - row.t > graceMs()) {
      getDb().prepare(`UPDATE posts SET error = ?, updated_at = datetime('now') WHERE id = ? AND status = 'scheduled'`).run(MISSED_MESSAGE, row.id);
      logActivity("publish", "A scheduled post missed its time while SocialBoost was off", { profileId: row.profile_id, refId: row.id });
      result.missed++;
      continue;
    }
    if (conn.expired) {
      getDb()
        .prepare(`UPDATE posts SET error = ?, updated_at = datetime('now') WHERE id = ? AND status = 'scheduled'`)
        .run("Your LinkedIn connection expired, so this didn't go out. Reconnect in Settings → LinkedIn, then post it.", row.id);
      result.failed++;
      continue;
    }
    // Clear a stale message from an earlier slot so the claim starts clean.
    if (row.error) getDb().prepare(`UPDATE posts SET error = NULL WHERE id = ? AND error = ?`).run(row.id, row.error);
    try {
      await publishToLinkedIn(row.profile_id, row.id, { trigger: "scheduler" });
      result.published++;
    } catch {
      // publishToLinkedIn already stored the reason on the post and in the activity log.
      result.failed++;
    }
  }
  setSetting(ATTEMPTS_KEY, nextAttempts);
  return result;
}
