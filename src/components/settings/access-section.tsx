"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { Spinner, api, toast } from "@/components/ui";
import { Group } from "./grouped";

/** Shown only when the password gate (SOCIALBOOST_PASSWORD) is on: ends this browser's session. */
export function AccessSection() {
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
      // Full navigation so the password gate runs again.
      window.location.assign("/login");
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  };

  return (
    <Group id="access" title="Access" footer="SocialBoost is protected with a password on this server. Signing out ends the session in this browser only.">
      <button type="button" onClick={signOut} disabled={busy} className="list-row w-full text-left transition-colors hover:bg-fill-4 focus-ring disabled:opacity-60">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-fill-3 text-sys-red">{busy ? <Spinner className="size-[18px]" /> : <LogOut className="size-[18px]" />}</span>
        <span className="min-w-0 flex-1">
          <span className="block t-subhead font-semibold text-sys-red">Sign out</span>
          <span className="block t-caption text-label-2">You'll need the password to come back in.</span>
        </span>
      </button>
    </Group>
  );
}
