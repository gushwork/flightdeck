import type {
  RunnerHistoryStats,
  RunnerJob,
  RunnerJobResult,
  RunnerSnapshot,
  RunnerState,
} from "./types";

/** Shape printed by the remote snapshot script (see `remote-script.ts`). */
export interface RawWorkerLog {
  file: string;
  startedAt: string | null;
  endedAt: string | null;
  finished: boolean;
  version?: string | null;
  planId?: string | null;
  name?: string | null;
  repo?: string | null;
  workflow?: string | null;
  runId?: string | null;
  runNumber?: string | null;
  runAttempt?: string | null;
  event?: string | null;
  ref?: string | null;
  sha?: string | null;
  actor?: string | null;
}

export interface RawSnapshot {
  collectedAt: number;
  hostname: string | null;
  vmUptimeSec: number | null;
  load: number[];
  memTotal: number | null;
  memAvailable: number | null;
  diskTotal: number | null;
  diskFree: number | null;
  runnerName: string | null;
  runnerUrl: string | null;
  listener: { pid: number; elapsedSec: number } | null;
  worker: { pid: number; elapsedSec: number } | null;
  pm2: { name: string | null; status: string | null; restarts: number | null } | null;
  runnerEvents: string[];
  workers: RawWorkerLog[];
}

interface RunnerEvent {
  planId: string;
  name: string | null;
  startedAt: string | null;
  completedAt: string | null;
  result: RunnerJobResult | null;
}

const STAMP = String.raw`\[(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)Z `;
const RECEIVED = new RegExp(`^${STAMP}.*Job request 0 for plan (\\S+) job \\S+ received\\.`);
const RUNNING = new RegExp(`^${STAMP}.*WRITE LINE: .*Running job: (.*)$`);
const COMPLETED = new RegExp(`^${STAMP}.*WRITE LINE: .*Job (.*) completed with result: (\\S+)\\s*$`);

/** Runner logs stamp UTC as `YYYY-MM-DD HH:MM:SS` (a trailing Z is stripped by the regexes). */
export function toIso(stamp: string | null | undefined): string | null {
  if (!stamp) return null;
  const d = new Date(`${stamp.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function normalizeResult(raw: string): RunnerJobResult {
  switch (raw.toLowerCase()) {
    case "succeeded":
      return "success";
    case "failed":
    case "abandoned":
      return "failure";
    case "canceled":
    case "cancelled":
      return "cancelled";
    case "skipped":
      return "skipped";
    default:
      return "unknown";
  }
}

/**
 * Pairs each `Job request … received` line with the `Running job` and
 * `completed with result` lines that follow it.
 */
export function parseRunnerEvents(lines: string[]): RunnerEvent[] {
  const events: RunnerEvent[] = [];
  let cur: RunnerEvent | null = null;

  for (const line of lines) {
    const received = RECEIVED.exec(line);
    if (received) {
      cur = { planId: received[2], name: null, startedAt: toIso(received[1]), completedAt: null, result: null };
      events.push(cur);
      continue;
    }
    if (!cur) continue;

    const running = RUNNING.exec(line);
    if (running) {
      cur.name = running[2].trim();
      cur.startedAt = toIso(running[1]);
      continue;
    }
    const completed = COMPLETED.exec(line);
    if (completed) {
      cur.completedAt = toIso(completed[1]);
      cur.result = normalizeResult(completed[3]);
      cur = null;
    }
  }
  return events;
}

function secondsBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  return Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));
}

export function buildJobs(raw: RawSnapshot): RunnerJob[] {
  const byPlan = new Map(parseRunnerEvents(raw.runnerEvents).map((e) => [e.planId, e]));
  const jobs: RunnerJob[] = [];
  const seen = new Set<string>();
  const busy = raw.worker !== null;
  const newestWorkerFile = raw.workers.at(-1)?.file;

  for (const w of raw.workers) {
    const ev = w.planId ? byPlan.get(w.planId) : undefined;
    if (w.planId) seen.add(w.planId);

    const startedAt = ev?.startedAt ?? toIso(w.startedAt);
    let completedAt = ev?.completedAt ?? null;
    let result: RunnerJobResult;
    if (ev?.result) {
      result = ev.result;
    } else if (!w.finished && busy && w.file === newestWorkerFile) {
      result = "running";
    } else {
      // Worker exited without a logged result (runner killed, or Runner log pruned).
      result = "unknown";
      completedAt = completedAt ?? toIso(w.endedAt);
    }

    jobs.push({
      id: w.planId ?? w.file,
      name: ev?.name ?? w.name ?? null,
      repo: w.repo ?? null,
      workflow: w.workflow ?? null,
      runId: w.runId ?? null,
      runNumber: w.runNumber ?? null,
      runAttempt: w.runAttempt ?? null,
      event: w.event ?? null,
      ref: w.ref ?? null,
      sha: w.sha ?? null,
      actor: w.actor ?? null,
      result,
      startedAt,
      completedAt,
      durationSec: secondsBetween(startedAt, completedAt),
    });
  }

  // Jobs whose Worker log has already been pruned but still appear in Runner logs.
  for (const ev of byPlan.values()) {
    if (seen.has(ev.planId)) continue;
    jobs.push({
      id: ev.planId,
      name: ev.name,
      repo: null,
      workflow: null,
      runId: null,
      runNumber: null,
      runAttempt: null,
      event: null,
      ref: null,
      sha: null,
      actor: null,
      result: ev.result ?? "unknown",
      startedAt: ev.startedAt,
      completedAt: ev.completedAt,
      durationSec: secondsBetween(ev.startedAt, ev.completedAt),
    });
  }

  return jobs.sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
}

export function computeStats(jobs: RunnerJob[], nowMs: number): RunnerHistoryStats {
  const dayAgo = nowMs - 24 * 3600 * 1000;
  const durations = jobs
    .filter((j) => j.result !== "running" && j.durationSec !== null)
    .map((j) => j.durationSec as number);
  const startedTimes = jobs.map((j) => j.startedAt).filter((s): s is string => s !== null);

  return {
    total: jobs.length,
    success: jobs.filter((j) => j.result === "success").length,
    failure: jobs.filter((j) => j.result === "failure").length,
    last24h: jobs.filter((j) => j.startedAt && Date.parse(j.startedAt) >= dayAgo).length,
    avgDurationSec: durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null,
    oldestAt: startedTimes.length ? startedTimes.reduce((a, b) => (a < b ? a : b)) : null,
  };
}

export function buildSnapshot(raw: RawSnapshot): RunnerSnapshot {
  const jobs = buildJobs(raw);
  const state: RunnerState = !raw.listener ? "offline" : raw.worker ? "busy" : "idle";
  const latestVersion = [...raw.workers].reverse().find((w) => w.version)?.version ?? null;

  return {
    collectedAt: new Date(raw.collectedAt).toISOString(),
    state,
    runnerName: raw.runnerName,
    runnerUrl: raw.runnerUrl,
    runnerVersion: latestVersion,
    hostname: raw.hostname,
    supervisor: raw.pm2,
    listenerUptimeSec: raw.listener?.elapsedSec ?? null,
    vm: {
      uptimeSec: raw.vmUptimeSec,
      load: raw.load,
      memTotal: raw.memTotal,
      memAvailable: raw.memAvailable,
      diskTotal: raw.diskTotal,
      diskFree: raw.diskFree,
    },
    currentJob: jobs.find((j) => j.result === "running") ?? null,
    jobs,
    stats: computeStats(jobs, raw.collectedAt),
  };
}
