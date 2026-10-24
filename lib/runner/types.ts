/** Client-safe DTOs for the self-hosted GitHub Actions runner on the Azure VM. */

export type RunnerState = "busy" | "idle" | "offline";

export type RunnerJobResult =
  | "running"
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  | "unknown";

export interface RunnerJob {
  /** Runner plan id — unique per job execution. */
  id: string;
  name: string | null;
  repo: string | null;
  workflow: string | null;
  runId: string | null;
  runNumber: string | null;
  runAttempt: string | null;
  event: string | null;
  ref: string | null;
  sha: string | null;
  actor: string | null;
  result: RunnerJobResult;
  /** ISO-8601 UTC */
  startedAt: string | null;
  /** ISO-8601 UTC; null while running */
  completedAt: string | null;
  durationSec: number | null;
}

export interface RunnerHistoryStats {
  total: number;
  success: number;
  failure: number;
  last24h: number;
  avgDurationSec: number | null;
  /** Oldest job still present in the runner's _diag logs. */
  oldestAt: string | null;
}

export interface RunnerSnapshot {
  collectedAt: string;
  state: RunnerState;
  runnerName: string | null;
  runnerUrl: string | null;
  runnerVersion: string | null;
  hostname: string | null;
  /** How the listener is supervised (pm2 app), if any. */
  supervisor: { name: string | null; status: string | null; restarts: number | null } | null;
  listenerUptimeSec: number | null;
  vm: {
    uptimeSec: number | null;
    load: number[];
    memTotal: number | null;
    memAvailable: number | null;
    diskTotal: number | null;
    diskFree: number | null;
  };
  currentJob: RunnerJob | null;
  jobs: RunnerJob[];
  stats: RunnerHistoryStats;
}

export type RunnerHostSource = "settings" | "env" | null;
export type RunnerUserSource = "settings" | "env" | "default";

/** Settings-page view of the runner VM connection (never includes the password). */
export interface RunnerConfigView {
  /** Overrides saved from Settings; empty string when none. */
  saved: { host: string; user: string };
  effective: {
    host: string | null;
    hostSource: RunnerHostSource;
    user: string;
    userSource: RunnerUserSource;
  };
  hasPassword: boolean;
}
