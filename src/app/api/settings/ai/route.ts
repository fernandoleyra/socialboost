import { handle, ok } from "@/lib/http";
import { getAISettings, maskAISettings, saveAISettings, unmaskAISettings } from "@/lib/settings";
import { AISettingsSchema } from "@/lib/types";

export const GET = handle(async () => ok({ settings: maskAISettings(getAISettings()) }));

export const PUT = handle(async (req: Request) => {
  const settings = unmaskAISettings(AISettingsSchema.parse(await req.json()));
  saveAISettings(settings);
  return ok({ settings: maskAISettings(getAISettings()) });
});
