/** Pillar lookup shared by server and client. Pure. */

import type { Pillar, Strategy } from "@/lib/types";

/** Match a post/memory pillar reference (id or name) to the strategy's pillar. */
export function findPillar(strategy: Pick<Strategy, "pillars"> | null | undefined, key: string | null | undefined): Pillar | null {
  if (!strategy || !key) return null;
  const k = key.trim().toLowerCase();
  return strategy.pillars.find((p) => p.id === key) ?? strategy.pillars.find((p) => p.name.trim().toLowerCase() === k) ?? null;
}
