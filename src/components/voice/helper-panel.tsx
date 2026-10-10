"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, Check, Copy, ShieldCheck } from "lucide-react";
import { Button, Textarea, toast } from "@/components/ui";
import { HELPER_SCRIPT, bookmarkletHref } from "@/lib/voice/helper-script";
import { ImportFormatError, parseHelperJson, type ParseResult } from "@/lib/voice/parse";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-fill-3 t-caption font-semibold tabular-nums">{n}</span>
      <div className="t-subhead min-w-0 flex-1 pt-0.5">{children}</div>
    </li>
  );
}

export function HelperPanel({ onParsed }: { onParsed: (r: ParseResult) => void }) {
  const [copied, setCopied] = useState(false);
  const [json, setJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);

  // React refuses javascript: URLs in JSX, so the bookmarklet's href is set on the element directly.
  useEffect(() => {
    linkRef.current?.setAttribute("href", bookmarkletHref());
  }, []);

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(HELPER_SCRIPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Couldn't copy. Select the script and copy it by hand.", "error");
    }
  };

  const preview = () => {
    setError(null);
    try {
      onParsed(parseHelperJson(json));
    } catch (e) {
      setError(e instanceof ImportFormatError ? [e.message, e.hint].filter(Boolean).join(" ") : "Couldn't read that.");
    }
  };

  return (
    <div className="space-y-5">
      <ol className="space-y-3">
        <Step n={1}>
          On a computer, open LinkedIn and go to your own activity: <span className="font-medium">Me → View profile → Show all posts</span>. The address looks like{" "}
          <code className="break-all rounded bg-fill-3 px-1 py-0.5 text-[13px]">linkedin.com/in/you/recent-activity/all/</code>.
        </Step>
        <Step n={2}>
          Run the helper. Either drag this button to your bookmarks bar and click it there,{" "}
          <a
            ref={linkRef}
            onClick={(e) => {
              e.preventDefault();
              toast("Drag it to your bookmarks bar, then click it on your LinkedIn activity page.", "info");
            }}
            className="btn btn-tinted btn-sm my-1 cursor-grab align-middle"
          >
            <Bookmark className="size-3.5" />
            SocialBoost helper
          </a>{" "}
          or open the browser console (<kbd className="t-caption">⌥⌘J</kbd> on Mac, <kbd className="t-caption">Ctrl+Shift+J</kbd> on Windows), paste the script and press Enter. Chrome may ask you to type <code className="rounded bg-fill-3 px-1 text-[13px]">allow pasting</code> first.
        </Step>
        <Step n={3}>It scrolls through your posts, opens each “…see more” and counts what&apos;s visible. Click “Stop and copy” whenever you have enough, then “Copy posts”.</Step>
        <Step n={4}>Paste the result below.</Step>
      </ol>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="t-footnote font-semibold text-label-2">Console script</span>
          <Button size="sm" variant="glass" icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} onClick={copyScript}>
            {copied ? "Copied" : "Copy script"}
          </Button>
        </div>
        <pre className="max-h-40 overflow-auto rounded-[14px] bg-fill-4 p-3 font-mono text-[12px] leading-relaxed text-label-2">{HELPER_SCRIPT}</pre>
      </div>

      <div className="flex gap-2.5 rounded-[14px] bg-fill-4 px-3.5 py-3 t-footnote text-label-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-sys-green" />
        <p>
          The helper only reads what&apos;s already on your screen, in your own browser. It never likes, comments, posts or sends anything, and nothing leaves your computer except
          what you paste here. LinkedIn&apos;s terms discourage scripts on its site, so use it at your own discretion; the data export (Shares.csv) is the official route for your full
          history.
        </p>
      </div>

      <div className="space-y-2">
        <Textarea rows={5} value={json} onChange={(e) => setJson(e.target.value)} placeholder='Paste what the helper copied. It starts with [ {"text": …' className="font-mono !text-[13px]" aria-label="Helper output" />
        {error && <p className="t-footnote text-sys-red">{error}</p>}
        <div className="flex justify-end">
          <Button variant="primary" onClick={preview} disabled={!json.trim()}>
            Preview posts
          </Button>
        </div>
      </div>
    </div>
  );
}
