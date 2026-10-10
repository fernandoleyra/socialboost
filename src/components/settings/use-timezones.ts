"use client";

import { useEffect, useMemo, useState } from "react";
import { timezoneOptions } from "./options";

/**
 * Timezone choices for a <select>. The full list comes from `Intl.supportedValuesOf`, which
 * differs between Node's ICU and each browser, so it is only built after mount; the server
 * render and the first client render show just the current zone and therefore match.
 */
export function useTimezoneOptions(current: string): string[] {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return useMemo(() => (mounted ? timezoneOptions(current) : [current]), [mounted, current]);
}
