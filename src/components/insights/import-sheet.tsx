"use client";

import { useRef, useState } from "react";
import { CircleAlert, FileUp } from "lucide-react";
import { Button, Field, Sheet, Textarea, api, toast } from "@/components/ui";
import type { ImportPreview } from "@/lib/calendar/types";

const MAX_BYTES = 5_000_000;

/** Two steps: check what matches (dry run), then import. */
export function ImportSheet({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState<null | "check" | "import">(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setCsv("");
    setFileName("");
    setPreview(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) {
      toast("That's an Excel file. Open it, go to the posts sheet, and save it as CSV first.", "error");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast("That file is too large. Export only the posts sheet.", "error");
      return;
    }
    setCsv(await file.text());
    setFileName(file.name);
    setPreview(null);
  };

  const run = async (dryRun: boolean) => {
    setBusy(dryRun ? "check" : "import");
    try {
      const res = await api<ImportPreview>("/api/insights/import", { method: "POST", json: { csv, dryRun } });
      if (dryRun) setPreview(res);
      else {
        toast(`Results added to ${res.applied} ${res.applied === 1 ? "post" : "posts"}.`);
        onImported();
        close();
      }
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const matched = preview?.matches.length ?? 0;
  return (
    <Sheet
      open={open}
      onClose={close}
      size="lg"
      title="Import results from a CSV"
      footer={
        <>
          <Button variant="plain" onClick={close}>
            Cancel
          </Button>
          {preview && matched > 0 ? (
            <Button variant="primary" onClick={() => run(false)} loading={busy === "import"}>
              Import results for {matched} {matched === 1 ? "post" : "posts"}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => run(true)} loading={busy === "check"} disabled={!csv.trim()}>
              Check the file
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2 t-subhead text-label-2">
          <p>LinkedIn doesn&apos;t share post analytics with personal apps, so results come from you. Two ways:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              On LinkedIn: <span className="text-label">Me → Analytics → Content → Export</span>. Open the file, go to the sheet with your top posts, and save it as CSV. It
              usually has impressions per post; type reactions and comments into the table on this page.
            </li>
            <li>
              Or make your own sheet with columns <span className="text-label">Post URL</span> or <span className="text-label">Date</span>, plus any of{" "}
              <span className="text-label">Impressions, Reactions, Comments, Reposts</span>.
            </li>
          </ol>
          <p>Rows match your posts by link first, then by the day they went out.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,.txt"
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              // Let the same file be picked again after editing it.
              e.target.value = "";
            }}
          />
          <Button variant="glass" onClick={() => fileRef.current?.click()} icon={<FileUp className="size-4" />}>
            Choose a CSV file
          </Button>
          {fileName && <span className="t-footnote text-label-2">{fileName}</span>}
        </div>
        <Field label="Or paste the CSV">
          <Textarea
            rows={6}
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setPreview(null);
              setFileName("");
            }}
            placeholder={"Post URL,Date,Impressions,Reactions,Comments,Reposts\nhttps://www.linkedin.com/feed/update/urn:li:activity:…,10/06/2026,1204,48,9,2"}
            className="font-mono text-[12.5px]"
          />
        </Field>

        {preview && (
          <div className="space-y-4">
            {preview.errors.map((e) => (
              <div key={e} className="flex items-start gap-2 rounded-inner px-3.5 py-3 t-subhead" style={{ background: "color-mix(in srgb, var(--sys-red) 12%, transparent)" }}>
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-sys-red" aria-hidden />
                {e}
              </div>
            ))}
            {matched > 0 && (
              <section className="space-y-2">
                <h3 className="px-1 t-footnote font-semibold uppercase tracking-wide text-label-2">Matched ({matched})</h3>
                <div className="card list-group">
                  {preview.matches.map((m) => (
                    <div key={m.postId} className="list-row">
                      <div className="min-w-0 flex-1">
                        <div className="t-subhead font-medium line-clamp-1">{m.hook || "Untitled post"}</div>
                        <div className="t-caption text-label-2 tabular-nums">
                          Row {m.line} · by {m.by === "url" ? "link" : "date"} ·{" "}
                          {[
                            m.impressions !== null && `${m.impressions.toLocaleString("en")} impressions`,
                            m.reactions !== null && `${m.reactions} reactions`,
                            m.comments !== null && `${m.comments} comments`,
                            m.reposts !== null && `${m.reposts} reposts`,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {preview.unmatched.length > 0 && (
              <section className="space-y-2">
                <h3 className="px-1 t-footnote font-semibold uppercase tracking-wide text-label-2">Not matched ({preview.unmatched.length})</h3>
                <div className="card list-group">
                  {preview.unmatched.slice(0, 30).map((u, i) => (
                    <div key={`${u.row.line}-${i}`} className="list-row t-footnote">
                      <span className="w-14 shrink-0 text-label-2 tabular-nums">Row {u.row.line}</span>
                      <span className="min-w-0 flex-1 text-label-2">{u.reason}</span>
                    </div>
                  ))}
                </div>
                {preview.unmatched.length > 30 && <p className="px-1 t-caption text-label-2">And {preview.unmatched.length - 30} more.</p>}
              </section>
            )}
            {matched === 0 && !preview.errors.length && <p className="t-subhead text-label-2">No rows matched a published post. Posts must be marked as posted here before their results can be imported.</p>}
          </div>
        )}
      </div>
    </Sheet>
  );
}
