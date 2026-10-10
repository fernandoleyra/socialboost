/**
 * Word-level diff for the version history ("what changed since this version"). Pure.
 * Classic LCS over tokens (words + whitespace runs). Posts are ≤ 3,000 characters, so the
 * O(n·m) table stays small; very long inputs fall back to a single replace.
 */

export type DiffPart = { type: "same" | "add" | "del"; text: string };

const tokenize = (s: string) => s.match(/\s+|[^\s]+/g) ?? [];

export function diffWords(before: string, after: string, maxTokens = 1800): DiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);
  if (a.length * b.length > maxTokens * maxTokens) {
    return [
      ...(before ? [{ type: "del" as const, text: before }] : []),
      ...(after ? [{ type: "add" as const, text: after }] : []),
    ];
  }
  const n = a.length;
  const m = b.length;
  // dp[i][j] = LCS length of a[i:] and b[j:], stored flat.
  const dp = new Uint16Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[at(i, j)] = a[i] === b[j] ? dp[at(i + 1, j + 1)] + 1 : Math.max(dp[at(i + 1, j)], dp[at(i, j + 1)]);
    }
  }
  const out: DiffPart[] = [];
  const emit = (type: DiffPart["type"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      emit("same", a[i]);
      i++;
      j++;
    } else if (dp[at(i + 1, j)] >= dp[at(i, j + 1)]) {
      emit("del", a[i++]);
    } else {
      emit("add", b[j++]);
    }
  }
  while (i < n) emit("del", a[i++]);
  while (j < m) emit("add", b[j++]);
  return out;
}

/** Share of words that changed, 0..1. */
export function changeRatio(parts: DiffPart[]): number {
  let changed = 0;
  let total = 0;
  for (const p of parts) {
    const words = (p.text.match(/\S+/g) ?? []).length;
    total += words;
    if (p.type !== "same") changed += words;
  }
  return total ? changed / total : 0;
}
