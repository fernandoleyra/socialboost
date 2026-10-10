/**
 * iCalendar (RFC 5545) feed for scheduled posts. Pure.
 *
 * Subscribe-able from Apple Calendar, Outlook or Google Calendar (Google needs a public URL).
 * Lines end with CRLF and are folded at 75 octets; TEXT values escape \ ; , and newlines.
 */

export type IcsEvent = {
  uid: string;
  start: Date;
  durationMinutes: number;
  summary: string;
  description: string;
  url?: string;
  status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
  categories?: string[];
  lastModified?: Date | null;
};

export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Fold a content line to ≤ 75 octets per physical line without splitting UTF-8 sequences. */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    if (currentBytes + bytes > limit) {
      out.push(current);
      current = "";
      currentBytes = 0;
      limit = 74; // continuation lines start with a space
    }
    current += ch;
    currentBytes += bytes;
  }
  if (current) out.push(current);
  return out.join("\r\n ");
}

/** 20261010T083000Z */
export function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function prop(name: string, value: string): string {
  return foldIcsLine(`${name}:${value}`);
}

export function buildIcs(input: { name: string; description?: string; events: IcsEvent[]; now?: Date }): string {
  const now = input.now ?? new Date();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SocialBoost//Content Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    prop("X-WR-CALNAME", escapeIcsText(input.name)),
    ...(input.description ? [prop("X-WR-CALDESC", escapeIcsText(input.description))] : []),
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];
  for (const e of input.events) {
    const end = new Date(e.start.getTime() + Math.max(5, e.durationMinutes) * 60_000);
    lines.push(
      "BEGIN:VEVENT",
      prop("UID", e.uid),
      `DTSTAMP:${icsDate(now)}`,
      `DTSTART:${icsDate(e.start)}`,
      `DTEND:${icsDate(end)}`,
      prop("SUMMARY", escapeIcsText(e.summary)),
      prop("DESCRIPTION", escapeIcsText(e.description)),
      ...(e.url ? [prop("URL", e.url)] : []),
      ...(e.categories?.length ? [prop("CATEGORIES", e.categories.map(escapeIcsText).join(","))] : []),
      `STATUS:${e.status ?? "CONFIRMED"}`,
      ...(e.lastModified ? [`LAST-MODIFIED:${icsDate(e.lastModified)}`] : []),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
