"use client";

import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes, type SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, CheckCircle2, AlertTriangle, Info } from "lucide-react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

type Material = "regular" | "strong" | "clear";
const materialClass: Record<Material, string> = { regular: "glass", strong: "glass-strong", clear: "glass-clear" };

export function Glass({ material = "regular", className, ...rest }: HTMLAttributes<HTMLDivElement> & { material?: Material }) {
  return <div className={cx(materialClass[material], "rounded-panel", className)} {...rest} />;
}

export function Card({ className, interactive, ...rest }: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return <div className={cx("card", interactive && "card-interactive cursor-pointer", className)} {...rest} />;
}

export function Section({ title, subtitle, action, children, className }: { title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("space-y-3", className)}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-4 px-1">
          <div>
            {title && <h2 className="t-title-3">{title}</h2>}
            {subtitle && <p className="t-footnote text-label-2 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Large-title page header, Apple style. */
export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-6 animate-in">
      <div className="min-w-0">
        {eyebrow && <div className="t-eyebrow mb-1">{eyebrow}</div>}
        <h1 className="t-large-title">{title}</h1>
        {subtitle && <p className="t-callout text-label-2 mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "glass" | "plain" | "tinted" | "destructive";
type ButtonSize = "sm" | "md" | "lg";

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; icon?: ReactNode }>(
  function Button({ variant = "glass", size = "md", loading, icon, className, children, disabled, ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={cx("btn", `btn-${variant}`, size === "sm" && "btn-sm", size === "lg" && "btn-lg", className)}
        disabled={disabled || loading}
        {...rest}
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
        {children}
      </button>
    );
  },
);

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} className={cx("icon-btn focus-ring", className)} {...rest}>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Fields                                                              */
/* ------------------------------------------------------------------ */

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx("field", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx("field", className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx("field", className)} {...rest}>
      {children}
    </select>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block space-y-1.5", className)}>
      <span className="t-footnote font-semibold text-label-2 px-1">{label}</span>
      {children}
      {hint && <span className="block t-caption text-label-3 px-1">{hint}</span>}
    </label>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch focus-ring" onClick={() => onChange(!checked)} />;
}

export function Segmented<T extends string>({ value, options, onChange, className }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx("segmented", className)} role="group">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Display                                                             */
/* ------------------------------------------------------------------ */

export const TONES: Record<string, { fg: string; bg: string }> = {
  blue: { fg: "var(--sys-blue)", bg: "color-mix(in srgb, var(--sys-blue) 14%, transparent)" },
  green: { fg: "var(--sys-green)", bg: "color-mix(in srgb, var(--sys-green) 15%, transparent)" },
  indigo: { fg: "var(--sys-indigo)", bg: "color-mix(in srgb, var(--sys-indigo) 14%, transparent)" },
  orange: { fg: "var(--sys-orange)", bg: "color-mix(in srgb, var(--sys-orange) 15%, transparent)" },
  pink: { fg: "var(--sys-pink)", bg: "color-mix(in srgb, var(--sys-pink) 14%, transparent)" },
  purple: { fg: "var(--sys-purple)", bg: "color-mix(in srgb, var(--sys-purple) 14%, transparent)" },
  red: { fg: "var(--sys-red)", bg: "color-mix(in srgb, var(--sys-red) 13%, transparent)" },
  teal: { fg: "var(--sys-teal)", bg: "color-mix(in srgb, var(--sys-teal) 15%, transparent)" },
  yellow: { fg: "color-mix(in srgb, var(--sys-yellow) 70%, var(--label))", bg: "color-mix(in srgb, var(--sys-yellow) 20%, transparent)" },
  mint: { fg: "var(--sys-mint)", bg: "color-mix(in srgb, var(--sys-mint) 15%, transparent)" },
  cyan: { fg: "var(--sys-cyan)", bg: "color-mix(in srgb, var(--sys-cyan) 15%, transparent)" },
  gray: { fg: "var(--label-2)", bg: "var(--fill-3)" },
};
export const TONE_NAMES = ["blue", "purple", "orange", "green", "pink", "teal", "indigo", "mint", "cyan", "yellow", "red"] as const;

export function Chip({ tone = "gray", className, style, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: string }) {
  const t = TONES[tone] ?? TONES.gray;
  return <span className={cx("chip", className)} style={{ ["--chip-fg" as string]: t.fg, ["--chip-bg" as string]: t.bg, ...style }} {...rest} />;
}

export function Meter({ value, color, className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={cx("meter", className)} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, ["--meter-color" as string]: color }} />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-5 animate-spin text-label-2", className)} />;
}

