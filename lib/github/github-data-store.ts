import type { GHWorkflowRun, GHRunsSummary } from "@/lib/github/types";
import { computeSummary } from "@/lib/github/types";
import { setGithubActivityFromSummary } from "./github-activity-store";

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

export type GithubDataSnapshot = {
  runs: GHWorkflowRun[];
  summary: GHRunsSummary;
  repos: string[];
  workflows: string[];
  loading: boolean;
  error: string | null;
  fetchedAt: string | null;
};

const listeners = new Set<() => void>();

/**
 * Initial empty state shared by the server snapshot and the client store. React’s
 * `useSyncExternalStore` requires that `getSnapshot` and `getServerSnapshot` return
 * the **same** reference (Object.is) for matching data on the first client render, or
 * updates from the real store can fail to apply (dashboard stuck at all zeros).
 */
const GITHUB_DATA_SERVER_SNAPSHOT: GithubDataSnapshot = {
  runs: [],
  summary: defaultSummary,
  repos: [],
  workflows: [],
  loading: false,
  error: null,
  fetchedAt: null,
};

let snapshot: GithubDataSnapshot = GITHUB_DATA_SERVER_SNAPSHOT;

function emit() {
  for (const l of listeners) l();
}

function patch(partial: Partial<GithubDataSnapshot>) {
  snapshot = { ...snapshot, ...partial };
  if (partial.summary) {
    setGithubActivityFromSummary(partial.summary);
  }
  emit();
}

export function getGithubDataSnapshot(): GithubDataSnapshot {
  return snapshot;
}

export function getGithubDataServerSnapshot(): GithubDataSnapshot {
  return GITHUB_DATA_SERVER_SNAPSHOT;
}

export function subscribeGithubData(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function setGithubDataLoading(loading: boolean) {
  if (snapshot.loading === loading) return;
  patch({ loading });
}

export function clearGithubDataError() {
  if (snapshot.error === null) return;
  patch({ error: null });
}

/** Replaces run list after a successful /api fetch. */
export function replaceGithubDataSuccess(data: {
  runs: GHWorkflowRun[];
  summary?: GHRunsSummary;
  repos: string[];
  workflows: string[];
}) {
  const runs = data.runs;
  const nextSummary = data.summary ?? computeSummary(runs);
  patch({
    runs,
    summary: nextSummary,
    repos: data.repos,
    workflows: data.workflows,
    error: null,
    fetchedAt: new Date().toISOString(),
  });
}

export function setGithubDataFetchError(message: string) {
  if (snapshot.error === message) return;
  patch({ error: message });
}

export function githubDataOptimisticUpdate(
  runId: number,
  patchRun: Partial<GHWorkflowRun>,
) {
  const next = snapshot.runs.map((r) =>
    r.id === runId ? { ...r, ...patchRun } : r,
  );
  const nextSummary = computeSummary(next);
  patch({ runs: next, summary: nextSummary });
}
