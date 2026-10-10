"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ImageOff } from "lucide-react";
import { cx } from "@/components/ui";
import { photoUrl } from "./upload";

/**
 * A stored photo with a shimmer while it loads and a quiet fallback if the file is gone.
 * Pass width/height to reserve the right aspect ratio (no layout jump in masonry grids).
 */
export function PhotoImg({
  id,
  size = "thumb",
  alt = "",
  width,
  height,
  fit = "cover",
  className,
  style,
}: {
  id: string;
  size?: "thumb" | "full";
  alt?: string;
  width?: number | null;
  height?: number | null;
  fit?: "cover" | "contain";
  className?: string;
  style?: CSSProperties;
}) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const ref = useRef<HTMLImageElement>(null);
  const src = photoUrl(id, size);

  useEffect(() => {
    setState("loading");
    // Images served from cache can finish before React attaches onLoad.
    const img = ref.current;
    if (img?.complete) setState(img.naturalWidth > 0 ? "loaded" : "error");
  }, [src]);

  const ratio = width && height ? { aspectRatio: `${width} / ${height}` } : undefined;
  return (
    <span className={cx("relative block overflow-hidden bg-fill-4", className)} style={{ ...ratio, ...style }}>
      {state === "loading" && <span className="skeleton absolute inset-0 rounded-none!" aria-hidden />}
      {state === "error" ? (
        <span className="absolute inset-0 grid place-items-center text-label-3" role="img" aria-label="Photo unavailable">
          <ImageOff className="size-6" />
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={ref}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setState("loaded")}
          onError={() => setState("error")}
          className={cx(
            "absolute inset-0 h-full w-full transition-opacity duration-300",
            fit === "cover" ? "object-cover" : "object-contain",
            state === "loaded" ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </span>
  );
}
