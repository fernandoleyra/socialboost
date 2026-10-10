/**
 * Numbers, amounts and currencies the way the author said them. Pure and unit-tested; shared by
 * the linter, the generation clean-up and the interview extractors.
 *
 * Small local models "tidy up" figures: "40k" turns into "forty thousand dollars", "60%" into
 * "sixty percent". That reads less like LinkedIn, slips past a digits-only provenance check and,
 * worse, changes the facts: a Madrid agency's "40k" is not dollars. These helpers find spelled-out
 * numbers (English, basic Spanish) and currency mentions, decide which of them the source doesn't
 * back up, and can put the author's own form back.
 */

export type NumToken = {
  raw: string;
  value: number;
  start: number;
  end: number;
  /** Under 10, no currency, suffix or percent: counts people write either way ("3 of them"). */
  small: boolean;
  percent: boolean;
  spelled: boolean;
};

/* ------------------------------------------------------------------ */
/* Digits                                                              */
/* ------------------------------------------------------------------ */

const SCALE_WORDS = String.raw`thousand|million|billion|mil|millones|mill[oó]n`;
const NUM_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])([$€£¥₹]\s?)?(\d{1,3}(?:[,'’ ]\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?)(\s?(?:%|k|m|bn|x)(?![\p{L}])|\s(?:${SCALE_WORDS})(?![\p{L}]))?`,
  "giu",
);
const PERCENT_AFTER = /^\s*(?:percent|per cent|por ciento|porciento)(?![\p{L}])/iu;

export function parseNumber(core: string): number {
  // "1,400" / "8 500" / "1’000" → thousands; "1.5" / "2,5" → decimal.
  if (/^\d{1,3}(?:[,'’ ]\d{3})+(?:\.\d+)?$/.test(core)) return Number(core.replace(/[,'’ ]/g, ""));
  if (/^\d+,\d{1,2}$/.test(core)) return Number(core.replace(",", "."));
  if (/^\d{1,3}(?:\.\d{3})+$/.test(core)) return Number(core.replace(/\./g, ""));
  return Number(core.replace(/,/g, ""));
}

const SCALE_VALUE: Record<string, number> = { thousand: 1e3, mil: 1e3, million: 1e6, millon: 1e6, millones: 1e6, billion: 1e9 };

/** Numbers written with digits: "40k", "€84k", "60%", "8 500", "2 millones". */
export function extractNumbers(text: string): NumToken[] {
  const out: NumToken[] = [];
  NUM_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NUM_RE.exec(text))) {
    const [raw, currency, core, suffixRaw] = m;
    let value = parseNumber(core);
    const suffix = fold(suffixRaw ?? "").trim();
    if (suffix === "k") value *= 1e3;
    else if (suffix === "m") value *= 1e6;
    else if (suffix === "bn") value *= 1e9;
    else if (suffix in SCALE_VALUE) value *= SCALE_VALUE[suffix];
    const end = m.index + raw.length;
    const percent = suffix === "%" || PERCENT_AFTER.test(text.slice(end));
    const small = !currency && !suffix && !percent && Number.isInteger(value) && value < 10;
    out.push({ raw: raw.trim(), value, start: m.index, end, small, percent, spelled: false });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Spelled-out numbers (English, basic Spanish)                        */
/* ------------------------------------------------------------------ */

/** Lowercase without diacritics ("millón" → "millon", "veintitrés" → "veintitres"). */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Words that add their value ("twenty", "tres", "doscientos"). */
const ADDITIVE: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  // Spanish. "once" (11) is left out: it is an everyday English word.
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400,
  quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700,
  ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900,
};
/** "hundred" multiplies what came before it ("two hundred"). */
const HUNDRED = "hundred";
/** Scales close a group ("forty thousand", "dos millones"). */
const SCALE: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9, mil: 1e3, millon: 1e6, millones: 1e6 };
const ES_TENS = new Set(["treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"]);

const isNumberWord = (w: string) => w in ADDITIVE || w === HUNDRED || w in SCALE;

/** "two hundred and fifty", "treinta y dos" — but not "between one and two". */
function joins(prev: string, connector: string, next: string): boolean {
  if (connector === "and") return (prev === HUNDRED || prev in SCALE) && next in ADDITIVE;
  if (connector === "y") return ES_TENS.has(prev) && ADDITIVE[next] >= 1 && ADDITIVE[next] <= 9;
  return false;
}

