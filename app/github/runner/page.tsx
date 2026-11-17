"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RunConclusion, RunStatus } from "@/lib/github/types";
import type { RunnerJob, RunnerJobResult, RunnerSnapshot, RunnerSshAccess, RunnerState } from "@/lib/runner/types";
import { cn } from "@/lib/utils";
import { RunnerFleetPanel, type RunnerFleetSummary } from "@/components/github/runner-fleet";
import { RunnerSshAccessPanel } from "@/components/github/runner-ssh-access";
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
const RECENT_JOBS = 5;

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20";
const mono = "font-(family-name:--font-mono)";

type ResultFilter = "all" | "failure" | "success";

type TabId = "status" | "jobs" | "vms" | "ssh";

const TABS: { id: TabId; label: string }[] = [
  { id: "status", label: "Status" },
  { id: "jobs", label: "Jobs" },
  { id: "vms", label: "VMs" },
  { id: "ssh", label: "SSH access" },
];

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

function sshBadge(access: RunnerSshAccess | null): { text: string; className: string } | null {
  if (!access) return null;
  if (access.openToInternet) return { text: "Open", className: "bg-(--danger)/10 text-(--danger)" };
  if (access.allowed.length > 0) return { text: String(access.allowed.length), className: "bg-(--bg-muted) text-(--text-muted)" };
  return { text: "Closed", className: "bg-(--bg-muted) text-(--text-muted)" };
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "danger" | "success" }) {
  const color = tone === "danger" ? "var(--danger)" : tone === "success" ? "var(--success)" : "var(--text-primary)";
  return (
    <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-4 shadow-sm">
      <div className={`${mono} text-2xl font-light tabular-nums`} style={{ color }}>
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
      <dt className="text-[11px] text-(--text-faint)">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-(--text-secondary)">{children}</dd>
    </div>
  );
}

