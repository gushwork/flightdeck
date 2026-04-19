"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GHWorkflowDetail, GHWorkflowRun } from "@/lib/github/types";
import { githubActionsWorkflowPageUrl } from "@/lib/github/github-urls";
import { useGithubData } from "@/lib/context/github-data-provider";
import { useRunMutations } from "@/components/github/use-run-mutations";
import { WorkflowBadgeImage } from "@/components/github/workflow-badge-image";
import { WorkflowDispatchForm } from "@/components/github/workflow-dispatch-form";
import {
  StatusIcon,
  ElapsedTimer,
  EventBadge,
  formatDuration,
  relativeTime,
  isActiveStatus,
  isFailedConclusion,
} from "./run-utils";

interface WorkflowDrawerProps {
  repoFullName: string;
  workflowId: number;
  workflowName: string;
  onClose: () => void;
}

function computeRecentRunStats(runs: GHWorkflowRun[]) {
  const sorted = [...runs].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const lastRun = sorted[0] ?? null;
  const completed = runs.filter((r) => r.status === "completed");
  const success = completed.filter((r) => r.conclusion === "success").length;
  const failed = completed.filter((r) => isFailedConclusion(r.conclusion)).length;
  const cancelled = completed.filter((r) => r.conclusion === "cancelled").length;
  const withDur = completed.filter((r) => r.durationSec !== undefined);
  const avgDurationSec =
    withDur.length > 0
      ? Math.round(withDur.reduce((s, r) => s + (r.durationSec ?? 0), 0) / withDur.length)
      : 0;
  const successRate =
    completed.length > 0 ? Math.round((success / completed.length) * 100) : 0;
  return {
    lastRun,
    completedCount: completed.length,
    success,
    failed,
    cancelled,
    avgDurationSec,
    successRate,
  };
}

function conclusionLabel(conclusion: GHWorkflowRun["conclusion"]): string {
  if (conclusion === null || conclusion === undefined) return "—";
  if (conclusion === "success") return "success";
  if (isFailedConclusion(conclusion)) return "failed";
  return conclusion.replace(/_/g, " ");
}

