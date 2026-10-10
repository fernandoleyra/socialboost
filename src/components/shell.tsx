"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  House,
  MessagesSquare,
  Library,
  Images,
  Sparkles,
  CalendarDays,
  AudioWaveform,
  ChartNoAxesColumn,
  Compass,
  Settings,
  ChevronsUpDown,
  Plus,
  Check,
  Sun,
  Moon,
  Monitor,
  Mic,
} from "lucide-react";
import { cx, api, toast } from "./ui";

export type ShellProfile = { id: string; name: string; headline: string };

export const NAV = [
  { href: "/", label: "Today", icon: House },
  { href: "/interviews", label: "Interviews", icon: MessagesSquare },
  { href: "/memories", label: "Memory Bank", icon: Library },
  { href: "/photos", label: "Photos", icon: Images },
  { href: "/studio", label: "Studio", icon: Sparkles },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/voice", label: "Voice", icon: AudioWaveform },
  { href: "/insights", label: "Insights", icon: ChartNoAxesColumn },
  { href: "/strategy", label: "Strategy", icon: Compass },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const MOBILE_NAV = ["/", "/interviews", "/studio", "/calendar", "/memories"];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: "linear-gradient(145deg, var(--sys-cyan), var(--sys-blue) 55%, var(--sys-indigo))",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.45), 0 2px 6px -2px rgba(0,0,0,.25)",
      }}
    >
      {initials(name) || "?"}
    </span>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  useEffect(() => {
    try {
      setTheme((localStorage.getItem("sb-theme") as typeof theme) || "system");
    } catch {
      /* ignore */
    }
  }, []);
  const apply = (t: typeof theme) => {
    setTheme(t);
    try {
      localStorage.setItem("sb-theme", t);
    } catch {
      /* ignore */
    }
    const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  };
  const opts = [
    { v: "light" as const, icon: Sun, label: "Light" },
    { v: "system" as const, icon: Monitor, label: "System" },
    { v: "dark" as const, icon: Moon, label: "Dark" },
  ];
  return (
    <div className="segmented w-full justify-between">
      {opts.map(({ v, icon: Icon, label }) => (
        <button key={v} type="button" aria-pressed={theme === v} onClick={() => apply(v)} aria-label={label} title={label} className="flex-1 grid place-items-center !px-0">
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

function ProfileSwitcher({ profiles, activeId }: { profiles: ShellProfile[]; activeId: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const active = profiles.find((p) => p.id === activeId) ?? profiles[0];
  const switchTo = async (id: string) => {
    setOpen(false);
    if (id === activeId) return;
    try {
      await api("/api/profiles/active", { method: "POST", json: { id } });
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 rounded-[16px] p-2 text-left hover:bg-fill-4 transition-colors focus-ring" aria-expanded={open}>
        <Avatar name={active?.name ?? "?"} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate t-subhead font-semibold">{active?.name}</span>
          <span className="block truncate t-caption text-label-2">{active?.headline || "Ghostwriting profile"}</span>
        </span>
        <ChevronsUpDown className="size-4 text-label-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="glass-strong absolute left-0 right-0 top-full z-50 mt-2 rounded-[18px] p-1.5 animate-pop">
            {profiles.map((p) => (
              <button key={p.id} type="button" onClick={() => switchTo(p.id)} className="flex w-full items-center gap-2.5 rounded-[12px] px-2 py-1.5 text-left hover:bg-fill-3">
                <Avatar name={p.name} size={26} />
                <span className="flex-1 truncate t-subhead">{p.name}</span>
                {p.id === activeId && <Check className="size-4 text-accent" />}
              </button>
            ))}
            <div className="my-1 h-px bg-separator" />
            <Link href="/welcome?new=1" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-[12px] px-2 py-1.5 t-subhead text-accent hover:bg-fill-3">
              <span className="grid size-[26px] place-items-center rounded-full bg-fill-3">
                <Plus className="size-4" />
              </span>
              Add a person
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export function Shell({ profiles, activeId, children }: { profiles: ShellProfile[]; activeId: string; children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen lg:pl-[284px]">
      {/* Floating glass sidebar */}
      <aside className="glass glass-lens fixed inset-y-3 left-3 z-30 hidden w-[264px] flex-col rounded-window p-3 lg:flex">
        <div className="flex items-center gap-2 px-2 pt-1 pb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="size-7 rounded-[8px]" />
          <span className="t-headline">SocialBoost</span>
        </div>
        <ProfileSwitcher profiles={profiles} activeId={activeId} />
        <Link href="/interviews/new" className="btn btn-primary mt-3 w-full">
          <Mic className="size-4" />
          New interview
        </Link>
        <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="nav-item" aria-current={isActive(pathname, href) ? "page" : undefined}>
              <Icon className="size-[18px] text-label-2" strokeWidth={2} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="pt-3">
          <ThemeToggle />
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 pt-3 pb-2 lg:hidden">
        <div className="glass flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4">
          <Avatar name={profiles.find((p) => p.id === activeId)?.name ?? "?"} size={28} />
          <span className="t-subhead font-semibold">SocialBoost</span>
        </div>
        <Link href="/settings" className="glass grid size-10 place-items-center rounded-full" aria-label="Settings">
          <Settings className="size-4.5" />
        </Link>
      </div>

      <main className="mx-auto w-full max-w-[1240px] px-4 pb-32 pt-4 sm:px-6 lg:px-10 lg:pt-10 lg:pb-16">{children}</main>

      {/* Mobile floating tab bar */}
      <nav className="glass glass-lens fixed inset-x-4 bottom-4 z-30 flex items-center justify-around rounded-full px-2 py-1.5 lg:hidden">
        {NAV.filter((n) => MOBILE_NAV.includes(n.href)).map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link key={href} href={href} className={cx("flex flex-col items-center gap-0.5 rounded-full px-3 py-1.5 transition-colors", active ? "text-accent bg-fill-4" : "text-label-2")}>
              <Icon className="size-5" />
              <span className="text-[10px] font-semibold">{label.split(" ")[0]}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
