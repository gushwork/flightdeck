"use client";

import { useState } from "react";
import type { GHWorkflowRun } from "@/lib/github/types";
import {
  StatusIcon,
  EventBadge,
  ElapsedTimer,
  formatDuration,
  relativeTime,
  isActiveStatus,
  isFailedConclusion,
} from "./run-utils";

interface RunCardProps {
  run: GHWorkflowRun;
  focused?: boolean;
  onRerun?: (run: GHWorkflowRun) => void;
  onRerunFailed?: (run: GHWorkflowRun) => void;
  onCancel?: (run: GHWorkflowRun) => void;
  onViewLogs?: (run: GHWorkflowRun) => void;
}

export function RunCard({
  run,
  focused,
  onRerun,
  onRerunFailed,
  onCancel,
  onViewLogs,
}: RunCardProps) {
  const [actionPending, setActionPending] = useState<string | null>(null);

  const isActive = isActiveStatus(run.status);
  const isFailed = run.status === "completed" && isFailedConclusion(run.conclusion);
  const isSuccess = run.status === "completed" && run.conclusion === "success";

  async function handleAction(
    actionKey: string,
    handler?: (run: GHWorkflowRun) => void,
  ) {
    if (!handler || actionPending) return;
    setActionPending(actionKey);
    try {
      await handler(run);
    } finally {
      setActionPending(null);
    }
  }

  const shortSha = run.headSha.slice(0, 7);

  return (
    <article
      className={`group flex flex-col gap-3 rounded-xl border p-4 transition-all duration-150 ${
        focused
          ? "border-(--accent)/50 bg-(--bg-elevated) shadow-md ring-2 ring-(--accent)/20"
          : "border-(--border-hairline) bg-(--bg-elevated) hover:border-(--border) hover:shadow-sm"
      }`}
      tabIndex={0}
      aria-label={`${run.workflowName} on ${run.repoFullName}, ${run.status}${run.conclusion ? `, ${run.conclusion}` : ""}`}
    >
      {/* Header row */}
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 shrink-0">
          <StatusIcon status={run.status} conclusion={run.conclusion} size={18} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="truncate text-[13px] font-medium text-(--text-primary)"
              title={run.workflowName}
            >
              {run.workflowName}
            </span>
            <span className="shrink-0 font-(family-name:--font-mono) text-[10px] text-(--text-faint)">
              #{run.runNumber}
            </span>
          </div>
          <div className="mt-0.5 truncate text-xs text-(--text-muted)" title={run.repoFullName}>
            {run.repoFullName}
          </div>
        </div>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {run.headBranch && (
          <span className="flex items-center gap-1 font-(family-name:--font-mono) text-[11px] text-(--text-secondary)">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden className="opacity-60">
              <path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 019 8.5H7a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 017 7h2a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z" />
            </svg>
            {run.headBranch}
          </span>
        )}
        <span className="font-(family-name:--font-mono) text-[11px] text-(--text-faint)">{shortSha}</span>
        <EventBadge event={run.event} />
      </div>

      {/* Actor + time row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {run.actor && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={run.actor.avatarUrl}
                alt={run.actor.login}
                width={16}
                height={16}
                className="rounded-full"
              />
              <span className="truncate text-[11px] text-(--text-muted)">
                {run.actor.login}
              </span>
            </>
          )}
        </div>
        <div className="shrink-0 text-right text-[11px] text-(--text-muted)">
          {isActive ? (
            <ElapsedTimer startedAt={run.createdAt} />
          ) : run.durationSec !== undefined ? (
            <span className="font-(family-name:--font-mono) tabular-nums">
              {formatDuration(run.durationSec)}
            </span>
          ) : (
            <span>{relativeTime(run.updatedAt)}</span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between gap-2 border-t border-(--border-hairline) pt-2.5">
        <div className="flex flex-wrap gap-1.5">
          {isActive && onCancel && (
            <ActionButton
              onClick={() => handleAction("cancel", onCancel)}
              loading={actionPending === "cancel"}
              variant="danger"
            >
              Cancel
            </ActionButton>
          )}
          {isFailed && onRerunFailed && (
            <ActionButton
              onClick={() => handleAction("rerun-failed", onRerunFailed)}
              loading={actionPending === "rerun-failed"}
              variant="default"
            >
              Re-run failed
            </ActionButton>
          )}
          {(isFailed || isSuccess || run.conclusion === "cancelled") && onRerun && (
            <ActionButton
              onClick={() => handleAction("rerun", onRerun)}
              loading={actionPending === "rerun"}
              variant="ghost"
            >
              Re-run all
            </ActionButton>
          )}
        </div>
        <div className="flex gap-1">
          {onViewLogs && run.status === "completed" && (
            <button
              type="button"
              onClick={() => handleAction("logs", onViewLogs)}
              className="rounded p-1.5 text-(--text-muted) transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
              title="View logs"
              aria-label="View run logs"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 5h8M4 8h6M4 11h4" />
                <rect x="1.5" y="1.5" width="13" height="13" rx="2" />
              </svg>
            </button>
          )}
          <a
            href={run.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded p-1.5 text-(--text-muted) transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
            title="View on GitHub"
            aria-label="View on GitHub"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1v-3M9 2h5m0 0v5m0-5L7 10" />
            </svg>
          </a>
        </div>
      </div>
    </article>
  );
}

function ActionButton({
  children,
  onClick,
  loading,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  loading?: boolean;
  variant?: "default" | "danger" | "ghost";
}) {
  const base =
    "inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50";
  const variants = {
    default:
      "border border-(--border) bg-(--bg-surface) text-(--text-secondary) hover:border-(--accent)/50 hover:text-(--accent)",
    danger:
      "border border-(--danger)/20 bg-(--danger)/5 text-(--danger) hover:bg-(--danger)/10",
    ghost:
      "border border-transparent text-(--text-muted) hover:bg-(--bg-hover) hover:text-(--text-secondary)",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!!loading}
      className={`${base} ${variants[variant]}`}
    >
      {loading ? (
        <svg className="mr-1 animate-spin" width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="2" strokeDasharray="20 6" strokeLinecap="round" />
        </svg>
      ) : null}
      {children}
    </button>
  );
}
