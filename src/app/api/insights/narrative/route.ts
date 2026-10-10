import { chatStream } from "@/lib/llm";
import { HttpError, handle, streamText } from "@/lib/http";
import { getStrategy, requireProfile } from "@/lib/repo";
import { insightsDigest } from "@/lib/calendar/insights";
import { insightsFor } from "@/lib/calendar/service";

export const dynamic = "force-dynamic";

function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? "English";
  } catch {
    return "English";
  }
}

const SYSTEM = `You are a calm, practical LinkedIn coach. You review one person's own post results and say what is working.
You only use the numbers you are given. You never invent numbers, posts or reasons.`;

/**
 * POST /api/insights/narrative → streamed plain text: 4-6 bullets on what's working and what to
 * try next, written from the aggregates only (critic task). Short, numbered rules so 7-14B
 * local models stay grounded.
 */
export const POST = handle(async (req: Request) => {
  const profile = requireProfile();
  const { insights } = insightsFor(profile);
  if (insights.totals.measured < 3) {
    throw new HttpError(409, "Log results for at least 3 posts first.", "Add reactions and comments in the table below, or import a CSV.");
  }
  const strategy = getStrategy(profile.id);
  const language = languageName(strategy?.language || profile.language || "en");
  const user = `My LinkedIn results:
<data>
${insightsDigest(insights)}
</data>

Write 4 to 6 short bullet points about what is working and what to change.
Rules:
1. Start every bullet with "- ". No title, no intro sentence, no closing sentence.
2. Each bullet names one group from the data (a pillar, opening style, structure, weekday, time of day, photo or length) and gives its index or average from the data.
3. If a group has fewer than 3 posts, call it an early signal.
4. Use only the data above. Do not invent numbers, posts or reasons.
5. Plain words. No hype, no emojis, no hashtags, no bold, no markdown headings.
6. The last bullet starts with "Next:" and names the one change to try in the next two weeks.
7. Write in ${language}.

Example of one good bullet:
- "Hiring" posts run at index 140 across 4 posts, your strongest pillar. Keep it in the plan at least once a week.`;

  const gen = chatStream({ task: "critic", system: SYSTEM, messages: [{ role: "user", content: user }], temperature: 0.3, maxTokens: 600, signal: req.signal });
  return streamText(gen);
});
