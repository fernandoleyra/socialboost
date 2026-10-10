"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, BookOpen, Check, ChevronDown, Compass, Dices, Info, RotateCcw, Shuffle } from "lucide-react";
import { Button, Chip, PageHeader, Spinner, Textarea, TONES, api, cx, toast } from "@/components/ui";
import { POSITIONING_AREAS, STORY_THEMES, themeOfPrompt } from "@/lib/interview/bank";
import { planStoryInterview, surprisePrompt } from "@/lib/interview/engine";
import type { Interview } from "@/lib/repo";

export type NewInterviewPillar = { id: string; name: string; color: string; description: string; weight: number; storyPrompts: string[]; ready: number };

export type NewInterviewProps = {
  initialKind: "positioning" | "story";
  auto: boolean;
  positioning: { status: "none" | "active" | "completed"; id: string | null };
  pillars: NewInterviewPillar[];
  defaultPillarId: string | null;
  initialSeed: string;
  initialThemeId: string | null;
  previousSeeds: string[];
  activeStory: { id: string; title: string } | null;
};

function KindCard({
  selected,
  onSelect,
  icon,
  tone,
  title,
  body,
  meta,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  tone: string;
  title: string;
  body: string;
  meta: React.ReactNode;
}) {
  const t = TONES[tone] ?? TONES.blue;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cx(
        "card card-interactive focus-ring relative flex w-full flex-col items-start gap-3 p-5 text-left",
        selected && "ring-2 ring-[color:var(--accent)] ring-offset-0",
      )}
    >
      <span className="grid size-11 place-items-center rounded-full [&>svg]:size-5" style={{ color: t.fg, background: t.bg }}>
        {icon}
      </span>
      <span className="space-y-1">
        <span className="block t-headline">{title}</span>
        <span className="block t-subhead text-label-2">{body}</span>
      </span>
      <span className="t-footnote text-label-2">{meta}</span>
      <span
        aria-hidden
        className={cx(
          "absolute right-4 top-4 grid size-6 place-items-center rounded-full transition-colors",
          selected ? "bg-accent text-white" : "ring-[1.5px] ring-inset ring-[color:var(--label-3)]",
        )}
      >
        {selected && <Check className="size-3.5" strokeWidth={3} />}
      </span>
    </button>
  );
}

