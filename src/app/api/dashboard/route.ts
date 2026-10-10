import { handle, ok } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { loadDashboard } from "@/components/today/data";

export const dynamic = "force-dynamic";

/** The Today view model as JSON: next best actions, pipeline stats, this week, pillar balance, activity. */
export const GET = handle(async () => ok(loadDashboard(requireProfile())));
