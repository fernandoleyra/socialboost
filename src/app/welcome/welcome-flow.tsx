"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Camera, CircleCheck, Clock, Compass, Feather, Library, Mic, RefreshCw, TriangleAlert, Zap } from "lucide-react";
import type { AISettings } from "@/lib/types";
import { Button, Field, Input, Select, api, cx, toast } from "@/components/ui";
import { HealthList } from "@/components/settings/health-list";
import { LANGUAGES, browserLanguage, browserTimezone, normalizeLinkedInUrl } from "@/components/settings/options";
import { useTimezoneOptions } from "@/components/settings/use-timezones";
import { activePreset, applyPreset, type HealthReport } from "@/components/settings/presets";

type Step = "intro" | "about" | "models" | "angle";

const POSITIONING_HREF = "/interviews/new?kind=positioning&auto=1";

function Feature({ icon, tone, title, children }: { icon: ReactNode; tone: string; title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3.5">
      <span className="grid size-10 shrink-0 place-items-center rounded-[13px] [&>svg]:size-5" style={{ color: `var(--sys-${tone})`, background: `color-mix(in srgb, var(--sys-${tone}) 14%, transparent)` }}>
        {icon}
      </span>
      <div>
        <div className="t-headline">{title}</div>
        <p className="t-subhead text-label-2">{children}</p>
      </div>
    </div>
  );
}

function StepHeader({ index, total, title, subtitle }: { index: number; total: number; title: string; subtitle: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="t-eyebrow">
        Step {index} of {total}
      </div>
      <h1 className="t-title-1">{title}</h1>
      <p className="t-callout text-label-2">{subtitle}</p>
    </div>
  );
}

