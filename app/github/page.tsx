"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useGithubData } from "@/lib/context/github-data-provider";
import type { GHWorkflowRun } from "@/lib/github/types";
import {
  StatusIcon,
  ElapsedTimer,
  relativeTime,
  isActiveStatus,
  isFailedConclusion,
  formatDuration,
} from "@/components/github/run-utils";
import { useRunMutations } from "@/components/github/use-run-mutations";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Skeleton } from "@/components/layout/loading-skeleton";

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color,
  pulse,
  href,
}: {
  label: string;
  value: number | string;
  sub?: string;
  color?: "accent" | "success" | "warn" | "danger" | "muted";
  pulse?: boolean;
  href?: string;
}) {
  const colorMap = {
    accent: "var(--accent)",
    success: "var(--success)",
    warn: "var(--warn)",
    danger: "var(--danger)",
    muted: "var(--text-muted)",
  };
  const c = colorMap[color ?? "muted"];

  const inner = (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {pulse && (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70" style={{ backgroundColor: c }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: c }} />
          </span>
        )}
        <span
          className="font-(family-name:--font-mono) text-3xl font-light tabular-nums"
          style={{ color: c }}
        >
          {value}
        </span>
      </div>
      <div className="text-xs font-medium text-(--text-secondary)">{label}</div>
      {sub && <div className="text-[11px] text-(--text-faint)">{sub}</div>}
    </div>
  );

  const card = (
    <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-4 shadow-sm">
      {inner}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block transition-shadow hover:shadow-md">
        {card}
      </Link>
    );
  }
  return card;
}

// ─── Health bar ───────────────────────────────────────────────────────────────