export function Typing() {
  return (
    <span className="typing inline-flex items-center py-1" aria-label="Thinking">
      <span />
      <span />
      <span />
    </span>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 px-8 py-14 text-center animate-in">
      {icon && <div className="grid size-14 place-items-center rounded-full bg-fill-4 text-label-2 [&>svg]:size-7">{icon}</div>}
      <div className="t-headline">{title}</div>
      {body && <p className="t-subhead text-label-2 max-w-md">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone = "blue", icon }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: string; icon?: ReactNode }) {
  const t = TONES[tone] ?? TONES.blue;
  return (
    <div className="card p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 t-footnote text-label-2 font-medium">
        {icon && (
          <span className="grid size-6 place-items-center rounded-full [&>svg]:size-3.5" style={{ color: t.fg, background: t.bg }}>
            {icon}
          </span>
        )}
        {label}
      </div>
      <div className="text-[28px] leading-8 font-bold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="t-caption text-label-2">{sub}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sheet (modal)                                                       */
/* ------------------------------------------------------------------ */

/** Open sheets, topmost last: only the topmost one reacts to Escape. */
const sheetStack: symbol[] = [];

export function Sheet({ open, onClose, title, children, footer, size = "md" }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" | "xl" }) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const token = Symbol("sheet");
    sheetStack.push(token);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || sheetStack[sheetStack.length - 1] !== token) return;
      e.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    // Move focus into the sheet so keyboard and screen-reader users land in it.
    requestAnimationFrame(() => {
      const el = panelRef.current;
      if (el && !el.contains(document.activeElement)) el.focus();
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      const i = sheetStack.indexOf(token);
      if (i >= 0) sheetStack.splice(i, 1);
      previouslyFocused?.focus?.();
    };
  }, [open]);
  if (!open || !mounted) return null;
  const width = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px] animate-in" onClick={onClose} />
      <div ref={panelRef} tabIndex={-1} className={cx("glass-strong relative w-full rounded-t-[28px] sm:rounded-window max-h-[92vh] flex flex-col animate-pop outline-none", width)}>
        <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-3">
          <div className="t-title-3 min-w-0 truncate">{title}</div>
          <IconButton label="Close" onClick={onClose} className="bg-fill-4">
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-6 pb-6 flex-1">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-separator px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; kind: ToastKind; message: string };
let pushToast: ((t: Omit<ToastItem, "id">) => void) | null = null;

export function toast(message: string, kind: ToastKind = "success") {
  pushToast?.({ message, kind });
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  useEffect(() => {
    pushToast = (t) => {
      const id = ++idRef.current;
      setItems((xs) => [...xs, { ...t, id }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), t.kind === "error" ? 7000 : 3500);
    };
    return () => {
      pushToast = null;
    };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div key={t.id} className="glass-strong pointer-events-auto flex max-w-lg items-center gap-2.5 rounded-full px-4 py-2.5 t-subhead font-medium animate-pop">
          {t.kind === "success" && <CheckCircle2 className="size-4.5 text-sys-green shrink-0" />}
          {t.kind === "error" && <AlertTriangle className="size-4.5 text-sys-red shrink-0" />}
          {t.kind === "info" && <Info className="size-4.5 text-sys-blue shrink-0" />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fetch helper for client components                                  */
/* ------------------------------------------------------------------ */

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const msg = (data && typeof data === "object" && "error" in data ? String((data as { error: unknown }).error) : null) ?? `Request failed (${res.status})`;
    const hint = data && typeof data === "object" && "hint" in data ? String((data as { hint: unknown }).hint) : "";
    throw new Error(hint ? `${msg} — ${hint}` : msg);
  }
  return data as T;
}

/** Read a streamed text response chunk by chunk. */
export async function streamText(url: string, body: unknown, onChunk: (text: string, full: string) => void, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    const text = await res.text();
    let msg = text;
    try {
      const j = JSON.parse(text);
      msg = j.hint ? `${j.error} — ${j.hint}` : j.error ?? text;
    } catch {
      /* plain text */
    }
    throw new Error(msg || `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    let piece = decoder.decode(value, { stream: true });
    // Server signals a mid-stream failure with a NUL-prefixed JSON trailer (see lib/http.ts).
    const nul = (full + piece).indexOf("\u0000");
    if (nul >= 0) {
      const trailer = (full + piece).slice(nul + 1);
      full = full.slice(0, Math.min(nul, full.length));
      let msg = "Generation failed";
      try {
        const j = JSON.parse(trailer);
        msg = j.hint ? `${j.error} — ${j.hint}` : j.error;
      } catch {
        /* partial trailer */
      }
      throw new Error(msg);
    }
    full += piece;
    onChunk(piece, full);
  }
  return full;
}
