import { AlertTriangle, CheckCircle2, Info, Users } from "lucide-react";
import { TONES, cx } from "@/components/ui";
import { photoChecks, type PhotoView } from "@/lib/photo-core";

const ICONS = { green: CheckCircle2, orange: AlertTriangle, yellow: AlertTriangle, blue: Users, gray: Info } as const;

/** Advice about one photo: candid or not, readable text, consent, resolution, framing. */
export function PhotoChecks({ photo, className }: { photo: Pick<PhotoView, "width" | "height" | "isCandid" | "meta">; className?: string }) {
  const checks = photoChecks(photo, photo.meta);
  if (checks.length === 0) return null;
  return (
    <ul className={cx("space-y-2", className)}>
      {checks.map((c) => {
        const Icon = ICONS[c.tone];
        const tone = TONES[c.tone] ?? TONES.gray;
        return (
          <li key={c.id} className="flex gap-3 rounded-inner p-3" style={{ background: tone.bg }}>
            <Icon className="mt-0.5 size-4 shrink-0" style={{ color: tone.fg }} />
            <span className="min-w-0">
              <span className="block t-subhead font-semibold">{c.title}</span>
              <span className="block t-footnote text-label-2">{c.body}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
