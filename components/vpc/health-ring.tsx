"use client";

import { useEffect, useState } from "react";
import { gradeOf } from "@/lib/vpc/review";
import { CountUp, mono } from "./ui";

const STROKE = { success: "var(--success)", accent: "var(--accent)", warn: "var(--warn)", danger: "var(--danger)" };

/** Design-health score as a ring that draws itself in. */
export function HealthRing({ score, size = 64 }: { score: number; size?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(score));
    return () => cancelAnimationFrame(frame);
  }, [score]);

  const r = size / 2 - 5;
  const circumference = 2 * Math.PI * r;
  const { label, tone } = gradeOf(score);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title={`${label} — ${score}/100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-muted)" strokeWidth="5" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={STROKE[tone]}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown / 100)}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center text-sm font-medium tabular-nums text-(--text-primary) ${mono}`}
      >
        <CountUp value={score} />
      </span>
    </div>
  );
}
