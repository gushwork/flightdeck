"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GHWorkflowListItem, GHWorkflowRun } from "@/lib/github/types";
import { useGithubData } from "@/lib/context/github-data-provider";
import { useSingletonPopoverDismiss } from "@/lib/hooks/use-singleton-popover-dismiss";
import { WorkflowDrawer } from "@/components/github/workflow-drawer";
import { WorkflowBadgeImage } from "@/components/github/workflow-badge-image";
import { WorkflowDispatchForm } from "@/components/github/workflow-dispatch-form";
import { Skeleton } from "@/components/layout/loading-skeleton";
import { SearchableSelect } from "@/components/searchable-select";
import {
  StatusIcon,
  relativeTime,
  isActiveStatus,
} from "@/components/github/run-utils";

/** Stable key for `data-popover-key` / singleton popover registry */
function workflowPopoverKey(wf: GHWorkflowListItem): string {
  return `${wf.repoFullName}#${wf.id}`;
}

// ─── Latest run for a workflow (from global runs feed) ───────────────────────

function pickLatestRunForWorkflow(
  runs: GHWorkflowRun[],
  wf: GHWorkflowListItem,
): GHWorkflowRun | null {
  const matching = runs.filter(
    (r) => r.repoFullName === wf.repoFullName && r.workflowId === wf.id,
  );
  if (matching.length === 0) return null;
  return matching.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )[0]!;
}

// ─── Workflow card ────────────────────────────────────────────────────────────