function HealthBar({
  label,
  value,
  max = 100,
  color,
  unit,
}: {
  label: string;
  value: number;
  max?: number;
  color?: string;
  unit?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-(--text-secondary)">{label}</span>
        <span className="font-(family-name:--font-mono) tabular-nums text-(--text-muted)">
          {unit ? `${value}${unit}` : `${pct}%`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-(--bg-muted)">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color ?? "var(--accent)" }}
        />
      </div>
    </div>
  );
}

// ─── Active run row ───────────────────────────────────────────────────────────

function ActiveRunRow({
  run,
  focused,
  onCancel,
}: {
  run: GHWorkflowRun;
  focused: boolean;
  onCancel: (run: GHWorkflowRun) => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
        focused ? "bg-(--accent-muted)" : "hover:bg-(--bg-hover)"
      }`}
      tabIndex={0}
      role="listitem"
      aria-label={`${run.workflowName} in ${run.repoFullName}, running`}
    >
      <div className="shrink-0">
        <StatusIcon status={run.status} conclusion={run.conclusion} size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-(--text-primary)">
            {run.workflowName}
          </span>
          <span className="shrink-0 text-[11px] text-(--text-muted)">{run.repoFullName.split("/")[1]}</span>
        </div>
        {run.headBranch && (
          <div className="mt-0.5 font-(family-name:--font-mono) text-[11px] text-(--text-faint)">
            {run.headBranch}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <ElapsedTimer startedAt={run.createdAt} />
        {/* Indeterminate progress bar */}
        <div className="relative h-1 w-16 overflow-hidden rounded-full bg-(--bg-muted)">
          <div
            className="absolute inset-y-0 w-8 rounded-full"
            style={{ backgroundColor: "var(--accent)", animation: "slide 1.5s linear infinite" }}
          />
        </div>
        <button
          type="button"
          onClick={() => onCancel(run)}
          className="rounded-md border border-(--danger)/20 bg-(--danger)/5 px-2 py-0.5 text-[11px] font-medium text-(--danger) transition-colors hover:bg-(--danger)/15"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Failure row ──────────────────────────────────────────────────────────────

function FailureRow({
  run,
  focused,
  onRerun,
  onRerunFailed,
}: {
  run: GHWorkflowRun;
  focused: boolean;
  onRerun: (run: GHWorkflowRun) => void;
  onRerunFailed: (run: GHWorkflowRun) => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
        focused ? "bg-(--accent-muted)" : "hover:bg-(--bg-hover)"
      }`}
      tabIndex={0}
      role="listitem"
      aria-label={`${run.workflowName} in ${run.repoFullName}, failed`}
    >
      <div className="shrink-0">
        <StatusIcon status={run.status} conclusion={run.conclusion} size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-(--text-primary)">
            {run.workflowName}
          </span>
          <span className="shrink-0 text-[11px] text-(--text-muted)">{run.repoFullName.split("/")[1]}</span>
        </div>
        {run.headBranch && (
          <div className="mt-0.5 font-(family-name:--font-mono) text-[11px] text-(--text-faint)">
            {run.headBranch} · {relativeTime(run.updatedAt)}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => onRerunFailed(run)}
          className="rounded-md border border-(--border) bg-(--bg-surface) px-2 py-0.5 text-[11px] font-medium text-(--text-secondary) transition-colors hover:border-(--accent)/50 hover:text-(--accent)"
        >
          Re-run failed
        </button>
        <button
          type="button"
          onClick={() => onRerun(run)}
          className="rounded-md border border-transparent px-2 py-0.5 text-[11px] text-(--text-muted) transition-colors hover:bg-(--bg-hover) hover:text-(--text-secondary)"
        >
          All
        </button>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-4 shadow-sm">
            <Skeleton className="mb-3 h-8 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) p-5">
        <Skeleton className="mb-4 h-4 w-32" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GithubActionsPage() {
  const {
    runs,
    summary,
    loading,
    error,
    fetchedAt,
    refresh,
    notifyMutation,
    optimisticUpdate,
  } = useGithubData();

  const { rerun, rerunFailed, cancel, error: mutationError, clearError } = useRunMutations({
    onMutation: notifyMutation,
    optimisticUpdate,
  });

  // For cancel confirmation
  const [cancelTarget, setCancelTarget] = useState<GHWorkflowRun | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  // Keyboard nav state
  const [focusSection, setFocusSection] = useState<"active" | "failures" | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);

  const activeRuns = runs.filter((r) => isActiveStatus(r.status));
  const failedRuns = runs
    .filter((r) => r.status === "completed" && isFailedConclusion(r.conclusion))
    .slice(0, 5);

  const activeCount = activeRuns.length;
  const failedCount = failedRuns.length;

  const focusSectionEffective =
    focusSection === "active" && activeCount > 0
      ? "active"
      : focusSection === "failures" && failedCount > 0
        ? "failures"
        : null;

  const focusIndexEffective =
    focusSectionEffective === null
      ? 0
      : focusSectionEffective === "active"
        ? Math.min(Math.max(0, focusIndex), activeCount - 1)
        : Math.min(Math.max(0, focusIndex), failedCount - 1);

  // Compute quick stats
  const completedRuns = runs.filter((r) => r.status === "completed");
  const successCount = completedRuns.filter((r) => r.conclusion === "success").length;
  const successRate =
    completedRuns.length > 0
      ? Math.round((successCount / completedRuns.length) * 100)
      : 0;

  const repoFreq: Record<string, number> = {};
  const wfFreq: Record<string, number> = {};
  for (const r of runs) {
    repoFreq[r.repoFullName] = (repoFreq[r.repoFullName] ?? 0) + 1;
    wfFreq[r.workflowName] = (wfFreq[r.workflowName] ?? 0) + 1;
  }
  const topRepo =
    Object.entries(repoFreq).sort((a, b) => b[1] - a[1])[0]?.[0]?.split("/")[1] ?? "—";
  const topWf = Object.entries(wfFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  // Global keyboard shortcuts
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" ||
        el.isContentEditable
      ) {
        return;
      }

      if (e.key === "R" && e.shiftKey) {
        e.preventDefault();
        void refresh();
        return;
      }

      if (e.key === "1" && activeRuns.length > 0) {
        e.preventDefault();
        setFocusSection("active");
        setFocusIndex(0);
        return;
      }
      if (e.key === "2" && failedRuns.length > 0) {
        e.preventDefault();
        setFocusSection("failures");
        setFocusIndex(0);
        return;
      }

      let section: "active" | "failures" | null = focusSection;
      let list: GHWorkflowRun[];
      if (section === "active") {
        list = activeRuns;
      } else if (section === "failures") {
        list = failedRuns;
      } else {
        if (activeRuns.length > 0) {
          section = "active";
          list = activeRuns;
        } else if (failedRuns.length > 0) {
          section = "failures";
          list = failedRuns;
        } else {
          list = [];
        }
      }

      if (e.key === "j" || e.key === "k") {
        if (list.length === 0) return;
        e.preventDefault();
        if (focusSection === null && section !== null) {
          setFocusSection(section);
          setFocusIndex(
            e.key === "j" ? 0 : Math.max(0, list.length - 1),
          );
          return;
        }
        if (section === "active") {
          setFocusIndex((i) =>
            e.key === "j"
              ? Math.min(i + 1, activeRuns.length - 1)
              : Math.max(i - 1, 0),
          );
        } else {
          setFocusIndex((i) =>
            e.key === "j"
              ? Math.min(i + 1, failedRuns.length - 1)
              : Math.max(i - 1, 0),
          );
        }
        return;
      }

      if (e.key === "c" && focusSectionEffective === "active") {
        if (activeCount === 0) return;
        e.preventDefault();
        const run = activeRuns[focusIndexEffective];
        if (run) setCancelTarget(run);
      } else if (e.key === "r" && focusSectionEffective === "failures") {
        if (failedCount === 0) return;
        e.preventDefault();
        const run = failedRuns[focusIndexEffective];
        if (run) void rerunFailed(run);
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [
    activeRuns,
    failedRuns,
    focusSection,
    focusSectionEffective,
    focusIndexEffective,
    activeCount,
    failedCount,
    refresh,
    rerunFailed,
  ]);

  const handleConfirmCancel = useCallback(async () => {
    if (!cancelTarget) return;
    setCancelLoading(true);
    await cancel(cancelTarget);
    setCancelLoading(false);
    setCancelTarget(null);
  }, [cancelTarget, cancel]);

  const { last24Succeeded, last24Failed } = useMemo(() => {
    if (!fetchedAt || runs.length === 0) {
      return { last24Succeeded: 0, last24Failed: 0 };
    }
    const anchor = new Date(fetchedAt).getTime();
    if (Number.isNaN(anchor)) {
      return { last24Succeeded: 0, last24Failed: 0 };
    }
    const yesterday = new Date(anchor - 86_400_000).toISOString();
    const last24Runs = runs.filter((r) => r.createdAt >= yesterday);
    return {
      last24Succeeded: last24Runs.filter((r) => r.conclusion === "success")
        .length,
      last24Failed: last24Runs.filter((r) => isFailedConclusion(r.conclusion))
        .length,
    };
  }, [runs, fetchedAt]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-(family-name:--font-display) text-2xl font-medium text-(--text-primary)">
            GitHub Actions
          </h1>
          {fetchedAt && (
            <p className="mt-0.5 text-xs text-(--text-muted)">
              Updated {relativeTime(fetchedAt)}
              {loading && (
                <span className="ml-2 inline-flex items-center gap-1 text-[11px]">
                  <svg className="animate-spin" width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="2" strokeDasharray="20 6" strokeLinecap="round" />
                  </svg>
                  Refreshing
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/github/runs"
            className="rounded-lg border border-(--border) bg-(--bg-surface) px-3 py-1.5 text-xs font-medium text-(--text-secondary) transition-colors hover:border-(--accent)/50 hover:text-(--accent)"
          >
            All runs →
          </Link>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-lg border border-(--border) bg-(--bg-surface) p-1.5 text-(--text-muted) transition-colors hover:bg-(--bg-hover) hover:text-(--accent) disabled:opacity-50"
            title="Refresh (Shift+R)"
            aria-label="Refresh data"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={loading ? "animate-spin" : ""}
              aria-hidden
            >
              <path d="M13.5 8a5.5 5.5 0 11-1.5-3.8" />
              <path d="M12 1v4h-4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Error */}
      {(error || mutationError) && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-(--danger)/20 bg-(--danger)/5 px-4 py-3 text-sm text-(--danger)">
          <span>{error ?? mutationError}</span>
          <button
            type="button"
            onClick={() => { clearError(); void refresh(); }}
            className="shrink-0 underline"
          >
            Retry
          </button>
        </div>
      )}

      {loading && !fetchedAt ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* Stat ribbon */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="In progress"
              value={summary.inProgress}
              color={summary.inProgress > 0 ? "accent" : "muted"}
              pulse={summary.inProgress > 0}
            />
            <StatCard
              label="Queued"
              value={summary.queued}
              color={summary.queued > 0 ? "warn" : "muted"}
            />
            <StatCard
              label="Succeeded (24h)"
              value={last24Succeeded}
              color="success"
            />
            <StatCard
              label="Failed (24h)"
              value={last24Failed}
              color={last24Failed > 0 ? "danger" : "muted"}
              href={last24Failed > 0 ? "/github/runs?status=failure" : undefined}
            />
          </div>

          {/* Active runs */}
          <section aria-label="Active runs">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-(--text-primary)">
                Active runs
                {activeRuns.length > 0 && (
                  <span className="ml-2 rounded-full bg-(--accent-dim) px-2 py-0.5 font-(family-name:--font-mono) text-[10px] text-(--accent)">
                    {activeRuns.length}
                  </span>
                )}
              </h2>
              <span className="text-[11px] text-(--text-faint)">
                1 or j/k to focus · j/k to navigate · c to cancel
              </span>
            </div>
            <div
              className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) overflow-hidden"
              role="list"
              aria-label="Active and queued workflow runs"
            >
              {activeRuns.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden className="text-(--text-faint)">
                    <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="2" />
                    <path d="M11 16l3.5 3.5L21 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="text-sm font-medium text-(--text-secondary)">All clear</p>
                  <p className="text-xs text-(--text-muted)">No active runs at the moment.</p>
                </div>
              ) : (
                <div className="divide-y divide-(--border-hairline) p-1.5">
                  {activeRuns.map((run, i) => (
                    <ActiveRunRow
                      key={run.id}
                      run={run}
                      focused={focusSectionEffective === "active" && focusIndexEffective === i}
                      onCancel={setCancelTarget}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Recent failures */}
          {failedRuns.length > 0 && (
            <section aria-label="Recent failures">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-(--text-primary)">
                  Recent failures
                  <span className="ml-2 rounded-full bg-(--danger)/10 px-2 py-0.5 font-(family-name:--font-mono) text-[10px] text-(--danger)">
                    {failedRuns.length}
                  </span>
                </h2>
                <span className="text-[11px] text-(--text-faint)">
                  2 or j/k to focus · j/k to navigate · r to re-run
                </span>
              </div>
              <div
                className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) overflow-hidden"
                role="list"
              >
                <div className="divide-y divide-(--border-hairline) p-1.5">
                  {failedRuns.map((run, i) => (
                    <FailureRow
                      key={run.id}
                      run={run}
                      focused={focusSectionEffective === "failures" && focusIndexEffective === i}
                      onRerun={rerun}
                      onRerunFailed={rerunFailed}
                    />
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Quick stats */}
          <section aria-label="Health overview">
            <h2 className="mb-4 text-sm font-semibold text-(--text-primary)">Health overview</h2>
            <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) p-5 space-y-4">
              <HealthBar
                label="Success rate (last 50 runs)"
                value={successRate}
                max={100}
                color={
                  successRate >= 90
                    ? "var(--success)"
                    : successRate >= 70
                    ? "var(--warn)"
                    : "var(--danger)"
                }
              />
              {summary.avgDurationSec > 0 && (
                <HealthBar
                  label="Avg run duration"
                  value={summary.avgDurationSec}
                  max={summary.avgDurationSec * 2}
                  unit={summary.avgDurationSec < 60 ? "s" : undefined}
                  color="var(--accent)"
                />
              )}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <p className="text-[11px] text-(--text-muted)">Most active repo</p>
                  <p className="mt-0.5 truncate font-(family-name:--font-mono) text-xs text-(--text-primary)" title={topRepo}>{topRepo}</p>
                </div>
                <div>
                  <p className="text-[11px] text-(--text-muted)">Most active workflow</p>
                  <p className="mt-0.5 truncate font-(family-name:--font-mono) text-xs text-(--text-primary)" title={topWf}>{topWf}</p>
                </div>
                <div>
                  <p className="text-[11px] text-(--text-muted)">Total fetched</p>
                  <p className="mt-0.5 font-(family-name:--font-mono) text-xs text-(--text-primary)">{runs.length} runs</p>
                </div>
                <div>
                  <p className="text-[11px] text-(--text-muted)">Avg duration</p>
                  <p className="mt-0.5 font-(family-name:--font-mono) text-xs text-(--text-primary)">
                    {summary.avgDurationSec > 0 ? formatDuration(summary.avgDurationSec) : "—"}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Keyboard hints */}
          <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-3">
            <p className="text-[11px] text-(--text-faint)">
              <kbd className="rounded border border-(--border) px-1 py-0.5 font-(family-name:--font-mono) text-[10px]">Shift+R</kbd>{" "}
              Refresh ·{" "}
              <kbd className="rounded border border-(--border) px-1 py-0.5 font-(family-name:--font-mono) text-[10px]">1</kbd>/{" "}
              <kbd className="rounded border border-(--border) px-1 py-0.5 font-(family-name:--font-mono) text-[10px]">2</kbd>{" "}
              Focus section ·{" "}
              <kbd className="rounded border border-(--border) px-1 py-0.5 font-(family-name:--font-mono) text-[10px]">j</kbd>/{" "}
              <kbd className="rounded border border-(--border) px-1 py-0.5 font-(family-name:--font-mono) text-[10px]">k</kbd>{" "}
              Navigate ·{" "}
              <kbd className="rounded border border-(--border) px-1 py-0.5 font-(family-name:--font-mono) text-[10px]">c</kbd>{" "}
              Cancel ·{" "}
              <kbd className="rounded border border-(--border) px-1 py-0.5 font-(family-name:--font-mono) text-[10px]">r</kbd>{" "}
              Re-run
            </p>
          </div>
        </>
      )}

      {/* Cancel confirmation */}
      <ConfirmDialog
        open={!!cancelTarget}
        title="Cancel workflow run?"
        message={
          cancelTarget
            ? `Cancel ${cancelTarget.workflowName} on ${cancelTarget.repoFullName}?`
            : ""
        }
        confirmLabel="Cancel run"
        confirmVariant="danger"
        loading={cancelLoading}
        onConfirm={handleConfirmCancel}
        onCancel={() => setCancelTarget(null)}
      />

      {/* Progress bar animation keyframes */}
      <style>{`
        @keyframes slide {
          0% { left: -33%; }
          100% { left: 100%; }
        }
      `}</style>
    </div>
  );
}