type Word = { word: string; start: number; end: number };

function words(text: string): Word[] {
  const out: Word[] = [];
  const re = /\p{L}+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ word: fold(m[0]), start: m.index, end: m.index + m[0].length });
  return out;
}

function valueOf(run: string[]): number {
  let total = 0;
  let current = 0;
  for (const w of run) {
    if (w in ADDITIVE) current += ADDITIVE[w];
    else if (w === HUNDRED) current = (current || 1) * 100;
    else if (w in SCALE) {
      total += (current || 1) * SCALE[w];
      current = 0;
    }
  }
  return total + current;
}

/**
 * Numbers written as words: "sixty percent", "twenty-three", "forty thousand", "treinta y dos",
 * "veinte mil". A bare scale word ("a thousand times", "mil gracias") is an idiom, not a figure,
 * and is skipped.
 */
export function spelledNumbers(text: string): NumToken[] {
  const ws = words(text);
  const out: NumToken[] = [];
  let i = 0;
  while (i < ws.length) {
    if (!isNumberWord(ws[i].word)) {
      i++;
      continue;
    }
    const run = [ws[i]];
    let j = i + 1;
    while (j < ws.length) {
      const gap = text.slice(run[run.length - 1].end, ws[j].start);
      if (!/^[ \t\u00a0-]+$/.test(gap)) break;
      if (isNumberWord(ws[j].word)) {
        run.push(ws[j]);
        j++;
      } else if (j + 1 < ws.length && joins(run[run.length - 1].word, ws[j].word, ws[j + 1].word) && /^[ \t\u00a0]+$/.test(text.slice(ws[j].end, ws[j + 1].start))) {
        run.push(ws[j + 1]); // the connector itself is skipped
        j += 2;
      } else break;
    }
    const names = run.map((w) => w.word);
    const start = run[0].start;
    let end = run[run.length - 1].end;
    const after = PERCENT_AFTER.exec(text.slice(end)) ?? /^\s?%/.exec(text.slice(end));
    const percent = !!after;
    if (after) end += after[0].length;
    // Continue after the run and its percent words ("por ciento" is not another number).
    i = j;
    while (i < ws.length && ws[i].start < end) i++;
    if (names.every((w) => w === HUNDRED || w in SCALE)) continue;
    const value = valueOf(names);
    out.push({ raw: text.slice(start, end), value, start, end, small: !percent && value < 10, percent, spelled: true });
  }
  return out;
}

/** Digits and words together, in text order. */
export function allNumbers(text: string): NumToken[] {
  return [...extractNumbers(text), ...spelledNumbers(text)].sort((a, b) => a.start - b.start);
}

/** The figure without a leading currency symbol: "€84k" → "84k". */
const bare = (raw: string) => raw.replace(/^(?:US\$|R\$|[$€£¥₹])\s?/u, "");

/* ------------------------------------------------------------------ */
/* Currencies                                                          */
/* ------------------------------------------------------------------ */

export type CurrencyMention = {
  raw: string;
  family: string;
  start: number;
  end: number;
  /** A word that often means something else ("pounds" of weight, "pesos" at the gym). */
  ambiguous: boolean;
};

const SYMBOL_FAMILY: Record<string, string> = { "US$": "dollar", "R$": "real", $: "dollar", "€": "euro", "£": "pound", "¥": "yen", "₹": "rupee", "₽": "ruble", "₩": "won", "₺": "lira", zł: "zloty" };
const SYMBOL_RE = /(?<![\p{L}])US\$|(?<![\p{L}])R\$|zł(?!\p{L})|[$€£¥₹₽₩₺]/gu;

