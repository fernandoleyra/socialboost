"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Camera, Globe, Loader2, MessageSquare, Repeat2, Send, ThumbsUp } from "lucide-react";
import { Avatar } from "@/components/shell";
import { Segmented, cx } from "@/components/ui";
import { aboveFold, type FoldMode } from "@/lib/factory/fold";
import type { PhotoLite } from "@/lib/factory/types";
import { photoSrc } from "./shared";

/** Hashtags, mentions and links render as LinkedIn links do. */
function renderText(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(#\p{L}[\p{L}\p{N}_]*|@\p{L}[\p{L}\p{N}_.-]*|https?:\/\/\S+|www\.\S+)/gu;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <span key={m.index} className="font-semibold" style={{ color: "var(--sys-blue)" }}>
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** LinkedIn shows single images between 1.91:1 and 4:5; taller ones are cropped to 4:5. */
function aspect(photo: PhotoLite | null): number {
  if (!photo?.width || !photo?.height) return 4 / 5;
  return Math.min(1.91, Math.max(0.8, photo.width / photo.height));
}

export function LinkedInPreview({
  author,
  body,
  photo,
  onAddPhoto,
  uploading,
  actions,
}: {
  author: { name: string; headline: string; avatarPhotoId: string | null };
  body: string;
  photo: PhotoLite | null;
  onAddPhoto: () => void;
  uploading?: boolean;
  actions?: ReactNode;
}) {
  const [mode, setMode] = useState<FoldMode>("mobile");
  const [expanded, setExpanded] = useState(false);
  const { visible, truncated } = aboveFold(body, mode);
  const text = expanded || !truncated ? body.replace(/\s+$/, "") : visible;

  useEffect(() => setExpanded(false), [mode]);

  return (
    <section className="space-y-3" aria-label="LinkedIn preview">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="t-headline">Preview</h2>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "mobile", label: "Phone" },
            { value: "desktop", label: "Desktop" },
          ]}
        />
      </div>
      <div className={cx("glass mx-auto overflow-hidden rounded-panel transition-[max-width] duration-300", mode === "mobile" ? "max-w-[390px]" : "max-w-[555px]")}>
        <div className="flex items-start gap-2.5 px-4 pt-4">
          {author.avatarPhotoId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoSrc(author.avatarPhotoId)} alt="" className="size-12 shrink-0 rounded-full object-cover" />
          ) : (
            <Avatar name={author.name} size={48} />
          )}
          <div className="min-w-0 flex-1">
            <div className="t-subhead font-semibold truncate">{author.name}</div>
            {author.headline && <div className="t-caption text-label-2 line-clamp-1">{author.headline}</div>}
            <div className="t-caption text-label-2 flex items-center gap-1">
              Now · <Globe className="size-3" aria-label="Public" />
            </div>
          </div>
        </div>

        <div className="px-4 pb-3 pt-3">
          {body.trim() ? (
            <p className="li-text">
              {renderText(text)}
              {truncated && !expanded && (
                <>
                  {"… "}
                  <button type="button" onClick={() => setExpanded(true)} className="font-semibold text-label-2 hover:underline">
                    see more
                  </button>
                </>
              )}
            </p>
          ) : (
            <p className="li-text text-label-3">Your post will appear here as people see it in the feed.</p>
          )}
          {truncated && expanded && (
            <button type="button" onClick={() => setExpanded(false)} className="mt-1 t-caption font-semibold text-label-2 hover:underline">
              Show less
            </button>
          )}
        </div>

        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoSrc(photo.id, "full")} alt={photo.caption || "Post photo"} className="block w-full bg-fill-4 object-cover" style={{ aspectRatio: String(aspect(photo)) }} />
        ) : (
          <button
            type="button"
            onClick={onAddPhoto}
            disabled={uploading}
            className="mx-4 mb-3 grid w-[calc(100%-2rem)] place-items-center gap-2 rounded-inner border-2 border-dashed px-6 py-10 text-center transition-colors focus-ring"
            style={{ borderColor: "color-mix(in srgb, var(--sys-orange) 60%, transparent)", background: "color-mix(in srgb, var(--sys-orange) 9%, transparent)", color: "var(--sys-orange)" }}
          >
            {uploading ? <Loader2 className="size-6 animate-spin" /> : <Camera className="size-6" />}
            <span className="t-subhead font-semibold">This post needs a photo</span>
            <span className="t-caption max-w-[260px]" style={{ color: "color-mix(in srgb, var(--sys-orange) 80%, var(--label))" }}>
              A real phone photo from the moment beats any graphic. Tap to add one.
            </span>
          </button>
        )}

        <div className="flex items-center justify-around border-t border-separator px-2 py-1.5 text-label-2" aria-hidden>
          {[
            { icon: ThumbsUp, label: "Like" },
            { icon: MessageSquare, label: "Comment" },
            { icon: Repeat2, label: "Repost" },
            { icon: Send, label: "Send" },
          ].map(({ icon: Icon, label }) => (
            <span key={label} className="flex items-center gap-1.5 rounded-[8px] px-2 py-1.5 t-caption font-semibold">
              <Icon className="size-4" />
              <span className={cx(mode === "mobile" && "sr-only sm:not-sr-only")}>{label}</span>
            </span>
          ))}
        </div>
      </div>
      {actions && <div className="flex flex-wrap justify-center gap-2">{actions}</div>}
    </section>
  );
}
