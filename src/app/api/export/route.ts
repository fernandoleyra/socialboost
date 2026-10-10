import { DATA_DIR } from "@/lib/db";
import { HttpError, handle } from "@/lib/http";
import {
  getStrategy,
  getVoiceProfile,
  listActivity,
  listInterviews,
  listMemories,
  listMessages,
  listPhotos,
  listPostVersions,
  listPosts,
  listProfiles,
  listVoiceSamples,
  requireProfile,
  type Profile,
} from "@/lib/repo";
import { getAISettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const EXPORT_VERSION = 1;

function exportProfile(profile: Profile) {
  return {
    profile,
    strategy: getStrategy(profile.id),
    voice: {
      profile: getVoiceProfile(profile.id),
      samples: listVoiceSamples(profile.id),
    },
    interviews: listInterviews(profile.id).map((i) => ({ ...i, messages: listMessages(i.id) })),
    memories: listMemories(profile.id),
    photos: listPhotos(profile.id),
    posts: listPosts(profile.id).map((p) => ({ ...p, versions: listPostVersions(p.id) })),
    activity: listActivity(profile.id, 100_000),
  };
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "profile";
}

/**
 * Download everything as one JSON file.
 *  ?scope=active (default) — the active profile
 *  ?scope=all             — every profile plus model settings
 *  &secrets=1             — include API keys in the model settings (left out by default)
 *
 * Photo files are not embedded; they live in data/uploads and are referenced by filename.
 */
export const GET = handle(async (req: Request) => {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "active";
  if (scope !== "active" && scope !== "all") throw new HttpError(400, "scope must be 'active' or 'all'");
  const includeSecrets = url.searchParams.get("secrets") === "1";

  const profiles = scope === "all" ? listProfiles() : [requireProfile()];
  const ai = getAISettings();
  const settings = {
    ai: includeSecrets ? ai : { ...ai, providers: ai.providers.map((p) => ({ ...p, apiKey: p.apiKey ? "(removed)" : "" })) },
  };

  const payload = {
    app: "socialboost",
    exportVersion: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    scope,
    note: `Photo files are not included. Copy ${DATA_DIR}/uploads to keep them (filenames match photos[].filename).`,
    ...(scope === "all" ? { settings } : {}),
    profiles: profiles.map(exportProfile),
  };

  const date = new Date().toISOString().slice(0, 10);
  const name = scope === "all" ? `socialboost-export-${date}.json` : `socialboost-${slug(profiles[0].name)}-${date}.json`;
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
});
