"use client";

import { useEffect, useState } from "react";
import { CircleCheck, Eye, EyeOff, TriangleAlert } from "lucide-react";
import type { ProviderConfig, ProviderKind } from "@/lib/types";
import { Button, Chip, Field, Input, Segmented, Sheet, api } from "@/components/ui";
import { DEFAULT_BASE_URL, PROVIDER_KIND_HINT, PROVIDER_KIND_LABEL, validateProvider } from "./presets";

export type ModelListResult = { ok: boolean; models: string[]; error?: string; hint?: string };

export async function fetchProviderModels(provider: ProviderConfig): Promise<ModelListResult> {
  try {
    return await api<ModelListResult>("/api/settings/ai/models", { method: "POST", json: { provider } });
  } catch (e) {
    return { ok: false, models: [], error: (e as Error).message };
  }
}

const DEFAULT_LABEL: Record<ProviderKind, string> = { ollama: "Ollama", openai: "LM Studio", anthropic: "Anthropic" };

/** Add or edit a model provider. `initial` null = add. Returns the provider through onSave (id assigned by the caller for new ones). */
export function ProviderSheet({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: ProviderConfig | null;
  onClose: () => void;
  onSave: (p: Omit<ProviderConfig, "id"> & { id?: string }) => void;
}) {
  const [kind, setKind] = useState<ProviderKind>("ollama");
  const [label, setLabel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ModelListResult | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(initial?.kind ?? "ollama");
    setLabel(initial?.label ?? DEFAULT_LABEL.ollama);
    setBaseUrl(initial?.baseUrl ?? DEFAULT_BASE_URL.ollama);
    setApiKey(initial?.apiKey ?? "");
    setShowKey(false);
    setResult(null);
    setTouched(false);
  }, [open, initial]);

  const switchKind = (k: ProviderKind) => {
    // Swap defaults only if the user hasn't customised them.
    if (!label.trim() || label === DEFAULT_LABEL[kind]) setLabel(DEFAULT_LABEL[k]);
    if (!baseUrl.trim() || baseUrl === DEFAULT_BASE_URL[kind]) setBaseUrl(DEFAULT_BASE_URL[k]);
    setKind(k);
    setResult(null);
  };

  const draft = { kind, label: label.trim(), baseUrl: baseUrl.trim(), apiKey: kind === "ollama" ? "" : apiKey.trim() };
  const error = validateProvider(draft);

  const test = async () => {
    setTouched(true);
    if (error) return;
    setTesting(true);
    setResult(await fetchProviderModels({ id: initial?.id ?? "test", ...draft }));
    setTesting(false);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="md"
      title={initial ? `Edit ${initial.label}` : "Add a model provider"}
      footer={
        <>
          <Button variant="glass" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setTouched(true);
              if (!error) onSave({ ...(initial ? { id: initial.id } : {}), ...draft });
            }}
          >
            {initial ? "Done" : "Add provider"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <Segmented<ProviderKind>
            value={kind}
            onChange={switchKind}
            options={(["ollama", "openai", "anthropic"] as const).map((k) => ({ value: k, label: PROVIDER_KIND_LABEL[k] }))}
            className="w-full [&>button]:flex-1"
          />
          <p className="px-1 t-footnote text-label-2">{PROVIDER_KIND_HINT[kind]}</p>
        </div>

        <Field label="Name">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="How it shows up in the task list" maxLength={60} />
        </Field>
        <Field label="Address" hint={kind === "openai" ? "LM Studio: http://localhost:1234/v1 · llama.cpp: http://localhost:9931/v1 · OpenAI: https://api.openai.com/v1" : undefined}>
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={DEFAULT_BASE_URL[kind]} inputMode="url" spellCheck={false} />
        </Field>
        {kind !== "ollama" && (
          <Field label="API key" hint={kind === "openai" ? "Leave empty for local servers that don't need one." : "Stored in your local database only."}>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder={kind === "anthropic" ? "sk-ant-…" : "Optional"}
                className="pr-11!"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="icon-btn absolute right-1 top-1/2 size-8! -translate-y-1/2 text-label-2! focus-ring"
                aria-label={showKey ? "Hide key" : "Show key"}
              >
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </Field>
        )}

        {touched && error && <p className="px-1 t-footnote text-sys-red">{error}</p>}

        <div className="space-y-3 rounded-inner bg-fill-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="t-subhead font-medium">Check the connection</div>
            <Button size="sm" variant="tinted" onClick={test} loading={testing}>
              Test connection
            </Button>
          </div>
          {result &&
            (result.ok ? (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 t-footnote font-medium text-sys-green">
                  <CircleCheck className="size-4" />
                  Connected. {result.models.length} {result.models.length === 1 ? "model" : "models"} available.
                </p>
                {result.models.length > 0 && (
                  <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                    {result.models.slice(0, 40).map((m) => (
                      <Chip key={m}>{m}</Chip>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <p className="flex items-start gap-1.5 t-footnote font-medium text-sys-red">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  <span className="break-words">{result.error}</span>
                </p>
                {result.hint && <p className="pl-5.5 t-footnote text-label-2">{result.hint}</p>}
              </div>
            ))}
        </div>
      </div>
    </Sheet>
  );
}
