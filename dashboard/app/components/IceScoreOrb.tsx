"use client";

/**
 * Ice-glass score orb.
 *
 * A frosted, refractive glass sphere with a gradient progress ring, a
 * contained outer halo, a top-left specular highlight, and a soft bottom-right
 * inner shadow that gives it physical depth.
 *
 * Key trick: the SVG viewBox is padded by ~18% beyond the sphere so the outer
 * halo (a Gaussian-blurred ring) never escapes the SVG bounds. That means the
 * parent card can keep its `overflow: hidden` and the halo still renders
 * cleanly — fixing the ugly clipping we had with the old `drop-shadow` ring.
 *
 * Reused on the Overview hero, Weekly cells, and the Weekly average card so
 * the visual language is consistent.
 */

import { useId } from "react";

export interface IceScoreOrbProps {
  /** 0–100, or null for "no data" state */
  score: number | null;
  /** Outer pixel size of the orb (visual diameter, padding excluded). */
  size?: number;
  /** Show the percentage label centered inside. Set false to render your own. */
  showLabel?: boolean;
  /** Force a particular color theme; otherwise derived from score. */
  tone?: "auto" | "success" | "warning" | "danger" | "muted";
  className?: string;
}

function toneFor(score: number | null, tone: IceScoreOrbProps["tone"]) {
  if (tone && tone !== "auto") return tone;
  if (score === null || score <= 0) return "muted";
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

/** Gradient stops per tone — pairs of accent-friendly colors for a believable
 *  ring sweep instead of one flat color. */
function ringStops(tone: ReturnType<typeof toneFor>): [string, string] {
  switch (tone) {
    case "success": return ["var(--success)", "var(--accent)"];
    case "warning": return ["var(--warning)", "var(--accent)"];
    case "danger":  return ["var(--danger)", "var(--warning)"];
    default:        return ["var(--muted-light)", "var(--muted-light)"];
  }
}

export default function IceScoreOrb({
  score,
  size = 110,
  showLabel = true,
  tone = "auto",
  className,
}: IceScoreOrbProps) {
  const uid = useId().replace(/:/g, "");
  const safe = Math.max(0, Math.min(100, score ?? 0));
  // Padding around the sphere so the halo + filter blur has room. Without
  // this the outer glow would either clip or need overflow:visible on every
  // parent — which previously broke the layout (halo poking out of cards).
  const pad = Math.round(size * 0.18);
  const box = size + pad * 2;
  const stroke = Math.max(5, Math.round(size * 0.06));
  const radius = (size - stroke) / 2;
  const cx = box / 2;
  const cy = box / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safe / 100) * circumference;

  const t = toneFor(score, tone);
  const [stopA, stopB] = ringStops(t);
  const ringId  = `orb-${uid}-ring`;
  const glassId = `orb-${uid}-glass`;
  const shadeId = `orb-${uid}-shade`;
  const shineId = `orb-${uid}-shine`;
  const glowId  = `orb-${uid}-glow`;

  const fontSize = Math.max(13, Math.round(size * 0.22));

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className ?? ""}`}
      style={{ width: box, height: box }}
    >
      <svg
        width={box}
        height={box}
        viewBox={`0 0 ${box} ${box}`}
        // Don't let the browser invent its own aspect — be explicit
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id={ringId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={stopA} />
            <stop offset="100%" stopColor={stopB} />
          </linearGradient>

          {/* Glass body — broad top-left highlight that fades to nothing. */}
          <radialGradient id={glassId} cx="32%" cy="26%" r="80%">
            <stop offset="0%"  stopColor="rgba(255,255,255,0.55)" />
            <stop offset="38%" stopColor="rgba(255,255,255,0.10)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>

          {/* Bottom-right inner shadow gives the sphere weight. */}
          <radialGradient id={shadeId} cx="72%" cy="80%" r="70%">
            <stop offset="0%"   stopColor="rgba(0,0,0,0.22)" />
            <stop offset="60%"  stopColor="rgba(0,0,0,0.04)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>

          {/* Pin-prick specular reflection. */}
          <radialGradient id={shineId} cx="30%" cy="22%" r="22%">
            <stop offset="0%"   stopColor="rgba(255,255,255,0.95)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>

          {/* Outer soft glow — applied only to the halo ring, contained by
              the padded viewBox so it never clips its parent card. */}
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={Math.max(2, size * 0.035)} />
          </filter>
        </defs>

        {/* (1) Outer halo — same path as the progress arc but blurred. */}
        {safe > 0 && (
          <circle
            cx={cx}
            cy={cy}
            r={radius + stroke * 0.4}
            fill="none"
            stroke={stopA}
            strokeWidth={stroke * 0.65}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            opacity={0.45}
            filter={`url(#${glowId})`}
          />
        )}

        {/* (2) Glass disc — frosted body of the sphere. */}
        <circle
          cx={cx}
          cy={cy}
          r={radius - stroke / 2}
          fill="rgba(255,255,255,0.045)"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={1}
        />
        <circle cx={cx} cy={cy} r={radius - stroke / 2} fill={`url(#${shadeId})`} />
        <circle cx={cx} cy={cy} r={radius - stroke / 2} fill={`url(#${glassId})`} />

        {/* (3) Track ring — the empty groove. */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />

        {/* (4) Progress ring — gradient + rounded caps. */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={`url(#${ringId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          className="score-ring-animated"
          style={{
            "--ring-circumference": circumference,
            "--ring-offset": offset,
          } as React.CSSProperties}
        />

        {/* (5) Specular pin-highlight on the glass — sells the 3D illusion. */}
        <ellipse
          cx={cx - radius * 0.32}
          cy={cy - radius * 0.46}
          rx={radius * 0.34}
          ry={radius * 0.18}
          fill={`url(#${shineId})`}
          opacity={0.9}
        />
      </svg>

      {showLabel && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span
            className="font-bold tracking-tight text-foreground"
            style={{ fontSize }}
          >
            {score !== null ? `${score}%` : "—"}
          </span>
        </div>
      )}
    </div>
  );
}
