import Link from "next/link";
import { ChevronRight, Download, HardDrive, Send } from "lucide-react";
import { CommandLine } from "./copy-button";
import { Group } from "./grouped";

/** Publishing link + export/backup. Server-renderable (no client state). */
export function PublishingSection() {
  return (
    <Group id="publishing" title="Publishing" footer="Without a LinkedIn connection everything still works: scheduled posts become reminders with copy-and-open buttons.">
      <Link href="/settings/linkedin" className="list-row transition-colors hover:bg-fill-4 focus-ring">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] text-white" style={{ background: "linear-gradient(145deg, #0a66c2, #004182)" }}>
          <Send className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block t-subhead font-semibold">LinkedIn connection</span>
          <span className="block t-caption text-label-2">Publish approved posts on schedule, straight from SocialBoost.</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-label-3" />
      </Link>
    </Group>
  );
}

export function DataSection({ profileName, dataDir }: { profileName: string; dataDir: string }) {
  return (
    <Group
      id="data"
      title="Your data"
      footer="Exports leave out API keys. Photos aren't inside the file; they're in the uploads folder."
    >
      <a href="/api/export" download className="list-row transition-colors hover:bg-fill-4 focus-ring">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-fill-3 text-accent">
          <Download className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block t-subhead font-semibold">Export {profileName}</span>
          <span className="block t-caption text-label-2">Strategy, interviews, Memory Bank, voice samples and posts as JSON.</span>
        </span>
      </a>
      <a href="/api/export?scope=all" download className="list-row transition-colors hover:bg-fill-4 focus-ring">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-fill-3 text-accent">
          <Download className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block t-subhead font-semibold">Export everyone</span>
          <span className="block t-caption text-label-2">Every profile plus your model settings.</span>
        </span>
      </a>
      <div className="list-row">
        <div className="w-full space-y-2 py-1">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-fill-3 text-label-2">
              <HardDrive className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block t-subhead font-semibold">Back up</span>
              <span className="block t-caption text-label-2">
                Everything lives in one folder: the database (socialboost.db) and your photos (uploads/). Copy it somewhere safe; copy it back to restore. Stop the app first for a clean copy.
              </span>
            </span>
          </div>
          <CommandLine command={dataDir} className="sm:ml-12" />
        </div>
      </div>
    </Group>
  );
}
