"use client";

import { useEffect, useState } from "react";
import type { RunStatus, RunConclusion } from "@/lib/github/types";

// ─── Status helpers ───────────────────────────────────────────────────────────

export function isActiveStatus(status: RunStatus): boolean {
  return (
    status === "in_progress" ||
    status === "queued" ||
    status === "waiting" ||
    status === "requested" ||
    status === "pending"
  );
}

export function isFailedConclusion(conclusion: RunConclusion): boolean {
  return (
    conclusion === "failure" ||
    conclusion === "timed_out" ||
    conclusion === "startup_failure" ||
    conclusion === "action_required"
  );
}

// ─── Status icon ─────────────────────────────────────────────────────────────

export function StatusIcon({
  status,
  conclusion,
  size = 20,
}: {
  status: RunStatus;
  conclusion: RunConclusion;
  size?: number;
}) {
  if (status === "in_progress") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        fill="none"
        aria-label="In progress"
        className="animate-spin text-(--accent)"
      >
        <circle
          cx="10"
          cy="10"
          r="8"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="40 12"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (
    status === "queued" ||
    status === "waiting" ||
    status === "requested" ||
    status === "pending"
  ) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        fill="none"
        aria-label="Queued"
        style={{ color: "var(--warn)" }}
      >
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" />
        <path
          d="M10 6v4l2.5 2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (conclusion === "success") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        fill="none"
        aria-label="Success"
        style={{ color: "var(--success)" }}
      >
        <circle cx="10" cy="10" r="8" fill="currentColor" opacity="0.12" />
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" />
        <path
          d="M6.5 10l2.5 2.5 4.5-5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (isFailedConclusion(conclusion)) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        fill="none"
        aria-label="Failed"
        style={{ color: "var(--danger)" }}
      >
        <circle cx="10" cy="10" r="8" fill="currentColor" opacity="0.1" />
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" />
        <path
          d="M7 7l6 6M13 7l-6 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (conclusion === "cancelled") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        fill="none"
        aria-label="Cancelled"
        style={{ color: "var(--text-muted)" }}
      >
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" />
        <path
          d="M7 10h6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (conclusion === "skipped") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        fill="none"
        aria-label="Skipped"
        style={{ color: "var(--text-faint)" }}
      >
        <circle
          cx="10"
          cy="10"
          r="8"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="4 3"
        />
        <path
          d="M8 7l4 3-4 3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-label="Unknown"
      style={{ color: "var(--text-faint)" }}
    >
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

// ─── Event badge ──────────────────────────────────────────────────────────────

const eventLabels: Record<string, string> = {
  push: "push",
  pull_request: "PR",
  pull_request_target: "PR",
  schedule: "cron",
  workflow_dispatch: "manual",
  workflow_call: "called",
  release: "release",
  repository_dispatch: "dispatch",
  merge_group: "merge",
  check_suite: "check",
};

export function EventBadge({ event }: { event: string }) {
  const label = eventLabels[event] ?? event;
  return (
    <span className="inline-flex items-center rounded-full border border-(--border-subtle) bg-(--bg-muted) px-1.5 py-0.5 font-(family-name:--font-mono) text-[10px] text-(--text-muted)">
      {label}
    </span>
  );
}

// ─── Duration formatter ───────────────────────────────────────────────────────

export function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

// ─── Elapsed timer (live) ─────────────────────────────────────────────────────

export function ElapsedTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return <span className="font-(family-name:--font-mono) text-xs tabular-nums">{formatDuration(elapsed)}</span>;
}

// ─── Relative time ────────────────────────────────────────────────────────────

export function relativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 0) return "just now";
  const intervals: [number, string][] = [
    [86400, "d"],
    [3600, "h"],
    [60, "m"],
  ];
  for (const [unit, label] of intervals) {
    const n = Math.floor(seconds / unit);
    if (n >= 1) return `${n}${label} ago`;
  }
  return "just now";
}
