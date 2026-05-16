"use client";

import { useMemo, useState } from "react";
import { resolveAvatarUrl } from "@/lib/api";

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  nickname?: string | null;
  size?: number;
  className?: string;
  ring?: boolean;
}

/**
 * Avatar — shows uploaded image if present, otherwise falls back to a deterministic
 * gradient-disc with the user's initial. Used everywhere a user appears: sidebar,
 * profile page, admin table.
 */
export default function Avatar({
  src,
  name,
  nickname,
  size = 40,
  className = "",
  ring = false,
}: AvatarProps) {
  const [errored, setErrored] = useState(false);
  const display = nickname || name || "?";
  const initial = display.trim().charAt(0).toUpperCase() || "?";
  const resolved = useMemo(() => resolveAvatarUrl(src), [src]);

  // Deterministic gradient picker so the same user gets the same color.
  const gradient = useMemo(() => {
    const palette = [
      "from-sky-400 to-blue-600",
      "from-violet-400 to-fuchsia-600",
      "from-emerald-400 to-teal-600",
      "from-amber-400 to-orange-600",
      "from-rose-400 to-pink-600",
      "from-cyan-400 to-indigo-600",
    ];
    let hash = 0;
    for (let i = 0; i < display.length; i++) hash = (hash * 31 + display.charCodeAt(i)) | 0;
    return palette[Math.abs(hash) % palette.length];
  }, [display]);

  const dim = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.42)) };
  const ringClass = ring ? "ring-2 ring-white/70 dark:ring-white/20 shadow-md" : "";

  if (resolved && !errored) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolved}
        alt={display}
        style={dim}
        onError={() => setErrored(true)}
        className={`rounded-full object-cover flex-shrink-0 ${ringClass} ${className}`}
      />
    );
  }

  return (
    <div
      style={dim}
      className={`rounded-full bg-gradient-to-br ${gradient} text-white font-bold flex items-center justify-center flex-shrink-0 select-none ${ringClass} ${className}`}
      aria-label={display}
    >
      {initial}
    </div>
  );
}
