"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { SubnetTier } from "@/lib/vpc/types";

export const mono = "font-(family-name:--font-mono)";

export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20";

export type Tone = "success" | "accent" | "warn" | "danger" | "muted";

const TONE_CLASS: Record<Tone, string> = {
  success: "border-(--success)/20 bg-(--success-muted) text-(--success)",
  accent: "border-(--accent)/20 bg-(--accent-muted) text-(--accent)",
  warn: "border-(--warn)/20 bg-(--warn-muted) text-(--warn)",
  danger: "border-(--danger)/20 bg-(--danger-muted) text-(--danger)",
  muted: "border-(--border) bg-(--bg-muted) text-(--text-muted)",
};

export function Chip({
  tone = "muted",
  children,
  title,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-lg border px-1.5 py-0.5 text-[10px] font-medium leading-4",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const TIER_TONE: Record<SubnetTier, Tone> = { public: "success", private: "accent", isolated: "muted" };

export function TierChip({ tier }: { tier: SubnetTier }) {
  return (
    <Chip tone={TIER_TONE[tier]} className="capitalize">
      {tier}
    </Chip>
  );
}

export function tierTone(tier: SubnetTier): Tone {
  return TIER_TONE[tier];
}

const GOOD = ["available", "running", "active", "attached", "in-use", "associated", "enabled", "healthy", "deployed"];
const BAD = ["failed", "blackhole", "rejected", "expired", "deleted", "deleting", "failing", "unhealthy", "inactive", "incompatible-network"];

export function StateChip({ state }: { state: string }) {
  const s = state.toLowerCase();
  const tone: Tone = GOOD.includes(s) ? "success" : BAD.includes(s) ? "danger" : "warn";
  return <Chip tone={tone}>{state || "unknown"}</Chip>;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(q.matches);
    sync();
    q.addEventListener("change", sync);
    return () => q.removeEventListener("change", sync);
  }, []);
  return reduced;
}

/** Eases a number from 0 to `target`; jumps straight there under reduced motion. */
export function CountUp({ value, ms = 700 }: { value: number; ms?: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, ms, reduced]);
  return <>{reduced ? value : shown}</>;
}

export function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = useCallback((text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1400);
      })
      .catch(() => {});
  }, []);
  return [copied, copy];
}

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 8.5l3.2 3.2L13 4.5" />
  </svg>
);
const CopyIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10.5 5.5V4A1.5 1.5 0 009 2.5H4A1.5 1.5 0 002.5 4v5A1.5 1.5 0 004 10.5h1.5" />
  </svg>
);

/** Click-to-copy identifier. */
export function CopyId({ value, label, className }: { value: string; label?: string; className?: string }) {
  const [copied, copy] = useCopy();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        copy(value);
      }}
      title={copied ? "Copied" : `Copy ${value}`}
      className={cn(
        "group inline-flex max-w-full items-center gap-1 rounded-lg px-1 py-0.5 text-left text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)",
        focusRing,
        mono,
        className,
      )}
    >
      <span className="truncate">{label ?? value}</span>
      <span className={copied ? "text-(--success)" : "text-(--text-faint) group-hover:text-(--accent)"}>
        {copied ? <CheckIcon /> : <CopyIcon />}
      </span>
    </button>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, copy] = useCopy();
  return (
    <button
      type="button"
      onClick={() => copy(text)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-(--border) bg-(--bg-surface) px-2.5 py-1 text-xs font-medium text-(--text-secondary) transition-colors hover:border-(--accent)/50 hover:text-(--accent)",
        focusRing,
      )}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function ConsoleLink({ href, label = "Console" }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Open in the AWS console"
      className={cn(
        "inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-medium text-(--text-muted) transition-colors hover:bg-(--bg-hover) hover:text-(--accent)",
        focusRing,
      )}
    >
      {label}
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6.5 3.5h-3v9h9v-3M9.5 2.5h4v4M13.5 2.5l-6 6" />
      </svg>
    </a>
  );
}

/** Address utilisation: calm until it matters. */
export function UtilBar({ used, total, className }: { used: number; total: number; className?: string }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const color = pct >= 90 ? "bg-(--danger)" : pct >= 75 ? "bg-(--warn)" : "bg-(--accent)";
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={used}
      aria-label="Addresses in use"
      className={cn("h-1.5 w-full overflow-hidden rounded-lg bg-(--bg-muted)", className)}
    >
      <div className={cn("h-full rounded-lg transition-[width] duration-700", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-(--border-hairline) bg-(--bg-elevated) p-4 shadow-sm", className)}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-(--text-primary)">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-(--border) px-6 py-10 text-center">
      <p className="text-sm font-medium text-(--text-secondary)">{title}</p>
      {hint && <p className="mt-1 text-xs text-(--text-muted)">{hint}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-(--bg-muted)", className)} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      className={cn(
        "rounded border border-(--border) bg-(--bg-muted) px-1 py-px text-[10px] font-medium text-(--text-muted)",
        mono,
      )}
    >
      {children}
    </kbd>
  );
}

export function GhostButton({
  children,
  onClick,
  title,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-(--border) bg-(--bg-surface) px-3 py-1.5 text-xs font-medium text-(--text-secondary) transition-colors hover:border-(--accent)/50 hover:text-(--accent) disabled:opacity-50",
        focusRing,
      )}
    >
      {children}
    </button>
  );
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

export function relativeTime(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}

/** Ref for a view's search box; the `/` shortcut (fired from the detail page) focuses it. */
export function useSearchFocus() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focus = () => ref.current?.focus();
    window.addEventListener("vpc:focus-search", focus);
    return () => window.removeEventListener("vpc:focus-search", focus);
  }, []);
  return ref;
}

export const inputClass = cn(
  "rounded-lg border border-(--border) bg-(--bg-field) px-3 py-1.5 text-sm text-(--text-primary) placeholder:text-(--text-faint)",
  focusRing,
);

export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
        focusRing,
        active
          ? "border-(--accent)/40 bg-(--accent-muted) text-(--accent)"
          : "border-(--border) bg-(--bg-surface) text-(--text-secondary) hover:border-(--accent)/40 hover:text-(--accent)",
      )}
    >
      {children}
    </button>
  );
}
