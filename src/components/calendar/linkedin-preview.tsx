"use client";

import { useState } from "react";
import { Globe, MessageSquare, Repeat2, Send, ThumbsUp } from "lucide-react";
import { initials, photoUrl } from "./helpers";

const FOLD_CHARS = 210;
const FOLD_LINES = 3;
const CHARS_PER_LINE = 70;

/** Text above LinkedIn's "…see more" fold: about 210 characters or 3 lines (blank lines count). */
function aboveFold(text: string): { visible: string; truncated: boolean } {
  const kept: string[] = [];
  let chars = 0;
  let lines = 0;
  for (const line of text.split("\n")) {
    const height = Math.max(1, Math.ceil(line.length / CHARS_PER_LINE));
    if (lines + height > FOLD_LINES || chars + line.length > FOLD_CHARS) {
      const roomChars = FOLD_CHARS - chars;
      const roomLines = FOLD_LINES - lines;
      if (roomLines > 0 && roomChars > 20) kept.push(line.slice(0, Math.min(roomChars, roomLines * CHARS_PER_LINE)).replace(/\s+\S*$/, ""));
      return { visible: kept.join("\n").trimEnd(), truncated: true };
    }
    kept.push(line);
    chars += line.length + 1;
    lines += height;
  }
  return { visible: text, truncated: false };
}

/** A LinkedIn-like feed card: what the post will look like before "see more". */
export function LinkedInPreview({ name, headline, body, photoId }: { name: string; headline: string; body: string; photoId: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const text = body.trim();
  const fold = aboveFold(text);
  return (
    <article className="card overflow-hidden" aria-label="LinkedIn preview">
      <div className="flex items-start gap-2.5 p-3.5 pb-2">
        <span
          className="grid size-11 shrink-0 place-items-center rounded-full text-[15px] font-semibold text-white"
          style={{ background: "linear-gradient(145deg, var(--sys-cyan), var(--sys-blue) 55%, var(--sys-indigo))" }}
          aria-hidden
        >
          {initials(name)}
        </span>
        <div className="min-w-0">
          <div className="t-subhead font-semibold truncate">{name}</div>
          {headline && <div className="t-caption text-label-2 line-clamp-1">{headline}</div>}
          <div className="t-caption text-label-3 flex items-center gap-1">
            now · <Globe className="size-3" aria-label="Public" />
          </div>
        </div>
      </div>
      <div className="li-text px-3.5 pb-3">
        {text ? (
          expanded || !fold.truncated ? (
            text
          ) : (
            <>
              {fold.visible}
              <button type="button" className="text-label-2 hover:text-accent hover:underline" onClick={() => setExpanded(true)}>
                …see more
              </button>
            </>
          )
        ) : (
          <span className="text-label-3">No text yet. Draft it in the Studio.</span>
        )}
      </div>
      {photoId && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl(photoId, "full")} alt="" loading="lazy" className="block max-h-[440px] w-full bg-fill-4 object-cover" />
      )}
      <div className="flex items-center justify-around border-t border-separator px-2 py-1.5 t-footnote font-semibold text-label-2">
        {[
          { icon: ThumbsUp, label: "Like" },
          { icon: MessageSquare, label: "Comment" },
          { icon: Repeat2, label: "Repost" },
          { icon: Send, label: "Send" },
        ].map(({ icon: Icon, label }) => (
          <span key={label} className="flex items-center gap-1.5 rounded-control px-2 py-1.5">
            <Icon className="size-4" aria-hidden />
            <span className="hidden sm:inline">{label}</span>
          </span>
        ))}
      </div>
    </article>
  );
}
