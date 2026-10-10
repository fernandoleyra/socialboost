/**
 * Angles: the "how do we tell this story" decision made before drafting. Pure — safe on the client.
 *
 * Storage: `posts.angle` holds a small JSON document (`AngleField`) with the angle options the
 * model suggested and the one the user picked. Older or hand-written values that aren't JSON are
 * read as a free-text note, so the column stays forgiving.
 */

import { z } from "zod";
import { STRUCTURE_IDS, matchStructureId, type StructureId } from "./structures";

/** Hook types from research 02 §5.1. Each is filled from a field of the story. */
export const HOOK_TYPES = ["scene", "dialogue", "number", "confession", "credential", "photo"] as const;
export type HookType = (typeof HOOK_TYPES)[number];

export const HOOK_TYPE_LABELS: Record<HookType, { label: string; hint: string }> = {
  scene: { label: "Scene", hint: "time + place + what was happening" },
  dialogue: { label: "Dialogue", hint: "a line someone said, word for word, and who said it" },
  number: { label: "Number", hint: "a number from the story and what was at stake" },
  confession: { label: "Confession", hint: "a mistake, or something I almost did" },
  credential: { label: "Credential", hint: "what I've done, plus the belief it gave me" },
  photo: { label: "Photo", hint: "what the photo shows and the moment behind it" },
};

/** Schema the model fills. Enums constrain local models through Ollama's structured outputs. */
export const AngleSchema = z.object({
  hook: z.string(),
  hookType: z.enum(HOOK_TYPES),
  structureId: z.enum(STRUCTURE_IDS),
  takeaway: z.string(),
  whyItWorks: z.string(),
});
export type Angle = z.infer<typeof AngleSchema>;

export const AnglesResponseSchema = z.object({ angles: z.array(AngleSchema).min(1).max(5) });

export const HooksResponseSchema = z.object({
  hooks: z.array(z.object({ text: z.string(), type: z.enum(HOOK_TYPES) })).min(1).max(8),
});
export type HookOption = z.infer<typeof HooksResponseSchema>["hooks"][number];

export type AngleField = {
  selected: Angle | null;
  options: Angle[];
  /** Free text that was in the column before it held JSON. */
  note: string;
};

export const EMPTY_ANGLE_FIELD: AngleField = { selected: null, options: [], note: "" };

const LooseAngle = z.object({
  hook: z.string().default(""),
  hookType: z.string().default("scene"),
  structureId: z.string().default("scene-lesson"),
  takeaway: z.string().default(""),
  whyItWorks: z.string().default(""),
});

function coerceAngle(raw: unknown, fallback: StructureId = "scene-lesson"): Angle | null {
  const p = LooseAngle.safeParse(raw);
  if (!p.success) return null;
  const hookType = (HOOK_TYPES as readonly string[]).includes(p.data.hookType.toLowerCase()) ? (p.data.hookType.toLowerCase() as HookType) : "scene";
  const hook = cleanHook(p.data.hook, { keepQuotes: hookType === "dialogue" });
  const takeaway = p.data.takeaway.trim();
  if (!hook && !takeaway) return null;
  return {
    hook,
    hookType,
    structureId: matchStructureId(p.data.structureId) ?? fallback,
    takeaway,
    whyItWorks: p.data.whyItWorks.trim(),
  };
}

export function parseAngleField(raw: string | null | undefined): AngleField {
  const text = (raw ?? "").trim();
  if (!text) return { ...EMPTY_ANGLE_FIELD };
  if (text.startsWith("{")) {
    try {
      const j = JSON.parse(text) as { selected?: unknown; options?: unknown; note?: unknown };
      const options = Array.isArray(j.options) ? j.options.map((o) => coerceAngle(o)).filter((a): a is Angle => !!a) : [];
      return { selected: j.selected ? coerceAngle(j.selected) : null, options, note: typeof j.note === "string" ? j.note : "" };
    } catch {
      /* not ours — treat as a note */
    }
  }
  return { selected: null, options: [], note: text };
}

export function serializeAngleField(f: AngleField): string {
  if (!f.selected && f.options.length === 0 && !f.note) return "";
  return JSON.stringify({ v: 1, selected: f.selected, options: f.options, ...(f.note ? { note: f.note } : {}) });
}

/**
 * Strip labels, wrapping quotes and spacing noise models add around a hook. Dialogue hooks keep
 * their quotes: there the quote marks are the point.
 */
export function cleanHook(hook: string, opts: { keepQuotes?: boolean } = {}): string {
  let h = hook.replace(/\s+/g, " ").trim();
  h = h.replace(/^(?:hook|first line|line \d)\s*[:\-–]\s*/i, "");
  if (!opts.keepQuotes && /^["“'«].*["”'»]$/.test(h) && !/["“”].+["“”].+["“”]/.test(h.slice(1, -1))) h = h.slice(1, -1).trim();
  return h.replace(/\s+([,.!?])/g, "$1");
}

/** A user-chosen angle: only the structure is required (hook and takeaway may be empty). */
export function toAngle(raw: unknown, fallback: StructureId = "scene-lesson"): Angle | null {
  const p = LooseAngle.safeParse(raw);
  if (!p.success) return null;
  const structureId = matchStructureId(p.data.structureId);
  if (!structureId) return coerceAngle(raw, fallback);
  const hookType = (HOOK_TYPES as readonly string[]).includes(p.data.hookType.toLowerCase()) ? (p.data.hookType.toLowerCase() as HookType) : "scene";
  return { hook: cleanHook(p.data.hook, { keepQuotes: hookType === "dialogue" }), hookType, structureId, takeaway: p.data.takeaway.trim(), whyItWorks: p.data.whyItWorks.trim() };
}

/** Validate, de-duplicate and cap model-suggested angles. */
export function normalizeAngles(raw: unknown[], fallback: StructureId, max = 3): Angle[] {
  const seen = new Set<string>();
  const out: Angle[] = [];
  for (const r of raw) {
    const a = coerceAngle(r, fallback);
    if (!a || !a.hook) continue;
    const key = a.hook.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
    if (out.length >= max) break;
  }
  return out;
}

/** Replace the first line (the hook) of a post, keeping everything after it. */
export function replaceHook(body: string, hook: string): string {
  const clean = cleanHook(hook, { keepQuotes: true });
  const nl = body.indexOf("\n");
  if (nl < 0) return clean;
  return clean + body.slice(nl);
}

/** First non-empty line, used as the post's hook preview everywhere. */
export function hookOf(body: string): string {
  return (body.split("\n").find((l) => l.trim()) ?? "").trim();
}
