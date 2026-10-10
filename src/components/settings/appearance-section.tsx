"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Segmented, Switch } from "@/components/ui";
import { Group } from "./grouped";

type Theme = "light" | "system" | "dark";

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

/** Same storage key and behaviour as the sidebar toggle in the shell (`sb-theme`). */
function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked */
  }
}

export function AppearanceSection() {
  const [theme, setTheme] = useState<Theme>("system");
  // iOS 27-style Liquid Glass look: -30 (ultra-clear) … +30 (fully tinted).
  const [glass, setGlass] = useState(0);
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const [moreContrast, setMoreContrast] = useState(false);

  useEffect(() => {
    try {
      setTheme((localStorage.getItem("sb-theme") as Theme) || "system");
      setGlass(parseInt(localStorage.getItem("sb-glass") || "0", 10) || 0);
      setReduceTransparency(localStorage.getItem("sb-transparency") === "reduced");
      setMoreContrast(localStorage.getItem("sb-contrast") === "more");
    } catch {
      /* storage blocked */
    }
  }, []);

  const changeGlass = (v: number) => {
    setGlass(v);
    document.documentElement.style.setProperty("--glass-adjust", String(v));
    store("sb-glass", v ? String(v) : null);
  };
  const changeTransparency = (on: boolean) => {
    setReduceTransparency(on);
    if (on) document.documentElement.dataset.transparency = "reduced";
    else delete document.documentElement.dataset.transparency;
    store("sb-transparency", on ? "reduced" : null);
  };
  const changeContrast = (on: boolean) => {
    setMoreContrast(on);
    if (on) document.documentElement.dataset.contrast = "more";
    else delete document.documentElement.dataset.contrast;
    store("sb-contrast", on ? "more" : null);
  };

  // While on "system", follow the OS switching between light and dark.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const choose = (t: Theme) => {
    setTheme(t);
    try {
      localStorage.setItem("sb-theme", t);
    } catch {
      /* storage blocked */
    }
    apply(t);
    window.dispatchEvent(new Event("sb-theme-change"));
  };

  return (
    <Group id="appearance" title="Appearance" footer="System follows your device's light or dark setting. These preferences are saved in this browser.">
      <div className="list-row flex-wrap justify-between">
        <span className="t-subhead font-medium">Theme</span>
        <Segmented<Theme>
          value={theme}
          onChange={choose}
          options={[
            {
              value: "light",
              label: (
                <span className="flex items-center gap-1.5">
                  <Sun className="size-3.5" />
                  Light
                </span>
              ),
            },
            {
              value: "system",
              label: (
                <span className="flex items-center gap-1.5">
                  <Monitor className="size-3.5" />
                  System
                </span>
              ),
            },
            {
              value: "dark",
              label: (
                <span className="flex items-center gap-1.5">
                  <Moon className="size-3.5" />
                  Dark
                </span>
              ),
            },
          ]}
        />
      </div>
      <div className="list-row flex-wrap justify-between gap-y-2">
        <label htmlFor="glass-look" className="t-subhead font-medium">
          Glass
        </label>
        <div className="flex w-full items-center gap-3 sm:w-72">
          <span className="t-caption text-label-2">Clear</span>
          <input
            id="glass-look"
            type="range"
            min={-30}
            max={30}
            step={5}
            value={glass}
            disabled={reduceTransparency}
            onChange={(e) => changeGlass(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer accent-[var(--accent-fill)] disabled:opacity-40"
          />
          <span className="t-caption text-label-2">Tinted</span>
        </div>
      </div>
      <div className="list-row justify-between">
        <span>
          <span className="block t-subhead font-medium">Reduce transparency</span>
          <span className="block t-caption text-label-2">Solid surfaces instead of glass. Easier to read, lighter on older machines.</span>
        </span>
        <Switch checked={reduceTransparency} onChange={changeTransparency} label="Reduce transparency" />
      </div>
      <div className="list-row justify-between">
        <span>
          <span className="block t-subhead font-medium">Increase contrast</span>
          <span className="block t-caption text-label-2">Darker secondary text and stronger outlines.</span>
        </span>
        <Switch checked={moreContrast} onChange={changeContrast} label="Increase contrast" />
      </div>
    </Group>
  );
}
