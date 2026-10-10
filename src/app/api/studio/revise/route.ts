import { z } from "zod";
import { handle, streamText, HttpError } from "@/lib/http";
import { getStrategy, requireProfile } from "@/lib/repo";
import { fixInstructions, reviseStream } from "@/lib/factory/pipeline";
import { requirePost } from "@/lib/factory/posts";
import { REVISE_PRESETS, presetInstruction, type RevisePresetId } from "@/lib/factory/prompts";
import { readBody } from "@/lib/factory/request";

export const dynamic = "force-dynamic";

const PRESET_IDS = REVISE_PRESETS.map((p) => p.id) as [RevisePresetId, ...RevisePresetId[]];

const Body = z.object({
  postId: z.string().min(1),
  /** Free-text instruction ("make the ending less neat"). */
  instruction: z.string().max(1000).optional(),
  /** A quick-fix chip. */
  preset: z.enum(PRESET_IDS).optional(),
  /** Turn the linter's and/or the critic's findings into instructions. */
  fix: z.enum(["lint", "critique", "all"]).optional(),
  /** The editor's current text when it has unsaved edits. */
  body: z.string().max(10000).optional(),
});

/** POST /api/studio/revise { postId, instruction?, preset?, fix?, body? } → streamed revised text. */
export const POST = handle(async (req: Request) => {
  const profile = requireProfile();
  const input = await readBody(req, Body);
  const post = requirePost(profile.id, input.postId);
  const base = input.body ?? post.body;

  const changes: string[] = [];
  let note = "Revised";
  if (input.preset) {
    const text = presetInstruction(input.preset, getStrategy(profile.id));
    if (!text) throw new HttpError(400, "Add a call to action to your strategy first.", "Strategy → Call to action.");
    changes.push(text);
    note = `Revised: ${REVISE_PRESETS.find((p) => p.id === input.preset)!.label}`;
  }
  if (input.fix) {
    const fixes = await fixInstructions(post, base, input.fix);
    if (!fixes.length && !input.instruction && !input.preset) {
      throw new HttpError(400, input.fix === "critique" ? "There are no critique suggestions for this version." : "Nothing flagged to fix.", input.fix === "critique" ? "Run Critique first." : undefined);
    }
    changes.push(...fixes);
    note = input.fix === "lint" ? "Fixed flagged lines" : input.fix === "critique" ? "Applied critique" : "Applied fixes";
  }
  const { gen, onDone } = await reviseStream(post, { changes, instruction: input.instruction, body: input.body, note: input.instruction && !input.preset && !input.fix ? undefined : note, signal: req.signal });
  return streamText(gen, onDone);
});