function WorkflowCard({
  wf,
  focused,
  onOpenDrawer,
  latestRun,
  onDispatchDone,
  dispatchOpen,
  onToggleDispatch,
  onCloseDispatch,
}: {
  wf: GHWorkflowListItem;
  focused: boolean;
  onOpenDrawer: () => void;
  latestRun: GHWorkflowRun | null;
  onDispatchDone: () => void;
  dispatchOpen: boolean;
  onToggleDispatch: () => void;
  onCloseDispatch: () => void;
}) {
  const isDisabled = wf.state !== "active";
  const popKey = workflowPopoverKey(wf);

  return (
    <div
      data-workflow-card
      className={`group relative flex w-full flex-col gap-2.5 rounded-xl border p-4 text-left transition-all duration-150 ${
        dispatchOpen ? "z-[100]" : "z-0"
      } ${
        focused
          ? "border-(--accent)/50 bg-(--bg-elevated) shadow-sm ring-2 ring-(--accent)/20"
          : "border-(--border-hairline) bg-(--bg-elevated) hover:border-(--border) hover:shadow-sm"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${
          isDisabled ? "bg-(--warn)" : "bg-(--success)"
        }`} />
        <button
          type="button"
          onClick={onOpenDrawer}
          className="min-w-0 flex-1 text-left outline-none"
          aria-label={`${wf.name} in ${wf.repoFullName}, ${wf.state}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-(--text-primary) group-hover:text-(--accent)">
                {wf.name}
              </span>
              <span className="mt-0.5 block truncate text-xs text-(--text-muted)">
                {wf.repoFullName.split("/")[1] ?? wf.repoFullName}
              </span>
            </div>
            <WorkflowBadgeImage src={wf.badgeUrl} className="h-4 max-w-28 shrink-0" />
          </div>
        </button>
        {!isDisabled && (
          <div
            data-popover-root="true"
            data-popover-key={popKey}
            className="relative shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onToggleDispatch}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-(--border) bg-(--bg-surface) text-(--text-muted) transition-colors hover:border-(--accent)/40 hover:text-(--accent)"
              title="Run workflow"
              aria-expanded={dispatchOpen}
              aria-label={`Run workflow ${wf.name}`}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <path d="M3 2l10 6-10 6V2z" />
              </svg>
            </button>
            {dispatchOpen && (
              <div
                className="absolute right-0 top-full z-10 mt-1 w-[min(100vw-2rem,22rem)] rounded-lg border border-(--border-hairline) bg-(--bg-elevated) p-3 shadow-xl"
                role="dialog"
                aria-label="Dispatch workflow"
              >
                <WorkflowDispatchForm
                  key={popKey}
                  repoFullName={wf.repoFullName}
                  workflowId={wf.id}
                  enabled={dispatchOpen}
                  compact
                  variant="inline"
                  onSuccess={() => {
                    onDispatchDone();
                    onCloseDispatch();
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Last run + path row */}
      <button
        type="button"
        onClick={onOpenDrawer}
        className="w-full text-left outline-none"
        aria-hidden={false}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {latestRun ? (
              <>
                <StatusIcon
                  status={latestRun.status}
                  conclusion={latestRun.conclusion}
                  size={14}
                />
                <span className="truncate text-[11px] text-(--text-secondary)">
                  {isActiveStatus(latestRun.status) ? "Running" : "Last"}{" "}
                  <span className="text-(--text-faint)">{relativeTime(latestRun.updatedAt)}</span>
                </span>
              </>
            ) : (
              <span className="text-[11px] text-(--text-faint)">No recent run in feed</span>
            )}
          </div>
          {isDisabled && (
            <span className="shrink-0 rounded-full border border-(--border-hairline) bg-(--bg-muted) px-1.5 py-0.5 text-[10px] font-medium text-(--text-muted)">
              disabled
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-(family-name:--font-mono) text-[11px] text-(--text-faint)">
            {wf.path.replace(".github/workflows/", "")}
          </span>
        </div>
      </button>
    </div>
  );
}

// ─── Skeleton grid ────────────────────────────────────────────────────────────

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) p-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <Skeleton className="mt-1 h-2 w-2 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WorkflowsPage() {
  const { runs, notifyMutation } = useGithubData();

  const [workflows, setWorkflows] = useState<GHWorkflowListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [repoFilter, setRepoFilter] = useState("");
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  /** At most one Run popover open — click-outside + Escape via useSingletonPopoverDismiss */
  const [openDispatchKey, setOpenDispatchKey] = useState<string | null>(null);
  const dismissDispatchPopover = useCallback(() => setOpenDispatchKey(null), []);
  useSingletonPopoverDismiss(openDispatchKey, dismissDispatchPopover);

  // Drawer state
  const [drawerTarget, setDrawerTarget] = useState<GHWorkflowListItem | null>(null);

  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/github/actions/workflows/list");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setWorkflows(data.workflows ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchWorkflows();
  }, [fetchWorkflows]);

  const onDispatchDone = useCallback(() => {
    notifyMutation();
    void fetchWorkflows();
  }, [notifyMutation, fetchWorkflows]);

  // Derived
  const repos = useMemo(
    () => [...new Set(workflows.map((w) => w.repoFullName))].sort(),
    [workflows],
  );

  const filtered = useMemo(() => {
    if (!repoFilter) return workflows;
    return workflows.filter((w) => w.repoFullName === repoFilter);
  }, [workflows, repoFilter]);

  const latestByKey = useMemo(() => {
    const map = new Map<string, GHWorkflowRun | null>();
    for (const wf of filtered) {
      const key = `${wf.repoFullName}:${wf.id}`;
      map.set(key, pickLatestRunForWorkflow(runs, wf));
    }
    return map;
  }, [filtered, runs]);

  // Column count for 2D keyboard nav
  const [cols, setCols] = useState(3);
  useEffect(() => {
    function updateCols() {
      const w = window.innerWidth;
      setCols(w < 640 ? 1 : w < 1024 ? 2 : 3);
    }
    updateCols();
    window.addEventListener("resize", updateCols);
    return () => window.removeEventListener("resize", updateCols);
  }, []);

  // Keyboard nav
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (drawerTarget) return;
      if (openDispatchKey) return;

      if (e.key === "R" && e.shiftKey) {
        e.preventDefault();
        void fetchWorkflows();
        return;
      }

      if (focusedIndex !== null) {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          setFocusedIndex((i) => Math.min((i ?? 0) + 1, filtered.length - 1));
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          setFocusedIndex((i) => Math.max((i ?? 0) - 1, 0));
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setFocusedIndex((i) => Math.min((i ?? 0) + cols, filtered.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setFocusedIndex((i) => Math.max((i ?? 0) - cols, 0));
        } else if (e.key === "Enter") {
          const wf = filtered[focusedIndex];
          if (wf) setDrawerTarget(wf);
        } else if (e.key === "Escape") {
          setFocusedIndex(null);
          (document.activeElement as HTMLElement)?.blur();
        }
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [filtered, focusedIndex, cols, fetchWorkflows, drawerTarget, openDispatchKey]);

  const selectClass =
    "rounded-lg border border-(--border) bg-(--bg-field) px-2.5 py-1.5 text-xs text-(--text-primary) outline-none transition-colors focus:border-(--accent) focus:ring-1 focus:ring-(--accent)/30";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-(family-name:--font-display) text-2xl font-medium text-(--text-primary)">
            Workflows
          </h1>
          <p className="mt-0.5 text-xs text-(--text-muted)">
            {filtered.length} workflow{filtered.length !== 1 ? "s" : ""}
            {loading && (
              <span className="ml-2 inline-flex items-center gap-1 text-[11px]">
                <svg className="animate-spin" width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="2" strokeDasharray="20 6" strokeLinecap="round" />
                </svg>
                Loading
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {repos.length > 1 && (
            <SearchableSelect
              value={repoFilter}
              onValueChange={setRepoFilter}
              className={selectClass}
              aria-label="Filter by repository"
              searchPlaceholder="Search repos…"
              options={[
                { value: "", label: `All repos (${repos.length})` },
                ...repos.map((r) => ({
                  value: r,
                  label: r.split("/")[1] ?? r,
                })),
              ]}
            />
          )}
          <button
            type="button"
            onClick={fetchWorkflows}
            disabled={loading}
            className="rounded-lg border border-(--border) bg-(--bg-surface) p-1.5 text-(--text-muted) transition-colors hover:bg-(--bg-hover) hover:text-(--accent) disabled:opacity-50"
            title="Refresh (Shift+R)"
            aria-label="Refresh"
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
      {error && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-(--danger)/20 bg-(--danger)/5 px-4 py-3 text-sm text-(--danger)">
          <span>{error}</span>
          <button type="button" onClick={fetchWorkflows} className="shrink-0 underline">Retry</button>
        </div>
      )}

      {/* Grid */}
      {loading && workflows.length === 0 ? (
        <GridSkeleton />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden className="text-(--text-faint)">
            <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="2" />
            <path d="M16 20h8M20 16v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <p className="text-sm font-medium text-(--text-secondary)">No workflows found</p>
          <p className="text-xs text-(--text-muted)">
            {repoFilter ? "Try a different repo filter." : "No workflows in the last 30 active repos."}
          </p>
        </div>
      ) : (
        <div
          ref={gridRef}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          role="list"
          aria-label="Workflows"
          onFocus={(e) => {
            const card = (e.target as HTMLElement).closest("[data-workflow-card]");
            if (card && gridRef.current) {
              const cards = gridRef.current.querySelectorAll("[data-workflow-card]");
              const idx = Array.from(cards).indexOf(card);
              if (idx >= 0) setFocusedIndex(idx);
            }
          }}
        >
          {filtered.map((wf, i) => (
            <div key={`${wf.repoFullName}/${wf.id}`} role="listitem">
              <WorkflowCard
                wf={wf}
                focused={focusedIndex === i}
                onOpenDrawer={() => setDrawerTarget(wf)}
                latestRun={latestByKey.get(`${wf.repoFullName}:${wf.id}`) ?? null}
                onDispatchDone={onDispatchDone}
                dispatchOpen={openDispatchKey === workflowPopoverKey(wf)}
                onToggleDispatch={() =>
                  setOpenDispatchKey((prev) =>
                    prev === workflowPopoverKey(wf) ? null : workflowPopoverKey(wf),
                  )
                }
                onCloseDispatch={dismissDispatchPopover}
              />
            </div>
          ))}
        </div>
      )}

      {/* Keyboard hints */}
      {filtered.length > 0 && (
        <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-3">
          <p className="text-[11px] text-(--text-faint)">
            <kbd className="rounded border border-(--border) px-1 py-0.5 font-(family-name:--font-mono) text-[10px]">↑↓←→</kbd>{" "}
            Navigate ·{" "}
            <kbd className="rounded border border-(--border) px-1 py-0.5 font-(family-name:--font-mono) text-[10px]">Enter</kbd>{" "}
            Open detail ·{" "}
            <kbd className="rounded border border-(--border) px-1 py-0.5 font-(family-name:--font-mono) text-[10px]">Esc</kbd>{" "}
            Close ·{" "}
            <kbd className="rounded border border-(--border) px-1 py-0.5 font-(family-name:--font-mono) text-[10px]">Shift+R</kbd>{" "}
            Refresh
          </p>
        </div>
      )}

      {/* Drawer */}
      {drawerTarget && (
        <WorkflowDrawer
          repoFullName={drawerTarget.repoFullName}
          workflowId={drawerTarget.id}
          workflowName={drawerTarget.name}
          onClose={() => setDrawerTarget(null)}
        />
      )}
    </div>
  );
}
