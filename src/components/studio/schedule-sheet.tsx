"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Camera } from "lucide-react";
import { Button, Field, Input, Sheet, cx } from "@/components/ui";
import { fromLocalInput, nextOpenSlots, toLocalInput, type Cadence } from "@/lib/factory/schedule";

export function ScheduleSheet({
  open,
  onClose,
  current,
  cadence,
  taken,
  needsApproval,
  missingPhoto,
  saving,
  onConfirm,
  onAddPhoto,
}: {
  open: boolean;
  onClose: () => void;
  current: string | null;
  cadence: Cadence | null;
  taken: string[];
  needsApproval: boolean;
  missingPhoto: boolean;
  saving: boolean;
  onConfirm: (iso: string) => void;
  onAddPhoto: () => void;
}) {
  const slots = useMemo(() => (open ? nextOpenSlots(cadence, taken, new Date(), 4) : []), [open, cadence, taken]);
  const [value, setValue] = useState("");
  useEffect(() => {
    if (!open) return;
    const initial = current && Date.parse(current) > Date.now() ? new Date(current) : slots[0];
    setValue(initial ? toLocalInput(initial) : "");
  }, [open, current, slots]);

  const iso = fromLocalInput(value);
  const past = iso ? Date.parse(iso) < Date.now() : false;
  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={needsApproval ? "Approve and schedule" : "Schedule"}
      footer={
        <>
          <Button variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<CalendarClock className="size-4" />} loading={saving} disabled={!iso || past} onClick={() => iso && onConfirm(iso)}>
            {needsApproval ? "Approve & schedule" : "Schedule"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="t-subhead text-label-2">
          {needsApproval ? "Scheduling also approves the post. " : ""}With LinkedIn connected it goes out on its own at that time; otherwise you get a reminder with the text ready to copy.
        </p>
        {slots.length > 0 && (
          <div className="space-y-2">
            <div className="t-footnote font-semibold text-label-2 px-1">Open slots in your cadence</div>
            <div className="flex flex-wrap gap-2">
              {slots.map((d) => {
                const v = toLocalInput(d);
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setValue(v)}
                    aria-pressed={value === v}
                    className={cx("rounded-full px-3.5 py-1.5 t-footnote font-semibold transition-colors focus-ring", value === v ? "bg-[var(--accent)] text-white" : "bg-fill-3 hover:bg-fill-2")}
                  >
                    {d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <Field label="Date and time" hint={tz ? `Your time zone: ${tz}. Weekday mornings, at least a day apart, work best.` : undefined}>
          <Input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} min={toLocalInput(new Date())} />
        </Field>
        {past && <p className="t-footnote text-sys-red px-1">That time has already passed.</p>}
        {missingPhoto && (
          <div className="flex items-start gap-3 rounded-card p-4" style={{ background: "color-mix(in srgb, var(--sys-orange) 10%, transparent)" }}>
            <Camera className="mt-0.5 size-4.5 shrink-0" style={{ color: "var(--sys-orange)" }} />
            <div className="space-y-2">
              <p className="t-footnote">This post has no photo yet. Posts with a real photo from the moment usually reach more people.</p>
              <Button size="sm" variant="glass" onClick={onAddPhoto}>
                Add a photo first
              </Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
