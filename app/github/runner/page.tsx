"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RunConclusion, RunStatus } from "@/lib/github/types";
import type { RunnerJob, RunnerJobResult, RunnerSnapshot, RunnerState } from "@/lib/runner/types";
import {
  ElapsedTimer,
  EventBadge,
  StatusIcon,
  formatDuration,
  relativeTime,
} from "@/components/github/run-utils";
import { Skeleton } from "@/components/layout/loading-skeleton";

const POLL_BUSY_MS = 8_000;
const POLL_IDLE_MS = 15_000;

type ResultFilter = "all" | "failure" | "success";

const STATE_META: Record<RunnerState, { label: string; color: string; hint: string }> = {
  busy: { label: "Busy", color: "var(--accent)", hint: "Running a job" },
  idle: { label: "Idle", color: "var(--success)", hint: "Online, waiting for jobs" },
  offline: { label: "Offline", color: "var(--danger)", hint: "Runner listener is not running on the VM" },
};

function iconFor(result: RunnerJobResult): { status: RunStatus; conclusion: RunConclusion } {
  switch (result) {
    case "running":
      return { status: "in_progress", conclusion: null };
    case "success":
    case "failure":
    case "cancelled":
    case "skipped":
      return { status: "completed", conclusion: result };
    default:
      return { status: "completed", conclusion: null };
  }
}

function formatUptime(sec: number | null): string {
  if (sec === null) return "—";
  const days = Math.floor(sec / 86_400);
  return days > 0 ? `${days}d ${formatDuration(sec % 86_400)}` : formatDuration(sec);
}

