export type RunStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "waiting"
  | "requested"
  | "pending";

export type RunConclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | "neutral"
  | "startup_failure"
  | null;

export interface GHRepo {
  id: number;
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
}

export interface GHActor {
  login: string;
  avatarUrl: string;
}

export interface GHWorkflowRun {
  id: number;
  name: string | null;
  workflowName: string;
  workflowId: number;
  repoFullName: string;
  headBranch: string | null;
  headSha: string;
  status: RunStatus;
  conclusion: RunConclusion;
  event: string;
  createdAt: string;
  updatedAt: string;
  runAttempt: number;
  htmlUrl: string;
  runNumber: number;
  actor: GHActor | null;
  durationSec?: number;
}

export interface GHWorkflow {
  id: number;
  name: string;
  path: string;
  state: "active" | "deleted" | "disabled_fork" | "disabled_inactivity" | "disabled_manually";
  repoFullName: string;
  htmlUrl: string;
}

export interface GHRunsSummary {
  total: number;
  inProgress: number;
  queued: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  avgDurationSec: number;
  failureRate: number;
}

export interface GHRunsResponse {
  runs: GHWorkflowRun[];
  summary: GHRunsSummary;
  repos: string[];
  workflows: string[];
}

export type RunMutationAction =
  | "rerun"
  | "rerun-failed"
  | "cancel";

export type WorkflowMutationAction =
  | "dispatch"
  | "enable"
  | "disable";

/** One `workflow_dispatch` input from workflow YAML (`on.workflow_dispatch.inputs`). */
export interface WorkflowDispatchInputSpec {
  name: string;
  description?: string;
  required?: boolean;
  default?: string | boolean | number;
  /** GitHub: choice | boolean | string | number | environment */
  type?: string;
  options?: string[];
}

/** Returned by GET `/api/github/actions/workflows/dispatch-schema` (client-safe JSON). */
export interface WorkflowDispatchSchemaResponse {
  hasWorkflowDispatch: boolean;
  inputs: WorkflowDispatchInputSpec[];
  /** Repo default branch — use as initial ref when dispatching */
  suggestedRef?: string;
  /** YAML parse failures only */
  parseError?: string;
}

// ─── Workflow list / detail DTOs (client-safe) ───────────────────────────────

export type WorkflowState =
  | "active"
  | "deleted"
  | "disabled_fork"
  | "disabled_inactivity"
  | "disabled_manually";

/** Minimal card fields for the workflow grid — no YAML, no runs. */
export interface GHWorkflowListItem {
  id: number;
  name: string;
  path: string;
  state: WorkflowState;
  repoFullName: string;
  htmlUrl: string;
  badgeUrl?: string;
  /** Optional; may be filled by client cross-reference with global runs. */
  lastRunStatus?: RunStatus;
  lastRunConclusion?: RunConclusion;
  lastRunAt?: string;
}

/** Full workflow detail for the drawer — includes recent runs + optional YAML. */
export interface GHWorkflowDetail {
  id: number;
  name: string;
  path: string;
  state: WorkflowState;
  repoFullName: string;
  htmlUrl: string;
  badgeUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  recentRuns: GHWorkflowRun[];
  yamlContent?: string;
  yamlTruncated: boolean;
}

// ─── Pure summary computation (client-safe, no Node.js deps) ─────────────────

export function computeSummary(runs: GHWorkflowRun[]): GHRunsSummary {
  let inProgress = 0;
  let queued = 0;
  let succeeded = 0;
  let failed = 0;
  let cancelled = 0;
  let totalDurationSec = 0;
  let completedCount = 0;

  for (const run of runs) {
    if (run.status === "in_progress") inProgress++;
    else if (
      run.status === "queued" ||
      run.status === "waiting" ||
      run.status === "pending" ||
      run.status === "requested"
    )
      queued++;

    if (run.conclusion === "success") succeeded++;
    else if (
      run.conclusion === "failure" ||
      run.conclusion === "timed_out" ||
      run.conclusion === "startup_failure"
    )
      failed++;
    else if (run.conclusion === "cancelled") cancelled++;

    if (run.durationSec !== undefined) {
      totalDurationSec += run.durationSec;
      completedCount++;
    }
  }

  const avgDurationSec =
    completedCount > 0 ? Math.round(totalDurationSec / completedCount) : 0;
  const finishedRuns = succeeded + failed + cancelled;
  const failureRate =
    finishedRuns > 0 ? Math.round((failed / finishedRuns) * 100) : 0;

  return {
    total: runs.length,
    inProgress,
    queued,
    succeeded,
    failed,
    cancelled,
    avgDurationSec,
    failureRate,
  };
}
