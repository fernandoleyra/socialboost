import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui";

export const metadata: Metadata = {
  title: "SocialBoost — LinkedIn ghostwriting studio",
  description: "Interview-driven LinkedIn ghostwriting: real stories, your voice, your photos. Runs on local models.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1f7" },
    { media: "(prefers-color-scheme: dark)", color: "#07080c" },
  ],
};

// Resolve the theme before first paint to avoid a flash.
const themeScript = `(function(){try{var t=localStorage.getItem('sb-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="wallpaper" aria-hidden />
        {/* Liquid Glass lensing filter (used by .glass-lens on Chromium). */}
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
          <filter id="lg-lens" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="7" result="noise" />
            <feGaussianBlur in="noise" stdDeviation="2" result="soft" />
            <feDisplacementMap in="SourceGraphic" in2="soft" scale="18" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
