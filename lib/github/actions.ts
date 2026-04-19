import { githubFetch, getGithubToken } from "./client";
import {
  computeSummary,
  type GHRepo,
  type GHWorkflow,
  type GHWorkflowRun,
  type GHWorkflowListItem,
  type GHWorkflowDetail,
  type GHRunsSummary,
  type RunMutationAction,
  type WorkflowMutationAction,
  type RunStatus,
  type RunConclusion,
} from "./types";

// Re-export for API routes that import computeSummary from actions
export { computeSummary };

// ─── Raw GitHub API shapes ────────────────────────────────────────────────────

interface RawRun {
  id: number;
  name: string | null;
  head_branch: string | null;
  head_sha: string;
  run_number: number;
  run_attempt: number;
  event: string;
  status: RunStatus;
  conclusion: RunConclusion;
  workflow_id: number;
  html_url: string;
  created_at: string;
  updated_at: string;
  actor: { login: string; avatar_url: string } | null;
}

interface RawRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  default_branch: string;
  html_url: string;
}

interface RawWorkflow {
  id: number;
  name: string;
  path: string;
  state: GHWorkflow["state"];
  html_url: string;
  badge_url?: string;
  created_at?: string;
  updated_at?: string;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapRun(raw: RawRun, repoFullName: string, workflowName: string): GHWorkflowRun {
  const createdMs = new Date(raw.created_at).getTime();
  const updatedMs = new Date(raw.updated_at).getTime();
  const durationSec =
    raw.status === "completed" ? Math.round((updatedMs - createdMs) / 1000) : undefined;

  return {
    id: raw.id,
    name: raw.name,
    workflowName,
    workflowId: raw.workflow_id,
    repoFullName,
    headBranch: raw.head_branch,
    headSha: raw.head_sha,
    runNumber: raw.run_number,
    runAttempt: raw.run_attempt,
    event: raw.event,
    status: raw.status,
    conclusion: raw.conclusion,
    htmlUrl: raw.html_url,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    actor: raw.actor ? { login: raw.actor.login, avatarUrl: raw.actor.avatar_url } : null,
    durationSec,
  };
}

function mapRepo(raw: RawRepo): GHRepo {
  return {
    id: raw.id,
    name: raw.name,
    fullName: raw.full_name,
    owner: raw.owner.login,
    private: raw.private,
    defaultBranch: raw.default_branch,
    htmlUrl: raw.html_url,
  };
}

function mapWorkflow(raw: RawWorkflow, repoFullName: string): GHWorkflow {
  return {
    id: raw.id,
    name: raw.name,
    path: raw.path,
    state: raw.state,
    repoFullName,
    htmlUrl: raw.html_url,
  };
}

// ─── Repository functions ─────────────────────────────────────────────────────

/** List the most recently active repos (capped for speed). */
export async function listUserRepos(limit = 30): Promise<GHRepo[]> {
  const raw = await githubFetch<RawRepo[]>(
    `/user/repos?type=all&sort=pushed&per_page=${Math.min(limit, 100)}`,
  );
  return (Array.isArray(raw) ? raw : []).slice(0, limit).map(mapRepo);
}

// ─── Workflow functions ───────────────────────────────────────────────────────

/** List all workflows for a given repo. */
export async function listWorkflows(repoFullName: string): Promise<GHWorkflow[]> {
  const data = await githubFetch<{ workflows: RawWorkflow[] }>(
    `/repos/${repoFullName}/actions/workflows?per_page=100`,
  );
  return (data.workflows ?? []).map((w) => mapWorkflow(w, repoFullName));
}

/** List workflows as lightweight list items (for card grid). */
async function listWorkflowItems(repoFullName: string): Promise<GHWorkflowListItem[]> {
  const data = await githubFetch<{ workflows: RawWorkflow[] }>(
    `/repos/${repoFullName}/actions/workflows?per_page=100`,
  );
  return (data.workflows ?? []).map((w) => ({
    id: w.id,
    name: w.name,
    path: w.path,
    state: w.state,
    repoFullName,
    htmlUrl: w.html_url,
    badgeUrl: w.badge_url,
  }));
}

/**
 * Fetch workflows across all user repos — fast path (capped, parallel, timeouts).
 * Same performance pattern as listAllRuns.
 */
export async function fetchAllWorkflowsFast(
  limit = 30,
): Promise<GHWorkflowListItem[]> {
  const CONCURRENCY = 12;
  const PER_REPO_TIMEOUT_MS = 3_000;
  const MAX_TOTAL = 500;

  const repos = await listUserRepos(limit);
  const results: GHWorkflowListItem[] = [];

  async function fetchWithTimeout(repo: GHRepo): Promise<GHWorkflowListItem[]> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve([]), PER_REPO_TIMEOUT_MS);
      listWorkflowItems(repo.fullName)
        .then((wfs) => {
          clearTimeout(timer);
          resolve(wfs);
        })
        .catch(() => {
          clearTimeout(timer);
          resolve([]);
        });
    });
  }

  for (let i = 0; i < repos.length; i += CONCURRENCY) {
    const batch = repos.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(batch.map(fetchWithTimeout));
    for (const wfs of settled) results.push(...wfs);
    if (results.length >= MAX_TOTAL) break;
  }

  // active first, then alphabetical
  results.sort((a, b) => {
    if (a.state === "active" && b.state !== "active") return -1;
    if (a.state !== "active" && b.state === "active") return 1;
    return a.name.localeCompare(b.name);
  });

  return results.slice(0, MAX_TOTAL);
}

