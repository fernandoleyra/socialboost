import { handle, ok } from "@/lib/http";
import { getAISettings, saveAISettings } from "@/lib/settings";
import { AISettingsSchema } from "@/lib/types";

export const GET = handle(async () => ok({ settings: getAISettings() }));

export const PUT = handle(async (req: Request) => {
  const settings = AISettingsSchema.parse(await req.json());
  saveAISettings(settings);
  return ok({ settings: getAISettings() });
});
