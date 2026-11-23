"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAwsWorkspace } from "@/lib/context/aws-workspace-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FloatingActionBar } from "@/components/floating-action-bar";
import {
  ENFORCE_MFA_POLICY_NAME,
  buildEnforceMfaPolicyDocument,
  isEnforced,
  summarizeMfaUsers,
  type IamMfaOverview,
  type IamMfaUserStatus,
  type MfaAction,
  type MfaChangeResponse,
} from "@/lib/iam/mfa";

type Filter = "all" | "not-enforced" | "enforced" | "no-device";

const FILTERS: { id: Filter; label: string; match: (u: IamMfaUserStatus) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "not-enforced", label: "Not enforced", match: (u) => !isEnforced(u) },
  { id: "enforced", label: "Enforced", match: (u) => isEnforced(u) },
  { id: "no-device", label: "No MFA device", match: (u) => u.mfaDevices === 0 },
];

interface PendingChange {
  action: MfaAction;
  /** Server resolves the full user list (covers users created after this page loaded). */
  all: boolean;
  users: IamMfaUserStatus[];
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20";
const defaultButton = `rounded-lg border border-(--border) bg-(--bg-surface) px-3 py-1.5 text-xs font-medium text-(--text-secondary) transition-colors hover:border-(--accent)/50 hover:text-(--accent) disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;
const primaryButton = `rounded-lg bg-(--accent) px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;
const checkboxClass = `h-4 w-4 rounded border-(--border) text-(--accent) ${focusRing}`;

async function fetchMfaOverview(region: string, profile: string): Promise<IamMfaOverview> {
  const params = new URLSearchParams({ region });
  if (profile.trim()) params.set("profile", profile);
  const res = await fetch(`/api/iam/mfa?${params}`, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load IAM users");
  return data as IamMfaOverview;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function formatDate(iso?: string): string {
  return iso ? new Date(iso).toLocaleDateString() : "";
}

function Badge({
  tone,
  children,
  title,
}: {
  tone: "success" | "warn" | "danger" | "accent" | "muted";
  children: React.ReactNode;
  title?: string;
}) {
  const toneClass = {
    success: "bg-(--success-muted) text-(--success)",
    warn: "bg-(--warn-muted) text-(--warn)",
    danger: "bg-(--danger-muted) text-(--danger)",
    accent: "bg-(--accent-dim) text-(--accent)",
    muted: "bg-(--bg-muted) text-(--text-muted)",
  }[tone];
  return (
    <span
      title={title}
      className={`inline-flex items-center whitespace-nowrap rounded-lg px-1.5 py-0.5 text-[11px] font-medium ${toneClass}`}
    >
      {children}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  tone?: "warn";
}) {
  return (
    <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-4 shadow-sm">
      <div className="text-xs font-medium text-(--text-secondary)">{label}</div>
      <div
        className={`mt-1 font-(family-name:--font-mono) text-3xl font-light tabular-nums ${
          tone === "warn" ? "text-(--warn)" : "text-(--text-primary)"
        }`}
      >
        {value}
      </div>
      <div className="text-[11px] text-(--text-faint)">{sub}</div>
    </div>
  );
}

function userSubline(u: IamMfaUserStatus): string {
  if (u.isCaller) return "Flightdeck signs in as this user";
  if (u.consoleAccess === false && (u.activeAccessKeys ?? 0) > 0) return "Programmatic access only";
  if (u.passwordLastUsed) return `Console last used ${formatDate(u.passwordLastUsed)}`;
  if (u.consoleAccess) return "Never signed in to the console";
  if (u.createdAt) return `Created ${formatDate(u.createdAt)}`;
  return "";
}

/** Text for the confirm dialog: who is affected and how. */
function describeChange(
  change: PendingChange,
  overview: IamMfaOverview,
): { title: string; message: string; detail?: string; danger: boolean } {
  const n = change.users.length;
  const scope = change.all
    ? `all ${plural(n, "user")} in account ${overview.accountId}`
    : plural(n, "user");

  if (change.action === "enforce") {
    const self = change.users.find((u) => u.isCaller);
    const pending = change.users.filter((u) => !u.isCaller && !isEnforced(u));
    const already = change.users.length - pending.length - (self ? 1 : 0);
    const withKeys = pending.filter((u) => (u.activeAccessKeys ?? 0) > 0);
    const lines: string[] = [];
    if (withKeys.length > 0) {
      lines.push(
        `Access keys stop working without an MFA session (aws sts get-session-token) for ${plural(withKeys.length, "user")}:`,
        ...withKeys.map(
          (u) =>
            `• ${u.userName}${u.consoleAccess === false ? " (programmatic only)" : ""}${
              u.mfaDevices === 0 ? " — no MFA device yet" : ""
            }`,
        ),
      );
    }
    if (self) lines.push(`Skipped: ${self.userName} — Flightdeck signs in as this user.`);
    if (already > 0) lines.push(`Already enforced: ${plural(already, "user")}.`);
    if (!overview.policy.exists) {
      lines.push(`Creates the customer-managed policy ${ENFORCE_MFA_POLICY_NAME}.`);
    } else if (overview.policy.upToDate === false) {
      lines.push(`Updates ${ENFORCE_MFA_POLICY_NAME} to Flightdeck's current version.`);
    }
    return {
      title: change.all ? "Enforce MFA on all users" : "Enforce MFA",
      message: `Enforce MFA on ${scope}? Each user can still sign in, change their password and set up an MFA device; every other action is denied until they sign in with MFA.`,
      detail: lines.length > 0 ? lines.join("\n") : undefined,
      danger: withKeys.length > 0,
    };
  }

  const viaGroupOnly = change.users.filter((u) => !u.enforcedDirect && u.enforcedViaGroups.length > 0);
  const lines: string[] = [];
  if (viaGroupOnly.length > 0) {
    lines.push(
      "Enforced through a group, not changed here:",
      ...viaGroupOnly.map((u) => `• ${u.userName} (${u.enforcedViaGroups.join(", ")})`),
    );
  }
  const notEnforced = change.users.filter((u) => !isEnforced(u)).length;
  if (notEnforced > 0) lines.push(`Not enforced: ${plural(notEnforced, "user")}.`);
  return {
    title: "Remove MFA enforcement",
    message: `Remove MFA enforcement from ${scope}? Their MFA devices stay registered, but AWS stops requiring them.`,
    detail: lines.length > 0 ? lines.join("\n") : undefined,
    danger: false,
  };
}

function ResultPanel({
  result,
  onDismiss,
}: {
  result: MfaChangeResponse;
  onDismiss: () => void;
}) {
  const count = (s: string) => result.results.filter((r) => r.status === s).length;
  const changed = count("changed");
  const headline =
    result.action === "enforce"
      ? `MFA enforced on ${plural(changed, "user")}`
      : `Enforcement removed from ${plural(changed, "user")}`;
  const notable = result.results
    .filter((r) => r.status !== "changed")
    .sort((a, b) => (a.status === "error" ? -1 : b.status === "error" ? 1 : 0));
  const errors = count("error");

  return (
    <div
      className={`mt-6 rounded-xl border bg-(--bg-elevated) p-4 shadow-sm ${
        errors > 0 ? "border-(--danger)/30" : "border-(--border-hairline)"
      }`}
      role="status"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-(--text-primary)">{headline}</h2>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {count("unchanged") > 0 && <Badge tone="muted">{count("unchanged")} unchanged</Badge>}
            {count("skipped") > 0 && <Badge tone="warn">{count("skipped")} skipped</Badge>}
            {errors > 0 && <Badge tone="danger">{errors} failed</Badge>}
            {result.policyCreated && <Badge tone="accent">Created {ENFORCE_MFA_POLICY_NAME}</Badge>}
            {result.policyUpdated && <Badge tone="accent">Updated {ENFORCE_MFA_POLICY_NAME}</Badge>}
          </div>
        </div>
        <button type="button" onClick={onDismiss} className={defaultButton}>
          Dismiss
        </button>
      </div>
      {result.warnings.map((w) => (
        <p key={w} className="mt-2 text-xs text-(--warn)">
          {w}
        </p>
      ))}
      {notable.length > 0 && (
        <ul className="mt-3 max-h-60 divide-y divide-(--border-hairline) overflow-y-auto rounded-lg border border-(--border-hairline)">
          {notable.map((r) => (
            <li key={r.userName} className="flex gap-3 px-3 py-2 text-xs">
              <span className="w-40 shrink-0 truncate font-(family-name:--font-mono) text-(--text-primary)">
                {r.userName}
              </span>
              <span className={r.status === "error" ? "text-(--danger)" : "text-(--text-secondary)"}>
                {r.message ?? r.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function IamEnforceMfaPage() {
  const { region, profile } = useAwsWorkspace();
  const [overview, setOverview] = useState<IamMfaOverview | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** First load for this account/region: nothing to show yet. */
  const loading = !overview && !loadError;
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [applying, setApplying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [result, setResult] = useState<MfaChangeResponse | null>(null);
  const requestId = useRef(0);

  /** Load the overview; a newer request (or account/region switch) wins over older responses. */
  const loadOverview = useCallback(
    (id: number) =>
      fetchMfaOverview(region, profile).then(
        (data) => {
          if (id !== requestId.current) return;
          setOverview(data);
          setLoadError(null);
        },
        (err: unknown) => {
          if (id !== requestId.current) return;
          setLoadError(err instanceof Error ? err.message : "Failed to load IAM users");
        },
      ),
    [region, profile],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadOverview(++requestId.current);
    } finally {
      setRefreshing(false);
    }
  }, [loadOverview]);

  // New account or region: drop the previous account's users, selection and results.
  const workspaceKey = `${region}|${profile}`;
  const [shownKey, setShownKey] = useState(workspaceKey);
  if (shownKey !== workspaceKey) {
    setShownKey(workspaceKey);
    setOverview(null);
    setLoadError(null);
    setSelected(new Set());
    setResult(null);
    setActionError(null);
  }

  useEffect(() => {
    void loadOverview(++requestId.current);
  }, [loadOverview]);

  const users = useMemo(() => overview?.users ?? [], [overview]);
  const summary = useMemo(() => summarizeMfaUsers(users), [users]);
  const filterCounts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, users.filter(f.match).length])) as Record<Filter, number>,
    [users],
  );
  const visible = useMemo(() => {
    const match = FILTERS.find((f) => f.id === filter)!.match;
    const q = query.trim().toLowerCase();
    return users.filter((u) => match(u) && (!q || u.userName.toLowerCase().includes(q)));
  }, [users, filter, query]);

  const selectedUsers = useMemo(
    () => users.filter((u) => selected.has(u.userName)),
    [users, selected],
  );
  const allVisibleSelected = visible.length > 0 && visible.every((u) => selected.has(u.userName));
  const someVisibleSelected = visible.some((u) => selected.has(u.userName));

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((u) => next.delete(u.userName));
      else visible.forEach((u) => next.add(u.userName));
      return next;
    });

  const apply = async () => {
    if (!pending) return;
    setApplying(true);
    setActionError(null);
    try {
      const res = await fetch("/api/iam/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region,
          profile,
          action: pending.action,
          ...(pending.all
            ? { allUsers: true }
            : { userNames: pending.users.map((u) => u.userName) }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setResult(data as MfaChangeResponse);
      setSelected(new Set());
      setPending(null);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
      setPending(null);
    } finally {
      setApplying(false);
    }
  };

  const confirm = pending && overview ? describeChange(pending, overview) : null;
  const policyJson = useMemo(
    () => JSON.stringify(buildEnforceMfaPolicyDocument(overview?.partition ?? "aws"), null, 2),
    [overview?.partition],
  );

  return (
    <div className="mx-auto max-w-5xl pb-24">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-(family-name:--font-display) text-2xl font-medium tracking-tight text-(--text-primary)">
            Enforce MFA
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-(--text-secondary)">
            Require IAM users to sign in with a second factor. Pick users below,
            or enforce it on everyone in the account.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || refreshing || applying}
            className={defaultButton}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => setPending({ action: "enforce", all: true, users })}
            disabled={loading || applying || users.length === 0}
            className={primaryButton}
          >
            Enforce on all users
          </button>
        </div>
      </div>

      {loadError && (
        <div className="mb-4 rounded-lg border border-(--danger)/30 bg-(--danger-muted) px-3 py-2 text-xs text-(--danger)">
          {loadError}
        </div>
      )}
      {actionError && (
        <div className="mb-4 rounded-lg border border-(--danger)/30 bg-(--danger-muted) px-3 py-2 text-xs text-(--danger)">
          {actionError}
        </div>
      )}
      {overview?.warnings.map((w) => (
        <div
          key={w}
          className="mb-4 rounded-lg border border-(--warn)/30 bg-(--warn-muted) px-3 py-2 text-xs text-(--warn)"
        >
          {w}
        </div>
      ))}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {loading && !overview ? (
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-[98px] animate-pulse rounded-xl bg-(--bg-muted)" />
          ))
        ) : (
          <>
            <StatCard label="Enforced" value={summary.enforced} sub={`of ${plural(summary.total, "user")}`} />
            <StatCard
              label="Not enforced"
              value={summary.total - summary.enforced}
              sub="can act without MFA"
              tone={summary.total - summary.enforced > 0 ? "warn" : undefined}
            />
            <StatCard label="MFA device" value={summary.enrolled} sub={`of ${plural(summary.total, "user")}`} />
            <StatCard label="Waiting to enroll" value={summary.awaitingEnrollment} sub="enforced, no device yet" />
          </>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-4 py-3 text-xs leading-relaxed text-(--text-secondary)">
        <p>
          Enforcing attaches the customer-managed policy{" "}
          <code className="font-(family-name:--font-mono) text-(--text-primary)">{ENFORCE_MFA_POLICY_NAME}</code>{" "}
          to the user. Until they sign in with MFA it denies everything except
          changing their password and setting up an MFA device. Calls signed with
          access keys need an MFA session (
          <code className="font-(family-name:--font-mono)">aws sts get-session-token</code>).
        </p>
        {overview && (
          <p className="mt-1.5 text-(--text-muted)">
            {!overview.policy.exists
              ? "The policy does not exist yet; Flightdeck creates it the first time you enforce."
              : overview.policy.upToDate
                ? "The policy is in place."
                : "The policy differs from Flightdeck's version; it is updated the next time you enforce."}
            {overview.callerUserName &&
              ` Flightdeck signs in as ${overview.callerUserName}, so that user is never enforced from here.`}
          </p>
        )}
        <details className="mt-1.5">
          <summary className={`cursor-pointer rounded text-(--accent) ${focusRing}`}>View policy JSON</summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-(--border-hairline) bg-(--bg-field) p-3 font-(family-name:--font-mono) text-[11px] text-(--text-primary)">
            {policyJson}
          </pre>
        </details>
      </div>

      {result && <ResultPanel result={result} onDismiss={() => setResult(null)} />}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter users">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${focusRing} ${
                filter === f.id
                  ? "border-(--accent)/40 bg-(--accent-muted) text-(--accent)"
                  : "border-(--border) bg-(--bg-surface) text-(--text-secondary) hover:bg-(--bg-hover)"
              }`}
            >
              {f.label}{" "}
              <span className="font-(family-name:--font-mono) tabular-nums opacity-70">{filterCounts[f.id]}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by user name…"
          aria-label="Filter by user name"
          className={`w-56 rounded-lg border border-(--border) bg-(--bg-field) px-3 py-1.5 text-xs text-(--text-primary) placeholder:text-(--text-faint) ${focusRing}`}
        />
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-(--border-hairline) bg-(--bg-elevated) shadow-sm">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-(--border-hairline) text-(--text-muted)">
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all shown users"
                  checked={allVisibleSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
                  }}
                  onChange={toggleAllVisible}
                  disabled={visible.length === 0 || applying}
                  className={checkboxClass}
                />
              </th>
              <th className="px-4 py-2 font-medium">User</th>
              <th className="px-4 py-2 font-medium">Sign-in</th>
              <th className="px-4 py-2 font-medium">MFA device</th>
              <th className="px-4 py-2 font-medium">Enforcement</th>
            </tr>
          </thead>
          <tbody>
            {loading && !overview &&
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i} className="border-t border-(--border-hairline)">
                  <td colSpan={5} className="px-4 py-3">
                    <div className="h-4 animate-pulse rounded bg-(--bg-muted)" />
                  </td>
                </tr>
              ))}
            {visible.map((u) => {
              const keys = u.activeAccessKeys ?? 0;
              return (
                <tr
                  key={u.userName}
                  className={`border-t border-(--border-hairline) transition-colors ${
                    selected.has(u.userName) ? "bg-(--accent-muted)" : "hover:bg-(--bg-hover)"
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Select ${u.userName}`}
                      checked={selected.has(u.userName)}
                      onChange={() => toggle(u.userName)}
                      disabled={applying}
                      className={checkboxClass}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-(family-name:--font-mono) font-medium text-(--text-primary)">
                        {u.userName}
                      </span>
                      {u.isCaller && (
                        <Badge tone="accent" title="Flightdeck uses this user's credentials; enforcing MFA on it would lock Flightdeck out">
                          You
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-(--text-faint)">{userSubline(u)}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {u.consoleAccess === null || u.activeAccessKeys === null ? (
                        <span className="text-(--text-faint)" title="Could not read this user's credentials">
                          Unknown
                        </span>
                      ) : (
                        <>
                          {u.consoleAccess && <Badge tone="muted">Console</Badge>}
                          {keys > 0 && (
                            <Badge
                              tone={isEnforced(u) || u.mfaDevices === 0 ? "warn" : "muted"}
                              title="Calls signed with these keys are denied under enforcement unless they use an MFA session (aws sts get-session-token)"
                            >
                              {plural(keys, "access key")}
                            </Badge>
                          )}
                          {!u.consoleAccess && keys === 0 && <span className="text-(--text-faint)">None</span>}
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {u.mfaDevices === null ? (
                      <span className="text-(--text-faint)">Unknown</span>
                    ) : u.mfaDevices > 0 ? (
                      <Badge tone="success">{u.mfaDevices > 1 ? `${u.mfaDevices} devices` : "Enrolled"}</Badge>
                    ) : (
                      <span className={isEnforced(u) ? "text-(--warn)" : "text-(--text-muted)"}>None</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {u.enforcedDirect ? (
                      <Badge tone="success">Enforced</Badge>
                    ) : u.enforcedViaGroups.length > 0 ? (
                      <Badge tone="success" title={`Policy attached to ${u.enforcedViaGroups.join(", ")}`}>
                        Via {u.enforcedViaGroups.length === 1 ? `group ${u.enforcedViaGroups[0]}` : `${u.enforcedViaGroups.length} groups`}
                      </Badge>
                    ) : (
                      <span className="text-(--text-muted)">Not enforced</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && overview && visible.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm font-medium text-(--text-secondary)">
              {users.length === 0 ? "No IAM users in this account" : "No users match this filter"}
            </p>
            <p className="mt-1 text-xs text-(--text-muted)">
              {users.length === 0
                ? "Switch the account profile in the top bar to manage another account."
                : "Try another filter or clear the search."}
            </p>
          </div>
        )}
      </div>

      <FloatingActionBar
        count={selected.size}
        onClear={() => setSelected(new Set())}
        actions={[
          {
            label: "Enforce MFA",
            variant: "accent",
            onClick: () => setPending({ action: "enforce", all: false, users: selectedUsers }),
          },
          {
            label: "Remove enforcement",
            onClick: () => setPending({ action: "remove", all: false, users: selectedUsers }),
          },
        ]}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title ?? ""}
        message={confirm?.message ?? ""}
        detail={confirm?.detail}
        confirmLabel={pending?.action === "remove" ? "Remove enforcement" : "Enforce MFA"}
        confirmVariant={confirm?.danger ? "danger" : "default"}
        onConfirm={() => void apply()}
        onCancel={() => setPending(null)}
        loading={applying}
      />
    </div>
  );
}
