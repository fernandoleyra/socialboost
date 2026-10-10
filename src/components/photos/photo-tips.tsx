import { Check } from "lucide-react";
import { cx } from "@/components/ui";
import { PHOTO_TIPS } from "@/lib/photo-core";

/** What makes a good LinkedIn photo, shown wherever we ask for one. */
export function PhotoTips({ limit, className }: { limit?: number; className?: string }) {
  const tips = limit ? PHOTO_TIPS.slice(0, limit) : PHOTO_TIPS;
  return (
    <ul className={cx("space-y-2.5", className)}>
      {tips.map((t) => (
        <li key={t.title} className="flex gap-2.5">
          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--sys-green)_15%,transparent)] text-sys-green">
            <Check className="size-3" strokeWidth={3} />
          </span>
          <span className="t-footnote">
            <span className="font-semibold">{t.title}.</span> <span className="text-label-2">{t.body}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
