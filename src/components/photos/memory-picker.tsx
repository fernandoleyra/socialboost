"use client";

import { useMemo, useState } from "react";
import { Check, Library, Plus, Search } from "lucide-react";
import { Input, cx } from "@/components/ui";
import { PhotoImg } from "./photo-img";

export type PickerMemory = { id: string; title: string; coverPhotoId: string | null; photoCount: number; status: string };

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Searchable single-select of stories, with "none" and an optional "new story" row. */
export function MemoryPicker({
  memories,
  value,
  onChange,
  onCreateNew,
  disabled,
}: {
  memories: PickerMemory[];
  value: string | null;
  onChange: (id: string | null) => void;
  onCreateNew?: () => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = fold(q.trim());
    const list = needle ? memories.filter((m) => fold(m.title).includes(needle)) : memories;
    // Keep the current choice visible even when it doesn't match the search.
    const current = memories.find((m) => m.id === value);
    return current && !list.includes(current) ? [current, ...list] : list;
  }, [memories, q, value]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-label-3" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a story" className="pl-10!" aria-label="Find a story" disabled={disabled} />
      </div>
      <div className="card list-group max-h-64 overflow-y-auto" role="listbox" aria-label="Stories">
        {onCreateNew && (
          <button type="button" className="list-row w-full text-left text-accent hover:bg-fill-4" onClick={onCreateNew} disabled={disabled}>
            <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-fill-3">
              <Plus className="size-4" />
            </span>
            <span className="t-subhead font-medium">New story from this photo</span>
          </button>
        )}
        <button type="button" role="option" aria-selected={value === null} className="list-row w-full text-left hover:bg-fill-4" onClick={() => onChange(null)} disabled={disabled}>
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-fill-3 text-label-3">
            <Library className="size-4" />
          </span>
          <span className="flex-1 t-subhead text-label-2">Not in a story (keep in library)</span>
          {value === null && <Check className="size-4 text-accent" />}
        </button>
        {shown.map((m) => (
          <button
            key={m.id}
            type="button"
            role="option"
            aria-selected={m.id === value}
            className={cx("list-row w-full text-left hover:bg-fill-4", m.id === value && "bg-fill-4")}
            onClick={() => onChange(m.id)}
            disabled={disabled}
          >
            {m.coverPhotoId ? (
              <PhotoImg id={m.coverPhotoId} className="size-9 shrink-0 rounded-[10px]" />
            ) : (
              <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-fill-3 text-label-3">
                <Library className="size-4" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate t-subhead font-medium">{m.title}</span>
              <span className="block t-caption text-label-2">
                {m.photoCount === 0 ? "No photo yet" : m.photoCount === 1 ? "1 photo" : `${m.photoCount} photos`}
                {m.status === "used" ? " · Used" : m.status === "archived" ? " · Archived" : ""}
              </span>
            </span>
            {m.id === value && <Check className="size-4 shrink-0 text-accent" />}
          </button>
        ))}
        {shown.length === 0 && q && <div className="list-row t-footnote text-label-2">No story matches “{q}”.</div>}
        {memories.length === 0 && !q && <div className="list-row t-footnote text-label-2">No stories yet. Run a story interview to add some.</div>}
      </div>
    </div>
  );
}
