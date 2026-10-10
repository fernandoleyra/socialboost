/** Option lists shared by Welcome, Settings and Strategy. Pure, client-safe. */

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "pt", label: "Português" },
  { code: "it", label: "Italiano" },
  { code: "nl", label: "Nederlands" },
  { code: "pl", label: "Polski" },
  { code: "sv", label: "Svenska" },
  { code: "da", label: "Dansk" },
  { code: "no", label: "Norsk" },
  { code: "fi", label: "Suomi" },
  { code: "cs", label: "Čeština" },
  { code: "ro", label: "Română" },
  { code: "tr", label: "Türkçe" },
  { code: "uk", label: "Українська" },
  { code: "ru", label: "Русский" },
  { code: "ar", label: "العربية" },
  { code: "hi", label: "हिन्दी" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "zh", label: "中文" },
] as const;

export function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

const FALLBACK_ZONES = [
  "UTC",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Zurich",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "Europe/Kyiv",
  "Europe/Istanbul",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/Bogota",
  "America/Sao_Paulo",
  "America/Buenos_Aires",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
];

/** Every IANA zone the runtime knows (falls back to a short list), always including `current`. */
export function timezoneOptions(current?: string): string[] {
  let zones: string[] = FALLBACK_ZONES;
  try {
    const all = Intl.supportedValuesOf("timeZone");
    if (all.length) zones = all;
  } catch {
    /* older runtime */
  }
  const set = new Set(zones);
  set.add("UTC");
  if (current) set.add(current);
  return [...set].sort((a, b) => (a === "UTC" ? -1 : b === "UTC" ? 1 : a.localeCompare(b)));
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Two-letter language code the browser prefers, if we support it. */
export function browserLanguage(): string {
  try {
    const code = (navigator.language || "en").slice(0, 2).toLowerCase();
    return LANGUAGES.some((l) => l.code === code) ? code : "en";
  } catch {
    return "en";
  }
}

/** Normalize a LinkedIn profile URL; returns null if it's clearly not one. Empty input → "". */
export function normalizeLinkedInUrl(input: string): string | null {
  const v = input.trim();
  if (!v) return "";
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
    const m = /^\/in\/([^/?#]+)/i.exec(u.pathname);
    if (!m) return null;
    return `https://www.linkedin.com/in/${decodeURIComponent(m[1])}`;
  } catch {
    return null;
  }
}
