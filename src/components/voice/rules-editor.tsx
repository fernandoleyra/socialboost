"use client";

import { useState } from "react";
import { Ban, Plus, X } from "lucide-react";
import { Button, IconButton, Input, toast } from "@/components/ui";
import { errorMessage } from "./format";

const SUGGESTIONS = [
  'Never say "leverage"',
  'Never say "journey"',
  'Never say "game-changer"',
  "No emojis",
  "No hashtags",
  "Don't open with a question",
  "Don't end with a moral",
  'Write "AI", not "artificial intelligence"',
];

/**
 * "Things I'd never say": free-form rules that override the measured style. Quoted words are
 * also caught by the draft checker, so we nudge people to quote exact words.
 */
export function RulesEditor({ rules, onSave }: { rules: string[]; onSave: (rules: string[]) => Promise<void> }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const commit = async (next: string[]) => {
    setBusy(true);
    try {
      await onSave(next);
      return true;
    } catch (e) {
      toast(errorMessage(e), "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (rule: string) => {
    const r = rule.trim();
    if (!r) return;
    if (rules.some((x) => x.toLowerCase() === r.toLowerCase())) {
      toast("That rule is already on the list", "info");
      return;
    }
    if (await commit([...rules, r])) setDraft("");
  };

  const unused = SUGGESTIONS.filter((s) => !rules.some((r) => r.toLowerCase() === s.toLowerCase()));

  return (
    <section className="space-y-3">
      <div className="px-1">
        <h2 className="t-title-3">Things I&apos;d never say</h2>
        <p className="t-footnote mt-0.5 text-label-2">
          Words, phrases and habits that aren&apos;t you. These beat everything else. Put exact words in quotes and every draft gets checked for them.
        </p>
      </div>
      <div className="card space-y-4 p-5">
        {rules.length > 0 ? (
          <ul className="list-group bg-fill-4">
            {rules.map((r) => (
              <li key={r} className="list-row !min-h-11 !py-2">
                <Ban className="size-4 shrink-0 text-sys-red" aria-hidden />
                <span className="t-subhead min-w-0 flex-1 break-words">{r}</span>
                <IconButton label={`Remove rule: ${r}`} disabled={busy} onClick={() => void commit(rules.filter((x) => x !== r))} className="size-8 shrink-0 text-label-2">
                  <X className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-subhead text-label-2">No rules yet. Which words make you cringe when you read them in a draft?</p>
        )}

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add(draft);
          }}
        >
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder='e.g. Never say "synergy"' maxLength={300} aria-label="New rule" />
          <Button type="submit" variant="primary" icon={<Plus className="size-4" />} loading={busy} disabled={!draft.trim()}>
            Add
          </Button>
        </form>

        {unused.length > 0 && (
          <div className="space-y-2">
            <div className="t-caption text-label-3">Common ones</div>
            <div className="flex flex-wrap gap-1.5">
              {unused.map((s) => (
                <button key={s} type="button" disabled={busy} onClick={() => void add(s)} className="chip focus-ring cursor-pointer transition-colors hover:[--chip-bg:var(--fill-2)] hover:[--chip-fg:var(--label)] disabled:opacity-50">
                  <Plus className="size-3" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
