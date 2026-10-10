"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui";

/**
 * Voice answers. Prefers server transcription (MediaRecorder → POST /api/stt → local
 * Whisper); falls back to the browser's own live dictation (Web Speech API) when the
 * server has none configured or answers 501.
 */

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function recorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t));
}

export type DictationMode = "checking" | "server" | "browser" | "none";
export type DictationStatus = "idle" | "recording" | "transcribing";

const MAX_SECONDS = 300;

export function useDictation({ lang, onText, onInterim }: { lang: string; onText: (text: string) => void; onInterim?: (text: string) => void }) {
  const [mode, setMode] = useState<DictationMode>("checking");
  const [status, setStatus] = useState<DictationStatus>("idle");
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cbs = useRef({ onText, onInterim });
  useEffect(() => {
    cbs.current = { onText, onInterim };
  });

  useEffect(() => {
    let cancelled = false;
    const browser = !!recognitionCtor();
    const canRecord = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
    fetch("/api/stt")
      .then((r) => (r.ok ? r.json() : { available: false }))
      .catch(() => ({ available: false }))
      .then((d: { available?: boolean }) => {
        if (cancelled) return;
        setMode(d.available && canRecord ? "server" : browser ? "browser" : "none");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const cleanup = useCallback(() => {
    stopTimer();
    recognition.current?.abort();
    recognition.current = null;
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
    recorder.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const startTimer = (onLimit: () => void) => {
    setSeconds(0);
    stopTimer();
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS) onLimit();
        return s + 1;
      });
    }, 1000);
  };

  const startBrowser = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      toast("Voice input isn't available in this browser.", "error");
      return;
    }
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) cbs.current.onText(r[0].transcript.trim());
        else interim += r[0].transcript;
      }
      cbs.current.onInterim?.(interim);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") toast("Microphone access is blocked. Allow it in your browser's site settings.", "error");
      else if (e.error !== "no-speech" && e.error !== "aborted") toast(`Dictation stopped (${e.error}).`, "error");
    };
    rec.onend = () => {
      stopTimer();
      cbs.current.onInterim?.("");
      recognition.current = null;
      setStatus("idle");
    };
    recognition.current = rec;
    rec.start();
    setStatus("recording");
    startTimer(() => rec.stop());
  }, [lang]);

  const startServer = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast("Microphone access is blocked. Allow it in your browser's site settings.", "error");
      return;
    }
    const mimeType = recorderMime();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stopTimer();
      stream.getTracks().forEach((t) => t.stop());
      const type = rec.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunks, { type });
      if (blob.size < 1200) {
        setStatus("idle");
        return;
      }
      setStatus("transcribing");
      try {
        const form = new FormData();
        form.append("file", blob, `answer.${/mp4/.test(type) ? "m4a" : /ogg/.test(type) ? "ogg" : "webm"}`);
        const res = await fetch("/api/stt", { method: "POST", body: form });
        const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string; hint?: string };
        if (res.status === 501) {
          const fallback = recognitionCtor() ? "browser" : "none";
          setMode(fallback);
          toast(fallback === "browser" ? "Server transcription isn't set up. Tap the mic again to use your browser's dictation." : "Voice input isn't available here. Type your answer instead.", "info");
        } else if (!res.ok) {
          toast(data.hint ? `${data.error} — ${data.hint}` : (data.error ?? "Transcription failed."), "error");
        } else if (data.text) {
          cbs.current.onText(data.text);
        } else {
          toast("Didn't catch anything. Try again a little closer to the mic.", "info");
        }
      } catch {
        toast("Couldn't reach the transcription server.", "error");
      } finally {
        setStatus("idle");
      }
    };
    recorder.current = rec;
    rec.start(1000);
    setStatus("recording");
    startTimer(() => rec.state !== "inactive" && rec.stop());
  }, []);

  const start = useCallback(() => {
    if (status !== "idle") return;
    if (mode === "server") void startServer();
    else if (mode === "browser") startBrowser();
  }, [mode, status, startServer, startBrowser]);

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    recognition.current?.stop();
  }, []);

  return { mode, status, seconds, start, stop, available: mode === "server" || mode === "browser" };
}
