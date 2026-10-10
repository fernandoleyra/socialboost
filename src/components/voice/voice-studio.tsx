"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioWaveform, FileText, Ban, Import, WandSparkles } from "lucide-react";
import { Button, Glass, PageHeader, Sheet, Typing, api, toast } from "@/components/ui";
import type { VoiceSample } from "@/lib/repo";
import { GOOD_POST_COUNT, MIN_POSTS_FOR_ANALYSIS, type ImportResult, type ProfileUpdate, type VoiceState } from "@/lib/voice/types";
import { Fingerprint } from "./fingerprint";
import { errorMessage, isAbort } from "./format";
import { ImportPanel } from "./import-panel";
import { ReferencePanel } from "./reference-panel";
import { RulesEditor } from "./rules-editor";
import { SamplesList } from "./samples-list";
import { StyleGuide } from "./style-guide";

function Onboarding() {
  const steps = [
    { icon: Import, title: "Bring in your posts", body: `Paste a few, upload LinkedIn's export, or use the browser helper. ${GOOD_POST_COUNT} or more of your best is ideal.` },
    { icon: WandSparkles, title: "Analyze your voice", body: "We measure your rhythm and habits, then your model writes a style guide you can edit." },
    { icon: Ban, title: "Add what you'd never say", body: "Words and moves that aren't you. They override everything, in every draft." },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {steps.map(({ icon: Icon, title, body }, i) => (
        <div key={title} className="card space-y-2 p-5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-full bg-accent/12 text-accent">
              <Icon className="size-4" />
            </span>
            <span className="t-caption font-semibold text-label-3">Step {i + 1}</span>
          </div>
          <div className="t-headline">{title}</div>
          <p className="t-footnote text-label-2">{body}</p>
        </div>
      ))}
    </div>
  );
}

function AnalyzeBanner({ started, postCount, onCancel }: { started: number; postCount: number; onCancel: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.round((now - started) / 1000));
  return (
    <Glass material="strong" className="sticky top-16 z-20 flex flex-wrap items-center gap-3 px-5 py-4 animate-pop lg:top-4" role="status" aria-live="polite">
      <Typing />
      <div className="min-w-0 flex-1">
        <div className="t-subhead font-semibold">Reading your {postCount} posts…</div>
        <div className="t-footnote text-label-2">
          {secs < 20 ? "Measuring your writing and indexing posts for examples." : "Your model is writing the style guide. On a local model this takes a minute or two."}{" "}
          <span aria-hidden className="tabular-nums">
            {secs}s
          </span>
        </div>
      </div>
      <Button size="sm" variant="glass" onClick={onCancel}>
        Cancel
      </Button>
    </Glass>
  );
}