// ─── Workflow detail (drawer) ─────────────────────────────────────────────────

/** Get a single workflow's full metadata. */
export async function getWorkflow(
  repoFullName: string,
  workflowId: number,
): Promise<GHWorkflowDetail> {
  const raw = await githubFetch<RawWorkflow & { created_at?: string; updated_at?: string }>(
    `/repos/${repoFullName}/actions/workflows/${workflowId}`,
  );
  return {
    id: raw.id,
    name: raw.name,
    path: raw.path,
    state: raw.state,
    repoFullName,
    htmlUrl: raw.html_url,
    badgeUrl: raw.badge_url,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    recentRuns: [],
    yamlTruncated: false,
  };
}

/** List recent runs for a specific workflow (small page for drawer). */
export async function listWorkflowRuns(
  repoFullName: string,
  workflowId: number,
  perPage = 15,
): Promise<GHWorkflowRun[]> {
  const data = await githubFetch<{ workflow_runs: (RawRun & { name: string | null })[] }>(
    `/repos/${repoFullName}/actions/workflows/${workflowId}/runs?per_page=${perPage}`,
  );
  return (data.workflow_runs ?? []).map((r) =>
    mapRun(r, repoFullName, r.name ?? `Workflow #${r.workflow_id}`),
  );
}

/** Fetch the YAML source of a workflow file from the repo contents API. */
export async function getWorkflowFileContent(
  repoFullName: string,
  path: string,
): Promise<{ content: string; truncated: boolean }> {
  try {
    const data = await githubFetch<{
      content?: string;
      encoding?: string;
      size?: number;
    }>(`/repos/${repoFullName}/contents/${path}`);

    if (!data.content) return { content: "", truncated: false };

    if (data.encoding === "base64") {
      const decoded = Buffer.from(data.content, "base64").toString("utf-8");
      const isLarge = (data.size ?? 0) > 100_000;
      return { content: isLarge ? decoded.slice(0, 100_000) : decoded, truncated: isLarge };
    }

    return { content: data.content, truncated: false };
  } catch {
    return { content: "", truncated: false };
  }
}

/**
 * Parallel fetch of full workflow detail — metadata + runs + YAML.
 * Used by the drawer detail API endpoint.
 */
export async function getWorkflowDetail(
  repoFullName: string,
  workflowId: number,
): Promise<GHWorkflowDetail> {
  // First: get the workflow metadata (we need the path for the YAML fetch)
  let wf: GHWorkflowDetail;
  try {
    wf = await getWorkflow(repoFullName, workflowId);
  } catch {
    return {
      id: workflowId,
      name: `Workflow #${workflowId}`,
      path: "",
      state: "active",
      repoFullName,
      htmlUrl: `https://github.com/${repoFullName}/actions`,
      recentRuns: [],
      yamlTruncated: false,
    };
  }

  // Then: fetch runs + file content in parallel (both depend on metadata above)
  const [runs, file] = await Promise.allSettled([
    listWorkflowRuns(repoFullName, workflowId, 15),
    wf.path ? getWorkflowFileContent(repoFullName, wf.path) : Promise.resolve({ content: "", truncated: false }),
  ]);

  if (runs.status === "fulfilled") wf.recentRuns = runs.value;
  if (file.status === "fulfilled") {
    wf.yamlContent = file.value.content;
    wf.yamlTruncated = file.value.truncated;
  }

  return wf;
}

// ─── Runs functions ───────────────────────────────────────────────────────────

interface ListRunsOptions {
  /** Filter by status */
  status?: RunStatus;
  /** Max runs to return per repo */
  perPage?: number;
  /** ISO timestamp — only return runs created after this date */
  created?: string;
}