function gb(bytes: number | null): string {
  return bytes === null ? "—" : `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function usedPercent(total: number | null, free: number | null): number | null {
  return total && free !== null ? Math.round(((total - free) / total) * 100) : null;
}

function shortRef(ref: string | null): string | null {
  return ref ? ref.replace(/^refs\/(heads|tags)\//, "") : null;
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "danger" | "success" }) {
  const color = tone === "danger" ? "var(--danger)" : tone === "success" ? "var(--success)" : "var(--text-primary)";
  return (
    <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-4 shadow-sm">
      <div className="font-(family-name:--font-mono) text-2xl font-light tabular-nums" style={{ color }}>
        {value}
      </div>
      <div className="mt-1 text-xs font-medium text-(--text-secondary)">{label}</div>
      {sub && <div className="text-[11px] text-(--text-faint)">{sub}</div>}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-(--text-faint)">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-(--text-secondary)">{children}</dd>
    </div>
  );
}

function JobRow({ job }: { job: RunnerJob }) {
  const { status, conclusion } = iconFor(job.result);
  const runUrl = job.repo && job.runId ? `https://github.com/${job.repo}/actions/runs/${job.runId}` : null;
  const ref = shortRef(job.ref);

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="mt-0.5 shrink-0">
        <StatusIcon status={status} conclusion={conclusion} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium text-(--text-primary)">{job.name ?? "Unnamed job"}</span>
          {job.event && <EventBadge event={job.event} />}
          {job.result === "unknown" && (
            <span className="text-[11px] text-(--text-faint)">no result logged</span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-(--text-muted)">
          {job.workflow ?? "workflow unavailable"}
          {job.runNumber && ` · #${job.runNumber}`}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-(--text-muted)">
          {job.repo &&
            (runUrl ? (
              <a
                href={runUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-(family-name:--font-mono) hover:text-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
              >
                {job.repo} ↗
              </a>
            ) : (
              <span className="font-(family-name:--font-mono)">{job.repo}</span>
            ))}
          {ref && <span className="font-(family-name:--font-mono)">{ref}</span>}
          {job.actor && <span>{job.actor}</span>}
        </div>
      </div>
      <div className="shrink-0 text-right text-xs text-(--text-muted)">
        <div className="font-(family-name:--font-mono) tabular-nums text-(--text-secondary)">
          {job.result === "running" && job.startedAt ? (
            <ElapsedTimer startedAt={job.startedAt} />
          ) : job.durationSec !== null ? (
            formatDuration(job.durationSec)
          ) : (
            "—"
          )}
        </div>
        <div className="mt-0.5" title={job.startedAt ?? undefined}>
          {job.startedAt ? relativeTime(job.startedAt) : "—"}
        </div>
      </div>
    </li>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-40 rounded-xl" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RunnerPage() {
  const [snapshot, setSnapshot] = useState<RunnerSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ResultFilter>("all");
  const stateRef = useRef<RunnerState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/github/runner", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { snapshot?: RunnerSnapshot; error?: string };
      if (!res.ok || !data.snapshot) throw new Error(data.error ?? `HTTP ${res.status}`);
      stateRef.current = data.snapshot.state;
      setSnapshot(data.snapshot);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Smart polling: faster while a job runs, paused while the tab is hidden.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const tick = async () => {
      if (document.visibilityState === "visible") await load();
      if (cancelled) return;
      timer = setTimeout(() => void tick(), stateRef.current === "busy" ? POLL_BUSY_MS : POLL_IDLE_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void tick();
      }
    };

    void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const jobs = useMemo(() => {
    if (!snapshot) return [];
    if (filter === "all") return snapshot.jobs;
    return snapshot.jobs.filter((j) => j.result === filter);
  }, [snapshot, filter]);

  const stats = snapshot?.stats;
  const finished = stats ? stats.success + stats.failure : 0;
  const successRate = stats && finished > 0 ? Math.round((stats.success / finished) * 100) : null;
  const meta = snapshot ? STATE_META[snapshot.state] : null;
  const memUsed = snapshot ? usedPercent(snapshot.vm.memTotal, snapshot.vm.memAvailable) : null;
  const diskUsed = snapshot ? usedPercent(snapshot.vm.diskTotal, snapshot.vm.diskFree) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-(family-name:--font-display) text-2xl font-medium text-(--text-primary)">
            Self-hosted runner
          </h1>
          <p className="mt-0.5 text-xs text-(--text-muted)">
            {snapshot ? `Updated ${relativeTime(snapshot.collectedAt)}` : "Connecting to the Azure VM…"}
            {loading && snapshot && <span className="ml-2 text-[11px]">Refreshing</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-(--border) bg-(--bg-surface) p-1.5 text-(--text-muted) transition-colors hover:bg-(--bg-hover) hover:text-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20 disabled:opacity-50"
          aria-label="Refresh runner status"
          title="Refresh"
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

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-(--danger)/20 bg-(--danger)/5 px-4 py-3 text-sm text-(--danger)">
          <span>
            {snapshot ? "Could not refresh — showing the last known state. " : ""}
            {error}
          </span>
          <span className="flex shrink-0 gap-3">
            <Link href="/settings" className="underline">
              Runner VM settings
            </Link>
            <button type="button" onClick={() => void load()} className="underline">
              Retry
            </button>
          </span>
        </div>
      )}

      {!snapshot ? (
        loading ? <PageSkeleton /> : null
      ) : (
        <>
          {/* Live status */}
          <section
            aria-label="Runner status"
            className={`rounded-xl border border-(--border-hairline) bg-(--bg-elevated) p-5 shadow-sm ${error ? "opacity-60" : ""}`}
          >
            <div className="flex items-start gap-4">
              <span className="relative mt-1.5 flex h-3 w-3 shrink-0" aria-hidden>
                {snapshot.state === "busy" && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70" style={{ backgroundColor: meta!.color }} />
                )}
                <span className="relative inline-flex h-3 w-3 rounded-full" style={{ backgroundColor: meta!.color }} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <h2 className="text-base font-semibold text-(--text-primary)">{meta!.label}</h2>
                  <span className="font-(family-name:--font-mono) text-xs text-(--text-muted)">
                    {snapshot.runnerName ?? "runner"}
                  </span>
                </div>
                {snapshot.currentJob ? (
                  <p className="mt-1 text-sm text-(--text-secondary)">
                    {snapshot.currentJob.name}
                    {snapshot.currentJob.repo && (
                      <span className="font-(family-name:--font-mono) text-(--text-muted)"> · {snapshot.currentJob.repo}</span>
                    )}
                    {snapshot.currentJob.startedAt && (
                      <span className="ml-2 text-(--text-muted)">
                        for <ElapsedTimer startedAt={snapshot.currentJob.startedAt} />
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-(--text-muted)">{meta!.hint}</p>
                )}
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-(--border-hairline) pt-4 sm:grid-cols-4">
              <Detail label="Host">{snapshot.hostname ?? "—"}</Detail>
              <Detail label="Registered to">
                {snapshot.runnerUrl ? snapshot.runnerUrl.replace("https://github.com/", "") : "—"}
              </Detail>
              <Detail label="Runner version">{snapshot.runnerVersion ?? "—"}</Detail>
              <Detail label="Listener up">{formatUptime(snapshot.listenerUptimeSec)}</Detail>
              <Detail label="Supervisor">
                {snapshot.supervisor
                  ? `pm2 ${snapshot.supervisor.name ?? ""} · ${snapshot.supervisor.status ?? "?"}`
                  : "none detected"}
              </Detail>
              <Detail label="Restarts">{snapshot.supervisor?.restarts ?? "—"}</Detail>
              <Detail label="VM uptime">{formatUptime(snapshot.vm.uptimeSec)}</Detail>
              <Detail label="Load (1/5/15m)">{snapshot.vm.load.length ? snapshot.vm.load.join(" / ") : "—"}</Detail>
            </dl>
          </section>

          {/* VM + history stats */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat
              label="Memory used"
              value={memUsed === null ? "—" : `${memUsed}%`}
              sub={`${gb(snapshot.vm.memAvailable)} free of ${gb(snapshot.vm.memTotal)}`}
              tone={memUsed !== null && memUsed >= 90 ? "danger" : undefined}
            />
            <Stat
              label="Disk used"
              value={diskUsed === null ? "—" : `${diskUsed}%`}
              sub={`${gb(snapshot.vm.diskFree)} free of ${gb(snapshot.vm.diskTotal)}`}
              tone={diskUsed !== null && diskUsed >= 85 ? "danger" : undefined}
            />
            <Stat label="Jobs (24h)" value={String(stats!.last24h)} sub={`${stats!.total} in retained logs`} />
            <Stat
              label="Success rate"
              value={successRate === null ? "—" : `${successRate}%`}
              sub={stats!.avgDurationSec !== null ? `avg ${formatDuration(stats!.avgDurationSec)}` : undefined}
              tone={successRate === null ? undefined : successRate < 80 ? "danger" : "success"}
            />
          </div>

          {/* Run history */}
          <section aria-labelledby="runner-history-heading">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="runner-history-heading" className="text-sm font-semibold text-(--text-primary)">
                Run history
              </h2>
              <div className="flex gap-1" role="group" aria-label="Filter by result">
                {(["all", "failure", "success"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    aria-pressed={filter === f}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20 ${
                      filter === f
                        ? "border-(--accent)/40 bg-(--accent-muted) text-(--accent)"
                        : "border-(--border-hairline) bg-(--bg-elevated) text-(--text-secondary) hover:bg-(--bg-hover)"
                    }`}
                  >
                    {f === "all" ? "All" : f === "failure" ? "Failed" : "Succeeded"}
                  </button>
                ))}
              </div>
            </div>

            {jobs.length === 0 ? (
              <p className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-4 py-8 text-center text-sm text-(--text-muted)">
                {snapshot.jobs.length === 0 ? "No jobs found in the runner logs." : "No jobs match this filter."}
              </p>
            ) : (
              <ul className="divide-y divide-(--border-hairline) overflow-hidden rounded-xl border border-(--border-hairline) bg-(--bg-elevated) shadow-sm">
                {jobs.map((job) => (
                  <JobRow key={job.id} job={job} />
                ))}
              </ul>
            )}
            {stats?.oldestAt && (
              <p className="mt-2 text-[11px] text-(--text-faint)">
                History comes from the runner&apos;s _diag logs on the VM; oldest retained job started {relativeTime(stats.oldestAt)}.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