function StateDot({ state, size = "sm" }: { state: RunnerState; size?: "sm" | "md" }) {
  const color = STATE_META[state].color;
  const dim = size === "md" ? "h-3 w-3" : "h-2 w-2";
  return (
    <span className={cn("relative flex shrink-0", dim)} aria-hidden>
      {state === "busy" && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 motion-reduce:animate-none" style={{ backgroundColor: color }} />
      )}
      <span className={cn("relative inline-flex rounded-full", dim)} style={{ backgroundColor: color }} />
    </span>
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
          {job.result === "unknown" && <span className="text-[11px] text-(--text-faint)">no result logged</span>}
        </div>
        <div className="mt-0.5 truncate text-xs text-(--text-muted)">
          {job.workflow ?? "workflow unavailable"}
          {job.runNumber && ` · #${job.runNumber}`}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-(--text-muted)">
          {job.repo &&
            (runUrl ? (
              <a href={runUrl} target="_blank" rel="noopener noreferrer" className={`${mono} hover:text-(--accent) ${focusRing}`}>
                {job.repo} ↗
              </a>
            ) : (
              <span className={mono}>{job.repo}</span>
            ))}
          {ref && <span className={mono}>{ref}</span>}
          {job.actor && <span>{job.actor}</span>}
          {job.runner && (
            <span className="inline-flex items-center gap-1" title={`Ran on ${job.runner}`}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                <rect x="2" y="2.5" width="12" height="4.5" rx="1" />
                <rect x="2" y="9" width="12" height="4.5" rx="1" />
                <path d="M4.5 4.75h.01M4.5 11.25h.01" strokeLinecap="round" strokeWidth="2" />
              </svg>
              <span className="sr-only">Ran on </span>
              <span className={mono}>{job.runner}</span>
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right text-xs text-(--text-muted)">
        <div className={`${mono} tabular-nums text-(--text-secondary)`}>
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

function JobList({ jobs, empty }: { jobs: RunnerJob[]; empty: string }) {
  if (jobs.length === 0) {
    return (
      <p className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-4 py-8 text-center text-sm text-(--text-muted)">
        {empty}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-(--border-hairline) overflow-hidden rounded-xl border border-(--border-hairline) bg-(--bg-elevated) shadow-sm">
      {jobs.map((job) => (
        <JobRow key={job.id} job={job} />
      ))}
    </ul>
  );
}

function StatusSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-40 rounded-xl" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function ListSkeleton() {
  return <Skeleton className="h-64 rounded-xl" />;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function RunnerPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const requested = search.get("tab");
  const tab: TabId = TABS.some((t) => t.id === requested) ? (requested as TabId) : "status";

  const [snapshot, setSnapshot] = useState<RunnerSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [access, setAccess] = useState<RunnerSshAccess | null>(null);
  const [fleet, setFleet] = useState<RunnerFleetSummary | null>(null);
  const stateRef = useRef<RunnerState | null>(null);
  // Polling SSH while the NSG blocks this machine only produces 10s timeouts, so pause it.
  const sshBlocked = access?.myIpAllowed === false;
  const blockedRef = useRef(false);

  const openTab = useCallback(
    (id: TabId, focus = false) => {
      const sp = new URLSearchParams(search.toString());
      if (id === "status") sp.delete("tab");
      else sp.set("tab", id);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      if (focus) document.getElementById(`runner-tab-${id}`)?.focus();
    },
    [router, pathname, search],
  );

  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next =
      e.key === "ArrowRight" ? (i + 1) % TABS.length
      : e.key === "ArrowLeft" ? (i - 1 + TABS.length) % TABS.length
      : e.key === "Home" ? 0
      : e.key === "End" ? TABS.length - 1
      : null;
    if (next === null) return;
    e.preventDefault();
    openTab(TABS[next].id, true);
  };

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
      if (document.visibilityState === "visible" && !blockedRef.current) await load();
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

  // Resume right away once your IP is allowed.
  useEffect(() => {
    const wasBlocked = blockedRef.current;
    blockedRef.current = sshBlocked;
    if (wasBlocked && !sshBlocked) void load();
  }, [sshBlocked, load]);

  const counts = useMemo(() => {
    const all = snapshot?.jobs ?? [];
    return {
      all: all.length,
      failure: all.filter((j) => j.result === "failure").length,
      success: all.filter((j) => j.result === "success").length,
    };
  }, [snapshot]);

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
  const live = tab === "status" || tab === "jobs";
  const stale = Boolean(error || sshBlocked);

  const badges: Partial<Record<TabId, React.ReactNode>> = {
    jobs: snapshot ? (
      <span className={`rounded-lg bg-(--bg-muted) px-1.5 text-[10px] tabular-nums text-(--text-muted) ${mono}`}>{counts.all}</span>
    ) : null,
    vms: fleet ? (
      <span className="flex items-center gap-1">
        {fleet.running > 0 && (
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-(--accent) motion-reduce:animate-none" title="Operation in progress" aria-label="Operation in progress" />
        )}
        {fleet.vms !== null && (
          <span className={`rounded-lg bg-(--bg-muted) px-1.5 text-[10px] tabular-nums text-(--text-muted) ${mono}`}>{fleet.vms}</span>
        )}
      </span>
    ) : null,
    ssh: (() => {
      const b = sshBadge(access);
      return b ? <span className={cn("rounded-lg px-1.5 text-[10px] font-medium tabular-nums", b.className)}>{b.text}</span> : null;
    })(),
  };

  // Shown on the two tabs that read the runner over SSH.
  const liveNotices = (
    <>
      {sshBlocked && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-(--border-hairline) bg-(--bg-surface) px-4 py-3 text-sm text-(--text-secondary)">
          <span>Live status is paused. Flightdeck reads the runner over SSH, and the VM&apos;s firewall blocks your IP.</span>
          <button type="button" onClick={() => openTab("ssh")} className={`shrink-0 text-xs font-medium text-(--accent) underline ${focusRing}`}>
            Allow your IP
          </button>
        </div>
      )}
      {error && !sshBlocked && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-(--danger)/20 bg-(--danger)/5 px-4 py-3 text-sm text-(--danger)">
          <span>
            {snapshot ? "Could not refresh. Showing the last known state. " : ""}
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
    </>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-(family-name:--font-display) text-2xl font-medium text-(--text-primary)">Self-hosted runner</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-(--text-muted)" aria-live="polite">
              {snapshot && meta ? (
                <>
                  <StateDot state={snapshot.state} />
                  <span className="font-medium" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                  <span className={mono}>{snapshot.runnerName ?? "runner"}</span>
                  <span className="text-(--text-faint)">
                    {stale ? "last seen" : "updated"} {relativeTime(snapshot.collectedAt)}
                  </span>
                </>
              ) : sshBlocked ? (
                "Paused until your IP can reach SSH"
              ) : (
                "Connecting to the Azure VM…"
              )}
            </p>
          </div>
          {live && (
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || sshBlocked}
              className={`rounded-lg border border-(--border) bg-(--bg-surface) p-1.5 text-(--text-muted) transition-colors hover:bg-(--bg-hover) hover:text-(--accent) disabled:opacity-50 ${focusRing}`}
              aria-label="Refresh runner status"
              title="Refresh runner status"
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
          )}
        </div>

        {/* Hairline is an inset shadow, not a border, so the active underline covers it without overflowing the scroller. */}
        <nav
          role="tablist"
          aria-label="Runner views"
          onKeyDown={onTabKey}
          className="flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--border-hairline)]"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`runner-tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              aria-controls={`runner-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => openTab(t.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
                focusRing,
                tab === t.id
                  ? "border-(--accent) font-medium text-(--text-primary)"
                  : "border-transparent text-(--text-muted) hover:text-(--text-primary)",
              )}
            >
              {t.label}
              {badges[t.id]}
            </button>
          ))}
        </nav>
      </header>

      {/* Every panel stays mounted so drafts, polling and in-flight operations survive switching tabs. */}
      <section id="runner-panel-status" role="tabpanel" aria-labelledby="runner-tab-status" hidden={tab !== "status"} className="space-y-6">
        {liveNotices}
        {!snapshot ? (
          loading && !sshBlocked ? <StatusSkeleton /> : null
        ) : (
          <>
            <div className={cn("rounded-xl border border-(--border-hairline) bg-(--bg-elevated) p-5 shadow-sm", stale && "opacity-60")}>
              <div className="flex items-start gap-4">
                <span className="mt-1.5">
                  <StateDot state={snapshot.state} size="md" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <h2 className="text-base font-semibold text-(--text-primary)">{meta!.label}</h2>
                    <span className={`${mono} text-xs text-(--text-muted)`}>{snapshot.runnerName ?? "runner"}</span>
                  </div>
                  {snapshot.currentJob ? (
                    <p className="mt-1 text-sm text-(--text-secondary)">
                      {snapshot.currentJob.name}
                      {snapshot.currentJob.repo && <span className={`${mono} text-(--text-muted)`}> · {snapshot.currentJob.repo}</span>}
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
            </div>

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

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-(--text-primary)">Recent jobs</h2>
                {snapshot.jobs.length > RECENT_JOBS && (
                  <button type="button" onClick={() => openTab("jobs")} className={`text-xs text-(--text-muted) hover:text-(--accent) ${focusRing}`}>
                    See all {snapshot.jobs.length} jobs
                  </button>
                )}
              </div>
              <JobList jobs={snapshot.jobs.slice(0, RECENT_JOBS)} empty="No jobs found in the runner logs." />
            </div>
          </>
        )}
      </section>

      <section id="runner-panel-jobs" role="tabpanel" aria-labelledby="runner-tab-jobs" hidden={tab !== "jobs"} className="space-y-4">
        {liveNotices}
        {!snapshot ? (
          loading && !sshBlocked ? <ListSkeleton /> : null
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-(--text-muted)">
                From the logs on <span className={mono}>{snapshot.runnerName ?? "the runner VM"}</span>
                {stats?.oldestAt && `. Oldest kept job started ${relativeTime(stats.oldestAt)}`}.
                {fleet?.vms !== null && fleet !== null && fleet.vms > 1 && (
                  <> Jobs on your other {fleet.vms - 1 === 1 ? "VM are" : `${fleet.vms - 1} VMs are`} not listed here.</>
                )}
              </p>
              <div className="flex gap-1" role="group" aria-label="Filter by result">
                {(["all", "failure", "success"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    aria-pressed={filter === f}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                      focusRing,
                      filter === f
                        ? "border-(--accent)/40 bg-(--accent-muted) text-(--accent)"
                        : "border-(--border-hairline) bg-(--bg-elevated) text-(--text-secondary) hover:bg-(--bg-hover)",
                    )}
                  >
                    {f === "all" ? "All" : f === "failure" ? "Failed" : "Succeeded"}
                    <span className={`${mono} tabular-nums opacity-70`}>{counts[f]}</span>
                  </button>
                ))}
              </div>
            </div>
            <JobList jobs={jobs} empty={snapshot.jobs.length === 0 ? "No jobs found in the runner logs." : "No jobs match this filter."} />
          </>
        )}
      </section>

      <section id="runner-panel-vms" role="tabpanel" aria-labelledby="runner-tab-vms" hidden={tab !== "vms"}>
        <RunnerFleetPanel onSummary={setFleet} />
      </section>

      <section id="runner-panel-ssh" role="tabpanel" aria-labelledby="runner-tab-ssh" hidden={tab !== "ssh"}>
        <RunnerSshAccessPanel onAccess={setAccess} />
      </section>
    </div>
  );
}

// useSearchParams must sit under Suspense for static generation.
export default function RunnerPage() {
  return (
    <Suspense fallback={<StatusSkeleton />}>
      <RunnerPageInner />
    </Suspense>
  );
}
