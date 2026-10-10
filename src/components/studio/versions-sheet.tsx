"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, History, RotateCcw, User, Wand2 } from "lucide-react";
import { Button, Chip, EmptyState, Sheet, Spinner, api, cx, toast } from "@/components/ui";
import { changeRatio, diffWords } from "@/lib/factory/diff";
import type { PostDetail, PostVersion } from "@/lib/factory/types";
import { relativeTime } from "./shared";

const SOURCE: Record<string, { label: string; tone: string; icon: typeof Bot }> = {
  ai: { label: "Writer", tone: "purple", icon: Bot },
  revision: { label: "Revision", tone: "blue", icon: Wand2 },
  human: { label: "You", tone: "green", icon: User },
};

function Diff({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => diffWords(before, after), [before, after]);
  const ratio = changeRatio(parts);
  if (before === after) return <p className="t-footnote text-label-2">Same as the current text.</p>;
  return (
    <div className="space-y-2">
      <p className="t-caption text-label-2">
        Changes from this version to the current text · {Math.round(ratio * 100)}% of words differ
      </p>
      <div className="li-text rounded-[14px] bg-fill-4 p-3 max-h-[320px] overflow-y-auto">
        {parts.map((p, i) =>
          p.type === "same" ? (
            <span key={i}>{p.text}</span>
          ) : p.type === "del" ? (
            <del key={i} className="rounded-[3px] decoration-[var(--sys-red)]" style={{ background: "color-mix(in srgb, var(--sys-red) 14%, transparent)" }}>
              {p.text}
            </del>
          ) : (
            <ins key={i} className="rounded-[3px] no-underline" style={{ background: "color-mix(in srgb, var(--sys-green) 18%, transparent)" }}>
              {p.text}
            </ins>
          ),
        )}
      </div>
    </div>
  );
}

export function VersionsSheet({ open, onClose, postId, current, readOnly, onRestored }: { open: boolean; onClose: () => void; postId: string; current: string; readOnly: boolean; onRestored: (d: PostDetail["post"]) => void }) {
  const [versions, setVersions] = useState<PostVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setVersions(null);
    setError(null);
    api<{ versions: PostVersion[] }>(`/api/posts/${postId}/versions`)
      .then((r) => {
        setVersions(r.versions);
        setOpenId(r.versions.find((v) => v.body !== current)?.id ?? null);
      })
      .catch((e: Error) => setError(e.message));
    // Load once per opening; `current` changes while typing and must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, postId]);

  const restore = async (v: PostVersion) => {
    setRestoring(v.id);
    try {
      const { post } = await api<{ post: PostDetail["post"] }>(`/api/posts/${postId}/versions`, { method: "POST", json: { versionId: v.id } });
      onRestored(post);
      toast("Version restored");
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setRestoring(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Version history" size="lg">
      {!versions && !error && (
        <div className="flex items-center gap-2 py-8 justify-center t-subhead text-label-2">
          <Spinner /> Loading versions…
        </div>
      )}
      {error && <p className="t-subhead text-sys-red py-6">{error}</p>}
      {versions && versions.length === 0 && <EmptyState icon={<History />} title="No versions yet" body="Every draft, revision and editing session is saved here, so you can always go back." />}
      {versions && versions.length > 0 && (
        <ol className="space-y-2">
          {versions.map((v) => {
            const s = SOURCE[v.source] ?? SOURCE.human;
            const Icon = s.icon;
            const isOpen = openId === v.id;
            const same = v.body === current;
            return (
              <li key={v.id} className={cx("card p-4 space-y-3", isOpen && "ring-1 ring-[var(--separator)]")}>
                <button type="button" onClick={() => setOpenId(isOpen ? null : v.id)} className="flex w-full items-start gap-3 text-left" aria-expanded={isOpen}>
                  <Chip tone={s.tone}>
                    <Icon className="size-3" />
                    {s.label}
                  </Chip>
                  <span className="min-w-0 flex-1">
                    <span className="block t-subhead font-medium truncate">{v.note || (v.body.split("\n")[0] ?? "")}</span>
                    <span className="block t-caption text-label-2">
                      {relativeTime(v.createdAt)} · {v.body.length.toLocaleString()} characters{same ? " · current" : ""}
                    </span>
                  </span>
                </button>
                {isOpen && (
                  <>
                    <Diff before={v.body} after={current} />
                    {!same && !readOnly && (
                      <div className="flex justify-end">
                        <Button size="sm" variant="glass" icon={<RotateCcw className="size-3.5" />} loading={restoring === v.id} disabled={restoring !== null} onClick={() => restore(v)}>
                          Restore this version
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Sheet>
  );
}