export function VoiceStudio({ initial, author }: { initial: VoiceState; author: { name: string; headline: string } }) {
  const [state, setState] = useState(initial);
  const [analyzeStarted, setAnalyzeStarted] = useState<number | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirmRedo, setConfirmRedo] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const own = state.samples.filter((s) => s.kind === "own");
  const reference = state.samples.filter((s) => s.kind === "reference");
  const canAnalyze = own.length >= MIN_POSTS_FOR_ANALYSIS;
  const analyzing = analyzeStarted !== null;

  useEffect(() => () => abortRef.current?.abort(), []);

  // New posts are indexed for example matching in the background: keep the count live until it
  // catches up, or stops moving (no embedding model answering).
  const indexing = state.embeddingsConfigured && state.counts.indexed < state.counts.own;
  useEffect(() => {
    if (!indexing || analyzing) return;
    let last = -1;
    let still = 0;
    let polls = 0;
    const timer = setInterval(async () => {
      try {
        const next = await api<VoiceState>("/api/voice");
        setState((st) => ({ ...st, counts: next.counts }));
        still = next.counts.indexed === last ? still + 1 : 0;
        last = next.counts.indexed;
        if (next.counts.indexed >= next.counts.own || still >= 5 || ++polls >= 60) clearInterval(timer);
      } catch {
        clearInterval(timer);
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [indexing, analyzing, state.counts.own]);

  const analyze = useCallback(async () => {
    if (abortRef.current) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setAnalyzeStarted(Date.now());
    try {
      const next = await api<VoiceState>("/api/voice/analyze", { method: "POST", signal: ctrl.signal });
      setState(next);
      toast(`Style guide written from ${next.meta.postsRead} of your posts`);
    } catch (e) {
      if (isAbort(e)) toast("Analysis cancelled", "info");
      else toast(errorMessage(e), "error");
    } finally {
      abortRef.current = null;
      setAnalyzeStarted(null);
    }
  }, []);

  /** Re-running replaces the guide (and any edits to it), so ask first. */
  const requestAnalyze = () => (state.meta.analyzedAt ? setConfirmRedo(true) : void analyze());

  const saveProfile = async (patch: ProfileUpdate) => {
    setState(await api<VoiceState>("/api/voice/profile", { method: "PUT", json: patch }));
  };

  const onImported = (r: ImportResult) => setState(r.state);
  const onSampleSaved = (s: VoiceSample) => setState((st) => ({ ...st, samples: st.samples.map((x) => (x.id === s.id ? s : x)) }));

  const analyzeHint = canAnalyze ? (own.length < GOOD_POST_COUNT ? `Works now; best with ${GOOD_POST_COUNT}+ posts` : undefined) : `Needs ${MIN_POSTS_FOR_ANALYSIS - own.length} more of your posts`;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Voice"
        title="Your voice"
        subtitle="SocialBoost learns how you write from your own LinkedIn posts, so drafts sound like you on a good day, not like AI."
        actions={
          <>
            {state.promptBlock && (
              <Button variant="glass" icon={<FileText className="size-4" />} onClick={() => setShowRules(true)}>
                What the writer sees
              </Button>
            )}
            <Button variant="primary" icon={<WandSparkles className="size-4" />} onClick={requestAnalyze} loading={analyzing} disabled={!canAnalyze} title={analyzeHint}>
              {state.meta.analyzedAt ? "Re-analyze" : "Analyze my voice"}
            </Button>
          </>
        }
      />

      {analyzeStarted !== null && <AnalyzeBanner started={analyzeStarted} postCount={own.length} onCancel={() => abortRef.current?.abort()} />}

      {own.length === 0 ? (
        <>
          <Onboarding />
          <section className="space-y-3">
            <div className="px-1">
              <h2 className="t-title-3">Import your posts</h2>
              <p className="t-footnote mt-0.5 text-label-2">Only posts you wrote yourself. Reposts and other people&apos;s posts would teach the writer the wrong voice.</p>
            </div>
            <ImportPanel author={author} onImported={onImported} />
          </section>
          <RulesEditor rules={state.profile.manualRules} onSave={(manualRules) => saveProfile({ manualRules })} />
        </>
      ) : (
        <>
          <Fingerprint stats={state.profile.stats} extras={state.extras} ownCount={own.length} />
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <StyleGuide guide={state.profile.guide} meta={state.meta} ownCount={own.length} analyzing={analyzing} onAnalyze={requestAnalyze} onSave={(guide) => saveProfile({ guide })} />
            <RulesEditor rules={state.profile.manualRules} onSave={(manualRules) => saveProfile({ manualRules })} />
          </div>
          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3 px-1">
              <div>
                <h2 className="t-title-3">Add more posts</h2>
                <p className="t-footnote mt-0.5 text-label-2">Duplicates are skipped, and re-importing a post fills in numbers it was missing.</p>
              </div>
              <Button variant={importing ? "plain" : "glass"} icon={importing ? undefined : <Import className="size-4" />} onClick={() => setImporting((v) => !v)}>
                {importing ? "Close" : "Import posts"}
              </Button>
            </div>
            {importing && (
              <ImportPanel
                author={author}
                onImported={(r) => {
                  setImporting(false);
                  onImported(r);
                }}
              />
            )}
          </section>
          <SamplesList samples={own} indexed={state.counts.indexed} embeddingsConfigured={state.embeddingsConfigured} onDeleted={setState} onSaved={onSampleSaved} />
        </>
      )}

      <ReferencePanel samples={reference} onChanged={setState} />

      <Sheet
        open={confirmRedo}
        onClose={() => setConfirmRedo(false)}
        title="Rewrite the style guide?"
        size="sm"
        footer={
          <>
            <Button variant="plain" onClick={() => setConfirmRedo(false)}>
              Keep current guide
            </Button>
            <Button
              variant="primary"
              icon={<WandSparkles className="size-4" />}
              onClick={() => {
                setConfirmRedo(false);
                void analyze();
              }}
            >
              Re-analyze
            </Button>
          </>
        }
      >
        <p className="t-subhead text-label-2">
          Your model reads your posts again and writes a new style guide from {own.length} posts. Edits you made to the current guide are replaced. Your “never say” rules stay as they are.
        </p>
      </Sheet>

      <Sheet
        open={showRules}
        onClose={() => setShowRules(false)}
        title={
          <span className="flex items-center gap-2">
            <AudioWaveform className="size-5 text-accent" />
            What the writer sees
          </span>
        }
        size="lg"
      >
        <div className="space-y-3">
          <p className="t-footnote text-label-2">This block goes into every draft and revision, next to two or three of your posts closest to the topic. Edit the style guide or your rules to change it.</p>
          <pre className="li-text whitespace-pre-wrap break-words rounded-[16px] bg-fill-4 p-4">{state.promptBlock}</pre>
        </div>
      </Sheet>
    </div>
  );
}
