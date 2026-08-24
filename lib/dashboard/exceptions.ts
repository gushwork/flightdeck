import type { SecretEntry } from "@/lib/types";
import type { GHWorkflowRun } from "@/lib/github/types";
import type { EnrichedFlyApp } from "@/lib/fly/types";

export const STALE_DAYS = 180;
export const EXCEPTION_LIST_CAP = 15;
export const UNROTATED_EXPAND_MAX = 5;
export const STALE_EXPAND_MAX = 8;
export const FAILED_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ExceptionSeverity = "danger" | "warn" | "info";
export type ExceptionSource = "github" | "secrets" | "fly";

export interface ExceptionRow {
  id: string;
  severity: ExceptionSeverity;
  source: ExceptionSource;
  label: string;
  ageLabel: string | null;
  href: string;
  actionLabel: string;
  sortTimeMs: number;
}

export interface OverflowLine {
  source: ExceptionSource;
  count: number;
  href: string;
}

const SEVERITY_ORDER: Record<ExceptionSeverity, number> = {
  danger: 0,
  warn: 1,
  info: 2,
};

const SOURCE_HREF: Record<ExceptionSource, string> = {
  github: "/github",
  secrets: "/secrets",
  fly: "/fly/overview",
};

export function ageLabelFromMs(thenMs: number, nowMs: number): string {
  const seconds = Math.floor((nowMs - thenMs) / 1000);
  if (seconds < 60) return "just now";
  const intervals: [number, string][] = [
    [31536000, "y"],
    [2592000, "mo"],
    [86400, "d"],
    [3600, "h"],
    [60, "m"],
  ];
  for (const [unit, label] of intervals) {
    const count = Math.floor(seconds / unit);
    if (count >= 1) return `${count}${label} ago`;
  }
  return "just now";
}

export function daysSinceAt(isoString: string, nowMs: number): number {
  return Math.floor((nowMs - new Date(isoString).getTime()) / (1000 * 60 * 60 * 24));
}

function isFailedConclusion(conclusion: GHWorkflowRun["conclusion"]): boolean {
  return (
    conclusion === "failure" ||
    conclusion === "timed_out" ||
    conclusion === "startup_failure"
  );
}

function isLiveStatus(status: GHWorkflowRun["status"]): boolean {
  return (
    status === "in_progress" ||
    status === "queued" ||
    status === "waiting" ||
    status === "requested" ||
    status === "pending"
  );
}

export function isSecretStale(secret: SecretEntry, nowMs: number): boolean {
  if (!secret.lastAccessedDate) return false;
  return daysSinceAt(secret.lastAccessedDate, nowMs) > STALE_DAYS;
}

export function secretsHygieneStats(secrets: SecretEntry[], nowMs: number) {
  let unrotated = 0;
  let stale = 0;
  let hygiene = 0;
  for (const s of secrets) {
    const u = !s.rotationEnabled;
    const t = isSecretStale(s, nowMs);
    if (u) unrotated += 1;
    if (t) stale += 1;
    if (u || t) hygiene += 1;
  }
  return { unrotated, stale, hygiene };
}

export function githubKpis(runs: GHWorkflowRun[], nowMs: number) {
  let failed24h = 0;
  let live = 0;
  for (const r of runs) {
    if (isLiveStatus(r.status)) live += 1;
    if (
      isFailedConclusion(r.conclusion) &&
      nowMs - new Date(r.updatedAt).getTime() <= FAILED_WINDOW_MS
    ) {
      failed24h += 1;
    }
  }
  return { failed24h, live };
}

export function flyUnhealthyCount(apps: EnrichedFlyApp[]): number {
  return apps.filter((a) => {
    const h = a.status_detail?.health;
    return h === "degraded" || h === "down";
  }).length;
}

export function buildGithubExceptions(
  runs: GHWorkflowRun[],
  nowMs: number,
): ExceptionRow[] {
  const rows: ExceptionRow[] = [];
  for (const r of runs) {
    const updated = new Date(r.updatedAt).getTime();
    const name = r.workflowName || r.name || "workflow";
    if (isLiveStatus(r.status)) {
      rows.push({
        id: `github-live-${r.id}`,
        severity: "warn",
        source: "github",
        label: `${r.repoFullName} / ${name} live`,
        ageLabel: ageLabelFromMs(updated, nowMs),
        href: "/github",
        actionLabel: "Open",
        sortTimeMs: updated,
      });
      continue;
    }
    if (isFailedConclusion(r.conclusion) && nowMs - updated <= FAILED_WINDOW_MS) {
      rows.push({
        id: `github-fail-${r.id}`,
        severity: "danger",
        source: "github",
        label: `${r.repoFullName} / ${name} failed`,
        ageLabel: ageLabelFromMs(updated, nowMs),
        href: "/github",
        actionLabel: "Open",
        sortTimeMs: updated,
      });
    }
  }
  return rows;
}

