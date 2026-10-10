"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { Button, Input, api } from "@/components/ui";

export function LoginForm({ next }: { next: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/login", { method: "POST", json: { password } });
      window.location.assign(next);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="glass w-full max-w-sm rounded-window p-8 animate-pop">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="size-14 rounded-[14px] shadow-lg" />
        <h1 className="t-title-2">SocialBoost</h1>
        <p className="t-subhead text-label-2">This studio is private. Enter the password set by whoever runs it.</p>
      </div>
      <label className="block space-y-1.5">
        <span className="sr-only">Password</span>
        <Input type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
      </label>
      {error && <p className="mt-2 px-1 t-footnote text-sys-red" role="alert">{error}</p>}
      <Button type="submit" variant="primary" size="lg" className="mt-5 w-full" loading={busy} disabled={!password} icon={<Lock className="size-4" />}>
        Sign in
      </Button>
    </form>
  );
}
