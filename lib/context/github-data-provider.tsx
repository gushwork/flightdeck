"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import type { GHWorkflowRun, GHRunsSummary } from "@/lib/github/types";
import {
  clearGithubDataError,
  getGithubDataServerSnapshot,
  getGithubDataSnapshot,
  githubDataOptimisticUpdate,
  replaceGithubDataSuccess,
  setGithubDataFetchError,
  setGithubDataLoading,
  subscribeGithubData,
} from "@/lib/github/github-data-store";

// ─── Polling intervals (only while /github/* is active) ─────────────────────

const POLL_ACTIVE_MS = 8_000;
const POLL_RECENT_FAIL_MS = 15_000;
const POLL_IDLE_MS = 60_000;
const POLL_AFTER_MUTATION_MS = 5_000;

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

// ─── Context types (stable return shape) ────────────────────────────────────

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

const defaultSummary: GithubDataContextValue["summary"] = {
  total: 0,
  inProgress: 0,
  queued: 0,
  succeeded: 0,
  failed: 0,
  cancelled: 0,
  avgDurationSec: 0,
  failureRate: 0,
};

/** Filled by `GithubDataController` so `useGithubData` always has live handlers. */
const controllerActions: {
  refresh: () => Promise<void>;
  notifyMutation: () => void;
} = {
  refresh: async () => {},
  notifyMutation: () => {},
};

function GithubDataController() {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const loadingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mutationPendingRef = useRef(false);

  const scheduleNext = useRef<() => void>(() => {});

  const doFetch = useCallback(
    async (signal: AbortSignal | undefined, options: { background?: boolean } = {}) => {
      const background = options.background ?? false;
      if (loadingRef.current) return;
      loadingRef.current = true;
      if (!background) {
        setGithubDataLoading(true);
      }
      clearGithubDataError();

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
        replaceGithubDataSuccess({
          runs: newRuns,
          summary: data.summary,
          repos: data.repos ?? [],
          workflows: data.workflows ?? [],
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setGithubDataFetchError(
          err instanceof Error ? err.message : "Failed to fetch runs",
        );
      } finally {
        loadingRef.current = false;
        if (!background) {
          setGithubDataLoading(false);
        }
      }
    },
    [],
  );

  scheduleNext.current = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    let interval: number;
    if (mutationPendingRef.current) {
      interval = POLL_AFTER_MUTATION_MS;
      mutationPendingRef.current = false;
    } else {
      interval = computePollInterval(getGithubDataSnapshot().runs);
    }
    timerRef.current = setTimeout(() => {
      if (!pathnameRef.current.startsWith("/github")) {
        return;
      }
      if (document.visibilityState === "hidden") {
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      void (async () => {
        await doFetch(controller.signal, { background: true });
        if (pathnameRef.current.startsWith("/github")) {
          scheduleNext.current();
        }
      })();
    }, interval);
  };

  const refresh = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    await doFetch(controller.signal, { background: false });
    if (pathnameRef.current.startsWith("/github")) {
      scheduleNext.current();
    }
  }, [doFetch]);

  const notifyMutation = useCallback(() => {
    mutationPendingRef.current = true;
    void refresh();
  }, [refresh]);

  controllerActions.refresh = refresh;
  controllerActions.notifyMutation = notifyMutation;

  useEffect(() => {
    const onHome = pathname === "/";
    const onGithub = pathname.startsWith("/github");

    if (!onHome && !onGithub) {
      abortRef.current?.abort();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    void (async () => {
      await doFetch(controller.signal, { background: false });
      if (controller.signal.aborted) return;
      if (pathnameRef.current.startsWith("/github")) {
        scheduleNext.current();
      }
    })();

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (!pathnameRef.current.startsWith("/github")) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      void (async () => {
        await doFetch(ac.signal, { background: true });
        if (pathnameRef.current.startsWith("/github")) {
          scheduleNext.current();
        }
      })();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      controller.abort();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pathname, doFetch]);

  return null;
}

/**
 * Fetches once on `/`, and fetches plus smart-polls on `/github/*`.
 * Children do not re-render on GitHub poll — only `useGithubData()` subscribers do.
 */
export function GithubDataProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GithubDataController />
      {children}
    </>
  );
}

export function useGithubData(): GithubDataContextValue {
  const data = useSyncExternalStore(
    subscribeGithubData,
    getGithubDataSnapshot,
    getGithubDataServerSnapshot,
  );

  return {
    ...data,
    summary: data.summary ?? defaultSummary,
    refresh: () => controllerActions.refresh(),
    notifyMutation: () => controllerActions.notifyMutation(),
    optimisticUpdate: githubDataOptimisticUpdate,
  };
}
