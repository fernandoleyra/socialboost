"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldCheck, Sparkles, Wand2, Wrench } from "lucide-react";
import { Button, Chip, Meter, Spinner, cx } from "@/components/ui";
import { RULE_LABELS, type LintHit } from "@/lib/factory/lint";
import { CRITIQUE_DIMENSIONS, READY_SCORE, critiqueScore, type Gate } from "@/lib/factory/quality";
import type { Critique } from "@/lib/types";
import { ScoreRing } from "./shared";

const SEV = {
  error: { color: "var(--sys-red)", label: "Fix" },
  warn: { color: "var(--sys-orange)", label: "Check" },
  info: { color: "var(--sys-blue)", label: "Note" },
} as const;

function meterColor(v: number) {
  return v >= 8 ? "var(--sys-green)" : v >= 6 ? "var(--sys-orange)" : "var(--sys-red)";
}

export function IssueList({ issues, onFocus, limit = 8 }: { issues: LintHit[]; onFocus: (i: LintHit) => void; limit?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? issues : issues.slice(0, limit);
  return (
    <div className="space-y-0.5">
      {shown.map((i, idx) => (
        <button
          key={`${i.rule}-${i.start ?? idx}-${idx}`}
          type="button"
          onClick={() => onFocus(i)}
          disabled={i.start === undefined}
          className="flex w-full items-start gap-2.5 rounded-[12px] px-2.5 py-2 text-left transition-colors hover:bg-fill-4 disabled:hover:bg-transparent disabled:cursor-default focus-ring"
        >
          <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: SEV[i.severity].color }} aria-label={SEV[i.severity].label} />
          <span className="min-w-0 t-footnote">
            <span className="font-semibold">{RULE_LABELS[i.rule] ?? i.rule}</span>
            <span className="text-label-2"> · {i.message}</span>
          </span>
        </button>
      ))}
      {issues.length > limit && (
        <button type="button" onClick={() => setAll((a) => !a)} className="px-2.5 pt-1 t-footnote font-semibold text-accent">
          {all ? "Show fewer" : `Show all ${issues.length}`}
        </button>
      )}
    </div>
  );
}

