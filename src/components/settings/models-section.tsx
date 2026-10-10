"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Cpu, Pencil, Plus, RefreshCw, Server, Sparkles, Stethoscope, Trash2, TriangleAlert, CircleCheck } from "lucide-react";
import type { AISettings, ModelRoute, ModelTask, ProviderConfig, ProviderKind } from "@/lib/types";
import { Button, Chip, IconButton, Input, Select, Sheet, Spinner, api, cx, toast } from "@/components/ui";
import { CommandLine } from "./copy-button";
import { Group } from "./grouped";
import { HealthList } from "./health-list";
import {
  PRESETS,
  TASK_FALLBACK,
  TASK_INFO,
  TASK_ORDER,
  activePreset,
  applyPreset,
  modelAvailable,
  presetModels,
  pullAllCommand,
  pullCommand,
  routesMissingModel,
  tasksUsingProvider,
  uniqueProviderId,
  type HealthReport,
  type PresetId,
} from "./presets";
import { ProviderSheet, fetchProviderModels, type ModelListResult } from "./provider-sheet";

const KIND_ICON: Record<ProviderKind, typeof Server> = { ollama: Server, openai: Cpu, anthropic: Sparkles };
const CTX_OPTIONS = [4096, 8192, 16384, 32768];
const TEMPERATURES = [0, 0.2, 0.4, 0.6, 0.7, 0.8, 0.9, 1, 1.2];

type ListState = ModelListResult & { loading: boolean };
type TestResult = { ok: boolean; sample?: string; ms?: number; error?: string; hint?: string };