/** List recent workflow runs for a single repo. */
export async function listRepoRuns(
  repoFullName: string,
  options: ListRunsOptions = {},
): Promise<GHWorkflowRun[]> {
  const params = new URLSearchParams({ per_page: String(options.perPage ?? 50) });
  if (options.status) params.set("status", options.status);
  if (options.created) params.set("created", `>=${options.created}`);

  const data = await githubFetch<{ workflow_runs: (RawRun & { name: string | null })[] }>(
    `/repos/${repoFullName}/actions/runs?${params.toString()}`,
  );

  const runs = data.workflow_runs ?? [];

  // Build a local workflow name map from run data since `name` on the run IS the workflow name
  return runs.map((r) =>
    mapRun(r, repoFullName, r.name ?? `Workflow #${r.workflow_id}`),
  );
}

/**
 * Fetch runs across repos in parallel with a per-repo timeout.
 * Caps total repos and total runs to keep the response fast.
 */
export async function listAllRuns(
  repos: GHRepo[],
  options: ListRunsOptions = {},
): Promise<GHWorkflowRun[]> {
  const CONCURRENCY = 10;
  const PER_REPO_TIMEOUT_MS = 4_000;
  const MAX_TOTAL_RUNS = 200;
  const results: GHWorkflowRun[] = [];

  // Wrap each repo fetch with a timeout so one slow repo doesn't block everything
  async function fetchWithTimeout(repo: GHRepo): Promise<GHWorkflowRun[]> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve([]), PER_REPO_TIMEOUT_MS);
      listRepoRuns(repo.fullName, options)
        .then((runs) => {
          clearTimeout(timer);
          resolve(runs);
        })
        .catch(() => {
          clearTimeout(timer);
          resolve([]);
        });
    });
  }

  for (let i = 0; i < repos.length; i += CONCURRENCY) {
    const batch = repos.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(batch.map(fetchWithTimeout));
    for (const runs of settled) {
      results.push(...runs);
    }
    // Stop early if we already have enough runs
    if (results.length >= MAX_TOTAL_RUNS) break;
  }

  results.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return results.slice(0, MAX_TOTAL_RUNS);
}

// ─── Mutation functions ───────────────────────────────────────────────────────

/** Re-run all jobs in a workflow run. */
export async function rerunWorkflowRun(
  repoFullName: string,
  runId: number,
): Promise<void> {
  await githubFetch(`/repos/${repoFullName}/actions/runs/${runId}/rerun`, {
    method: "POST",
  });
}

/** Re-run only the failed jobs in a workflow run. */
export async function rerunFailedJobs(
  repoFullName: string,
  runId: number,
): Promise<void> {
  await githubFetch(
    `/repos/${repoFullName}/actions/runs/${runId}/rerun-failed-jobs`,
    { method: "POST" },
  );
}

/** Cancel an in-progress workflow run. */
export async function cancelWorkflowRun(
  repoFullName: string,
  runId: number,
): Promise<void> {
  await githubFetch(`/repos/${repoFullName}/actions/runs/${runId}/cancel`, {
    method: "POST",
  });
}

/** Manually dispatch a workflow (workflow_dispatch event). */
export async function dispatchWorkflow(
  repoFullName: string,
  workflowId: number | string,
  ref: string,
  inputs: Record<string, string> = {},
): Promise<void> {
  await githubFetch(
    `/repos/${repoFullName}/actions/workflows/${workflowId}/dispatches`,
    { method: "POST", body: { ref, inputs } },
  );
}

/** Disable a workflow. */
export async function disableWorkflow(
  repoFullName: string,
  workflowId: number,
): Promise<void> {
  await githubFetch(
    `/repos/${repoFullName}/actions/workflows/${workflowId}/disable`,
    { method: "PUT" },
  );
}

/** Enable a previously disabled workflow. */
export async function enableWorkflow(
  repoFullName: string,
  workflowId: number,
): Promise<void> {
  await githubFetch(
    `/repos/${repoFullName}/actions/workflows/${workflowId}/enable`,
    { method: "PUT" },
  );
}

/**
 * Get the download URL for run logs.
 * GitHub returns a 302 redirect to a zip; we return the Location URL.
 */
export async function getRunLogsUrl(
  repoFullName: string,
  runId: number,
): Promise<string> {
  const token = await getGithubToken();
  const res = await fetch(
    `https://api.github.com/repos/${repoFullName}/actions/runs/${runId}/logs`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      redirect: "manual",
    },
  );
  const location = res.headers.get("Location") ?? res.url;
  return location;
}

// Re-export mutation action types for use in route handlers
export type { RunMutationAction, WorkflowMutationAction };
