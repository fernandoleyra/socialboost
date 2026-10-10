"use client";

import { useEffect, useRef, useState } from "react";
import { CloudDownload, ExternalLink, MapPin, ShieldCheck } from "lucide-react";
import { Button, Field, Input, Spinner, api, toast } from "@/components/ui";
import { DMA_SCOPE } from "@/lib/voice/dma";
import type { LinkedInImportResult } from "@/lib/voice/types";
import { errorMessage, isAbort } from "./format";
import { importSummary } from "./import-preview";

const NEW_APP_URL = "https://www.linkedin.com/developers/apps/new";
const TOKEN_TOOL_URL = "https://www.linkedin.com/developers/tools/oauth";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-fill-3 t-caption font-semibold tabular-nums">{n}</span>
      <div className="t-subhead min-w-0 flex-1 pt-0.5 text-label-2">{children}</div>
    </li>
  );
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline focus-ring rounded-sm">
      {children}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}

const Name = ({ children }: { children: React.ReactNode }) => <span className="font-medium text-label">{children}</span>;

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="tabular-nums">{Math.max(0, Math.round((now - since) / 1000))}s</span>;
}

/**
 * Import straight from LinkedIn with the Member Data Portability API (members in the EEA and
 * Switzerland). The token is sent once, for this import, and the field is cleared afterwards.
 */
export function LinkedInImportTab({ onImported, onUseExport }: { onImported: (r: LinkedInImportResult) => void; onUseExport: () => void }) {
  const [token, setToken] = useState("");
  const [started, setStarted] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busy = started !== null;

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = async () => {
    if (abortRef.current || !token.trim()) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStarted(Date.now());
    try {
      const r = await api<LinkedInImportResult>("/api/voice/import/linkedin", { method: "POST", json: { token }, signal: ctrl.signal });
      setToken("");
      if (r.inserted > 0 || r.updated > 0) toast(importSummary(r));
      else toast(`Nothing new: ${r.found === 1 ? "the post LinkedIn sent is" : `all ${r.found} posts LinkedIn sent are`} already in your library`, "info");
      for (const w of r.warnings) toast(w, "info");
      onImported(r);
    } catch (e) {
      if (isAbort(e)) toast("Import cancelled", "info");
      else toast(errorMessage(e), "error");
    } finally {
      abortRef.current = null;
      setStarted(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex gap-2.5 rounded-[14px] px-3.5 py-3 t-footnote" style={{ background: "color-mix(in srgb, var(--sys-blue) 10%, transparent)" }}>
        <MapPin className="mt-0.5 size-4 shrink-0 text-sys-blue" />
        <p>
          Only for members located in the EEA or Switzerland. Elsewhere, use the{" "}
          <button type="button" onClick={onUseExport} className="font-medium text-accent hover:underline focus-ring rounded-sm">
            LinkedIn data export (Shares.csv)
          </button>
          .
        </p>
      </div>

      <p className="t-subhead text-label-2">
        LinkedIn&apos;s official data portability API hands over every post you&apos;ve written, with dates and links. Setting it up takes a few minutes, once.
      </p>

      <ol className="space-y-3">
        <Step n={1}>
          <Link href={NEW_APP_URL}>Create a new LinkedIn app</Link> just for this. As its LinkedIn Page, choose <Name>Member Data Portability (Member) Default Company</Name>, not your own
          company page. Any app name works.
        </Step>
        <Step n={2}>
          In the app&apos;s <Name>Products</Name> tab, click <Name>Request access</Name> next to <Name>Member Data Portability API (Member)</Name> and accept the terms. Access is
          granted straight away.
        </Step>
        <Step n={3}>
          Open the <Link href={TOKEN_TOOL_URL}>OAuth Token Tool</Link> (Docs and tools → OAuth Token Tools), click <Name>Create token</Name>, pick that app, tick{" "}
          <code className="break-all rounded bg-fill-3 px-1 py-0.5 text-[13px]">{DMA_SCOPE}</code>, click <Name>Request access token</Name>, sign in and click <Name>Allow</Name>.
        </Step>
        <Step n={4}>Copy the access token, paste it below and import.</Step>
      </ol>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <Field label="Access token" hint="Used once for this import. SocialBoost doesn't save it.">
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste the token from the OAuth Token Tool"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
        </Field>
        {busy ? (
          <div className="flex flex-wrap items-center gap-3 rounded-[14px] bg-fill-4 px-3.5 py-3" role="status" aria-live="polite">
            <Spinner className="size-4" />
            <div className="min-w-0 flex-1 t-footnote">
              <div className="font-semibold text-label">Reading your posts from LinkedIn…</div>
              <div className="text-label-2">
                A long history takes a minute. <Elapsed since={started} />
              </div>
            </div>
            <Button type="button" size="sm" variant="glass" onClick={() => abortRef.current?.abort()}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button type="submit" variant="primary" icon={<CloudDownload className="size-4" />} disabled={!token.trim()}>
              Import from LinkedIn
            </Button>
          </div>
        )}
      </form>

      <div className="space-y-2 t-caption text-label-3">
        <p>
          Just allowed access? LinkedIn gathers your data first, and posts can take a day or two to arrive. If nothing comes back yet, try again later with the same token.
        </p>
        <p className="flex gap-1.5">
          <ShieldCheck className="mt-px size-3.5 shrink-0 text-sys-green" />
          The token goes from this page to your SocialBoost server and on to LinkedIn, nowhere else. It only lets SocialBoost read your own data.
        </p>
      </div>
    </div>
  );
}

