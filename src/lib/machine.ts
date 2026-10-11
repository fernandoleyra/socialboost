import "server-only";
import os from "node:os";
import type { MachineInfo } from "@/components/settings/presets";

/** Hardware of the machine running SocialBoost (= where local models run in the default setup). */
export function machineInfo(): MachineInfo {
  return { memGB: Math.round(os.totalmem() / 1024 ** 3), platform: process.platform, arch: process.arch };
}
