import { z } from "zod";
import { handle, ok } from "@/lib/http";
import { getStrategy, requireProfile, saveStrategy } from "@/lib/repo";
import { StrategySchema } from "@/lib/types";
import { emptyStrategy, normalizeStrategy, prepareStrategyInput } from "@/components/strategy/model";

export const dynamic = "force-dynamic";

/** The active profile's strategy, or null before the positioning interview / first edit. */
export const GET = handle(async () => {
  const profile = requireProfile();
  return ok({ strategy: getStrategy(profile.id) });
});

/**
 * Save the strategy. Accepts a full strategy or a partial one: top-level keys that are
 * sent replace the stored ones, everything else is kept. The result is normalized
 * (trimmed lists, unique pillar ids, valid colors and cadence) and returned.
 */
export const PUT = handle(async (req: Request) => {
  const profile = requireProfile();
  const body = z.record(z.string(), z.unknown()).parse(await req.json());
  const current = getStrategy(profile.id) ?? emptyStrategy(profile.language);
  const merged = StrategySchema.parse(prepareStrategyInput({ ...current, ...body }));
  const strategy = normalizeStrategy(merged);
  saveStrategy(profile.id, strategy);
  return ok({ strategy });
});