export function ModelsSection({ initial }: { initial: AISettings }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [lists, setLists] = useState<Record<string, ListState>>({});
  const [tests, setTests] = useState<Partial<Record<ModelTask, TestResult | "running">>>({});
  const [sheet, setSheet] = useState<{ open: boolean; provider: ProviderConfig | null }>({ open: false, provider: null });
  const [health, setHealth] = useState<{ open: boolean; report: HealthReport | null; loading: boolean }>({ open: false, report: null, loading: false });

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const preset = activePreset(draft);

  const loadModels = useCallback(async (p: ProviderConfig) => {
    setLists((l) => ({ ...l, [p.id]: { ...(l[p.id] ?? { ok: false, models: [] }), loading: true } }));
    const res = await fetchProviderModels(p);
    setLists((l) => ({ ...l, [p.id]: { ...res, loading: false } }));
  }, []);

  // Load model lists for saved providers on mount.
  useEffect(() => {
    initial.providers.forEach((p) => void loadModels(p));
  }, [initial.providers, loadModels]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const persist = async (next: AISettings, message?: string): Promise<boolean> => {
    const blank = routesMissingModel(next);
    if (blank.length) {
      toast(`Pick a model for ${blank.map((t) => TASK_INFO[t].label).join(", ")}, or turn ${blank.length === 1 ? "it" : "them"} off, before saving.`, "error");
      return false;
    }
    setSaving(true);
    try {
      const res = await api<{ settings: AISettings }>("/api/settings/ai", { method: "PUT", json: next });
      setSaved(res.settings);
      setDraft(res.settings);
      if (message) toast(message);
      return true;
    } catch (e) {
      toast((e as Error).message, "error");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const setRoute = (task: ModelTask, route: ModelRoute | null) => setDraft((d) => ({ ...d, routes: { ...d.routes, [task]: route } }));

  const changeProvider = (task: ModelTask, providerId: string) => {
    if (!providerId) return setRoute(task, null);
    const current = draft.routes[task];
    const models = lists[providerId]?.models ?? [];
    const provider = draft.providers.find((p) => p.id === providerId);
    // Keep the model name if the new provider has it; otherwise start empty so the user picks one.
    const keep = current?.model && provider && modelAvailable(provider.kind, current.model, models) ? current.model : "";
    const info = TASK_INFO[task];
    setRoute(task, {
      providerId,
      model: keep,
      ...(info.usesTemperature ? { temperature: current?.temperature ?? info.defaultTemperature } : {}),
    });
  };

  const runTest = async (task: ModelTask) => {
    if (dirty && !(await persist(draft))) return;
    setTests((t) => ({ ...t, [task]: "running" }));
    try {
      const res = await api<TestResult>("/api/settings/ai/test", { method: "POST", json: { task } });
      setTests((t) => ({ ...t, [task]: res }));
    } catch (e) {
      setTests((t) => ({ ...t, [task]: { ok: false, error: (e as Error).message } }));
    }
  };

  const applyPresetNow = async (id: PresetId) => {
    const next = applyPreset(draft, id);
    if (await persist(next, `${PRESETS.find((p) => p.id === id)!.label} preset applied`)) {
      next.providers.filter((p) => !lists[p.id]).forEach((p) => void loadModels(p));
      setTests({});
    }
  };

  const saveProvider = (p: Omit<ProviderConfig, "id"> & { id?: string }) => {
    const provider: ProviderConfig = { ...p, id: p.id ?? uniqueProviderId(draft.providers, p.kind) };
    setDraft((d) => ({
      ...d,
      providers: p.id ? d.providers.map((x) => (x.id === p.id ? provider : x)) : [...d.providers, provider],
    }));
    setSheet({ open: false, provider: null });
    void loadModels(provider);
  };

  const removeProvider = (p: ProviderConfig) => {
    const used = tasksUsingProvider(draft, p.id);
    if (used.length) {
      toast(`${p.label} is used by ${used.map((t) => TASK_INFO[t].label).join(", ")}. Point those tasks at another provider first.`, "error");
      return;
    }
    setDraft((d) => ({ ...d, providers: d.providers.filter((x) => x.id !== p.id) }));
  };

  const runHealth = async () => {
    setHealth({ open: true, report: null, loading: true });
    try {
      const report = await api<HealthReport>("/api/system/health");
      setHealth({ open: true, report, loading: false });
    } catch (e) {
      toast((e as Error).message, "error");
      setHealth({ open: false, report: null, loading: false });
    }
  };

  return (
    <div id="models" className="scroll-mt-24 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h2 className="t-title-3">Models</h2>
          <p className="t-footnote mt-0.5 max-w-2xl text-label-2">
            Every job in the app runs on a model you choose. Local models through Ollama keep everything on this machine; you can mix in an OpenAI-compatible server or Anthropic.
          </p>
        </div>
        <Button variant="glass" size="sm" icon={<Stethoscope className="size-4" />} onClick={runHealth} disabled={dirty} title={dirty ? "Save your changes first" : undefined}>
          Check everything
        </Button>
      </div>

      {/* Presets */}
      <Group level={3} title="Local presets" footer="Presets point every task at Ollama. Pull the models once in a terminal; Ollama keeps them on disk.">
        <div className="grid divide-y divide-separator sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {PRESETS.map((p) => {
            const active = preset === p.id;
            return (
              <div key={p.id} className="flex min-w-0 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 t-headline">
                      {p.label}
                      {active && (
                        <Chip tone="green">
                          <CircleCheck className="size-3" />
                          In use
                        </Chip>
                      )}
                    </div>
                    <div className="t-caption font-medium text-label-2">{p.memory}</div>
                  </div>
                  <Button size="sm" variant={active ? "plain" : "tinted"} disabled={active || saving} onClick={() => applyPresetNow(p.id)}>
                    {active ? "Applied" : "Apply"}
                  </Button>
                </div>
                <p className="t-footnote text-label-2">{p.description}</p>
                <CommandLine command={pullAllCommand(presetModels(p.id))} />
              </div>
            );
          })}
        </div>
      </Group>

      {/* Providers */}
      <Group
        level={3}
        title="Providers"
        action={
          <Button variant="plain" size="sm" icon={<Plus className="size-4" />} onClick={() => setSheet({ open: true, provider: null })}>
            Add
          </Button>
        }
        footer={
          <>
            New to local models? Install Ollama from <span className="font-medium text-label">ollama.com</span>, then press refresh here.
          </>
        }
      >
        {draft.providers.length === 0 && <div className="list-row t-subhead text-label-2">No providers yet. Add Ollama to run everything locally.</div>}
        {draft.providers.map((p) => {
          const Icon = KIND_ICON[p.kind];
          const l = lists[p.id];
          return (
            <div key={p.id} className="list-row flex-wrap">
              <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-fill-3 text-label-2">
                <Icon className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="t-subhead font-semibold">{p.label}</div>
                <div className="truncate font-mono text-[12px] text-label-2">{p.baseUrl}</div>
              </div>
              <div className="flex items-center gap-1">
                {!l || l.loading ? (
                  <Chip>
                    <Spinner className="size-3!" />
                    Checking
                  </Chip>
                ) : l.ok ? (
                  <Chip tone="green">
                    {l.models.length} {l.models.length === 1 ? "model" : "models"}
                  </Chip>
                ) : (
                  <Chip tone="red" title={[l.error, l.hint].filter(Boolean).join(" ")}>
                    <TriangleAlert className="size-3" />
                    Unreachable
                  </Chip>
                )}
                <IconButton label={`Refresh ${p.label}`} onClick={() => loadModels(p)}>
                  <RefreshCw className="size-4" />
                </IconButton>
                <IconButton label={`Edit ${p.label}`} onClick={() => setSheet({ open: true, provider: p })}>
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton label={`Remove ${p.label}`} onClick={() => removeProvider(p)} className="hover:text-sys-red!">
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
              {l && !l.loading && !l.ok && (
                <p className="w-full pl-12 t-caption text-label-2">
                  {l.error} {l.hint && <span className="text-label">{l.hint}</span>}
                </p>
              )}
            </div>
          );
        })}
      </Group>

      {/* Routing */}
      <Group level={3} title="Who does what" footer="Test sends a tiny prompt to the model and shows the reply and how long it took. Unsaved changes are saved first.">
        {TASK_ORDER.map((task) => {
          const info = TASK_INFO[task];
          const route = draft.routes[task];
          const provider = route ? draft.providers.find((p) => p.id === route.providerId) : undefined;
          const list = route ? lists[route.providerId] : undefined;
          const listed = !!list && list.ok && list.models.length > 0;
          const missing = !!route && !!provider && listed && route.model.trim() !== "" && !modelAvailable(provider.kind, route.model, list!.models);
          const canTurnOff = info.importance !== "required";
          const test = tests[task];
          const dataListId = route ? `models-${route.providerId}` : undefined;
          // The env-provided Whisper server ("stt") isn't in the provider list; keep it selectable.
          const orphan = route && !provider ? route.providerId : null;
          return (
            <div key={task} className="list-row">
              <div className="w-full space-y-2.5 py-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 t-subhead font-semibold">
                      {info.label}
                      {info.importance !== "required" && <Chip>{info.importance === "optional" ? "Optional" : "Recommended"}</Chip>}
                    </div>
                    <div className="t-caption text-label-2">{info.description}</div>
                  </div>
                  <Button size="sm" variant="glass" onClick={() => runTest(task)} loading={test === "running"} disabled={!route || !route.model.trim() || saving}>
                    Test
                  </Button>
                </div>
                <div className={cx("grid gap-2", info.usesTemperature ? "sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)_88px]" : "sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)]")}>
                  <Select value={route?.providerId ?? ""} onChange={(e) => changeProvider(task, e.target.value)} aria-label={`${info.label} provider`}>
                    {(canTurnOff || !route) && <option value="">{canTurnOff ? "Off" : "Choose…"}</option>}
                    {draft.providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                    {orphan && <option value={orphan}>{orphan === "stt" ? "Whisper (from .env)" : `${orphan} (missing)`}</option>}
                  </Select>
                  <Input
                    value={route?.model ?? ""}
                    onChange={(e) => route && setRoute(task, { ...route, model: e.target.value })}
                    disabled={!route}
                    list={dataListId}
                    placeholder={route ? "Model name" : "Off"}
                    aria-label={`${info.label} model`}
                    spellCheck={false}
                    className="font-mono text-[13.5px]!"
                  />
                  {info.usesTemperature && (
                    <Select
                      value={route?.temperature === undefined ? "" : String(route.temperature)}
                      disabled={!route}
                      onChange={(e) => {
                        if (!route) return;
                        const base = { providerId: route.providerId, model: route.model };
                        setRoute(task, e.target.value === "" ? base : { ...base, temperature: Number(e.target.value) });
                      }}
                      aria-label={`${info.label} temperature`}
                      title="Temperature: lower is steadier, higher is more varied"
                      className="tabular-nums"
                    >
                      <option value="">Auto</option>
                      {[...new Set([...TEMPERATURES, ...(route?.temperature !== undefined ? [route.temperature] : [])])]
                        .sort((a, b) => a - b)
                        .map((t) => (
                          <option key={t} value={String(t)}>
                            {t.toFixed(1)}
                          </option>
                        ))}
                    </Select>
                  )}
                </div>
                {!route && TASK_FALLBACK[task] && <p className="t-caption text-label-2">{TASK_FALLBACK[task]}</p>}
                {route && !route.model.trim() && <p className="t-caption text-sys-orange">Pick a model for this task.</p>}
                {missing && (
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-1.5 t-caption font-medium text-sys-orange">
                      <TriangleAlert className="size-3.5" />
                      {provider!.label} doesn't have this model.
                      {provider!.kind === "ollama" ? " Pull it once:" : " Check the name."}
                    </p>
                    {provider!.kind === "ollama" && <CommandLine command={pullCommand(route!.model)} className="max-w-md" />}
                  </div>
                )}
                {test && test !== "running" && (
                  <div className={cx("rounded-control px-3 py-2 t-caption", test.ok ? "bg-[color-mix(in_srgb,var(--sys-green)_10%,transparent)]" : "bg-[color-mix(in_srgb,var(--sys-red)_9%,transparent)]")}>
                    {test.ok ? (
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-semibold text-sys-green">Works{typeof test.ms === "number" && test.ms > 0 ? ` · ${(test.ms / 1000).toFixed(1)} s` : ""}</span>
                        {test.sample && <span className="text-label-2">“{test.sample}”</span>}
                      </span>
                    ) : (
                      <span className="block">
                        <span className="font-semibold text-sys-red">{test.error}</span>
                        {test.hint && <span className="block text-label-2">{test.hint}</span>}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </Group>

      {Object.entries(lists).map(([id, l]) => (
        <datalist key={id} id={`models-${id}`}>
          {l.models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      ))}

      <Group level={3} title="Context window" footer="How much text a local model reads at once (Ollama num_ctx). Bigger lets the writer see more of your past posts and stories but needs more memory. 8K suits 7-14B models on 16 GB.">
        <div className="list-row">
          <span className="flex-1 t-subhead font-medium">Tokens</span>
          <Select value={String(draft.numCtx)} onChange={(e) => setDraft((d) => ({ ...d, numCtx: Number(e.target.value) }))} className="w-40!" aria-label="Context window">
            {[...new Set([...CTX_OPTIONS, draft.numCtx])]
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  {n >= 1024 ? `${n / 1024}K` : n}
                </option>
              ))}
          </Select>
        </div>
      </Group>

      {/* Save bar */}
      {dirty && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 lg:bottom-6 lg:pl-[284px]">
          <div className="glass-strong pointer-events-auto flex items-center gap-3 rounded-full py-2 pl-5 pr-2 animate-pop">
            <span className="t-subhead font-medium">Unsaved model changes</span>
            <Button variant="plain" size="sm" onClick={() => setDraft(saved)} disabled={saving}>
              Discard
            </Button>
            <Button variant="primary" size="sm" onClick={() => persist(draft, "Model settings saved")} loading={saving}>
              Save
            </Button>
          </div>
        </div>
      )}

      <ProviderSheet open={sheet.open} initial={sheet.provider} onClose={() => setSheet({ open: false, provider: null })} onSave={saveProvider} />

      <Sheet open={health.open} onClose={() => setHealth((h) => ({ ...h, open: false }))} title="Model check" size="md">
        {health.loading || !health.report ? (
          <div className="flex items-center gap-3 py-8 t-subhead text-label-2">
            <Spinner />
            Asking each provider which models it has…
          </div>
        ) : (
          <HealthList report={health.report} />
        )}
      </Sheet>
    </div>
  );
}
