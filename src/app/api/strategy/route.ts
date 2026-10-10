import { z } from "zod";
import { HttpError, handle, ok } from "@/lib/http";
import { getProfile, getStrategy, requireProfile, saveStrategy, updateProfile, type Profile } from "@/lib/repo";
import { StrategySchema } from "@/lib/types";
import { emptyStrategy, normalizeStrategy, prepareStrategyInput } from "@/components/strategy/model";

export const dynamic = "force-dynamic";

/**
 * `?profileId=` pins the request to the profile the editor was opened for. Without it a
 * debounced autosave that lands after a profile switch would overwrite the other person's
 * strategy. Falls back to the active profile.
 */
function targetProfile(req: Request): Profile {
  const id = new URL(req.url).searchParams.get("profileId");
  if (!id) return requireProfile();
  const profile = getProfile(id);
  if (!profile) throw new HttpError(404, "That profile no longer exists", "Reload the page to continue with the current profile.");
  return profile;
}

/** The profile's strategy, or null before the positioning interview / first edit. */
export const GET = handle(async (req: Request) => {
  const profile = targetProfile(req);
  return ok({ strategy: getStrategy(profile.id) });
});

/**
 * Save the strategy. Accepts a full strategy or a partial one: top-level keys that are
 * sent replace the stored ones, everything else is kept. The result is normalized
 * (trimmed lists, unique pillar ids, valid colors and cadence) and returned.
 * Changing the post language here also changes it on the profile, so both places agree.
 */
export const PUT = handle(async (req: Request) => {
  const profile = targetProfile(req);
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "The strategy must be sent as JSON.");
  }
  const body = z.record(z.string(), z.unknown()).parse(raw);
  const current = getStrategy(profile.id) ?? emptyStrategy(profile.language);
  const merged = StrategySchema.parse(prepareStrategyInput({ ...current, ...body }));
  const strategy = normalizeStrategy(merged);
  saveStrategy(profile.id, strategy);
  // Only an explicit language change is mirrored, so a full-object autosave never flips the profile.
  const languageChanged = typeof body.language === "string" && strategy.language !== current.language;
  if (languageChanged && strategy.language !== profile.language) updateProfile(profile.id, { language: strategy.language });
  return ok({ strategy });
});