export function WorkflowDrawer({
  repoFullName,
  workflowId,
  workflowName,
  onClose,
}: WorkflowDrawerProps) {
  const { notifyMutation, optimisticUpdate } = useGithubData();
  const { rerun, pendingRunId, pendingAction, error: mutationError, clearError } =
    useRunMutations({
      onMutation: notifyMutation,
      optimisticUpdate,
    });

  const [detail, setDetail] = useState<GHWorkflowDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [tab, setTab] = useState<"overview" | "yaml" | "runs">("overview");
  const drawerRef = useRef<HTMLDivElement>(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/github/actions/workflows/detail?repo=${encodeURIComponent(repoFullName)}&workflowId=${workflowId}`,
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDetail(data as GHWorkflowDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [repoFullName, workflowId]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  // Escape closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Focus trap on mount
  useEffect(() => {
    drawerRef.current?.focus();
  }, []);

  const actionsPageUrl = useMemo(
    () =>
      detail
        ? githubActionsWorkflowPageUrl(detail.repoFullName, detail.path)
        : githubActionsWorkflowPageUrl(repoFullName, ""),
    [detail, repoFullName],
  );

  async function handleAction(action: "enable" | "disable") {
    setActionPending(action);
    try {
      await fetch("/api/github/actions/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, repoFullName, workflowId }),
      });
      await fetchDetail();
    } finally {
      setActionPending(null);
    }
  }

  const stateLabel: Record<string, string> = {
    active: "Active",
    disabled_manually: "Disabled",
    disabled_inactivity: "Disabled (inactivity)",
    disabled_fork: "Disabled (fork)",
    deleted: "Deleted",
  };

  const isDisabled = detail?.state !== "active";

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal aria-label={workflowName}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={drawerRef}
        tabIndex={-1}
        className="relative flex h-[100dvh] max-h-[100dvh] min-h-0 w-full max-w-lg flex-col border-l border-(--border-hairline) bg-(--bg-elevated) shadow-xl outline-none animate-[slideInRight_0.15s_ease-out]"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-(--border-hairline) px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-(--text-primary)">
              {detail?.name ?? workflowName}
            </h2>
            <p className="mt-0.5 truncate font-(family-name:--font-mono) text-[11px] text-(--text-muted)">
              {repoFullName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-3 shrink-0 rounded-lg p-1.5 text-(--text-muted) transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 border-b border-(--border-hairline) px-5">
          {(["overview", "runs", "yaml"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
                tab === t
                  ? "border-(--accent) text-(--accent)"
                  : "border-transparent text-(--text-muted) hover:text-(--text-secondary)"
              }`}
            >
              {t === "overview" ? "Overview" : t === "runs" ? "Runs" : "YAML"}
            </button>
          ))}
        </div>

        {/* Scrollable tab body + fixed footers (workflow actions + run form stick to bottom) */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            {loading ? (
              <DrawerSkeleton />
            ) : error ? (
              <div className="space-y-3 py-8 text-center">
                <p className="text-sm text-(--danger)">{error}</p>
                <button type="button" onClick={fetchDetail} className="text-xs text-(--accent) underline">Retry</button>
              </div>
            ) : detail && tab === "overview" ? (
              <OverviewTab detail={detail} isDisabled={isDisabled} stateLabel={stateLabel} />
            ) : detail && tab === "runs" ? (
              <RunsTab
                runs={detail.recentRuns}
                onRerun={rerun}
                pendingRunId={pendingRunId}
                pendingAction={pendingAction}
                mutationError={mutationError}
                onClearMutationError={clearError}
              />
            ) : detail && tab === "yaml" ? (
              <YamlTab detail={detail} />
            ) : null}
          </div>

          {detail && !loading && (
            <>
              {/* Workflow actions — stays above the run panel, does not scroll with tabs */}
              <div className="shrink-0 border-t border-(--border-hairline) bg-(--bg-elevated) px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  {isDisabled ? (
                    <button
                      type="button"
                      onClick={() => handleAction("enable")}
                      disabled={!!actionPending}
                      className="rounded-lg bg-(--accent) px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {actionPending === "enable" ? "Enabling…" : "Enable workflow"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleAction("disable")}
                      disabled={!!actionPending}
                      className="rounded-lg border border-(--danger)/20 bg-(--danger)/5 px-3 py-1.5 text-xs font-medium text-(--danger) transition-colors hover:bg-(--danger)/10 disabled:opacity-50"
                    >
                      {actionPending === "disable" ? "Disabling…" : "Disable workflow"}
                    </button>
                  )}

                  <a
                    href={actionsPageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-(--border) bg-(--bg-surface) px-3 py-1.5 text-xs text-(--text-secondary) transition-colors hover:border-(--accent)/50 hover:text-(--accent)"
                  >
                    Open in Actions
                  </a>
                  <a
                    href={detail.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-(--border) bg-(--bg-surface) px-3 py-1.5 text-xs text-(--text-secondary) transition-colors hover:border-(--accent)/50 hover:text-(--accent)"
                  >
                    View workflow file
                  </a>
                </div>
              </div>

              {/* Run workflow — pinned to drawer bottom, collapsible */}
              {!isDisabled && (
                <div className="shrink-0 border-t border-(--border-hairline) bg-(--bg-elevated) shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
                  <div className="max-h-[min(55vh,28rem)] overflow-y-auto px-5 py-3">
                    <div className="rounded-lg border border-(--border-hairline) bg-(--bg-surface) p-3">
                      <button
                        type="button"
                        onClick={() => setDispatchOpen((o) => !o)}
                        className="flex w-full items-center justify-between gap-2 text-left text-xs font-medium text-(--text-primary)"
                        aria-expanded={dispatchOpen}
                      >
                        <span>Run workflow</span>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          className={`shrink-0 text-(--text-muted) transition-transform duration-200 ${dispatchOpen ? "rotate-180" : ""}`}
                          aria-hidden
                        >
                          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      {dispatchOpen && (
                        <div className="mt-3 border-t border-(--border-hairline) pt-3">
                          <WorkflowDispatchForm
                            key={`${repoFullName}-${workflowId}`}
                            repoFullName={repoFullName}
                            workflowId={workflowId}
                            enabled={dispatchOpen && !isDisabled}
                            variant="drawer"
                            onSuccess={async () => {
                              await fetchDetail();
                              notifyMutation();
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

// ─── Tab components ───────────────────────────────────────────────────────────

function OverviewTab({
  detail,
  isDisabled,
  stateLabel,
}: {
  detail: GHWorkflowDetail;
  isDisabled: boolean;
  stateLabel: Record<string, string>;
}) {
  const stats = useMemo(() => computeRecentRunStats(detail.recentRuns), [detail.recentRuns]);
  const { lastRun, completedCount, success, failed, avgDurationSec, successRate } = stats;

  return (
    <div className="space-y-4">
      {/* Last run + quick links */}
      {lastRun && (
        <div className="rounded-lg border border-(--border-hairline) bg-(--bg-surface) p-3">
          <p className="text-[11px] font-medium text-(--text-muted)">Latest run</p>
          <div className="mt-2 flex items-start gap-3">
            <StatusIcon status={lastRun.status} conclusion={lastRun.conclusion} size={22} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={lastRun.htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-(family-name:--font-mono) text-[13px] font-semibold text-(--accent) hover:underline"
                >
                  #{lastRun.runNumber}
                </a>
                <EventBadge event={lastRun.event} />
                <span className="text-[11px] text-(--text-muted)">
                  {conclusionLabel(lastRun.conclusion)}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-(--text-faint)">
                {relativeTime(lastRun.updatedAt)}
                {lastRun.headBranch && (
                  <span className="ml-2 font-(family-name:--font-mono) text-(--text-muted)">
                    {lastRun.headBranch}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={githubActionsWorkflowPageUrl(detail.repoFullName, detail.path)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-(--accent) underline"
            >
              Actions · this workflow
            </a>
            <span className="text-(--text-faint)">·</span>
            <a
              href={detail.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-(--accent) underline"
            >
              Workflow file on GitHub
            </a>
          </div>
        </div>
      )}

      {/* Stats from recent window */}
      {detail.recentRuns.length > 0 && (
        <div className="rounded-lg border border-(--border-hairline) bg-(--bg-surface) px-3 py-2.5">
          <p className="text-[11px] font-medium text-(--text-muted)">Recent runs (this list)</p>
          <p className="mt-1 text-xs text-(--text-secondary)">
            <span className="font-medium text-(--success)">{success}</span>
            <span className="text-(--text-faint)">/{completedCount} passed</span>
            {failed > 0 && (
              <span className="ml-2 text-(--danger)">
                · {failed} failed
              </span>
            )}
            <span className="ml-2 text-(--text-muted)">· {successRate}% success</span>
            {avgDurationSec > 0 && (
              <span className="ml-2 text-(--text-muted)">
                · avg {formatDuration(avgDurationSec)}
              </span>
            )}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="State">
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
            isDisabled ? "text-(--warn)" : "text-(--success)"
          }`}>
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${
              isDisabled ? "bg-(--warn)" : "bg-(--success)"
            }`} />
            {stateLabel[detail.state] ?? detail.state}
          </span>
        </Field>
        <Field label="ID">
          <span className="font-(family-name:--font-mono) text-xs text-(--text-primary)">{detail.id}</span>
        </Field>
        <Field label="Path">
          <span className="font-(family-name:--font-mono) text-[11px] text-(--text-secondary) break-all">{detail.path}</span>
        </Field>
        <Field label="Repository">
          <span className="text-xs text-(--text-secondary)">{detail.repoFullName}</span>
        </Field>
        {detail.createdAt && (
          <Field label="Created">
            <span className="text-xs text-(--text-muted)">{relativeTime(detail.createdAt)}</span>
          </Field>
        )}
        {detail.updatedAt && (
          <Field label="Updated">
            <span className="text-xs text-(--text-muted)">{relativeTime(detail.updatedAt)}</span>
          </Field>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-medium text-(--text-muted)">Status badge</p>
        <WorkflowBadgeImage src={detail.badgeUrl} className="h-5 max-w-full" />
      </div>
    </div>
  );
}

function RunsTab({
  runs,
  onRerun,
  pendingRunId,
  pendingAction,
  mutationError,
  onClearMutationError,
}: {
  runs: GHWorkflowRun[];
  onRerun: (run: GHWorkflowRun) => void;
  pendingRunId: number | null;
  pendingAction: string | null;
  mutationError: string | null;
  onClearMutationError: () => void;
}) {
  if (runs.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-(--text-secondary)">No recent runs</p>
      </div>
    );
  }
  return (
    <div className="divide-y divide-(--border-hairline) -mx-5">
      {mutationError && (
        <div className="flex items-start justify-between gap-2 px-5 py-2 text-[11px] text-(--danger)">
          <span>{mutationError}</span>
          <button type="button" className="shrink-0 underline" onClick={onClearMutationError}>
            Dismiss
          </button>
        </div>
      )}
      {runs.map((run) => {
        const showRerun =
          run.status === "completed" && isFailedConclusion(run.conclusion);
        const pending = pendingRunId === run.id && pendingAction === "rerun";
        return (
          <div
            key={run.id}
            className="flex items-center gap-2 px-5 py-2.5 transition-colors hover:bg-(--bg-hover)"
          >
            <a
              href={run.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <StatusIcon status={run.status} conclusion={run.conclusion} size={16} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-(family-name:--font-mono) text-[13px] font-medium text-(--text-primary)">
                    #{run.runNumber}
                  </span>
                  <EventBadge event={run.event} />
                  {run.headBranch && (
                    <span className="truncate font-(family-name:--font-mono) text-[11px] text-(--text-muted)">
                      {run.headBranch}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  {run.actor && (
                    <span className="text-[11px] text-(--text-faint)">{run.actor.login}</span>
                  )}
                  <span className="rounded bg-(--bg-muted) px-1.5 py-0.5 text-[10px] text-(--text-muted)">
                    {conclusionLabel(run.conclusion)}
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                {isActiveStatus(run.status) ? (
                  <ElapsedTimer startedAt={run.createdAt} />
                ) : run.durationSec !== undefined ? (
                  <span className="font-(family-name:--font-mono) text-[11px] tabular-nums text-(--text-muted)">
                    {formatDuration(run.durationSec)}
                  </span>
                ) : (
                  <span className="text-[11px] text-(--text-faint)">{relativeTime(run.updatedAt)}</span>
                )}
              </div>
            </a>
            {showRerun && (
              <button
                type="button"
                onClick={() => onRerun(run)}
                disabled={pending}
                className="shrink-0 rounded-md border border-(--border) bg-(--bg-elevated) px-2 py-1 text-[11px] font-medium text-(--text-secondary) transition-colors hover:border-(--accent)/40 hover:text-(--accent) disabled:opacity-50"
              >
                {pending ? "…" : "Re-run"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function YamlTab({ detail }: { detail: GHWorkflowDetail }) {
  if (!detail.yamlContent) {
    return (
      <div className="space-y-3 py-10 text-center">
        <p className="text-sm text-(--text-secondary)">YAML not available</p>
        <a
          href={detail.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-(--accent) underline"
        >
          View file on GitHub
        </a>
      </div>
    );
  }
  return (
    <div className="-mx-5 -my-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2">
        {detail.yamlTruncated && (
          <p className="text-[11px] text-(--warn)">File truncated (showing first 100KB)</p>
        )}
        <a
          href={detail.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-[11px] text-(--accent) underline"
        >
          Open file on GitHub
        </a>
      </div>
      <pre className="overflow-auto p-5 font-(family-name:--font-mono) text-[11px] leading-relaxed text-(--text-secondary)">
        {detail.yamlContent}
      </pre>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-(--text-muted)">{label}</p>
      {children}
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-3 w-16 animate-pulse rounded bg-(--bg-muted)" />
          <div className="h-4 w-32 animate-pulse rounded bg-(--bg-muted)" />
        </div>
      ))}
    </div>
  );
}
