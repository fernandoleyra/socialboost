"use client";

import { useEffect, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Button, Sheet, api, toast } from "@/components/ui";
import { copyText } from "./helpers";

/** Calendar subscription (iCalendar feed) with copy, open-in-app and reset. */
export function SubscribeSheet({ open, path, onClose, onPathChange }: { open: boolean; path: string; onClose: () => void; onPathChange: (p: string) => void }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [resetting, setResetting] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const url = origin + path;
  const webcal = url.replace(/^https?:\/\//, "webcal://");
  const isLocal = /\/\/(localhost|127\.|192\.168\.|10\.|\[::1\])/.test(url);

  const reset = async () => {
    if (!window.confirm("Make a new link? Calendars subscribed with the old link stop updating.")) return;
    setResetting(true);
    try {
      const res = await api<{ path: string }>("/api/calendar/ics", { method: "POST" });
      onPathChange(res.path);
      toast("New link ready. Subscribe again with it.");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setResetting(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Subscribe in your calendar app">
      <div className="space-y-5">
        <p className="t-subhead text-label-2">
          See planned and scheduled posts next to your meetings. Each event has the post text and a link back here. Calendar apps refresh it about once an hour.
        </p>
        <div className="flex items-center gap-1 rounded-control bg-fill-4 py-1 pl-3 pr-1 font-mono text-[12.5px] leading-5">
          <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap py-1">{url}</code>
          <button
            type="button"
            className="icon-btn size-8! shrink-0 focus-ring"
            aria-label={copied ? "Copied" : "Copy the link"}
            onClick={async () => {
              if (await copyText(url)) setCopied(true);
              else toast("Couldn't copy. Select the link and copy it by hand.", "error");
            }}
          >
            {copied ? <Check className="size-4 text-sys-green" /> : <Copy className="size-4" />}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={webcal} className="btn btn-primary">
            Open in Calendar
          </a>
          <Button variant="plain" onClick={reset} loading={resetting} icon={<RefreshCw className="size-4" />}>
            Make a new link
          </Button>
        </div>
        <ul className="space-y-2 t-footnote text-label-2">
          <li>
            <strong className="font-semibold text-label">Apple Calendar or Outlook:</strong> “Open in Calendar”, or File → New Calendar Subscription and paste the link.
          </li>
          <li>
            <strong className="font-semibold text-label">Google Calendar:</strong> Other calendars → From URL.{" "}
            {isLocal ? "Google fetches from its own servers, so it can only reach SocialBoost if it runs on a public address." : "Paste the link."}
          </li>
          <li>The link contains a private key. Anyone with it can read your planned posts, so share it only with your own calendar.</li>
        </ul>
      </div>
    </Sheet>
  );
}
