"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { relativeTime } from "@/components/github/run-utils";
import { CopyButton } from "@/components/vpc/ui";
import type { RunnerSshAccess, RunnerSshAction } from "@/lib/runner/types";

const API = "/api/github/runner/access";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20";
const primaryButton = `rounded-lg bg-(--accent) px-3.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;
const dangerButton = `rounded-lg border border-(--danger)/30 px-3 py-1.5 text-xs font-medium text-(--danger) transition-colors hover:bg-(--danger)/5 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;
const textButton = `rounded-lg px-1.5 py-0.5 text-xs text-(--text-muted) transition-colors hover:text-(--accent) disabled:opacity-50 ${focusRing}`;

type Status = { label: string; color: string; text: string };

function statusOf(access: RunnerSshAccess): Status {
  if (access.openToInternet) {
    return {
      label: "Open to the internet",
      color: "var(--danger)",
      text: "Any address can try to log in on port 22. Allow only your IP to shut everyone else out.",
    };
  }
  if (access.allowed.length > 0) {
    const n = access.allowed.length;
    return {
      label: "Restricted",
      color: "var(--success)",
      text: `Only ${n === 1 ? "1 address" : `${n} addresses`} below can reach port 22. The rest of the internet is blocked.`,
    };
  }
  return {
    label: "Closed to the internet",
    color: "var(--text-faint)",
    text: "No internet address can reach port 22. Allow your IP to connect.",
  };
}

const isMine = (source: string, ip: string | null) => ip !== null && (source === ip || source === `${ip}/32`);

