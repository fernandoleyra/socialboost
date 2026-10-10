/**
 * Runs once when a Next.js server starts. Starts the background publisher for scheduled posts
 * (Node.js runtime only; skipped during `next build` and when SOCIALBOOST_DISABLE_SCHEDULER=1).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.SOCIALBOOST_DISABLE_SCHEDULER === "1") return;
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
