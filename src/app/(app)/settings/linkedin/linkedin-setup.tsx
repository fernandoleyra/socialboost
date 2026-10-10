"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Check, ChevronLeft, CircleAlert, CircleCheck, Copy, ExternalLink, KeyRound, Plug, ShieldCheck, Unplug } from "lucide-react";
import { Button, Card, Field, Input, PageHeader, Section, Textarea, api, toast } from "@/components/ui";
import type { LinkedInSettings } from "@/lib/calendar/types";
import { copyText, initials } from "@/components/calendar/helpers";
import { ConfirmSheet } from "@/components/photos/confirm-sheet";

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <div className="flex items-center gap-1 rounded-control bg-fill-4 py-1 pl-3 pr-1 font-mono text-[12.5px] leading-5">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap py-1">{value}</code>
      <button
        type="button"
        className="icon-btn size-8! shrink-0 focus-ring"
        aria-label={copied ? "Copied" : `Copy ${label}`}
        onClick={async () => {
          if (await copyText(value)) setCopied(true);
          else toast("Couldn't copy. Select the text and copy it by hand.", "error");
        }}
      >
        {copied ? <Check className="size-4 text-sys-green" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-fill-3 t-footnote font-semibold tabular-nums">{n}</span>
      <div className="min-w-0 flex-1 space-y-2 pt-0.5">
        <div className="t-subhead font-semibold">{title}</div>
        <div className="space-y-2 t-subhead text-label-2">{children}</div>
      </div>
    </li>
  );
}

/** In the profile's zone, so the server render and the browser agree. */
function formatDate(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: timezone }).format(new Date(iso));
}

