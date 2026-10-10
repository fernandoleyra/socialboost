"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Segmented } from "@/components/ui";
import { Group } from "./grouped";

type Theme = "light" | "system" | "dark";

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

/** Same storage key and behaviour as the sidebar toggle in the shell (`sb-theme`). */
export function AppearanceSection() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      setTheme((localStorage.getItem("sb-theme") as Theme) || "system");
    } catch {
      /* storage blocked */
    }
  }, []);

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
    <Group id="appearance" title="Appearance" footer="System follows your device's light or dark setting.">
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
    </Group>
  );
}