export function QualityPanel({
  hasBody,
  lint,
  lintScore,
  score,
  gate,
  critique,
  critiqueFresh,
  critiquing,
  critiqueError,
  busy,
  onCritique,
  onApplyCritique,
  onFixWithWriter,
  onAutofix,
  onFocus,
}: {
  hasBody: boolean;
  lint: LintHit[];
  lintScore: number;
  score: number;
  gate: Gate;
  critique: Critique | null;
  critiqueFresh: boolean;
  critiquing: boolean;
  critiqueError: string | null;
  busy: boolean;
  onCritique: () => void;
  onApplyCritique: () => void;
  onFixWithWriter: () => void;
  onAutofix: () => void;
  onFocus: (i: LintHit) => void;
}) {
  const fixable = lint.filter((i) => i.fixable).length;
  const actionable = lint.filter((i) => i.severity !== "info").length;
  const counts = { error: lint.filter((i) => i.severity === "error").length, warn: lint.filter((i) => i.severity === "warn").length };

  if (!hasBody) {
    return (
      <section className="card p-5 space-y-2" aria-label="Quality">
        <div className="flex items-center gap-2 t-headline">
          <ShieldCheck className="size-5 text-label-2" />
          Quality check
        </div>
        <p className="t-footnote text-label-2">
          Once there's text, every line is checked live for AI tells (126 phrases, em dashes, “it's not X, it's Y”, one-line staircases, bait endings) and for numbers or quotes that aren't in your story. A critique then scores how human, specific and on-voice it reads. Posts pass at {READY_SCORE}.
        </p>
      </section>
    );
  }

  return (
    <section className="card p-5 space-y-5" aria-label="Quality">
      <div className="flex items-center gap-4">
        <ScoreRing score={score} size={60} />
        <div className="min-w-0">
          <div className="t-headline flex items-center gap-1.5">
            {gate.ready ? (
              <>
                <CheckCircle2 className="size-4.5 text-sys-green" />
                Ready for your review
              </>
            ) : (
              "Needs a pass"
            )}
          </div>
          <div className="t-footnote text-label-2">
            Checks {lintScore}
            {critique ? ` · Critique ${critiqueScore(critique)}${critiqueFresh ? "" : " (earlier version)"}` : " · No critique yet"}
          </div>
        </div>
      </div>

      {!gate.ready && gate.reasons.length > 0 && (
        <ul className="space-y-1 t-footnote text-label-2">
          {gate.reasons.slice(0, 3).map((r) => (
            <li key={r} className="flex gap-2">
              <span className="mt-[7px] size-1 shrink-0 rounded-full bg-[var(--label-3)]" />
              {r}
            </li>
          ))}
        </ul>
      )}

      {/* Critique */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="t-subhead font-semibold">Editor's read</h3>
          <div className="flex items-center gap-1.5">
            {critique && !critiqueFresh && <Chip tone="orange">Earlier version</Chip>}
            <Button size="sm" variant={critique && critiqueFresh ? "plain" : "tinted"} onClick={onCritique} loading={critiquing} disabled={busy}>
              {critique ? "Re-run" : "Critique"}
            </Button>
          </div>
        </div>
        {critiquing && !critique && (
          <div className="flex items-center gap-2 t-footnote text-label-2">
            <Spinner className="size-4" /> Reading it like a strict editor would…
          </div>
        )}
        {critiqueError && (
          <div className="flex gap-2 rounded-[12px] p-3 t-footnote" style={{ background: "color-mix(in srgb, var(--sys-red) 10%, transparent)" }}>
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-sys-red" />
            <span>
              {critiqueError}
              {/settings/i.test(critiqueError) && (
                <>
                  {" "}
                  <Link href="/settings" className="font-semibold text-accent">
                    Open Settings
                  </Link>
                </>
              )}
            </span>
          </div>
        )}
        {critique && (
          <div className={cx("space-y-2.5", !critiqueFresh && "opacity-60")}>
            {CRITIQUE_DIMENSIONS.map((d) => (
              <div key={d.key} className="grid grid-cols-[96px_1fr_28px] items-center gap-2.5" title={d.hint}>
                <span className="t-footnote text-label-2">{d.label}</span>
                <Meter value={critique[d.key] / 10} color={meterColor(critique[d.key])} />
                <span className="t-footnote font-semibold tabular-nums text-right">{critique[d.key]}</span>
              </div>
            ))}
            {critique.issues.length > 0 && (
              <ul className="space-y-1.5 pt-1">
                {critique.issues.map((s) => (
                  <li key={s} className="flex gap-2 t-footnote">
                    <span className="mt-[7px] size-1.5 shrink-0 rounded-full" style={{ background: /^invented/i.test(s) ? "var(--sys-red)" : "var(--sys-orange)" }} />
                    <span className={cx(/^invented/i.test(s) && "font-semibold")}>{s}</span>
                  </li>
                ))}
              </ul>
            )}
            {critique.suggestions.length > 0 && (
              <ul className="space-y-1.5">
                {critique.suggestions.map((s) => (
                  <li key={s} className="flex gap-2 t-footnote text-label-2">
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent" />
                    {s}
                  </li>
                ))}
              </ul>
            )}
            {critiqueFresh && (critique.suggestions.length > 0 || critique.issues.length > 0) && (
              <Button size="sm" variant="glass" icon={<Wand2 className="size-3.5" />} onClick={onApplyCritique} disabled={busy}>
                Apply these notes
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Lint */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="t-subhead font-semibold">
            Checks{" "}
            <span className="t-footnote font-normal text-label-2">
              {lint.length === 0 ? "· all clear" : [counts.error && `${counts.error} to fix`, counts.warn && `${counts.warn} to check`].filter(Boolean).join(" · ") || `${lint.length} notes`}
            </span>
          </h3>
          <div className="flex gap-1.5">
            {fixable > 0 && (
              <Button size="sm" variant="plain" icon={<Wrench className="size-3.5" />} onClick={onAutofix} disabled={busy}>
                Fix {fixable}
              </Button>
            )}
            {actionable > 0 && (
              <Button size="sm" variant="tinted" icon={<Wand2 className="size-3.5" />} onClick={onFixWithWriter} disabled={busy}>
                Rewrite flagged
              </Button>
            )}
          </div>
        </div>
        {lint.length === 0 ? (
          <div className="flex items-center gap-2 rounded-[12px] px-2.5 py-2 t-footnote text-label-2">
            <CheckCircle2 className="size-4 text-sys-green" />
            No AI tells, no invented numbers or quotes.
          </div>
        ) : (
          <IssueList issues={lint} onFocus={onFocus} />
        )}
      </div>
    </section>
  );
}