export function WelcomeFlow({ adding }: { adding: boolean }) {
  const steps: Step[] = adding ? ["about", "angle"] : ["intro", "about", "models", "angle"];
  const [step, setStep] = useState<Step>(steps[0]);
  const numbered: Step[] = steps.filter((s) => s !== "intro");
  const position = numbered.indexOf(step) + 1;
  const next = () => setStep(steps[Math.min(steps.length - 1, steps.indexOf(step) + 1)]);
  const back = () => setStep(steps[Math.max(0, steps.indexOf(step) - 1)]);

  /* ---------------- About ---------------- */
  const [name, setName] = useState("");
  const [headline, setHeadline] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [language, setLanguage] = useState("en");
  const [timezone, setTimezone] = useState("UTC");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const [touched, setTouched] = useState(false);
  const zones = useTimezoneOptions(timezone);

  useEffect(() => {
    setTimezone(browserTimezone());
    setLanguage(browserLanguage());
  }, []);

  const normalizedUrl = normalizeLinkedInUrl(linkedinUrl);

  const submitAbout = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!name.trim() || normalizedUrl === null) return;
    const body = { name: name.trim(), headline: headline.trim(), linkedinUrl: normalizedUrl, language, timezone };
    setCreating(true);
    try {
      if (created) {
        await api(`/api/profiles/${created.id}`, { method: "PATCH", json: body });
      } else {
        const res = await api<{ profile: { id: string; name: string } }>("/api/profiles", { method: "POST", json: body });
        setCreated({ id: res.profile.id, name: res.profile.name });
      }
      next();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setCreating(false);
    }
  };

  /* ---------------- Models ---------------- */
  const [report, setReport] = useState<HealthReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [ai, setAi] = useState<AISettings | null>(null);
  const [applying, setApplying] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    setCheckError(null);
    try {
      const [r, s] = await Promise.all([api<HealthReport>("/api/system/health"), api<{ settings: AISettings }>("/api/settings/ai")]);
      setReport(r);
      setAi(s.settings);
    } catch (err) {
      setCheckError((err as Error).message);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (step === "models" && !report && !checking && !checkError) void check();
  }, [step, report, checking, checkError, check]);

  const switchToLight = async () => {
    if (!ai) return;
    setApplying(true);
    try {
      await api("/api/settings/ai", { method: "PUT", json: applyPreset(ai, "light") });
      toast("Switched to the light models");
      await check();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setApplying(false);
    }
  };

  /* ---------------- Render ---------------- */
  const firstName = (created?.name ?? name).trim().split(/\s+/)[0];

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-8 sm:py-14">
      <div className="mb-6 flex w-full max-w-[560px] items-center justify-between">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="size-8 rounded-[9px] shadow-sm" />
          <span className="t-headline">SocialBoost</span>
        </div>
        {adding ? (
          <Link href="/" className="btn btn-plain btn-sm">
            Cancel
          </Link>
        ) : (
          step !== "intro" && (
            <div className="flex items-center gap-1.5" aria-label={`Step ${position} of ${numbered.length}`}>
              {numbered.map((s, i) => (
                <span key={s} className={cx("h-1.5 rounded-full transition-all duration-500", i + 1 === position ? "w-6 bg-accent" : i + 1 < position ? "w-1.5 bg-accent/60" : "w-1.5 bg-fill")} />
              ))}
            </div>
          )
        )}
      </div>

      <main className="glass-strong w-full max-w-[560px] rounded-window p-6 sm:p-9 animate-pop">
        <div key={step} className="animate-in">
          {step === "intro" && (
            <div className="space-y-8">
              <div className="space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icon.svg" alt="" className="size-16 rounded-[18px] shadow-[0_10px_30px_-10px_rgba(0,136,255,.6)]" />
                <h1 className="t-large-title">Your stories. Your voice. Your photos.</h1>
                <p className="t-callout text-label-2">
                  SocialBoost works like a good ghostwriter: it interviews you, keeps a bank of your real stories, and turns them into LinkedIn posts that sound like you wrote them. It all runs on your own machine.
                </p>
              </div>
              <div className="space-y-5">
                <Feature icon={<Mic />} tone="indigo" title="It interviews you">
                  Short conversations that pull out real moments, with the details that make them yours.
                </Feature>
                <Feature icon={<Library />} tone="blue" title="It remembers">
                  Every story lands in a Memory Bank, together with a photo from the moment.
                </Feature>
                <Feature icon={<Feather />} tone="teal" title="It drafts, you approve">
                  Posts in your tone, checked for AI tells, planned on a calendar you control.
                </Feature>
              </div>
              <div className="space-y-3">
                <Button variant="primary" size="lg" className="w-full" onClick={next}>
                  Get started
                  <ArrowRight className="size-4" />
                </Button>
                <p className="text-center t-footnote text-label-2">Two minutes of setup, then a 10-15 minute conversation about your goals.</p>
              </div>
            </div>
          )}

          {step === "about" && (
            <form onSubmit={submitAbout} className="space-y-7" noValidate>
              <StepHeader
                index={position}
                total={numbered.length}
                title={adding ? "Who are we writing for next?" : "Who are we writing for?"}
                subtitle={adding ? "Each person gets their own strategy, stories, voice and calendar." : "Just the basics. You can change all of this later in Settings."}
              />
              <div className="space-y-4">
                <Field label="Full name">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Doe"
                    autoFocus
                    autoComplete="name"
                    maxLength={120}
                    aria-invalid={touched && !name.trim()}
                  />
                  {touched && !name.trim() && <span className="block px-1 t-caption text-sys-red">We need a name to write for.</span>}
                </Field>
                <Field label="Headline" hint="The line under your name on LinkedIn. Optional.">
                  <Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Founder at Acme · AI for finance teams" maxLength={220} />
                </Field>
                <Field label="LinkedIn profile" hint="Optional. We never log in or scrape; later you can import your own posts so drafts match your tone.">
                  <Input
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    placeholder="linkedin.com/in/janedoe"
                    inputMode="url"
                    autoComplete="url"
                    spellCheck={false}
                    aria-invalid={normalizedUrl === null}
                  />
                  {normalizedUrl === null && <span className="block px-1 t-caption text-sys-red">Use your profile link, the one with /in/ in it.</span>}
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Posts written in">
                    <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
                      {LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Timezone">
                    <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                      {zones.map((z) => (
                        <option key={z} value={z}>
                          {z.replace(/_/g, " ")}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                {steps.indexOf(step) > 0 ? (
                  <Button type="button" variant="plain" icon={<ArrowLeft className="size-4" />} onClick={back}>
                    Back
                  </Button>
                ) : (
                  <span />
                )}
                <Button type="submit" variant="primary" size="lg" loading={creating}>
                  Continue
                  {!creating && <ArrowRight className="size-4" />}
                </Button>
              </div>
            </form>
          )}

          {step === "models" && (
            <div className="space-y-6">
              <StepHeader
                index={position}
                total={numbered.length}
                title="Check your models"
                subtitle="Interviews and drafts run on local models through Ollama, so nothing leaves this machine. Here's what's ready."
              />

              {checking && !report ? (
                <div className="space-y-2.5" aria-busy="true" aria-label="Checking models">
                  <div className="skeleton h-14 w-full" />
                  {Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className="skeleton h-7" style={{ width: `${90 - i * 8}%` }} />
                  ))}
                </div>
              ) : checkError ? (
                <div className="flex items-start gap-3 rounded-inner bg-fill-4 p-4">
                  <TriangleAlert className="mt-0.5 size-5 shrink-0 text-sys-red" />
                  <div className="space-y-1">
                    <p className="t-subhead font-semibold">Couldn't run the check</p>
                    <p className="t-footnote text-label-2">{checkError}</p>
                  </div>
                </div>
              ) : report ? (
                <div className="space-y-5">
                  {report.summary.ready ? (
                    <div className="flex items-start gap-3 rounded-inner p-4" style={{ background: "color-mix(in srgb, var(--sys-green) 12%, transparent)" }}>
                      <CircleCheck className="mt-0.5 size-5 shrink-0 text-sys-green" />
                      <p className="t-subhead">
                        <span className="font-semibold">You're set.</span> Everything needed for interviews and writing is installed.
                        {report.summary.missingRecommended > 0 && " A couple of extras are missing; the app works without them."}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 rounded-inner p-4" style={{ background: "color-mix(in srgb, var(--sys-orange) 13%, transparent)" }}>
                      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-sys-orange" />
                      <p className="t-subhead">
                        <span className="font-semibold">Some models are missing.</span> You can carry on and fix it later in Settings → Models; interviews need them to run.
                      </p>
                    </div>
                  )}
                  {report.providers.some((p) => p.kind === "ollama" && !p.ok) && (
                    <p className="t-footnote text-label-2">
                      New to Ollama? Install it from{" "}
                      <a href="https://ollama.com/download" target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
                        ollama.com/download
                      </a>
                      , open it, then press Check again. We'll show the exact models to download.
                    </p>
                  )}
                  <HealthList report={report} compact />
                  {ai && activePreset(ai) !== "light" && !report.summary.ready && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-inner border border-separator p-4">
                      <div className="flex items-start gap-3">
                        <Zap className="mt-0.5 size-5 shrink-0 text-sys-yellow" />
                        <div>
                          <div className="t-subhead font-semibold">Laptop with 8 GB of memory?</div>
                          <p className="t-footnote text-label-2">Switch to smaller models (Qwen3 4B, Gemma 3 4B). Faster downloads, a little less polish.</p>
                        </div>
                      </div>
                      <Button size="sm" variant="tinted" onClick={switchToLight} loading={applying}>
                        Use light models
                      </Button>
                    </div>
                  )}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button type="button" variant="glass" icon={<RefreshCw className={cx("size-4", checking && "animate-spin")} />} onClick={check} disabled={checking}>
                  Check again
                </Button>
                <Button variant="primary" size="lg" onClick={next}>
                  {report?.summary.ready ? "Continue" : "Continue anyway"}
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          )}

          {step === "angle" && (
            <div className="space-y-7">
              <StepHeader
                index={position}
                total={numbered.length}
                title={firstName ? `Let's find your angle, ${firstName}` : "Let's find your angle"}
                subtitle="A good ghostwriter interviews you before writing a word. This first conversation is about direction: what LinkedIn should do for you, who you want to reach, and what you know and believe that others don't."
              />
              <div className="space-y-4 rounded-panel bg-fill-4 p-5">
                <Feature icon={<Clock />} tone="blue" title="10-15 minutes">
                  One question at a time. Stop whenever you like and pick up later.
                </Feature>
                <Feature icon={<Mic />} tone="indigo" title="Type or talk">
                  Answer in whatever language is easiest. Rough answers are fine.
                </Feature>
                <Feature icon={<Compass />} tone="green" title="You get a strategy draft">
                  Positioning, audience, 3-4 content pillars and a posting rhythm. Edit anything afterwards.
                </Feature>
              </div>
              <div className="space-y-3">
                <Link href={POSITIONING_HREF} className="btn btn-primary btn-lg w-full">
                  <Mic className="size-4" />
                  Start the positioning interview
                </Link>
                <Link href="/strategy" className="btn btn-plain w-full">
                  Skip — I'll fill in the strategy myself
                </Link>
              </div>
              <p className="flex items-start gap-2 t-footnote text-label-2">
                <Camera className="mt-0.5 size-4 shrink-0" />
                Next come story interviews. Each one ends with a request for a photo from the moment, because real photos are what make a post feel like you.
              </p>
            </div>
          )}
        </div>
      </main>

      {!adding && step === "about" && (
        <p className="mt-5 max-w-[480px] text-center t-caption text-label-2">Your data stays in the data/ folder on this computer. Nothing is sent anywhere unless you add a cloud model.</p>
      )}
    </div>
  );
}