export function buildSecretsExceptions(
  secrets: SecretEntry[],
  nowMs: number,
): { rows: ExceptionRow[]; omittedStale: number } {
  const unrotated = secrets.filter((s) => !s.rotationEnabled);
  const staleSorted = secrets
    .filter((s) => isSecretStale(s, nowMs))
    .sort(
      (a, b) =>
        daysSinceAt(b.lastAccessedDate!, nowMs) - daysSinceAt(a.lastAccessedDate!, nowMs),
    );

  const rows: ExceptionRow[] = [];

  if (unrotated.length > UNROTATED_EXPAND_MAX) {
    rows.push({
      id: "secrets-unrotated-aggregate",
      severity: "warn",
      source: "secrets",
      label: `${unrotated.length} secrets without auto-rotation`,
      ageLabel: null,
      href: "/secrets?filter=no-rotation",
      actionLabel: "Review",
      sortTimeMs: 0,
    });
  } else {
    for (const s of unrotated) {
      const t = s.lastChangedDate ?? s.createdDate;
      rows.push({
        id: `secrets-unrotated-${s.name}`,
        severity: "warn",
        source: "secrets",
        label: `${s.name} without auto-rotation`,
        ageLabel: t ? ageLabelFromMs(new Date(t).getTime(), nowMs) : null,
        href: `/secrets/${encodeURIComponent(s.name)}`,
        actionLabel: "View",
        sortTimeMs: t ? new Date(t).getTime() : 0,
      });
    }
  }

  const shownStale = staleSorted.slice(0, STALE_EXPAND_MAX);
  const omittedStale = Math.max(0, staleSorted.length - shownStale.length);
  for (const s of shownStale) {
    const d = daysSinceAt(s.lastAccessedDate!, nowMs);
    rows.push({
      id: `secrets-stale-${s.name}`,
      severity: "info",
      source: "secrets",
      label: `${s.name} not accessed in ${d} days`,
      ageLabel: `${d}d ago`,
      href: `/secrets/${encodeURIComponent(s.name)}`,
      actionLabel: "View",
      sortTimeMs: new Date(s.lastAccessedDate!).getTime(),
    });
  }

  return { rows, omittedStale };
}

export function buildFlyExceptions(apps: EnrichedFlyApp[]): ExceptionRow[] {
  const rows: ExceptionRow[] = [];
  for (const a of apps) {
    const h = a.status_detail?.health;
    if (h !== "degraded" && h !== "down") continue;
    rows.push({
      id: `fly-${a.name}`,
      severity: "danger",
      source: "fly",
      label: `${a.name} ${h}`,
      ageLabel: null,
      href: "/fly/overview",
      actionLabel: "Open",
      sortTimeMs: 0,
    });
  }
  return rows;
}

export function mergeExceptions(
  rows: ExceptionRow[],
  omittedStale = 0,
): {
  visible: ExceptionRow[];
  total: number;
  overflow: OverflowLine[];
  hasDanger: boolean;
} {
  const sorted = [...rows].sort((a, b) => {
    const sd = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sd !== 0) return sd;
    return b.sortTimeMs - a.sortTimeMs;
  });
  const visible = sorted.slice(0, EXCEPTION_LIST_CAP);
  const hidden = sorted.slice(EXCEPTION_LIST_CAP);
  const overflowCounts: Record<ExceptionSource, number> = {
    github: 0,
    secrets: omittedStale,
    fly: 0,
  };
  for (const r of hidden) overflowCounts[r.source] += 1;

  const overflow: OverflowLine[] = (["github", "secrets", "fly"] as ExceptionSource[])
    .filter((s) => overflowCounts[s] > 0)
    .map((s) => ({
      source: s,
      count: overflowCounts[s],
      href: s === "secrets" && omittedStale > 0 ? "/secrets?filter=stale" : SOURCE_HREF[s],
    }));

  return {
    visible,
    total: sorted.length + omittedStale,
    overflow,
    hasDanger: sorted.some((r) => r.severity === "danger"),
  };
}

export function filterRowsBySource(
  rows: ExceptionRow[],
  source: ExceptionSource | null,
): ExceptionRow[] {
  if (!source) return rows;
  return rows.filter((r) => r.source === source);
}
