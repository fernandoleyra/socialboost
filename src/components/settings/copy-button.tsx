"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cx, toast } from "@/components/ui";

/** Copy text to the clipboard; falls back to execCommand on non-secure origins (e.g. http://192.168.x.x). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  } catch {
    return false;
  }
}

/** A command line with a copy button, e.g. `ollama pull qwen3:14b`. */
export function CommandLine({ command, className }: { command: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <div className={cx("flex items-center gap-1 rounded-control bg-fill-4 py-1 pl-3 pr-1 font-mono text-[12.5px] leading-5", className)}>
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap py-1">{command}</code>
      <button
        type="button"
        className="icon-btn size-7! shrink-0 text-label-2! focus-ring"
        aria-label={copied ? "Copied" : `Copy ${command}`}
        title="Copy"
        onClick={async () => {
          if (await copyText(command)) setCopied(true);
          else toast("Couldn't copy. Select the text and copy it by hand.", "error");
        }}
      >
        {copied ? <Check className="size-3.5 text-sys-green" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}
