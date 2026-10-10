"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button, Input, Select, Sheet, api, toast } from "@/components/ui";
import { Group, Row } from "./grouped";
import { LANGUAGES, normalizeLinkedInUrl, timezoneOptions } from "./options";

export type ProfileForm = { id: string; name: string; headline: string; linkedinUrl: string; language: string; timezone: string };

export function ProfileSection({ profile, otherProfiles }: { profile: ProfileForm; otherProfiles: number }) {
  const router = useRouter();
  const [saved, setSaved] = useState(profile);
  const [form, setForm] = useState(profile);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const zones = useMemo(() => timezoneOptions(form.timezone), [form.timezone]);

  const dirty = (Object.keys(form) as (keyof ProfileForm)[]).some((k) => form[k] !== saved[k]);
  const linkedIn = normalizeLinkedInUrl(form.linkedinUrl);
  const nameMissing = !form.name.trim();
  const set = (k: keyof ProfileForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (nameMissing || linkedIn === null) return;
    setBusy(true);
    try {
      const body = { name: form.name.trim(), headline: form.headline.trim(), linkedinUrl: linkedIn, language: form.language, timezone: form.timezone };
      const { profile: p } = await api<{ profile: ProfileForm }>(`/api/profiles/${profile.id}`, { method: "PATCH", json: body });
      const next = { id: p.id, name: p.name, headline: p.headline, linkedinUrl: p.linkedinUrl, language: p.language, timezone: p.timezone };
      setSaved(next);
      setForm(next);
      toast("Profile saved");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api(`/api/profiles/${profile.id}`, { method: "DELETE" });
      toast(`${saved.name} was deleted`);
      // Full navigation: the shell falls back to another profile, or to Welcome if none is left.
      window.location.assign("/");
    } catch (e) {
      toast((e as Error).message, "error");
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Group
        id="profile"
        title="Profile"
        footer="Your name and headline appear on post previews. The timezone decides when posting days start and when reminders fire."
      >
        <Row label="Name" htmlFor="pf-name">
          <Input id="pf-name" value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={120} aria-invalid={nameMissing} />
        </Row>
        <Row label="Headline" hint="As on LinkedIn" htmlFor="pf-headline">
          <Input id="pf-headline" value={form.headline} onChange={(e) => set("headline", e.target.value)} maxLength={220} placeholder="Founder at Acme · AI for finance teams" />
        </Row>
        <Row label="LinkedIn profile" htmlFor="pf-linkedin">
          <Input
            id="pf-linkedin"
            value={form.linkedinUrl}
            onChange={(e) => set("linkedinUrl", e.target.value)}
            placeholder="https://www.linkedin.com/in/you"
            inputMode="url"
            aria-invalid={linkedIn === null}
          />
          {linkedIn === null && <p className="mt-1 px-1 t-caption text-sys-red">Use your profile link, the one with /in/ in it.</p>}
        </Row>
        <Row label="Post language" htmlFor="pf-language">
          <Select id="pf-language" value={form.language} onChange={(e) => set("language", e.target.value)}>
            {!LANGUAGES.some((l) => l.code === form.language) && <option value={form.language}>{form.language}</option>}
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </Select>
        </Row>
        <Row label="Timezone" htmlFor="pf-timezone">
          <Select id="pf-timezone" value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </Row>
        <div className="list-row justify-end">
          {dirty && (
            <Button variant="plain" size="sm" onClick={() => setForm(saved)} disabled={busy}>
              Discard
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={save} loading={busy} disabled={!dirty || nameMissing || linkedIn === null}>
            Save profile
          </Button>
        </div>
      </Group>

      <Group footer={otherProfiles > 0 ? "You'll switch to another person afterwards." : "This is the only profile, so you'll go back to the Welcome screen."}>
        <button type="button" onClick={() => setConfirmDelete(true)} className="list-row w-full text-left t-subhead font-medium text-sys-red transition-colors hover:bg-fill-4 focus-ring">
          <Trash2 className="size-4" />
          Delete {saved.name}…
        </button>
      </Group>

      <Sheet
        open={confirmDelete}
        onClose={() => !deleting && setConfirmDelete(false)}
        size="sm"
        title={`Delete ${saved.name}?`}
        footer={
          <>
            <Button variant="glass" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} loading={deleting}>
              Delete forever
            </Button>
          </>
        }
      >
        <div className="space-y-3 t-subhead text-label-2">
          <p>This removes the strategy, every interview, the Memory Bank, voice samples, drafts and the calendar for {saved.name}. It can't be undone.</p>
          <p>
            Photo files stay in the data folder.{" "}
            <a href="/api/export" className="font-medium text-accent hover:underline">
              Download an export first
            </a>{" "}
            if you might want any of it back.
          </p>
        </div>
      </Sheet>
    </div>
  );
}