const CODE_FAMILY: Record<string, string> = {
  USD: "dollar", CAD: "dollar", AUD: "dollar", NZD: "dollar", HKD: "dollar", SGD: "dollar",
  EUR: "euro", GBP: "pound", JPY: "yen", CHF: "franc", INR: "rupee",
  MXN: "peso", ARS: "peso", CLP: "peso", COP: "peso", BRL: "real", CNY: "yuan", RMB: "yuan",
  SEK: "krona", NOK: "krona", DKK: "krona", PLN: "zloty", RUB: "ruble",
};
const CODE_RE = new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${Object.keys(CODE_FAMILY).join("|")})(?![\p{L}])`, "gu");

/** [pattern, family, ambiguous]. "real", "won" and "mark" are left out: they are everyday words. */
const CURRENCY_WORDS: [string, string, boolean][] = [
  ["dollars?|bucks|d[oó]lar(?:es)?|dollari|dollaro", "dollar", false],
  ["euros?|euro", "euro", false],
  ["quid|sterling", "pound", false],
  ["pounds?|libras?|pfund", "pound", true],
  ["yen", "yen", false],
  ["francs?|francos?|franken", "franc", true],
  ["rupees?|rupias?", "rupee", false],
  ["pesos?", "peso", true],
  ["reais", "real", false],
  ["yuan|renminbi", "yuan", false],
  ["kronor|kroner|krona|krone", "krona", false],
  ["z[łl]oty(?:s|ch)?", "zloty", false],
  ["roubles?|rubles?|rublos?", "ruble", false],
  ["liras?|lire", "lira", true],
];
const WORD_RE = new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${CURRENCY_WORDS.map(([p]) => p).join("|")})(?![\p{L}])`, "giu");
const WORD_ENTRIES = CURRENCY_WORDS.map(([p, family, ambiguous]) => ({ re: new RegExp(`^(?:${p})$`, "iu"), family, ambiguous }));

/** Every currency symbol, ISO code or currency word in the text. */
export function findCurrencies(text: string): CurrencyMention[] {
  const found: CurrencyMention[] = [];
  const scan = (re: RegExp, toMention: (raw: string) => Omit<CurrencyMention, "raw" | "start" | "end"> | null) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const info = toMention(m[0]);
      if (info) found.push({ raw: m[0], start: m.index, end: m.index + m[0].length, ...info });
    }
  };
  scan(SYMBOL_RE, (raw) => ({ family: SYMBOL_FAMILY[raw], ambiguous: false }));
  scan(CODE_RE, (raw) => ({ family: CODE_FAMILY[raw], ambiguous: false }));
  scan(WORD_RE, (raw) => {
    const e = WORD_ENTRIES.find((x) => x.re.test(raw));
    return e ? { family: e.family, ambiguous: e.ambiguous } : null;
  });
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  return found.filter((m, i) => !found.slice(0, i).some((p) => m.start < p.end && p.start < m.end));
}

type Attachment = { num: NumToken; strip: [number, number] };

/** The number a currency mention belongs to ("$40k", "40k dollars", "USD 40k", "40k-dollar"), with the span to remove. */
function attachment(text: string, m: CurrencyMention, nums: NumToken[]): Attachment | null {
  const spaceAfter = (i: number) => (/[ \u00a0]/.test(text[i] ?? "") ? 1 : 0);
  // Part of the token ("$40k", "US$40k").
  const inside = nums.find((n) => m.start < n.end && n.start < m.end);
  if (inside) return { num: inside, strip: [m.start, m.end + spaceAfter(m.end)] };
  // After the amount ("40k dollars", "40 €", "40k-dollar").
  const before = nums.find((n) => n.end <= m.start && /^[ \u00a0-]?$/.test(text.slice(n.end, m.start)));
  if (before) return { num: before, strip: [before.end, m.end] };
  // Before it ("USD 40k").
  const after = nums.find((n) => n.start >= m.end && /^[ \u00a0]?$/.test(text.slice(m.end, n.start)));
  if (after) return { num: after, strip: [m.start, after.start] };
  return null;
}

/** Currency families the text really uses. Ambiguous words only count next to a number. */
export function currencyFamilies(text: string): Set<string> {
  const nums = allNumbers(text);
  const out = new Set<string>();
  for (const m of findCurrencies(text)) if (!m.ambiguous || attachment(text, m, nums)) out.add(m.family);
  return out;
}

/** value → currency families it appears with in the text (null = without one). */
function amountsWithCurrency(text: string): Map<number, Set<string | null>> {
  const nums = allNumbers(text).filter((n) => !n.small);
  const out = new Map<number, Set<string | null>>();
  const attached = new Map<NumToken, string>();
  for (const m of findCurrencies(text)) {
    const a = attachment(text, m, nums);
    if (a) attached.set(a.num, m.family);
  }
  for (const n of nums) {
    const set = out.get(n.value) ?? new Set<string | null>();
    set.add(attached.get(n) ?? null);
    out.set(n.value, set);
  }
  return out;
}

export type CurrencyIssue = CurrencyMention & {
  /** "absent": the source never names this currency. "added": the source gives this amount without it. */
  kind: "absent" | "added";
  /** The amount as the source writes it, when the mention belongs to a number the source has. */
  suggest: string | null;
  /** What to delete to undo it (only for mentions attached to a number). */
  strip: [number, number] | null;
};

