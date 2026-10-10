import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker builds set NEXT_OUTPUT=standalone for a small runtime image; local `npm start` uses the normal output.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  serverExternalPackages: ["better-sqlite3", "sharp"],
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
    // proxy.ts (optional password gate) buffers request bodies; keep photo uploads intact.
    proxyClientMaxBodySize: "30mb",
  },
};

export default nextConfig;
