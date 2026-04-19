"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useGithubData } from "@/lib/context/github-data-provider";
import { RunCard } from "@/components/github/run-card";
import { RunFilters } from "@/components/github/run-filters";
import { DispatchDialog } from "@/components/github/dispatch-dialog";
import { useRunMutations } from "@/components/github/use-run-mutations";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Skeleton } from "@/components/layout/loading-skeleton";
import type { GHWorkflowRun, GHWorkflow } from "@/lib/github/types";
import { isActiveStatus, isFailedConclusion, relativeTime } from "@/components/github/run-utils";

// ─── Skeleton grid ────────────────────────────────────────────────────────────

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-12" />
          </div>
          <div className="flex justify-between">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-10" />
          </div>
          <div className="flex gap-2 pt-1 border-t border-(--border-hairline)">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Filter matching ──────────────────────────────────────────────────────────

function matchesFilter(
  run: GHWorkflowRun,
  status: string,
  repo: string,
  workflow: string,
  branch: string,
): boolean {
  if (status) {
    if (status === "success" && run.conclusion !== "success") return false;
    if (status === "failure" && !isFailedConclusion(run.conclusion)) return false;
    if (status === "cancelled" && run.conclusion !== "cancelled") return false;
    if (status === "skipped" && run.conclusion !== "skipped") return false;
    if (status === "in_progress" && run.status !== "in_progress") return false;
    if (
      status === "queued" &&
      !(
        run.status === "queued" ||
        run.status === "waiting" ||
        run.status === "requested" ||
        run.status === "pending"
      )
    )
      return false;
  }
  if (repo && run.repoFullName !== repo) return false;
  if (workflow && run.workflowName !== workflow) return false;
  if (branch && !(run.headBranch ?? "").toLowerCase().includes(branch.toLowerCase()))
    return false;
  return true;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AllRunsPage() {
  return (
    <Suspense fallback={<GridSkeleton />}>
      <AllRunsPageContent />
    </Suspense>
  );
}

function AllRunsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { runs, repos, workflows, loading, error, fetchedAt, refresh, notifyMutation, optimisticUpdate } =
    useGithubData();

  // Filters from URL
  const urlStatus = searchParams.get("status") ?? "";
  const urlRepo = searchParams.get("repo") ?? "";
  const urlWorkflow = searchParams.get("workflow") ?? "";
  const urlBranch = searchParams.get("branch") ?? "";
  const urlSort = (searchParams.get("sort") ?? "newest") as "newest" | "oldest";

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const branchInputRef = useRef<HTMLInputElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  // Filtered + sorted runs
  const filteredRuns = useMemo(() => {
    const filtered = runs.filter((r) =>
      matchesFilter(r, urlStatus, urlRepo, urlWorkflow, urlBranch),
    );
    if (urlSort === "oldest") return [...filtered].reverse();
    return filtered;
  }, [runs, urlStatus, urlRepo, urlWorkflow, urlBranch, urlSort]);

  // Keyboard nav: focused card index
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  // Columns count based on grid breakpoints (estimate)
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

  // Cancel confirmation
  const [cancelTarget, setCancelTarget] = useState<GHWorkflowRun | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  // Dispatch dialog
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [ghWorkflows, setGhWorkflows] = useState<GHWorkflow[]>([]);

  const { rerun, rerunFailed, cancel, error: mutationError, clearError } = useRunMutations({
    onMutation: notifyMutation,
    optimisticUpdate,
  });

  // Fetch workflows list for dispatch dialog (lazy, on open)
  const loadWorkflows = useCallback(async () => {
    const res = await fetch("/api/github/actions/workflows/list");
    const data = (await res.json()) as { workflows?: GHWorkflow[]; error?: string };
    if (data.workflows) setGhWorkflows(data.workflows);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (e.key === "R" && e.shiftKey && !isInput) {
        e.preventDefault();
        void refresh();
        return;
      }

      if (e.key === "/" && !isInput) {
        e.preventDefault();
        branchInputRef.current?.focus();
        return;
      }

      if (e.key === "f" && !isInput) {
        e.preventDefault();
        branchInputRef.current?.closest("form")?.querySelector("select")?.focus();
        return;
      }

      if (e.key === "Escape" && !isInput) {
        setFocusedIndex(null);
        (document.activeElement as HTMLElement)?.blur();
        return;
      }

      if (!isInput && focusedIndex !== null) {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          setFocusedIndex((i) =>
            i === null ? 0 : Math.min((i ?? 0) + 1, filteredRuns.length - 1),
          );
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          setFocusedIndex((i) => Math.max((i ?? 0) - 1, 0));
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setFocusedIndex((i) =>
            Math.min((i ?? 0) + cols, filteredRuns.length - 1),
          );
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setFocusedIndex((i) => Math.max((i ?? 0) - cols, 0));
        } else if (e.key === "r") {
          const run = focusedIndex !== null ? filteredRuns[focusedIndex] : null;
          if (run) {
            if (run.conclusion === "failure") void rerunFailed(run);
            else void rerun(run);
          }
        } else if (e.key === "c") {
          const run = focusedIndex !== null ? filteredRuns[focusedIndex] : null;
          if (run && isActiveStatus(run.status)) setCancelTarget(run);
        }
      }
    }

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [filteredRuns, focusedIndex, cols, refresh, rerun, rerunFailed]);

  const handleConfirmCancel = useCallback(async () => {
    if (!cancelTarget) return;
    setCancelLoading(true);
    await cancel(cancelTarget);
    setCancelLoading(false);
    setCancelTarget(null);
  }, [cancelTarget, cancel]);

  async function handleViewLogs(run: GHWorkflowRun) {
    const res = await fetch(
      `/api/github/actions/runs/${run.id}/logs?repo=${encodeURIComponent(run.repoFullName)}`,
    );
    const data = (await res.json()) as { url?: string; error?: string };
    if (data.url) window.open(data.url, "_blank");
  }



  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-(family-name:--font-display) text-2xl font-medium text-(--text-primary)">
            All runs
          </h1>
          {fetchedAt && (
            <p className="mt-0.5 text-xs text-(--text-muted)">
              {filteredRuns.length} run{filteredRuns.length !== 1 ? "s" : ""} shown · Updated{" "}
              {relativeTime(fetchedAt)}
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
          <button
            type="button"
            onClick={() => {
              void loadWorkflows();
              setDispatchOpen(true);
            }}
            className="rounded-lg border border-(--border) bg-(--bg-surface) px-3 py-1.5 text-xs font-medium text-(--text-secondary) transition-colors hover:border-(--accent)/50 hover:text-(--accent)"
          >
            Trigger workflow
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
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

      {/* Sticky filter bar */}
      <div className="sticky top-0 z-10 -mx-8 bg-(--bg-deep)/90 px-8 py-3 backdrop-blur-sm border-b border-(--border-hairline)">
        <RunFilters
          status={urlStatus}
          repo={urlRepo}
          workflow={urlWorkflow}
          branch={urlBranch}
          sort={urlSort}
          repos={repos}
          workflows={workflows}
          onStatusChange={(v) => updateParam("status", v)}
          onRepoChange={(v) => updateParam("repo", v)}
          onWorkflowChange={(v) => updateParam("workflow", v)}
          onBranchChange={(v) => updateParam("branch", v)}
          onSortChange={(v) => updateParam("sort", v === "newest" ? "" : v)}
          branchInputRef={branchInputRef}
        />
      </div>

      {/* Errors */}
      {(error || mutationError) && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-(--danger)/20 bg-(--danger)/5 px-4 py-3 text-sm text-(--danger)">
          <span>{error ?? mutationError}</span>
          <button type="button" onClick={() => { clearError(); void refresh(); }} className="shrink-0 underline">
            Retry
          </button>
        </div>
      )}

      {/* Grid */}
      {loading && !fetchedAt ? (
        <GridSkeleton />
      ) : filteredRuns.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden className="text-(--text-faint)">
            <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="2" />
            <path d="M13 20h14M20 13v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <p className="text-sm font-medium text-(--text-secondary)">No runs match these filters</p>
          <p className="text-xs text-(--text-muted)">Try removing some filters or refreshing.</p>
        </div>
      ) : (
        <div
          ref={gridRef}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          role="list"
          aria-label="Workflow runs"
          onFocus={(e) => {
            const card = (e.target as HTMLElement).closest("article");
            if (card) {
              const cards = gridRef.current?.querySelectorAll("article") ?? [];
              const idx = Array.from(cards).indexOf(card as HTMLElement);
              if (idx >= 0) setFocusedIndex(idx);
            }
          }}
          onBlur={() => {
            // Small delay to allow focus to move between cards
            setTimeout(() => {
              const active = document.activeElement;
              if (!gridRef.current?.contains(active)) setFocusedIndex(null);
            }, 50);
          }}
        >
          {filteredRuns.map((run, i) => (
            <div key={run.id} role="listitem">
              <RunCard
                run={run}
                focused={focusedIndex === i}
                onRerun={rerun}
                onRerunFailed={rerunFailed}
                onCancel={(r) => setCancelTarget(r)}
                onViewLogs={handleViewLogs}
              />
            </div>
          ))}
        </div>
      )}

      {/* Keyboard hints */}
      <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-3">
        <p className="text-[11px] text-(--text-faint)">
          <kbd className="rounded border border-(--border) px-1 py-0.5 font-(family-name:--font-mono) text-[10px]">/</kbd>{" "}
          Branch search ·{" "}
          <kbd className="rounded border border-(--border) px-1 py-0.5 font-(family-name:--font-mono) text-[10px]">f</kbd>{" "}
          Focus filters ·{" "}
          <kbd className="rounded border border-(--border) px-1 py-0.5 font-(family-name:--font-mono) text-[10px]">↑↓←→</kbd>{" "}
          Navigate cards ·{" "}
          <kbd className="rounded border border-(--border) px-1 py-0.5 font-(family-name:--font-mono) text-[10px]">r</kbd>{" "}
          Re-run ·{" "}
          <kbd className="rounded border border-(--border) px-1 py-0.5 font-(family-name:--font-mono) text-[10px]">c</kbd>{" "}
          Cancel ·{" "}
          <kbd className="rounded border border-(--border) px-1 py-0.5 font-(family-name:--font-mono) text-[10px]">Esc</kbd>{" "}
          Clear focus ·{" "}
          <kbd className="rounded border border-(--border) px-1 py-0.5 font-(family-name:--font-mono) text-[10px]">Shift+R</kbd>{" "}
          Refresh
        </p>
      </div>

      {/* Cancel confirmation */}
      <ConfirmDialog
        open={!!cancelTarget}
        title="Cancel workflow run?"
        message={
          cancelTarget
            ? `Cancel "${cancelTarget.workflowName}" on ${cancelTarget.repoFullName}?`
            : ""
        }
        confirmLabel="Cancel run"
        confirmVariant="danger"
        loading={cancelLoading}
        onConfirm={handleConfirmCancel}
        onCancel={() => setCancelTarget(null)}
      />

      {/* Dispatch dialog */}
      <DispatchDialog
        open={dispatchOpen}
        workflows={ghWorkflows}
        onClose={() => setDispatchOpen(false)}
        onDispatched={() => {
          notifyMutation();
        }}
      />
    </div>
  );
}