/** Currencies in `text` that `source` doesn't back up. */
export function currencyIssues(text: string, source: string): CurrencyIssue[] {
  const families = currencyFamilies(source);
  const sourceAmounts = amountsWithCurrency(source);
  const sourceNums = allNumbers(source).filter((n) => !n.small);
  const nums = allNumbers(text);
  const out: CurrencyIssue[] = [];
  for (const m of findCurrencies(text)) {
    const a = attachment(text, m, nums);
    if (m.ambiguous && !a) continue;
    const same = a ? sourceAmounts.get(a.num.value) : undefined;
    const suggestTok = a ? sourceNums.find((n) => n.value === a.num.value && !n.spelled) : undefined;
    const suggest = suggestTok ? bare(suggestTok.raw) : null;
    if (!families.has(m.family)) out.push({ ...m, kind: "absent", suggest, strip: a ? a.strip : null });
    else if (a && same && !same.has(m.family)) out.push({ ...m, kind: "added", suggest, strip: a.strip });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Numbers written as words where the source has digits                */
/* ------------------------------------------------------------------ */

export type DigitFix = { start: number; end: number; raw: string; replacement: string };

const nextWord = (text: string, idx: number) => fold(/^[\s-]*(\p{L}+)/u.exec(text.slice(idx))?.[1] ?? "");

/**
 * Spelled-out numbers in `text` that `source` writes with digits, and the digits to use instead:
 * "sixty percent" → "60%", "forty thousand" → "40k". Small numbers ("four products") only when the
 * source writes the same thing with a digit ("4 products"). When the source spells the number
 * itself, the words stay.
 */
export function digitFixes(text: string, source: string): DigitFix[] {
  const srcDigits = extractNumbers(source);
  const srcSpelled = new Set(spelledNumbers(source).map((n) => n.value));
  const out: DigitFix[] = [];
  for (const sp of spelledNumbers(text)) {
    if (sp.value === 0 || sp.value === 1 || srcSpelled.has(sp.value)) continue;
    const candidates = srcDigits.filter((d) => d.value === sp.value);
    if (!candidates.length) continue;
    const following = nextWord(text, sp.end);
    const sameNoun = candidates.filter((d) => following && nextWord(source, d.end) === following);
    if (sp.value < 10 && !sp.percent && !sameNoun.length) continue;
    const pick = sameNoun[0] ?? candidates.find((d) => d.percent === sp.percent) ?? candidates[0];
    const digits = bare(pick.raw);
    const hasPercentSign = /%$/.test(digits);
    // "sixty percent" → "60%" when the source has the sign; otherwise only the number words change.
    const numberEnd = sp.percent && !hasPercentSign ? sp.start + sp.raw.search(/\s*(?:percent|per cent|por ciento|porciento|%)\s*$/iu) : sp.end;
    const replacement = sp.percent || !hasPercentSign ? digits : digits.replace(/%$/, "");
    out.push({ start: sp.start, end: numberEnd, raw: text.slice(sp.start, numberEnd), replacement });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Putting the author's figures back                                   */
/* ------------------------------------------------------------------ */

/**
 * Rewrite figures the way the source has them: spelled-out numbers become the source's digits,
 * and currencies glued to an amount the source states without them are removed
 * ("forty thousand dollars of work" → "40k of work"). Everything else is left alone; the
 * linter reports what can't be fixed safely.
 */
export function alignFigures(text: string, source: string): string {
  if (!text || !source.trim()) return text;
  const edits: { start: number; end: number; replacement: string }[] = [
    ...digitFixes(text, source),
    ...currencyIssues(text, source)
      .filter((c) => c.strip)
      .map((c) => ({ start: c.strip![0], end: c.strip![1], replacement: "" })),
  ].sort((a, b) => b.start - a.start);
  let out = text;
  let floor = Infinity;
  for (const e of edits) {
    if (e.end > floor) continue; // overlaps an edit already applied
    let start = e.start;
    // A removal must not leave "a  rebrand" or "40k ." behind.
    if (!e.replacement && out[start - 1] === " " && /^(?:[ ,.;:!?)]|$)/.test(out.slice(e.end, e.end + 1))) start--;
    out = out.slice(0, start) + e.replacement + out.slice(e.end);
    floor = start;
  }
  return out;
}
