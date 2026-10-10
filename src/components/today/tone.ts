import type { CSSProperties } from "react";

/**
 * System-color styles for server components. (`TONES` in components/ui is a client
 * module export, so server components can't read it; this mirrors its values.)
 */
const KNOWN = new Set(["blue", "green", "indigo", "orange", "pink", "purple", "red", "teal", "yellow", "mint", "cyan"]);

export function toneColor(tone: string | null | undefined): string {
  if (!tone || !KNOWN.has(tone)) return "var(--sys-gray)";
  return tone === "yellow" ? "color-mix(in srgb, var(--sys-yellow) 70%, var(--label))" : `var(--sys-${tone})`;
}

/** Tinted icon well: colored glyph on a soft wash of the same color. */
export function toneWell(tone: string | null | undefined, strength = 14): CSSProperties {
  const fg = toneColor(tone);
  return { color: fg, background: `color-mix(in srgb, ${fg} ${strength}%, transparent)` };
}
