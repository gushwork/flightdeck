"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { GHWorkflowRun, GHRunsSummary } from "@/lib/github/types";
import { computeSummary } from "@/lib/github/types";

// ─── Polling intervals ────────────────────────────────────────────────────────

const POLL_ACTIVE_MS = 8_000;   // in_progress or queued: 8 s — feels live
const POLL_RECENT_FAIL_MS = 15_000; // recent failure within 2 min: 15 s
const POLL_IDLE_MS = 60_000;    // all settled: 60 s — save bandwidth
const POLL_AFTER_MUTATION_MS = 5_000; // follow-up after user action: 5 s

function computePollInterval(runs: GHWorkflowRun[]): number {
  const hasActive = runs.some(
    (r) =>
      r.status === "in_progress" ||
      r.status === "queued" ||
      r.status === "waiting" ||
      r.status === "requested" ||
      r.status === "pending",
  );
  if (hasActive) return POLL_ACTIVE_MS;

  const twoMinAgo = Date.now() - 2 * 60 * 1000;
  const hasRecentFailure = runs.some(
    (r) =>
      (r.conclusion === "failure" ||
        r.conclusion === "timed_out" ||
        r.conclusion === "startup_failure") &&
      new Date(r.updatedAt).getTime() > twoMinAgo,
  );
  if (hasRecentFailure) return POLL_RECENT_FAIL_MS;

  return POLL_IDLE_MS;
}

// ─── Context types ────────────────────────────────────────────────────────────

export interface GithubDataContextValue {
  runs: GHWorkflowRun[];
  summary: GHRunsSummary;
  repos: string[];
  workflows: string[];
  loading: boolean;
  error: string | null;
  fetchedAt: string | null;
  /** Trigger an immediate refresh (e.g. after a mutation). */
  refresh: () => Promise<void>;
  /** Call this after a mutation so polling speeds up temporarily. */
  notifyMutation: () => void;
  /** Optimistically update a single run's status. */
  optimisticUpdate: (runId: number, patch: Partial<GHWorkflowRun>) => void;
}

const defaultSummary: GHRunsSummary = {
  total: 0,
  inProgress: 0,
  queued: 0,
  succeeded: 0,
  failed: 0,
  cancelled: 0,
  avgDurationSec: 0,
  failureRate: 0,
};

const GithubDataContext = createContext<GithubDataContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function GithubDataProvider({ children }: { children: React.ReactNode }) {
  const [runs, setRuns] = useState<GHWorkflowRun[]>([]);
  const [summary, setSummary] = useState<GHRunsSummary>(defaultSummary);
  const [repos, setRepos] = useState<string[]>([]);
  const [workflows, setWorkflows] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const runsRef = useRef<GHWorkflowRun[]>([]);
  const loadingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Set to true for one cycle after a mutation to use faster follow-up interval
  const mutationPendingRef = useRef(false);

  const doFetch = useCallback(async (signal?: AbortSignal) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/github/actions/runs", { signal });
      if (signal?.aborted) return;
      const data = (await res.json()) as {
        runs?: GHWorkflowRun[];
        summary?: GHRunsSummary;
        repos?: string[];
        workflows?: string[];
        error?: string;
      };
      if (data.error) throw new Error(data.error);

      const newRuns = data.runs ?? [];
      runsRef.current = newRuns;
      setRuns(newRuns);
      setSummary(data.summary ?? computeSummary(newRuns));
      setRepos(data.repos ?? []);
      setWorkflows(data.workflows ?? []);
      setFetchedAt(new Date().toISOString());
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to fetch runs");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  const scheduleNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    let interval: number;
    if (mutationPendingRef.current) {
      interval = POLL_AFTER_MUTATION_MS;
      mutationPendingRef.current = false;
    } else {
      interval = computePollInterval(runsRef.current);
    }

    timerRef.current = setTimeout(() => {
      if (document.visibilityState === "hidden") {
        // Tab not visible — defer until it becomes visible again
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      doFetch(controller.signal).then(() => scheduleNext());
    }, interval);
  }, [doFetch]);

  const refresh = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    await doFetch(controller.signal);
    scheduleNext();
  }, [doFetch, scheduleNext]);

  const notifyMutation = useCallback(() => {
    mutationPendingRef.current = true;
    // Trigger an immediate refresh
    void refresh();
  }, [refresh]);

  const optimisticUpdate = useCallback(
    (runId: number, patch: Partial<GHWorkflowRun>) => {
      setRuns((prev) => {
        const next = prev.map((r) => (r.id === runId ? { ...r, ...patch } : r));
        runsRef.current = next;
        setSummary(computeSummary(next));
        return next;
      });
    },
    [],
  );

  // Initial fetch + visibility-based resume
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    doFetch(controller.signal).then(() => scheduleNext());

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      controller.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GithubDataContext.Provider
      value={{
        runs,
        summary,
        repos,
        workflows,
        loading,
        error,
        fetchedAt,
        refresh,
        notifyMutation,
        optimisticUpdate,
      }}
    >
      {children}
    </GithubDataContext.Provider>
  );
}

export function useGithubData(): GithubDataContextValue {
  const ctx = useContext(GithubDataContext);
  if (!ctx) throw new Error("useGithubData must be used within GithubDataProvider");
  return ctx;
}
