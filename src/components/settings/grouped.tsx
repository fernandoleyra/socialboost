import type { ReactNode } from "react";

/** Apple Settings-style section: small header, inset grouped list, optional footer note. */
export function Group({ id, title, footer, action, level = 2, children }: { id?: string; title?: ReactNode; footer?: ReactNode; action?: ReactNode; level?: 2 | 3; children: ReactNode }) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section id={id} className="scroll-mt-24 space-y-2">
      {(title || action) && (
        <div className="flex items-end justify-between gap-3 px-4">
          {title && <Heading className="t-footnote font-semibold uppercase tracking-wide text-label-2">{title}</Heading>}
          {action}
        </div>
      )}
      <div className="card list-group">{children}</div>
      {footer && <div className="px-4 t-footnote text-label-2">{footer}</div>}
    </section>
  );
}

/** A labelled row. Label left and control right on wide screens; stacked on phones. */
export function Row({ label, hint, children, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="list-row">
      <div className="flex w-full flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
        <label htmlFor={htmlFor} className="shrink-0 sm:w-44">
          <span className="block t-subhead font-medium">{label}</span>
          {hint && <span className="block t-caption text-label-2">{hint}</span>}
        </label>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
