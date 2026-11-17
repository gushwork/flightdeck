"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { relativeTime } from "@/components/github/run-utils";
import { hostedLabels, parseLabels } from "@/lib/runner/fleet-plan";
import type { GhRunnerInfo, RunnerFleet, RunnerFleetAction, RunnerOperation, RunnerVm } from "@/lib/runner/types";

const API = "/api/github/runner/fleet";
const OPS_POLL_MS = 5_000;
const FLEET_POLL_MS = 30_000;

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20";
const mono = "font-(family-name:--font-mono)";
const inputClass = `w-full rounded-md border border-(--border) bg-(--bg-field) px-3 py-2 text-sm text-(--text-primary) outline-none transition-colors focus:border-(--accent) ${focusRing}`;
const primaryButton = `rounded-lg bg-(--accent) px-3.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;
const secondaryButton = `rounded-lg border border-(--border) bg-(--bg-surface) px-3 py-1.5 text-xs font-medium text-(--text-secondary) transition-colors hover:bg-(--bg-hover) disabled:opacity-50 ${focusRing}`;
const dangerButton = `rounded-lg border border-(--danger)/30 px-3 py-1.5 text-xs font-medium text-(--danger) transition-colors hover:bg-(--danger)/5 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;
const dangerSolid = `rounded-lg bg-(--danger) px-3.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

const isRunning = (o: RunnerOperation) => o.status === "running";

function runnerStatus(runner: GhRunnerInfo | null): { label: string; color: string } {
  if (!runner) return { label: "Not registered", color: "var(--text-faint)" };
  if (runner.status === "offline") return { label: "Offline", color: "var(--danger)" };
  return runner.busy ? { label: "Busy", color: "var(--accent)" } : { label: "Idle", color: "var(--success)" };
}

async function post(body: RunnerFleetAction): Promise<{ operation?: RunnerOperation }> {
  const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { operation?: RunnerOperation; error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

async function fetchFleet(): Promise<RunnerFleet> {
  const res = await fetch(API, { cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as { fleet?: RunnerFleet; error?: string };
  if (!res.ok || !data.fleet) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.fleet;
}

function Labels({ labels }: { labels: string[] }) {
  if (!labels.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {labels.map((l) => (
        <span key={l} className={`rounded border border-(--border-hairline) px-1.5 py-px text-[11px] text-(--text-muted) ${mono}`}>
          {l}
        </span>
      ))}
    </span>
  );
}

function OperationRow({ op }: { op: RunnerOperation }) {
  const color = op.status === "failed" ? "text-(--danger)" : op.status === "succeeded" ? "text-(--success)" : "text-(--accent)";
  return (
    <li className="px-4 py-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-(--text-primary)">
          {op.kind === "create" ? "Create" : "Kill"} <span className={mono}>{op.vm}</span>
        </span>
        <span className={color}>
          {op.status === "running" ? "In progress" : op.status === "succeeded" ? "Done" : "Failed"} · started {relativeTime(op.startedAt)}
        </span>
      </div>
      <ol className="mt-2 space-y-0.5 text-(--text-muted)">
        {op.steps.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className={`shrink-0 text-(--text-faint) ${mono}`}>{new Date(s.at).toLocaleTimeString()}</span>
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
      {op.error && <p className="mt-1 text-(--danger)">{op.error}</p>}
    </li>
  );
}

export interface RunnerFleetSummary {
  /** VMs in the resource group, or null until Azure answers. */
  vms: number | null;
  /** Create or kill operations still running. */
  running: number;
}

/** Create and kill whole runner VMs in the runner resource group; each one registers itself with GitHub. */
export function RunnerFleetPanel({ onSummary }: { onSummary?: (summary: RunnerFleetSummary) => void }) {
  const [fleet, setFleet] = useState<RunnerFleet | null>(null);
  const [ops, setOps] = useState<RunnerOperation[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; size: string; labels: string } | null>(null);
  const [killing, setKilling] = useState<{ vm: string; typed: string } | null>(null);
  const opsRef = useRef<RunnerOperation[]>([]);

  const accept = useCallback((next: RunnerFleet) => {
    setFleet(next);
    setOps(next.operations);
    setLoadError(null);
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    return fetchFleet()
      .then(accept, (err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [accept]);

  useEffect(() => {
    let cancelled = false;
    fetchFleet()
      .then(
        (next) => !cancelled && accept(next),
        (err: unknown) => !cancelled && setLoadError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [accept]);

  useEffect(() => {
    opsRef.current = ops;
  }, [ops]);

  const vmCount = fleet ? fleet.vms.length : null;
  const runningCount = ops.filter(isRunning).length;
  useEffect(() => {
    onSummary?.({ vms: vmCount, running: runningCount });
  }, [onSummary, vmCount, runningCount]);

  // While something runs: watch its steps, reload the VM list when it finishes and every 30s.
  const running = ops.some(isRunning);
  useEffect(() => {
    if (!running) return;
    let ticks = 0;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      ticks += 1;
      void fetch(`${API}?only=operations`, { cache: "no-store" })
        .then((res) => res.json() as Promise<{ operations?: RunnerOperation[] }>)
        .then(({ operations }) => {
          if (!operations) return;
          const finished = operations.filter(isRunning).length < opsRef.current.filter(isRunning).length;
          setOps(operations);
          if (finished || ticks % (FLEET_POLL_MS / OPS_POLL_MS) === 0) void refresh();
        })
        .catch(() => {});
    }, OPS_POLL_MS);
    return () => clearInterval(timer);
  }, [running, refresh]);

  const act = useCallback(
    async (body: RunnerFleetAction, key: string, after?: () => void) => {
      setPending(key);
      setActionError(null);
      try {
        const { operation } = await post(body);
        if (operation) setOps((prev) => [operation, ...prev.filter((o) => o.id !== operation.id)]);
        after?.();
        await refresh();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
      } finally {
        setPending(null);
      }
    },
    [refresh],
  );

  const busyVms = new Set(ops.filter(isRunning).map((o) => o.vm));
  const canCreate = fleet !== null && fleet.scope !== null && !fleet.githubError;
  const formLabels = form ? parseLabels(form.labels) : [];
  const shadowing = hostedLabels(formLabels);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-(--text-muted)">
            {fleet ? (
              <>
                Resource group <span className={mono}>{fleet.resourceGroup}</span>
                {fleet.scope && (
                  <>
                    {" "}· registers to <span className={mono}>{fleet.scope}</span>
                  </>
                )}
              </>
            ) : loading ? (
              "Loading VMs from Azure…"
            ) : null}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void refresh()} disabled={loading} className={secondaryButton}>
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            type="button"
            disabled={!canCreate || form !== null}
            title={canCreate ? undefined : (fleet?.githubError ?? "Loading")}
            onClick={() =>
              fleet && setForm({ name: fleet.defaults.name, size: fleet.defaults.size, labels: fleet.defaults.labels.join(", ") })
            }
            className={primaryButton}
          >
            New runner VM
          </button>
        </div>
      </div>

      {loadError && <p className="text-xs text-(--danger)">{loadError}</p>}
      {fleet?.githubError && <p className="text-xs text-(--danger)">GitHub: {fleet.githubError}</p>}
      {actionError && <p className="text-xs text-(--danger)">{actionError}</p>}

      {form && fleet && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(
              { action: "create", input: { name: form.name.trim(), size: form.size.trim(), labels: formLabels } },
              "create",
              () => setForm(null),
            );
          }}
          className="space-y-4 rounded-xl border border-(--border-hairline) bg-(--bg-elevated) p-5 shadow-sm"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-xs font-medium text-(--text-secondary)">
              <span className="block">VM and runner name</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                spellCheck={false}
                autoComplete="off"
                className={`${inputClass} ${mono}`}
              />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-(--text-secondary)">
              <span className="block">Size</span>
              <input
                value={form.size}
                onChange={(e) => setForm({ ...form, size: e.target.value })}
                spellCheck={false}
                autoComplete="off"
                className={`${inputClass} ${mono}`}
              />
            </label>
          </div>
          <label className="block space-y-1.5 text-xs font-medium text-(--text-secondary)">
            <span className="block">Labels (comma separated; self-hosted, Linux and X64 are added by GitHub)</span>
            <input
              value={form.labels}
              onChange={(e) => setForm({ ...form, labels: e.target.value })}
              spellCheck={false}
              autoComplete="off"
              className={`${inputClass} ${mono}`}
            />
          </label>
          {shadowing.length > 0 && (
            <p className="text-xs text-(--danger)">
              {shadowing.join(", ")} {shadowing.length === 1 ? "is a GitHub-hosted label" : "are GitHub-hosted labels"}: jobs
              meant for GitHub&apos;s own machines can land on this VM. Remove {shadowing.length === 1 ? "it" : "them"} unless
              you want that.
            </p>
          )}
          <p className="text-[11px] text-(--text-muted)">
            Copies {fleet.template.name}: <span className={mono}>{fleet.template.image}</span>, {fleet.template.location}
            {fleet.template.zone && ` zone ${fleet.template.zone}`}
            {fleet.template.diskGb && `, ${fleet.template.diskGb} GB disk`}. Gets its own public IP and the same SSH access
            rules as {fleet.template.name}
            {fleet.template.sshNsg ? (
              <>
                {" "}(it shares <span className={mono}>{fleet.template.sshNsg}</span>)
              </>
            ) : (
              " (its subnet's network security group)"
            )}
            , so IPs allowed in SSH access can reach it too. First boot installs Docker and the latest runner, then
            registers to {fleet.scope}. Azure bills it by the hour until you kill it.
          </p>
          <div className="flex gap-2">
            <button type="submit" disabled={pending !== null} className={primaryButton}>
              {pending === "create" ? "Starting…" : "Create VM"}
            </button>
            <button type="button" onClick={() => setForm(null)} disabled={pending !== null} className={secondaryButton}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {fleet && (
        <ul className="divide-y divide-(--border-hairline) overflow-hidden rounded-xl border border-(--border-hairline) bg-(--bg-elevated) shadow-sm">
          {fleet.vms.length === 0 && <li className="px-4 py-6 text-center text-sm text-(--text-muted)">No VMs in this resource group.</li>}
          {fleet.vms.map((vm: RunnerVm) => {
            const status = runnerStatus(vm.runner);
            const locked = busyVms.has(vm.name);
            const confirming = killing?.vm === vm.name;
            return (
              <li key={vm.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-sm font-medium text-(--text-primary) ${mono}`}>{vm.name}</span>
                      {vm.isConfigured && (
                        <span className="rounded bg-(--accent-muted) px-1.5 py-px text-[11px] text-(--accent)">read by this page</span>
                      )}
                      <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: status.color }}>
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: status.color }} aria-hidden />
                        {status.label}
                      </span>
                      {locked && <span className="text-xs text-(--accent)">operation in progress</span>}
                    </div>
                    <div className="text-xs text-(--text-muted)">
                      {vm.size} · {vm.location}
                      {vm.zone && ` zone ${vm.zone}`}
                      {vm.publicIp && (
                        <>
                          {" "}· <span className={mono}>{vm.publicIp}</span>
                        </>
                      )}
                      {vm.powerState && ` · ${vm.powerState.replace(/^VM /, "")}`}
                      {vm.createdAt && ` · created ${relativeTime(vm.createdAt)}`}
                    </div>
                    <Labels labels={vm.runner?.labels ?? []} />
                  </div>
                  {!confirming && (
                    <button
                      type="button"
                      onClick={() => setKilling({ vm: vm.name, typed: "" })}
                      disabled={locked || vm.runner?.busy || pending !== null}
                      title={vm.runner?.busy ? "Running a job. Wait for it to finish." : undefined}
                      className={dangerButton}
                    >
                      Kill
                    </button>
                  )}
                </div>
                {confirming && killing && (
                  <div className="mt-3 space-y-2 rounded-lg border border-(--danger)/20 bg-(--danger)/5 p-3 text-xs">
                    <p className="text-(--text-secondary)">
                      Removes the runner from GitHub, then deletes the VM, its disk, network interface, public IP and its
                      NSG if nothing else uses it. This cannot be undone.
                      {vm.isConfigured && " This is the VM the rest of this page reads; point Settings at another VM afterwards."}
                    </p>
                    <label className="block text-(--text-secondary)">
                      Type <span className={`font-medium text-(--text-primary) ${mono}`}>{vm.name}</span> to confirm
                      <input
                        value={killing.typed}
                        onChange={(e) => setKilling({ vm: vm.name, typed: e.target.value })}
                        spellCheck={false}
                        autoComplete="off"
                        autoFocus
                        className={`${inputClass} mt-1.5 ${mono}`}
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={killing.typed !== vm.name || pending !== null}
                        onClick={() =>
                          void act({ action: "kill", vm: vm.name, confirm: killing.typed }, `kill:${vm.name}`, () => setKilling(null))
                        }
                        className={dangerSolid}
                      >
                        {pending === `kill:${vm.name}` ? "Starting…" : "Kill VM"}
                      </button>
                      <button type="button" onClick={() => setKilling(null)} className={secondaryButton}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {fleet && fleet.orphans.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-(--text-secondary)">GitHub registrations without a VM</h3>
          <ul className="divide-y divide-(--border-hairline) rounded-xl border border-(--border-hairline) bg-(--bg-elevated)">
            {fleet.orphans.map((r) => {
              const status = runnerStatus(r);
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`text-(--text-primary) ${mono}`}>{r.name}</span>
                    <span style={{ color: status.color }}>{status.label}</span>
                    <Labels labels={r.labels} />
                  </span>
                  <button
                    type="button"
                    disabled={r.busy || pending !== null}
                    onClick={() => void act({ action: "remove-registration", runnerId: r.id }, `remove:${r.id}`)}
                    className={dangerButton}
                  >
                    {pending === `remove:${r.id}` ? "Removing…" : "Remove"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {ops.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-(--text-secondary)">Activity</h3>
          <ul className="divide-y divide-(--border-hairline) rounded-xl border border-(--border-hairline) bg-(--bg-elevated)">
            {ops.map((op) => (
              <OperationRow key={op.id} op={op} />
            ))}
          </ul>
          <p className="text-[11px] text-(--text-faint)">
            Operations run inside the Flightdeck server. Keep it running until they finish; this list resets when it restarts.
          </p>
        </div>
      )}
    </div>
  );
}
