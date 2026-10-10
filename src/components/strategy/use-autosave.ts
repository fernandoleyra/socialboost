"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

/**
 * Debounced autosave with ordering guarantees: one request in flight at a time, the latest
 * value always wins, and edits still waiting for the debounce are flushed with a keepalive
 * request when the page is hidden or the component unmounts (client-side navigation).
 */
export function useAutosave<T>(opts: { url: string; method?: "PUT" | "PATCH" | "POST"; delay?: number; onError?: (message: string) => void }) {
  const { url, method = "PUT", delay = 800 } = opts;
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const latest = useRef<T | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const again = useRef(false);
  const onError = useRef(opts.onError);
  onError.current = opts.onError;

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!dirty.current || latest.current === null) return;
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    dirty.current = false;
    setState("saving");
    try {
      const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(latest.current) });
      if (!res.ok) {
        let msg = `Couldn't save (${res.status})`;
        try {
          const j = await res.json();
          msg = j.hint ? `${j.error} — ${j.hint}` : (j.error ?? msg);
        } catch {
          /* not JSON */
        }
        throw new Error(msg);
      }
      setError(null);
      setState(dirty.current || again.current ? "pending" : "saved");
    } catch (e) {
      dirty.current = true;
      const msg = e instanceof Error ? e.message : "Couldn't save";
      setError(msg);
      setState("error");
      onError.current?.(msg);
    } finally {
      inFlight.current = false;
      if (again.current) {
        again.current = false;
        void flush();
      }
    }
  }, [url, method]);

  /** Record a new value and schedule a save. */
  const queue = useCallback(
    (value: T) => {
      latest.current = value;
      dirty.current = true;
      setState("pending");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );

  useEffect(() => {
    const beacon = () => {
      if (!dirty.current || latest.current === null) return;
      dirty.current = false;
      fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(latest.current), keepalive: true }).catch(() => {});
    };
    const onVisibility = () => document.visibilityState === "hidden" && beacon();
    window.addEventListener("pagehide", beacon);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", beacon);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer.current) clearTimeout(timer.current);
      beacon();
    };
  }, [url, method]);

  return { state, error, queue, flush };
}
