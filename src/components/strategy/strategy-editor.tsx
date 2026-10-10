"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Compass, Equal, MessagesSquare, Plus, RotateCcw } from "lucide-react";
import type { Pillar, Strategy } from "@/lib/types";
import { Button, EmptyState, Field, PageHeader, Select, Sheet, Spinner, TONES, toast } from "@/components/ui";
import { LANGUAGES } from "@/components/settings/options";
import { AutoTextarea } from "./auto-textarea";
import { CadenceEditor } from "./cadence-editor";
import { ListEditor } from "./list-editor";
import { PillarCard } from "./pillar-card";
import { GOAL_SUGGESTIONS, MAX_PILLARS, balanceWeights, cadenceSummary, createPillar, emptyStrategy, isStrategyEmpty, sharePercents } from "@/lib/strategy";
import { useAutosave, type SaveState } from "./use-autosave";

const SECTIONS = [
  { id: "positioning", label: "Positioning" },
  { id: "audience", label: "Audience" },
  { id: "pillars", label: "Pillars" },
  { id: "expertise", label: "What you know" },
  { id: "beliefs", label: "What you believe" },
  { id: "cadence", label: "Posting rhythm" },
  { id: "cta", label: "Call to action" },
  { id: "boundaries", label: "Boundaries" },
  { id: "language", label: "Language & notes" },
] as const;

const POSITIONING_HREF = "/interviews/new?kind=positioning&auto=1";

function SaveIndicator({ state, error, onRetry }: { state: SaveState; error: string | null; onRetry: () => void }) {
  if (state === "error") {
    return (
      <button type="button" onClick={onRetry} title={error ?? undefined} className="chip focus-ring" style={{ ["--chip-fg" as string]: "var(--sys-red)", ["--chip-bg" as string]: "color-mix(in srgb, var(--sys-red) 13%, transparent)" }}>
        <AlertTriangle className="size-3.5" />
        Not saved · Retry
      </button>
    );
  }
  if (state === "saving" || state === "pending") {
    return (
      <span className="chip" aria-live="polite">
        <Spinner className="size-3.5!" />
        Saving…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="chip" aria-live="polite" style={{ ["--chip-fg" as string]: "var(--sys-green)", ["--chip-bg" as string]: "color-mix(in srgb, var(--sys-green) 14%, transparent)" }}>
        <Check className="size-3.5" />
        Saved
      </span>
    );
  }
  return <span className="chip">Changes save automatically</span>;
}

/** Like Field, but a group (not a <label>) because list editors hold several controls. */
function ListField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="px-1 t-footnote font-semibold text-label-2">{label}</div>
      {children}
      {hint && <p className="px-1 t-caption text-label-3">{hint}</p>}
    </div>
  );
}

