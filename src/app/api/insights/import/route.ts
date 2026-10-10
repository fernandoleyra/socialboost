import { z } from "zod";
import { handle, ok } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { jsonBody } from "@/lib/calendar/body";
import { importMetrics } from "@/lib/calendar/service";

export const dynamic = "force-dynamic";

const Body = z.object({
  csv: z.string().min(1, "The file is empty.").max(5_000_000, "That file is too large. Export only the posts sheet."),
  dryRun: z.boolean().default(true),
});

/**
 * POST /api/insights/import { csv, dryRun? } → { matches, unmatched, errors, applied }
 * CSV columns (any order, common aliases): post URL and/or date + impressions / reactions /
 * comments / reposts. Rows match published posts by LinkedIn URL, else by publish day.
 */
export const POST = handle(async (req: Request) => {
  const profile = requireProfile();
  const body = await jsonBody(req, Body);
  return ok(importMetrics(profile, body.csv, body.dryRun));
});
