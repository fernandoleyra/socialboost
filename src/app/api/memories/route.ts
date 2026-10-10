import { handle, ok } from "@/lib/http";
import { requireProfile } from "@/lib/repo";
import { ManualMemorySchema, createManualMemory, queryMemories } from "@/lib/memory";
import { parseMemoryFilter, type MemoryFilter } from "@/lib/memory-core";

export const dynamic = "force-dynamic";

/** Older callers pass `status=`; map it onto the bank's filters. */
function filterFrom(sp: URLSearchParams): MemoryFilter {
  const f = parseMemoryFilter(sp.get("filter"));
  if (f) return f;
  const status = sp.get("status");
  if (status === "ready" || status === "used" || status === "archived") return status;
  return "all";
}

/**
 * GET /api/memories?q=&pillar=&filter=all|ready|needs-photo|used|archived (or status=)
 * → { memories, counts, mode } where mode is "semantic" | "keyword" | "list".
 */
export const GET = handle(async (req: Request) => {
  const profile = requireProfile();
  const sp = new URL(req.url).searchParams;
  return ok(await queryMemories(profile.id, { q: sp.get("q"), pillar: sp.get("pillar"), filter: filterFrom(sp) }));
});

/**
 * POST /api/memories — a story written by hand: { story, title?, …fields, photoIds?, enrich? }.
 * With enrich (default) the extractor model fills in people, numbers, quotes, lesson, tags, angles.
 * → { memory, warning? } (warning when the model was unavailable and we saved it as written).
 */
export const POST = handle(async (req: Request) => {
  const profile = requireProfile();
  const input = ManualMemorySchema.parse(await req.json());
  return ok(await createManualMemory(profile.id, input), { status: 201 });
});