function listJoin(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

async function call(init?: RequestInit): Promise<RunnerSshAccess> {
  const res = await fetch(API, { cache: "no-store", ...init });
  const data = (await res.json().catch(() => ({}))) as { access?: RunnerSshAccess; error?: string };
  if (!res.ok || !data.access) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.access;
}

/**
 * Allowlist for the runner VM's SSH port (its NSG rule) plus the command to connect yourself.
 * `onAccess` gets the latest state, or null when it could not be read.
 */
export function RunnerSshAccessPanel({ onAccess }: { onAccess: (access: RunnerSshAccess | null) => void }) {
  const [access, setAccess] = useState<RunnerSshAccess | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const accept = useCallback(
    (next: RunnerSshAccess) => {
      setAccess(next);
      setLoadError(null);
      onAccess(next);
    },
    [onAccess],
  );

  const fail = useCallback(
    (err: unknown) => {
      setLoadError(err instanceof Error ? err.message : String(err));
      onAccess(null);
    },
    [onAccess],
  );

  const check = useCallback(() => {
    setChecking(true);
    return call()
      .then(accept, fail)
      .finally(() => setChecking(false));
  }, [accept, fail]);

  const act = useCallback(
    async (input: RunnerSshAction, key: string) => {
      setPending(key);
      setActionError(null);
      try {
        accept(
          await call({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }),
        );
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
      } finally {
        setPending(null);
        setConfirmClose(false);
      }
    },
    [accept],
  );

  useEffect(() => {
    let cancelled = false;
    call()
      .then(
        (next) => !cancelled && accept(next),
        (err: unknown) => !cancelled && fail(err),
      )
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [accept, fail]);

  const busy = checking || pending !== null;
  const status = access ? statusOf(access) : null;
  const canAllow = access !== null && access.myIp !== null && (!access.myIpAllowed || access.openToInternet);
  const canClose = access !== null && (access.openToInternet || access.allowed.length > 0);

  return (
    <div className="space-y-4 rounded-xl border border-(--border-hairline) bg-(--bg-elevated) p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs text-(--text-muted)">
            {access ? (
              <>
                Port 22 on <span className="font-(family-name:--font-mono)">{access.host}</span> ·{" "}
                {access.rule ? `${access.rule.nsg} / ${access.rule.name}` : "no SSH rule yet"} · checked{" "}
                {relativeTime(access.checkedAt)}
              </>
            ) : (
              "Reading the VM's network security group…"
            )}
          </p>
        </div>
        <button type="button" onClick={() => void check()} disabled={busy} className={textButton}>
          {checking ? "Checking…" : "Recheck"}
        </button>
      </div>

      {loadError && <p className="text-xs text-(--danger)">{loadError}</p>}

      {access && status && (
        <>
          <div className="flex items-start gap-3">
            <span className="mt-1.5 inline-flex h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: status.color }} aria-hidden />
            <div>
              <div className="text-sm font-medium" style={{ color: access.openToInternet ? "var(--danger)" : "var(--text-primary)" }}>
                {status.label}
              </div>
              <p className="mt-0.5 text-xs text-(--text-secondary)">{status.text}</p>
              <p className="mt-1 text-xs text-(--text-muted)">
                Applies to {access.connect.length === 1 ? "" : `${access.connect.length} VMs: `}
                <span className="font-(family-name:--font-mono)">{listJoin(access.connect.map((c) => c.vm))}</span>
                {access.subnets.length > 0 && (
                  <>
                    {" "}and every VM in{" "}
                    <span className="font-(family-name:--font-mono)">{listJoin(access.subnets)}</span>
                  </>
                )}
                .
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-(--border-hairline) pt-4">
            <div className="min-w-0 text-xs">
              <span className="text-(--text-muted)">Your IP </span>
              {access.myIp ? (
                <>
                  <span className="font-(family-name:--font-mono) text-(--text-primary)">{access.myIp}</span>
                  <span className={`ml-2 ${access.myIpAllowed ? "text-(--success)" : "text-(--text-muted)"}`}>
                    {access.myIpAllowed ? "can connect" : "blocked"}
                  </span>
                  {!access.myIpAllowed && access.blockedBy && (
                    <span className="ml-1 text-(--text-faint)">by {access.blockedBy}</span>
                  )}
                </>
              ) : (
                <span className="text-(--danger)">{access.myIpError ?? "unknown"}</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {canAllow && (
                <button
                  type="button"
                  onClick={() => void act({ action: "allow-my-ip" }, "allow")}
                  disabled={busy}
                  className={primaryButton}
                >
                  {pending === "allow" ? "Updating NSG…" : access.openToInternet ? "Allow only my IP" : "Allow my IP"}
                </button>
              )}
              {canClose && (
                <button type="button" onClick={() => setConfirmClose(true)} disabled={busy} className={dangerButton}>
                  Close to internet
                </button>
              )}
            </div>
          </div>

          {access.allowed.length > 0 && (
            <ul className="divide-y divide-(--border-hairline) rounded-lg border border-(--border-hairline)" aria-label="Allowed addresses">
              {access.allowed.map((source) => (
                <li key={source} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                  <span className="font-(family-name:--font-mono) text-(--text-secondary)">
                    {source}
                    {isMine(source, access.myIp) && <span className="ml-2 font-(family-name:--font-sans) text-(--text-faint)">you</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => void act({ action: "remove", source }, `remove:${source}`)}
                    disabled={busy}
                    className={textButton}
                    aria-label={`Remove ${source} from the SSH allowlist`}
                  >
                    {pending === `remove:${source}` ? "Removing…" : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {actionError && <p className="text-xs text-(--danger)">{actionError}</p>}

          <div className="space-y-2 border-t border-(--border-hairline) pt-4">
            <h3 className="text-xs font-medium text-(--text-secondary)">Connect</h3>
            {access.myIpAllowed ? (
              <>
                {access.connect.map((c) => (
                  <div key={c.vm} className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-(--bg-field) px-3 py-2 font-(family-name:--font-mono) text-xs text-(--text-primary)">
                      {c.command}
                    </code>
                    <CopyButton text={c.command} />
                  </div>
                ))}
                <p className="text-[11px] text-(--text-muted)">
                  Run it in your terminal. It signs you in with your <code className="font-(family-name:--font-mono)">az login</code>{" "}
                  identity; use <code className="font-(family-name:--font-mono)">sudo -iu {access.runnerUser}</code> to act as the
                  runner user.
                </p>
              </>
            ) : (
              <p className="text-xs text-(--text-muted)">Allow your IP first. The SSH {access.connect.length === 1 ? "command shows" : "commands show"} here once it can connect.</p>
            )}
          </div>

          <p className="text-[11px] text-(--text-faint)">
            The runner only makes outbound connections to GitHub, so these rules do not affect jobs.
          </p>
        </>
      )}

      <ConfirmDialog
        open={confirmClose}
        title="Close SSH to the internet?"
        message="This denies port 22 from every internet address, including yours. Runner jobs keep working. You can allow your IP again at any time."
        detail={access?.allowed.length ? `Removes: ${access.allowed.join(", ")}` : undefined}
        confirmLabel="Close SSH"
        loading={pending === "close"}
        onConfirm={() => void act({ action: "close" }, "close")}
        onCancel={() => setConfirmClose(false)}
      />
    </div>
  );
}