export function LinkedInSetup({
  initial,
  profileName,
  timezone,
  connected,
  error,
}: {
  initial: LinkedInSettings;
  profileName: string;
  timezone: string;
  connected: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [form, setForm] = useState({ clientId: initial.config.clientId, clientSecret: "", redirectUri: initial.config.redirectUri, apiVersion: initial.config.apiVersion });
  const [saving, setSaving] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [token, setToken] = useState("");
  const [tokenSaving, setTokenSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(connected ? { kind: "ok", text: "LinkedIn is connected." } : error ? { kind: "error", text: error } : null);

  // Drop ?connected / ?error from the address bar so a refresh doesn't repeat the message.
  useEffect(() => {
    if (connected || error) router.replace("/settings/linkedin", { scroll: false });
  }, [connected, error, router]);

  const a = s.account;
  const dirty =
    form.clientId.trim() !== s.config.clientId || form.clientSecret.trim() !== "" || form.redirectUri.trim() !== s.config.redirectUri || form.apiVersion.trim() !== s.config.apiVersion;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const next = await api<LinkedInSettings>("/api/linkedin", { method: "PUT", json: { ...form, clientSecret: form.clientSecret.trim() } });
      setS(next);
      setForm((f) => ({ ...f, clientSecret: "", redirectUri: next.config.redirectUri, apiVersion: next.config.apiVersion }));
      toast("LinkedIn app saved.");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  /** Errors are shown by the confirmation sheet, which stays open so the person can retry. */
  const disconnect = async () => {
    setS(await api<LinkedInSettings>("/api/linkedin", { method: "DELETE" }));
    setNotice(null);
    toast("Disconnected.");
  };

  const connectToken = async (e: FormEvent) => {
    e.preventDefault();
    setTokenSaving(true);
    try {
      const res = await api<{ account: LinkedInSettings["account"] }>("/api/linkedin/token", { method: "POST", json: { token: token.trim() } });
      setS((cur) => ({ ...cur, account: res.account }));
      setToken("");
      setNotice({ kind: "ok", text: "LinkedIn is connected." });
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setTokenSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link href="/settings" className="btn btn-plain btn-sm -ml-3 mb-2">
          <ChevronLeft className="size-4" aria-hidden />
          Settings
        </Link>
        <PageHeader eyebrow="Publishing" title="LinkedIn" subtitle={`Publish ${profileName}'s approved posts at their scheduled time, straight from SocialBoost.`} />
      </div>

      {notice && (
        <div
          role={notice.kind === "error" ? "alert" : "status"}
          className="flex items-start gap-2.5 rounded-card px-4 py-3 t-subhead"
          style={{ background: `color-mix(in srgb, var(--sys-${notice.kind === "ok" ? "green" : "red"}) 12%, transparent)` }}
        >
          {notice.kind === "ok" ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-sys-green" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-sys-red" />}
          <span>{notice.text}</span>
        </div>
      )}

      {/* Connection */}
      <Card className="p-5">
        {a ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              {a.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.picture} alt="" className="size-12 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-fill-3 t-headline">{initials(a.name || profileName)}</span>
              )}
              <div className="min-w-0">
                <div className="t-headline truncate">Connected as {a.name || "your LinkedIn account"}</div>
                <div className={a.expired ? "t-footnote text-sys-red" : a.expiringSoon ? "t-footnote text-sys-orange" : "t-footnote text-label-2"}>
                  {a.expired
                    ? "The connection expired. Reconnect to keep publishing."
                    : `Valid until ${formatDate(a.expiresAt, timezone)} (${a.daysLeft} ${a.daysLeft === 1 ? "day" : "days"}). LinkedIn asks you to reconnect every 60 days.`}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <a href="/api/linkedin/connect" className={a.expired || a.expiringSoon ? "btn btn-primary" : "btn btn-glass"}>
                <Plug className="size-4" aria-hidden />
                Reconnect
              </a>
              <Button variant="destructive" onClick={() => setConfirmDisconnect(true)} icon={<Unplug className="size-4" />}>
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="t-headline">Not connected</div>
              <div className="t-footnote text-label-2">{s.config.ready ? "Your app is set up. Connect to sign in with LinkedIn." : "Set up your LinkedIn app below first. It takes about 10 minutes, once."}</div>
            </div>
            {s.config.ready ? (
              <a href="/api/linkedin/connect" className="btn btn-primary shrink-0">
                <Plug className="size-4" aria-hidden />
                Connect LinkedIn
              </a>
            ) : (
              <Button variant="primary" disabled icon={<Plug className="size-4" />}>
                Connect LinkedIn
              </Button>
            )}
          </div>
        )}
      </Card>

      <Card className="flex gap-3 p-5">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-sys-green" aria-hidden />
        <div className="space-y-1.5 t-subhead text-label-2">
          <p className="font-semibold text-label">You don&apos;t need this to use SocialBoost.</p>
          <p>
            Without a connection, a scheduled post becomes a reminder when its time comes: the calendar marks it Due, with the text ready to copy, the photo to download and a button that
            opens LinkedIn. You post it yourself and mark it as posted.
          </p>
          <p>With a connection, only posts you approved and scheduled go out, exactly as you approved them. SocialBoost never comments, likes or posts anything else.</p>
        </div>
      </Card>

      <Section title="Set up your LinkedIn app" subtitle="LinkedIn only lets apps post for you through an app you own. Both products below are self-serve: no review.">
        <Card className="p-5">
          <ol className="space-y-6">
            <Step n={1} title="Create an app">
              <p>
                Go to{" "}
                <a href="https://www.linkedin.com/developers/apps/new" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                  linkedin.com/developers/apps/new <ExternalLink className="inline size-3.5 align-[-2px]" aria-hidden />
                </a>
                . Any name works (it can&apos;t contain &quot;LinkedIn&quot;). LinkedIn requires a Company Page: pick yours, or create a simple one first. Then open the app&apos;s Settings tab and
                verify it with the Page.
              </p>
            </Step>
            <Step n={2} title="Add two products">
              <p>
                In the Products tab, add <span className="font-semibold text-label">Sign In with LinkedIn using OpenID Connect</span> and{" "}
                <span className="font-semibold text-label">Share on LinkedIn</span>.
              </p>
            </Step>
            <Step n={3} title="Add the redirect URL">
              <p>In the Auth tab, under &quot;Authorized redirect URLs for your app&quot;, add this exactly:</p>
              <CopyField value={s.config.redirectUri} label="redirect URL" />
              {s.config.redirectUri !== s.defaultRedirectUri && (
                <p className="t-footnote">This page runs at {new URL(s.defaultRedirectUri).origin}. If you reach SocialBoost on a different address, change the redirect URL below to match.</p>
              )}
            </Step>
            <Step n={4} title="Copy the Client ID and Client Secret here">
              <form onSubmit={save} className="space-y-4 pt-1">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Client ID" hint={s.config.env.clientId ? "LINKEDIN_CLIENT_ID is set. A value saved here takes priority." : undefined}>
                    <Input value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))} autoComplete="off" spellCheck={false} placeholder="86abc123xyz" />
                  </Field>
                  <Field label="Client Secret" hint={s.config.hasSecret ? "Saved. Leave empty to keep it." : s.config.env.clientSecret ? "Set by LINKEDIN_CLIENT_SECRET" : "Shown once in the Auth tab."}>
                    <Input
                      type="password"
                      value={form.clientSecret}
                      onChange={(e) => setForm((f) => ({ ...f, clientSecret: e.target.value }))}
                      autoComplete="new-password"
                      placeholder={s.config.hasSecret ? "••••••••••••" : "WPL_AP1.…"}
                    />
                  </Field>
                </div>
                <Field label="Redirect URL" hint="Must match the URL in your LinkedIn app character for character.">
                  <div className="flex gap-2">
                    <Input value={form.redirectUri} onChange={(e) => setForm((f) => ({ ...f, redirectUri: e.target.value }))} spellCheck={false} inputMode="url" />
                    {form.redirectUri !== s.defaultRedirectUri && (
                      <Button type="button" variant="glass" onClick={() => setForm((f) => ({ ...f, redirectUri: s.defaultRedirectUri }))}>
                        Reset
                      </Button>
                    )}
                  </div>
                </Field>
                <Field label="API version" hint="LinkedIn retires each monthly version after about a year. If publishing says a version was retired, enter a newer one (YYYYMM).">
                  <Input value={form.apiVersion} onChange={(e) => setForm((f) => ({ ...f, apiVersion: e.target.value }))} inputMode="numeric" maxLength={6} className="w-32" />
                </Field>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" variant="primary" loading={saving} disabled={!dirty}>
                    Save
                  </Button>
                  {!dirty && s.config.ready && <span className="t-footnote text-label-2">Saved. Now connect above.</span>}
                </div>
              </form>
            </Step>
            <Step n={5} title="Connect">
              <p>Use Connect LinkedIn at the top of this page and approve the request. You&apos;ll come back here when it&apos;s done.</p>
            </Step>
          </ol>
        </Card>
      </Section>

      <details className="card group p-5">
        <summary className="flex cursor-pointer list-none items-center gap-2 t-subhead font-semibold">
          <KeyRound className="size-4 text-label-2" aria-hidden />
          Can&apos;t use the redirect? Paste an access token instead
        </summary>
        <form onSubmit={connectToken} className="mt-4 space-y-3">
          <p className="t-subhead text-label-2">
            In LinkedIn&apos;s{" "}
            <a href="https://www.linkedin.com/developers/tools/oauth/token-generator" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              token generator
            </a>
            , pick your app and the scopes <span className="font-mono text-[13px]">openid</span>, <span className="font-mono text-[13px]">profile</span> and{" "}
            <span className="font-mono text-[13px]">w_member_social</span>, then paste the token here. It lasts 60 days.
          </p>
          <Textarea rows={3} value={token} onChange={(e) => setToken(e.target.value)} placeholder="AQV…" className="font-mono text-[12.5px]" spellCheck={false} />
          <Button type="submit" variant="glass" loading={tokenSaving} disabled={token.trim().length < 20}>
            Connect with this token
          </Button>
        </form>
      </details>

      <p className="px-1 t-footnote text-label-2">
        The access token is stored in your local database (data/socialboost.db) and only sent to LinkedIn. LinkedIn doesn&apos;t give personal apps access to post analytics, so results
        are entered on the Insights page.
      </p>

      <ConfirmSheet
        open={confirmDisconnect}
        title={`Disconnect LinkedIn from ${profileName}?`}
        body="Scheduled posts turn into reminders with copy and open-LinkedIn until you connect again."
        confirmLabel="Disconnect"
        onConfirm={disconnect}
        onClose={() => setConfirmDisconnect(false)}
      />
    </div>
  );
}
