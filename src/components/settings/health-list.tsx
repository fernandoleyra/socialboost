"use client";

import { CircleCheck, CircleDashed, CircleHelp, CircleX, Server } from "lucide-react";
import { cx } from "@/components/ui";
import { CommandLine } from "./copy-button";
import { TASK_FALLBACK, TASK_INFO, pullAllCommand, type HealthReport, type RouteHealth, type TaskImportance } from "./presets";

const GROUPS: { importance: TaskImportance; title: string }[] = [
  { importance: "required", title: "Needed for interviews and writing" },
  { importance: "recommended", title: "Nice to have" },
  { importance: "optional", title: "Optional" },
];

function statusText(r: RouteHealth): string {
  switch (r.status) {
    case "ready":
      return r.model;
    case "missing":
      return `${r.model} isn't installed`;
    case "unknown":
      return `${r.model} (can't list models; use Test in Settings)`;
    case "provider-down":
      return `${r.providerLabel} isn't reachable`;
    case "no-provider":
      return `Provider "${r.providerLabel}" was removed`;
    case "off":
      return "Off";
  }
}

function StatusIcon({ r }: { r: RouteHealth }) {
  if (r.status === "ready") return <CircleCheck className="size-[18px] shrink-0 text-sys-green" aria-label="Ready" />;
  if (r.status === "off") return <CircleDashed className="size-[18px] shrink-0 text-label-3" aria-label="Off" />;
  if (r.status === "unknown") return <CircleHelp className="size-[18px] shrink-0 text-sys-blue" aria-label="Unknown" />;
  const soft = r.importance !== "required";
  return <CircleX className={cx("size-[18px] shrink-0", soft ? "text-sys-orange" : "text-sys-red")} aria-label="Missing" />;
}

/** Provider reachability + per-task model availability, with copyable `ollama pull` commands. */
export function HealthList({ report, compact }: { report: HealthReport; compact?: boolean }) {
  const pulls = report.summary.pullCommands.map((c) => c.replace(/^ollama pull /, ""));
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {report.providers.length === 0 && <p className="t-subhead text-label-2">No model providers are configured.</p>}
        {report.providers.map((p) => (
          <div key={p.id} className="flex items-start gap-3 rounded-inner bg-fill-4 px-3.5 py-3">
            <Server className={cx("mt-0.5 size-[18px] shrink-0", p.ok ? "text-sys-green" : "text-sys-red")} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="t-subhead font-semibold">{p.label}</span>
                <span className={cx("t-footnote", p.ok ? "text-sys-green" : "text-sys-red")}>
                  {p.ok ? `Connected · ${p.models.length} ${p.models.length === 1 ? "model" : "models"}` : "Not reachable"}
                </span>
              </div>
              {!p.ok && (
                <p className="mt-0.5 break-words t-footnote text-label-2">
                  {p.error} {p.hint && <span className="font-medium text-label">{p.hint}</span>}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {GROUPS.map((g) => {
        const rows = report.routes.filter((r) => r.importance === g.importance);
        if (rows.length === 0) return null;
        return (
          <div key={g.importance} className="space-y-1.5">
            <div className="px-1 t-caption font-semibold uppercase tracking-wide text-label-2">{g.title}</div>
            <ul className="space-y-1">
              {rows.map((r) => (
                <li key={r.task} className="flex items-start gap-3 rounded-control px-1 py-1.5">
                  <StatusIcon r={r} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="t-subhead font-medium">{TASK_INFO[r.task].label}</span>
                      <span className={cx("min-w-0 truncate font-mono text-[12.5px]", r.status === "ready" ? "text-label-2" : "text-label")}>{statusText(r)}</span>
                    </div>
                    {!compact && r.status !== "ready" && TASK_FALLBACK[r.task] && <p className="t-caption text-label-2">{TASK_FALLBACK[r.task]}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {pulls.length > 0 && (
        <div className="space-y-2 rounded-inner border border-separator p-3.5">
          <p className="t-footnote font-medium">Run this once in a terminal to download what's missing:</p>
          <CommandLine command={pullAllCommand(pulls)} />
          <p className="t-caption text-label-2">Downloads take a few minutes. Then check again.</p>
        </div>
      )}
    </div>
  );
}
