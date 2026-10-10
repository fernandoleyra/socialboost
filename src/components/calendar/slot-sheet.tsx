"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarClock, Library, Wand2 } from "lucide-react";
import { Button, Sheet } from "@/components/ui";
import type { Slot } from "@/lib/calendar/slots";
import type { CalendarData, CalendarPost } from "@/lib/calendar/types";
import { formatDayLong } from "@/lib/calendar/view";
import { CardPill } from "./post-pill";
import { LOCALE } from "./views";

/** An open posting day: put an approved post there, or let Auto-plan fill it with a story. */
export function SlotSheet({
  slot,
  data,
  onClose,
  onPlace,
  onAutoPlan,
}: {
  slot: Slot | null;
  data: CalendarData;
  onClose: () => void;
  onPlace: (post: CalendarPost, at: string) => Promise<boolean>;
  onAutoPlan: () => void;
}) {
  const [placing, setPlacing] = useState<string | null>(null);
  if (!slot) return null;
  const approved = data.unscheduled;
  const place = async (post: CalendarPost) => {
    setPlacing(post.id);
    const ok = await onPlace(post, slot.at);
    setPlacing(null);
    if (ok) onClose();
  };
  return (
    <Sheet open onClose={onClose} title={`${formatDayLong(slot.day, LOCALE)} · ${slot.time}`}>
      <div className="space-y-5">
        <p className="t-subhead text-label-2">This is one of your posting days and nothing is planned yet.</p>
        {approved.length > 0 && (
          <section className="space-y-2">
            <h3 className="px-1 t-footnote font-semibold uppercase tracking-wide text-label-2">Approved, waiting for a day</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {approved.map((p) => (
                <div key={p.id} className="space-y-1.5">
                  <CardPill post={p} pillars={data.pillars} onOpen={() => void place(p)} />
                  <Button size="sm" variant="tinted" className="w-full" loading={placing === p.id} onClick={() => void place(p)} icon={<CalendarClock className="size-4" />}>
                    Schedule here
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={approved.length ? "glass" : "primary"}
            onClick={() => {
              onClose();
              onAutoPlan();
            }}
            icon={<Wand2 className="size-4" />}
          >
            Auto-plan open days
          </Button>
          <Link href="/memories" className="btn btn-glass">
            <Library className="size-4" aria-hidden />
            Pick a story
          </Link>
        </div>
        <p className="t-footnote text-label-2">
          From the Memory Bank, choose “Write a post” on a story. When it&apos;s approved, drag it here or schedule it from the Studio.
        </p>
      </div>
    </Sheet>
  );
}