export function NewInterview(props: NewInterviewProps) {
  const router = useRouter();
  const [kind, setKind] = useState(props.initialKind);
  const [pillarId, setPillarId] = useState<string | null>(props.defaultPillarId);
  const [themeId, setThemeId] = useState<string | null>(props.initialThemeId);
  const [seed, setSeed] = useState(props.initialSeed);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [knownOpen, setKnownOpen] = useState(false);
  const [knownStory, setKnownStory] = useState("");
  const [creating, setCreating] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);
  const autoRan = useRef(false);

  const create = async (body: Record<string, unknown>) => {
    setCreating(true);
    try {
      const { interview } = await api<{ interview: Interview }>("/api/interviews", { method: "POST", json: body });
      router.replace(`/interviews/${interview.id}`);
      return true;
    } catch (e) {
      toast((e as Error).message, "error");
      setCreating(false);
      return (e as Error).message;
    }
  };

  // /interviews/new?kind=positioning&auto=1 (from Welcome): start immediately.
  useEffect(() => {
    if (!props.auto || props.initialKind !== "positioning" || autoRan.current) return;
    autoRan.current = true;
    void create({ kind: "positioning" }).then((r) => r !== true && setAutoError(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (props.auto && props.initialKind === "positioning" && !autoError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center animate-in">
        <Spinner className="size-7" />
        <div>
          <div className="t-title-3">Setting up your positioning interview</div>
          <p className="mt-1 t-subhead text-label-2">10 to 15 minutes, one question at a time.</p>
        </div>
      </div>
    );
  }

  const replan = (next: { pillarId?: string | null; themeId?: string | null; skip?: string[] }) => {
    const p = next.pillarId !== undefined ? next.pillarId : pillarId;
    const th = next.themeId !== undefined ? next.themeId : themeId;
    const sk = next.skip ?? skipped;
    const plan = planStoryInterview({
      pillars: p ? props.pillars : [],
      memories: [],
      previousSeeds: [...props.previousSeeds, ...sk],
      pillarId: p,
      themeId: th,
    });
    setSeed(plan.seed);
    setThemeId(plan.themeId);
  };

  const choosePillar = (id: string | null) => {
    setPillarId(id);
    setSkipped([]);
    // A pillar with its own story prompts starts from those; otherwise keep the chosen theme.
    const pillar = props.pillars.find((p) => p.id === id);
    replan({ pillarId: id, themeId: pillar?.storyPrompts.length ? null : themeId, skip: [] });
  };

  const another = () => {
    const sk = [...skipped, seed];
    setSkipped(sk);
    replan({ skip: sk });
  };

  const surprise = () => {
    const s = surprisePrompt([...props.previousSeeds, ...skipped, seed]);
    setSeed(s.seed);
    setThemeId(s.themeId);
  };

  const theme = STORY_THEMES.find((t) => t.id === themeId) ?? themeOfPrompt(seed);
  const pillar = props.pillars.find((p) => p.id === pillarId);
  const neediest = props.defaultPillarId;
  const usingKnown = knownOpen && knownStory.trim().length > 0;

  const start = () =>
    void create(
      kind === "positioning"
        ? { kind: "positioning" }
        : { kind: "story", pillar: pillarId, ...(usingKnown ? { knownStory: knownStory.trim() } : { seed, theme: themeId }) },
    );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow="New interview"
        title="Let's talk"
        subtitle="Interviews are where your posts come from. You answer in your own words, by typing or talking; SocialBoost asks the follow-up questions a good ghostwriter would."
      />

      {autoError && (
        <div className="card flex items-start gap-3 p-4" role="alert">
          <Info className="mt-0.5 size-4 shrink-0 text-sys-red" />
          <div className="space-y-2">
            <p className="t-subhead">{autoError}</p>
            <Button size="sm" variant="tinted" icon={<RotateCcw className="size-3.5" />} onClick={() => void create({ kind: "positioning" }).then((r) => setAutoError(r === true ? null : r))}>
              Try again
            </Button>
          </div>
        </div>
      )}

      <section className="space-y-3" aria-label="Interview type">
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
          <KindCard
            selected={kind === "positioning"}
            onSelect={() => setKind("positioning")}
            icon={<Compass />}
            tone="indigo"
            title="Positioning"
            body="What your LinkedIn is for: goals, the readers you want, what you believe. Builds your strategy and pillars."
            meta={
              props.positioning.status === "completed" ? (
                <span className="text-sys-green">Done · run again to update your strategy</span>
              ) : props.positioning.status === "active" ? (
                <span className="text-accent">In progress</span>
              ) : (
                "10–15 min · do this first"
              )
            }
          />
          <KindCard
            selected={kind === "story"}
            onSelect={() => setKind("story")}
            icon={<BookOpen />}
            tone="orange"
            title="Story"
            body="One real moment from your work, told in detail: the scene, what was said, what changed. Ends with a photo."
            meta="About 10 min · once a week keeps the calendar full"
          />
        </div>
      </section>

      {kind === "positioning" ? (
        <section className="card space-y-4 p-5 animate-in">
          <div>
            <h2 className="t-headline">What we'll cover</h2>
            <p className="mt-1 t-subhead text-label-2">One question at a time. Short answers are fine; examples help most. At the end, SocialBoost drafts your positioning, audience and 3–4 content pillars. You can edit all of it in Strategy.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {POSITIONING_AREAS.map((a) => (
              <Chip key={a.key}>{a.label}</Chip>
            ))}
          </div>
          {props.positioning.status === "active" && props.positioning.id ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href={`/interviews/${props.positioning.id}`} className="btn btn-primary btn-lg">
                Resume positioning interview
                <ArrowRight className="size-4" />
              </Link>
              <Button variant="glass" size="lg" onClick={start} loading={creating}>
                Start over
              </Button>
            </div>
          ) : (
            <Button variant="primary" size="lg" onClick={start} loading={creating} className="w-full sm:w-auto">
              {props.positioning.status === "completed" ? "Run it again" : "Start positioning interview"}
              <ArrowRight className="size-4" />
            </Button>
          )}
        </section>
      ) : (
        <div className="space-y-6 animate-in">
          {props.positioning.status !== "completed" && (
            <div className="flex items-start gap-3 rounded-[18px] bg-fill-4 p-4">
              <Info className="mt-0.5 size-4 shrink-0 text-accent" />
              <p className="t-footnote text-label-2">
                Tip: do the{" "}
                <button type="button" className="font-semibold text-accent" onClick={() => setKind("positioning")}>
                  positioning interview
                </button>{" "}
                first so stories get matched to your content pillars. You can still tell a story now.
              </p>
            </div>
          )}

          {props.activeStory && (
            <Link href={`/interviews/${props.activeStory.id}`} className="card card-interactive flex items-center gap-3 p-4">
              <span className="grid size-9 place-items-center rounded-full bg-fill-3">
                <BookOpen className="size-4 text-label-2" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block t-footnote text-label-2">You have a story in progress</span>
                <span className="block truncate t-subhead font-semibold">{props.activeStory.title}</span>
              </span>
              <span className="t-subhead font-semibold text-accent">Resume</span>
            </Link>
          )}

          {props.pillars.length > 0 && (
            <section className="space-y-3">
              <div className="px-1">
                <h2 className="t-headline">Which pillar?</h2>
                <p className="t-footnote text-label-2">We'll steer the questions toward this part of your strategy.</p>
              </div>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Pillar">
                {props.pillars.map((p) => {
                  const selected = p.id === pillarId;
                  const t = TONES[p.color] ?? TONES.blue;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => choosePillar(p.id)}
                      className={cx(
                        "focus-ring flex items-center gap-2 rounded-full py-2 pl-3 pr-4 t-subhead transition-[background,box-shadow]",
                        selected ? "font-semibold" : "bg-fill-4 hover:bg-fill-3",
                      )}
                      style={selected ? { background: t.bg, color: t.fg, boxShadow: `inset 0 0 0 1.5px ${t.fg}` } : undefined}
                    >
                      <span className="size-2.5 rounded-full" style={{ background: t.fg }} />
                      {p.name}
                      <span className={cx("t-caption", selected ? "" : "text-label-2")}>
                        {p.ready} ready{p.id === neediest ? " · needs stories" : ""}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  role="radio"
                  aria-checked={pillarId === null}
                  onClick={() => choosePillar(null)}
                  className={cx("focus-ring rounded-full px-4 py-2 t-subhead", pillarId === null ? "bg-fill-2 font-semibold" : "bg-fill-4 hover:bg-fill-3")}
                >
                  Any topic
                </button>
              </div>
            </section>
          )}

          <section className={cx("glass rounded-panel p-5 sm:p-6 space-y-4 transition-opacity", usingKnown && "opacity-50")} aria-live="polite">
            <div className="flex items-center justify-between gap-3">
              <div className="t-eyebrow">{theme ? `First question · ${theme.label}` : pillar ? `First question · ${pillar.name}` : "First question"}</div>
            </div>
            <p className="t-title-2 font-semibold">{seed}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="glass" icon={<Shuffle className="size-3.5" />} onClick={another} disabled={usingKnown}>
                Another question
              </Button>
              <Button size="sm" variant="plain" icon={<Dices className="size-3.5" />} onClick={surprise} disabled={usingKnown}>
                Surprise me
              </Button>
            </div>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Theme">
              {STORY_THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={themeId === t.id}
                  title={t.blurb}
                  disabled={usingKnown}
                  onClick={() => {
                    setThemeId(t.id);
                    replan({ themeId: t.id });
                  }}
                  className="chip shrink-0 transition-[background,color] hover:brightness-95 disabled:opacity-50"
                  style={themeId === t.id ? { ["--chip-bg" as string]: "var(--accent)", ["--chip-fg" as string]: "#fff" } : undefined}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          <section className="card p-1.5">
            <button
              type="button"
              onClick={() => setKnownOpen((o) => !o)}
              aria-expanded={knownOpen}
              className="flex w-full items-center justify-between gap-3 rounded-[14px] px-3.5 py-3 text-left hover:bg-fill-4"
            >
              <span>
                <span className="block t-subhead font-semibold">I already know the story</span>
                <span className="block t-footnote text-label-2">Write a line or two and the interviewer starts from there.</span>
              </span>
              <ChevronDown className={cx("size-4 shrink-0 text-label-2 transition-transform", knownOpen && "rotate-180")} />
            </button>
            {knownOpen && (
              <div className="px-3.5 pb-3.5 pt-1">
                <Textarea
                  autoFocus
                  rows={3}
                  value={knownStory}
                  onChange={(e) => setKnownStory(e.target.value)}
                  placeholder="e.g. The day our biggest client walked out of a pitch after 12 minutes."
                  maxLength={4000}
                />
              </div>
            )}
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" onClick={start} loading={creating}>
              Start interview
              <ArrowRight className="size-4" />
            </Button>
            <span className="t-footnote text-label-2">About 10 minutes. At the end we'll ask for a photo.</span>
          </div>
        </div>
      )}
    </div>
  );
}
