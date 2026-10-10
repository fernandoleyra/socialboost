"use client";

import { forwardRef, useCallback, useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";
import { cx } from "@/components/ui";

/** Textarea that grows with its content (no inner scrollbar for normal-length text). */
export const AutoTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }>(function AutoTextarea(
  { className, minRows = 1, value, onChange, ...rest },
  forwarded,
) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const setRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      inner.current = el;
      if (typeof forwarded === "function") forwarded(el);
      else if (forwarded) forwarded.current = el;
    },
    [forwarded],
  );

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);

  return <textarea ref={setRef} rows={minRows} value={value} onChange={onChange} className={cx("field resize-none! overflow-hidden", className)} {...rest} />;
});