function Block({ id, title, subtitle, children }: { id: string; title: string; subtitle: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <div className="px-1">
        <h2 className="t-title-3">{title}</h2>
        <p className="t-footnote mt-0.5 max-w-2xl text-label-2">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

export function StrategyEditor({
  profileId,
  initial,
  language,
  timezone,
  storyCounts,
  activePositioningId,
}: {
  /** The profile being edited; every save is pinned to it (see PUT /api/strategy). */
  profileId: string;
  initial: Strategy | null;
  language: string;
  timezone: string;
  storyCounts: Record<string, number>;
  activePositioningId: string | null;
}) {
  const [strategy, setStrategyState] = useState<Strategy | null>(isStrategyEmpty(initial) ? null : initial);
  const [confirmRemove, setConfirmRemove] = useState<Pillar | null>(null);
  const save = useAutosave<Strategy>({ url: `/api/strategy?profileId=${encodeURIComponent(profileId)}`, onError: (m) => toast(m, "error") });
  // Latest value outside React's batching so consecutive edits in one tick build on each other.
  const current = useRef<Strategy | null>(strategy);

  const setStrategy = (next: Strategy | null) => {
    current.current = next;
    setStrategyState(next);
  };

  /** Apply an edit, render it, and queue an autosave. */
  const change = (fn: (s: Strategy) => Strategy) => {
    const next = fn(current.current ?? initial ?? emptyStrategy(language));
    setStrategy(next);
    save.queue(next);
  };

  const interviewCta = activePositioningId ? (
    <Link href={`/interviews/${activePositioningId}`} className="btn btn-primary">
      <MessagesSquare className="size-4" />
      Continue positioning interview
    </Link>
  ) : (
    <Link href={POSITIONING_HREF} className="btn btn-primary">
      <MessagesSquare className="size-4" />
      Start positioning interview
    </Link>
  );

  if (!strategy) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Strategy" title="Your angle on LinkedIn" subtitle="Who you write for, what you write about, and how often you post." />
        <EmptyState
          icon={<Compass />}
          title="No strategy yet"
          body="The fastest way is a 10-15 minute positioning interview. We'll ask about your goals, your audience and what you believe, then fill in this page for you. You can change everything afterwards."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {interviewCta}
              <Button variant="glass" onClick={() => setStrategy(initial ?? emptyStrategy(language))}>
                Fill it in myself
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const s = strategy;
  const shares = sharePercents(s.pillars);
  const set = <K extends keyof Strategy>(k: K, v: Strategy[K]) => change((cur) => ({ ...cur, [k]: v }));
  const setPillar = (p: Pillar) => change((cur) => ({ ...cur, pillars: cur.pillars.map((x) => (x.id === p.id ? p : x)) }));
  const removePillar = (id: string) => change((cur) => ({ ...cur, pillars: cur.pillars.filter((x) => x.id !== id) }));
  const askRemove = (p: Pillar) => ((storyCounts[p.id] ?? 0) > 0 ? setConfirmRemove(p) : removePillar(p.id));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Strategy"
        title="Your angle on LinkedIn"
        subtitle="Everything the interviewer and the writer aim for. Edit freely; changes save as you type."
        actions={
          <>
            <SaveIndicator state={save.state} error={save.error} onRetry={() => void save.flush()} />
            {activePositioningId ? (
              interviewCta
            ) : (
              <Link href={POSITIONING_HREF} className="btn btn-glass">
                <RotateCcw className="size-4" />
                Re-run positioning interview
              </Link>
            )}
          </>
        }
      />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_200px]">
        <div className="min-w-0 space-y-10">
          <Block id="positioning" title="Positioning" subtitle="One sentence a stranger would understand. Try: “I help ___ do ___ by ___” or “I'm the person who…”">
            <div className="card space-y-5 p-5">
              <AutoTextarea
                minRows={2}
                value={s.positioning}
                onChange={(e) => set("positioning", e.target.value)}
                placeholder="I help finance teams put AI into production without the compliance headaches."
                aria-label="Positioning statement"
                className="text-[17px]! leading-relaxed!"
              />
              <ListField label="What LinkedIn should do for you" hint="Rank them: the first goal shapes calls to action and which stories we look for.">
                <ListEditor label="Goal" items={s.goals} onChange={(v) => set("goals", v)} placeholder="e.g. Win 2 new clients a month" addLabel="Add goal" suggestions={GOAL_SUGGESTIONS} />
              </ListField>
            </div>
          </Block>

          <Block id="audience" title="Audience" subtitle="Picture one real person you want reading every post. Their problems decide which of your stories matter.">
            <div className="card space-y-5 p-5">
              <Field label="Who they are">
                <AutoTextarea
                  minRows={2}
                  value={s.audience.who}
                  onChange={(e) => set("audience", { ...s.audience, who: e.target.value })}
                  placeholder="Heads of operations at 50-500 person fintechs who've been told to 'do something with AI'."
                />
              </Field>
              <div className="grid gap-5 md:grid-cols-2">
                <ListField label="What keeps them up at night">
                  <ListEditor label="Pain" items={s.audience.pains} onChange={(v) => set("audience", { ...s.audience, pains: v })} placeholder="A problem, in their words" addLabel="Add pain" />
                </ListField>
                <ListField label="What they want">
                  <ListEditor label="Desire" items={s.audience.desires} onChange={(v) => set("audience", { ...s.audience, desires: v })} placeholder="An outcome they'd pay for" addLabel="Add desire" />
                </ListField>
              </div>
            </div>
          </Block>

          <Block id="pillars" title="Content pillars" subtitle="3-4 themes you can own: where your experience meets a problem your audience can't stop thinking about. Every post belongs to one.">
            <div className="space-y-4">
              {s.pillars.length > 0 && (
                <div className="card space-y-3 p-4">
                  <div className="flex h-3 overflow-hidden rounded-full bg-fill-3" role="img" aria-label="Post mix by pillar">
                    {s.pillars.map((p, i) => (
                      <span key={p.id} className="h-full transition-[width] duration-500" style={{ width: `${shares[i]}%`, background: (TONES[p.color] ?? TONES.blue).fg }} title={`${p.name || "Untitled"}: ${shares[i]}%`} />
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {s.pillars.map((p, i) => (
                        <span key={p.id} className="flex items-center gap-1.5 t-footnote text-label-2">
                          <span className="size-2 rounded-full" style={{ background: (TONES[p.color] ?? TONES.blue).fg }} />
                          {p.name || "Untitled"} <span className="tabular-nums text-label-3">{shares[i]}%</span>
                        </span>
                      ))}
                    </div>
                    <Button variant="plain" size="sm" icon={<Equal className="size-4" />} onClick={() => change((cur) => ({ ...cur, pillars: balanceWeights(cur.pillars) }))}>
                      Even split
                    </Button>
                  </div>
                </div>
              )}
              {s.pillars.map((p, i) => (
                <PillarCard key={p.id} pillar={p} share={shares[i]} stories={storyCounts[p.id] ?? 0} onChange={setPillar} onRemove={() => askRemove(p)} />
              ))}
              {s.pillars.length === 0 && (
                <div className="card p-5 t-subhead text-label-2">No pillars yet. Add the first theme you want to be known for.</div>
              )}
              <Button
                variant="glass"
                icon={<Plus className="size-4" />}
                disabled={s.pillars.length >= MAX_PILLARS}
                onClick={() => change((cur) => ({ ...cur, pillars: [...cur.pillars, createPillar(cur.pillars)] }))}
              >
                {s.pillars.length >= MAX_PILLARS ? `${MAX_PILLARS} pillars is the limit` : "Add pillar"}
              </Button>
            </div>
          </Block>

          <Block id="expertise" title="What you know" subtitle="Topics you could talk about for an hour with no notes, and what you sell or want to be known for.">
            <div className="card grid gap-5 p-5 md:grid-cols-2">
              <ListField label="Expertise">
                <ListEditor label="Expertise" items={s.expertise} onChange={(v) => set("expertise", v)} placeholder="e.g. Shipping LLM features in regulated companies" addLabel="Add topic" />
              </ListField>
              <ListField label="Offers">
                <ListEditor label="Offer" items={s.offers} onChange={(v) => set("offers", v)} placeholder="e.g. 6-week AI readiness sprint" addLabel="Add offer" />
              </ListField>
            </div>
          </Block>

          <Block id="beliefs" title="What you believe" subtitle="Opinion posts are a belief proven by a story. Contrarian takes are the ones a reasonable peer would argue with.">
            <div className="card grid gap-5 p-5 md:grid-cols-2">
              <ListField label="Beliefs">
                <ListEditor label="Belief" items={s.beliefs} onChange={(v) => set("beliefs", v)} placeholder="e.g. Most AI pilots fail on data access, not models" addLabel="Add belief" />
              </ListField>
              <ListField label="Contrarian takes">
                <ListEditor label="Contrarian take" items={s.contrarianTakes} onChange={(v) => set("contrarianTakes", v)} placeholder="e.g. Prompt engineering is a temporary job" addLabel="Add take" />
              </ListField>
            </div>
          </Block>

          <Block id="cadence" title="Posting rhythm" subtitle={cadenceSummary(s.cadence)}>
            <div className="card p-5">
              <CadenceEditor cadence={s.cadence} timezone={timezone} onChange={(c) => set("cadence", c)} />
            </div>
          </Block>

          <Block
            id="cta"
            title="Call to action"
            subtitle="Most posts end with an easy question, not a pitch. This soft ask goes in about one post in five. Skip “DM me” and “comment YES”: LinkedIn downranks bait."
          >
            <div className="card p-5">
              <AutoTextarea minRows={2} value={s.cta} onChange={(e) => set("cta", e.target.value)} placeholder="P.S. The checklist I use with clients is in my Featured section." aria-label="Call to action" />
            </div>
          </Block>

          <Block id="boundaries" title="Boundaries" subtitle="Topics, names and details that never go into a post. The interviewer won't dig into them and the writer won't mention them.">
            <div className="card p-5">
              <ListEditor label="Topic to avoid" items={s.avoidTopics} onChange={(v) => set("avoidTopics", v)} placeholder="e.g. My current employer's clients by name" addLabel="Add boundary" suggestions={["Politics", "Family details", "Health", "Client names", "Salary and money"]} />
            </div>
          </Block>

          <Block id="language" title="Language & notes" subtitle="Posts are written in this language. You can answer interviews in any language.">
            <div className="card grid gap-5 p-5 md:grid-cols-[220px_1fr]">
              <Field label="Post language">
                <Select value={s.language} onChange={(e) => set("language", e.target.value)}>
                  {!LANGUAGES.some((l) => l.code === s.language) && <option value={s.language}>{s.language}</option>}
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Notes for the writer">
                <AutoTextarea minRows={3} value={s.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything to always keep in mind: I'm based in Zurich, I write for non-native English readers, I never name competitors…" />
              </Field>
            </div>
          </Block>
        </div>

        <nav aria-label="On this page" className="hidden lg:block">
          <div className="glass sticky! top-10 space-y-0.5 rounded-panel p-2">
            <div className="t-eyebrow px-3 pb-1 pt-2">On this page</div>
            {SECTIONS.map((sec) => (
              <a key={sec.id} href={`#${sec.id}`} className="nav-item h-8! text-[13.5px]!">
                {sec.label}
              </a>
            ))}
          </div>
        </nav>
      </div>

      <Sheet
        open={!!confirmRemove}
        onClose={() => setConfirmRemove(null)}
        size="sm"
        title="Remove this pillar?"
        footer={
          <>
            <Button variant="glass" onClick={() => setConfirmRemove(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmRemove) removePillar(confirmRemove.id);
                setConfirmRemove(null);
              }}
            >
              Remove pillar
            </Button>
          </>
        }
      >
        {confirmRemove && (
          <p className="t-body text-label-2">
            {storyCounts[confirmRemove.id]} {storyCounts[confirmRemove.id] === 1 ? "story is" : "stories are"} filed under “{confirmRemove.name}”. They stay in your Memory Bank and keep their text; they just won't count towards a pillar until you file them again.
          </p>
        )}
      </Sheet>
    </div>
  );
}
