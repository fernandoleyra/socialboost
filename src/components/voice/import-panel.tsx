"use client";

import { useRef, useState } from "react";
import { ClipboardPaste, CloudDownload, FileSpreadsheet, Upload } from "lucide-react";
import { Button, Segmented, Textarea, cx } from "@/components/ui";
import { ImportFormatError, parsePastedPosts, parseSharesCsv, type ParseResult } from "@/lib/voice/parse";
import type { ImportResult } from "@/lib/voice/types";
import { ImportPreview } from "./import-preview";
import { LinkedInImportTab } from "./linkedin-import";

type Tab = "paste" | "export" | "linkedin";
const MAX_FILE_BYTES = 15 * 1024 * 1024;

function formatError(e: unknown): string {
  return e instanceof ImportFormatError ? [e.message, e.hint].filter(Boolean).join(" ") : e instanceof Error ? e.message : "Couldn't read that.";
}

function ExportTab({ onParsed }: { onParsed: (r: ParseResult) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const read = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (/\.zip$/i.test(file.name)) {
      setError("That's the whole archive. Unzip it and choose the file called Shares.csv inside.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is larger than 15 MB. Is it really Shares.csv?");
      return;
    }
    setReading(true);
    try {
      onParsed(parseSharesCsv(await file.text()));
    } catch (e) {
      setError(formatError(e));
    } finally {
      setReading(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="space-y-5">
      <p className="t-subhead text-label-2">Works for every LinkedIn member: LinkedIn&apos;s own copy of your data holds the full text and date of every post you wrote.</p>
      <ol className="space-y-2 t-subhead text-label-2">
        <li>
          <span className="font-semibold text-label">1.</span> On LinkedIn: <span className="text-label">Me → Settings &amp; Privacy → Data privacy → Get a copy of your data</span>.
        </li>
        <li>
          <span className="font-semibold text-label">2.</span> Choose <span className="text-label">Want something in particular?</span>, tick <span className="text-label">Posts</span> (called{" "}
          <span className="text-label">Shares</span> in some versions), and request the archive.
        </li>
        <li>
          <span className="font-semibold text-label">3.</span> LinkedIn emails you a download link, usually within a day. The link works for 72 hours.
        </li>
        <li>
          <span className="font-semibold text-label">4.</span> Unzip the download and drop <span className="text-label">Shares.csv</span> here.
        </li>
      </ol>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void read(e.dataTransfer.files[0]);
        }}
        className={cx(
          "flex w-full flex-col items-center gap-2 rounded-[20px] border-2 border-dashed px-6 py-10 text-center transition-colors focus-ring",
          over ? "border-accent bg-accent/10" : "border-separator bg-fill-4 hover:bg-fill-3",
        )}
      >
        <span className="grid size-12 place-items-center rounded-full bg-fill-3 text-label-2">
          <Upload className="size-5" />
        </span>
        <span className="t-headline">{reading ? "Reading…" : "Drop Shares.csv here"}</span>
        <span className="t-footnote text-label-2">or click to choose the file</span>
      </button>
      <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void read(e.target.files?.[0])} />
      {error && <p className="t-footnote text-sys-red">{error}</p>}
      <p className="t-caption text-label-3">The export has no reactions or comments. After importing, add the numbers to your best posts so the writer learns from those first.</p>
    </div>
  );
}

export function PasteTab({ headerLines, kind, onParsed }: { headerLines: string[]; kind: "own" | "reference"; onParsed: (r: ParseResult) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const preview = () => {
    const r = parsePastedPosts(text, { headerLines });
    if (!r.posts.length) {
      setError("No posts found. Paste the full text of at least one post (40+ characters).");
      return;
    }
    setError(null);
    onParsed(r);
  };
  return (
    <div className="space-y-3">
      <Textarea
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={kind === "own" ? "Paste one or more of your LinkedIn posts.\n\nPut a line with --- between posts.\n\nYou can also copy straight from your activity page: we strip the likes, comments and buttons." : "Paste one or more of their posts. Put a line with --- between posts."}
        aria-label="Posts to import"
      />
      {error && <p className="t-footnote text-sys-red">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="t-caption text-label-3">Expand “…see more” before copying, so we get the whole post.</p>
        <Button variant="primary" onClick={preview} disabled={!text.trim()}>
          Preview posts
        </Button>
      </div>
    </div>
  );
}

/**
 * Bring in the person's own posts: paste or Shares.csv (previewed first), or LinkedIn's portability
 * API for members in the EEA and Switzerland (imported directly: it only returns their own posts).
 */
export function ImportPanel({ author, onImported }: { author: { name: string; headline: string }; onImported: (r: ImportResult) => void }) {
  const [tab, setTab] = useState<Tab>("paste");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [key, setKey] = useState(0);
  const done = (r: ImportResult) => {
    setParsed(null);
    setKey((k) => k + 1);
    onImported(r);
  };

  return (
    <div className="card p-5 sm:p-6">
      {parsed && (
        <ImportPreview
          parsed={parsed}
          kind="own"
          origin={tab === "export" ? "export" : "paste"}
          onCancel={() => setParsed(null)}
          onImported={done}
        />
      )}
      {/* Kept mounted while previewing so "Back" returns to what was pasted. */}
      <div className={cx("space-y-5", parsed && "hidden")}>
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              {
                value: "paste",
                label: (
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <ClipboardPaste className="size-3.5" />
                    Paste posts
                  </span>
                ),
              },
              {
                value: "export",
                label: (
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <FileSpreadsheet className="size-3.5" />
                    LinkedIn export
                  </span>
                ),
              },
              {
                value: "linkedin",
                label: (
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <CloudDownload className="size-3.5" />
                    From LinkedIn (EU &amp; Switzerland)
                  </span>
                ),
              },
            ]}
          />
        </div>
        <div key={key}>
          <div className={cx(tab !== "paste" && "hidden")}>
            <PasteTab kind="own" headerLines={[author.name, author.headline]} onParsed={setParsed} />
          </div>
          <div className={cx(tab !== "export" && "hidden")}>
            <ExportTab onParsed={setParsed} />
          </div>
          <div className={cx(tab !== "linkedin" && "hidden")}>
            <LinkedInImportTab onImported={done} onUseExport={() => setTab("export")} />
          </div>
        </div>
      </div>
    </div>
  );
}

