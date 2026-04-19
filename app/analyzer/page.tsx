"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { daysSince } from "@/lib/utils";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { AnalyzerInfo, AnalyzerFinding } from "@/lib/aws/analyzer";
import { useAwsWorkspace } from "@/lib/context/aws-workspace-provider";
import { workspaceSearchParams } from "@/lib/aws/workspace-query";

type SectionKey = "permissions" | "roles" | "keys" | "passwords";

interface FindingDetail {
  id: string;
  resource: string;
  findingType: string;
  status: string;
  findingDetails?: Array<{
    unusedPermissionDetails?: {
      serviceNamespace?: string;
      actions?: Array<{ action?: string; lastAccessed?: string }>;
      lastAccessed?: string;
    };
  }>;
}

function shortenArn(arn: string): string {
  return arn.split(":").pop() || arn;
}

function CountCard({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border p-4 text-left transition-colors ${
        active
          ? "border-(--accent) bg-(--accent-dim)"
          : "border-(--border) bg-(--bg-card) hover:bg-(--bg-hover)"
      }`}
    >
      <p className="font-(family-name:--font-mono) text-2xl font-semibold text-(--text-primary)">
        {count}
      </p>
      <p className="mt-1 text-xs text-(--text-secondary)">{label}</p>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "ACTIVE"
      ? "bg-(--warn-dim) text-(--warn)"
      : status === "RESOLVED"
        ? "bg-(--success-dim) text-(--success)"
        : "bg-(--bg-surface) text-(--text-muted)";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {status}
    </span>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform ${open ? "rotate-90" : ""}`}
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

interface SectionProps {
  id: SectionKey;
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function Section({ id, title, count, expanded, onToggle, children }: SectionProps) {
  return (
    <div id={`section-${id}`} className="rounded-lg border border-(--border) overflow-hidden">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 bg-(--bg-surface) px-4 py-3 text-left transition-colors hover:bg-(--bg-hover)"
      >
        <ChevronIcon open={expanded} />
        <span className="text-sm font-semibold text-(--text-primary)">{title}</span>
        <span className="rounded-full bg-(--bg-card) px-2 py-0.5 font-(family-name:--font-mono) text-[11px] font-medium text-(--text-secondary)">
          {count}
        </span>
      </button>
      {expanded && <div className="border-t border-(--border)">{children}</div>}
    </div>
  );
}

export default function AnalyzerPage() {
  const { region, profile } = useAwsWorkspace();
  const [analyzers, setAnalyzers] = useState<AnalyzerInfo[]>([]);
  const [findings, setFindings] = useState<AnalyzerFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [findingsLoading, setFindingsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noAnalyzer, setNoAnalyzer] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const [expandedSections, setExpandedSections] = useState<Set<SectionKey>>(new Set());
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [userDetails, setUserDetails] = useState<Map<string, FindingDetail[]>>(new Map());
  const [detailsLoading, setDetailsLoading] = useState<Set<string>>(new Set());
  const sectionsInitRef = useRef(false);

  const [showCreateConfirm, setShowCreateConfirm] = useState(false);
  const [creating, setCreating] = useState(false);

  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    label: string;
    onConfirm: () => void;
  } | null>(null);

  const [showResolved, setShowResolved] = useState(false);

  const fetchFindings = useCallback(async (analyzerArn: string) => {
    setFindingsLoading(true);
    try {
      const res = await fetch("/api/analyzer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "findings",
          analyzerArn,
          region,
          profile: profile.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setFindings(data.findings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load findings");
    } finally {
      setFindingsLoading(false);
    }
  }, [region, profile]);

  const fetchAnalyzers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = workspaceSearchParams(region, profile).toString();
      const res = await fetch(`/api/analyzer?${q}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAnalyzers(data.analyzers ?? []);

      const unusedAccess = (data.analyzers as AnalyzerInfo[])?.find(
        (a) => a.type === "ACCOUNT_UNUSED_ACCESS",
      );
      if (unusedAccess) {
        await fetchFindings(unusedAccess.arn);
      } else {
        setNoAnalyzer(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analyzers");
    } finally {
      setLoading(false);
    }
  }, [region, profile, fetchFindings]);

  useEffect(() => {
    fetchAnalyzers();
  }, [fetchAnalyzers]);

  const counts = useMemo(() => {
    const c = { UnusedPermission: 0, UnusedIAMRole: 0, UnusedIAMUserAccessKey: 0, UnusedIAMUserPassword: 0 };
    for (const f of findings) {
      if (f.findingType in c) c[f.findingType as keyof typeof c]++;
    }
    return c;
  }, [findings]);

  const permissionFindings = useMemo(
    () => findings.filter((f) => f.findingType === "UnusedPermission"),
    [findings],
  );
  const roleFindings = useMemo(
    () => findings.filter((f) => f.findingType === "UnusedIAMRole"),
    [findings],
  );
  const keyFindings = useMemo(
    () => findings.filter((f) => f.findingType === "UnusedIAMUserAccessKey"),
    [findings],
  );
  const passwordFindings = useMemo(
    () => findings.filter((f) => f.findingType === "UnusedIAMUserPassword"),
    [findings],
  );

  const permissionsByUser = useMemo(() => {
    const map = new Map<string, AnalyzerFinding[]>();
    for (const f of permissionFindings) {
      const key = f.resource;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return map;
  }, [permissionFindings]);

  const activeFindings = useMemo(
    () => (showResolved ? findings : findings.filter((f) => f.status === "ACTIVE")),
    [findings, showResolved],
  );
  const resolvedCount = findings.length - findings.filter((f) => f.status === "ACTIVE").length;
  const totalFindings = activeFindings.length;

  const activeCounts = useMemo(() => {
    const c = { UnusedPermission: 0, UnusedIAMRole: 0, UnusedIAMUserAccessKey: 0, UnusedIAMUserPassword: 0 };
    for (const f of activeFindings) {
      if (f.findingType in c) c[f.findingType as keyof typeof c]++;
    }
    return c;
  }, [activeFindings]);

  const activePermissionFindings = useMemo(
    () => activeFindings.filter((f) => f.findingType === "UnusedPermission"),
    [activeFindings],
  );
  const activeRoleFindings = useMemo(
    () => activeFindings.filter((f) => f.findingType === "UnusedIAMRole"),
    [activeFindings],
  );
  const activeKeyFindings = useMemo(
    () => activeFindings.filter((f) => f.findingType === "UnusedIAMUserAccessKey"),
    [activeFindings],
  );
  const activePasswordFindings = useMemo(
    () => activeFindings.filter((f) => f.findingType === "UnusedIAMUserPassword"),
    [activeFindings],
  );
  const activePermissionsByUser = useMemo(() => {
    const map = new Map<string, AnalyzerFinding[]>();
    for (const f of activePermissionFindings) {
      if (!map.has(f.resource)) map.set(f.resource, []);
      map.get(f.resource)!.push(f);
    }
    return map;
  }, [activePermissionFindings]);

  useEffect(() => {
    if (findings.length > 0 && !sectionsInitRef.current) {
      const initial = new Set<SectionKey>();
      if (counts.UnusedPermission > 0) initial.add("permissions");
      if (counts.UnusedIAMRole > 0) initial.add("roles");
      if (counts.UnusedIAMUserAccessKey > 0) initial.add("keys");
      if (counts.UnusedIAMUserPassword > 0) initial.add("passwords");
      setExpandedSections(initial);
      sectionsInitRef.current = true;
    }
  }, [findings, counts]);

  function toggleSection(key: SectionKey) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function toggleUser(arn: string) {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(arn)) next.delete(arn);
      else next.add(arn);
      return next;
    });

    if (!expandedUsers.has(arn) && !userDetails.has(arn)) {
      const userFindings = permissionsByUser.get(arn);
      if (!userFindings?.length) return;

      setDetailsLoading((prev) => new Set([...prev, arn]));
      try {
        const unusedAnalyzer = analyzers.find((a) => a.type === "ACCOUNT_UNUSED_ACCESS");
        if (!unusedAnalyzer) return;

        const res = await fetch("/api/analyzer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "findingDetails",
            analyzerArn: unusedAnalyzer.arn,
            findingIds: userFindings.map((f) => f.id),
            region,
            profile: profile.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (data.details) {
          setUserDetails((prev) => new Map([...prev, [arn, data.details]]));
        }
      } catch {
        /* detail fetch failure is non-fatal */
      } finally {
        setDetailsLoading((prev) => {
          const next = new Set(prev);
          next.delete(arn);
          return next;
        });
      }
    }
  }

  function scrollToSection(key: SectionKey) {
    setExpandedSections((prev) => new Set([...prev, key]));
    setTimeout(() => {
      document.getElementById(`section-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  async function handleCreateAnalyzer() {
    setCreating(true);
    try {
      const res = await fetch("/api/analyzer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          region,
          profile: profile.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setShowCreateConfirm(false);
      setNoAnalyzer(false);
      fetchAnalyzers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create analyzer");
      setShowCreateConfirm(false);
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-32">
        <p className="animate-pulse text-sm text-(--text-muted)">
          Loading analyzers...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center py-32">
        <div className="rounded-lg border border-(--danger)/20 bg-(--danger-dim) px-6 py-5 text-center">
          <p className="text-sm text-(--danger)">{error}</p>
          <button
            onClick={() => { setError(null); fetchAnalyzers(); }}
            className="mt-3 rounded-md bg-(--accent) px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-(--accent)/90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (noAnalyzer && !dismissed) {
    return (
      <div className="space-y-4">
        <h1 className="font-(family-name:--font-display) text-2xl text-(--text-primary)">
          Cleanup Wizard
        </h1>
        <div className="rounded-lg border border-(--border) bg-(--bg-card) px-6 py-10 text-center">
          <div className="mx-auto max-w-md space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-(--accent-dim)">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-(--text-primary)">
              No Unused Access Analyzer Found
            </h2>
            <p className="text-sm text-(--text-secondary)">
              An unused access analyzer continuously monitors your IAM users and roles to
              identify unused permissions, roles, access keys, and passwords. This helps you
              tighten security by removing access that&apos;s no longer needed.
            </p>
            <p className="rounded-md bg-(--warn-dim) px-3 py-2 text-xs font-medium text-(--warn)">
              Cost: ~$0.20 per IAM user and role per month
            </p>
            {analyzers.length > 0 && (
              <p className="text-xs text-(--text-muted)">
                Active analyzers:{" "}
                {analyzers.map((a) => `${a.name} (${a.type})`).join(", ")}
              </p>
            )}
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setShowCreateConfirm(true)}
                className="rounded-md bg-(--accent) px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Create Analyzer
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="rounded-md border border-(--border) bg-(--bg-field) px-5 py-2 text-sm font-medium text-(--text-secondary) transition-colors hover:bg-(--bg-hover)"
              >
                Skip
              </button>
            </div>
          </div>
        </div>

        <ConfirmDialog
          open={showCreateConfirm}
          title="Create an unused access analyzer?"
          message="This will start analyzing IAM permissions across your account. The analyzer continuously monitors for unused access and generates findings."
          detail="Cost: ~$0.20 per IAM user and role per month"
          confirmLabel="Create Analyzer"
          confirmVariant="default"
          onConfirm={handleCreateAnalyzer}
          onCancel={() => setShowCreateConfirm(false)}
          loading={creating}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-(family-name:--font-display) text-2xl text-(--text-primary)">
          Cleanup Wizard
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-(--text-muted)">
            {totalFindings} active{showResolved ? ` + ${resolvedCount} resolved` : ""}
          </span>
          <button
            onClick={() => setShowResolved((v) => !v)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              showResolved
                ? "bg-(--accent) text-white"
                : "bg-(--bg-surface) text-(--text-secondary) hover:bg-(--bg-hover)"
            }`}
          >
            {showResolved ? "Showing all" : "Show resolved"}
          </button>
          <button
            onClick={() => { setUserDetails(new Map()); fetchAnalyzers(); }}
            disabled={loading || findingsLoading}
            className="rounded-md border border-(--border) bg-(--bg-field) px-3 py-1.5 text-xs font-medium text-(--text-secondary) transition-colors hover:bg-(--bg-hover) disabled:opacity-50"
          >
            {findingsLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Count cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CountCard
          label="Unused Permissions"
          count={activeCounts.UnusedPermission}
          active={false}
          onClick={() => scrollToSection("permissions")}
        />
        <CountCard
          label="Unused Roles"
          count={activeCounts.UnusedIAMRole}
          active={false}
          onClick={() => scrollToSection("roles")}
        />
        <CountCard
          label="Unused Keys"
          count={activeCounts.UnusedIAMUserAccessKey}
          active={false}
          onClick={() => scrollToSection("keys")}
        />
        <CountCard
          label="Unused Passwords"
          count={activeCounts.UnusedIAMUserPassword}
          active={false}
          onClick={() => scrollToSection("passwords")}
        />
      </div>

      {findingsLoading && (
        <p className="animate-pulse py-8 text-center text-sm text-(--text-muted)">
          Loading findings...
        </p>
      )}

      {!findingsLoading && totalFindings === 0 && (
        <div className="rounded-lg border border-(--border) bg-(--bg-surface) px-6 py-10 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-(--success-dim) mb-3">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.5 8.5l3 3 6-7" />
            </svg>
          </div>
          <p className="text-sm font-medium text-(--text-primary)">All clean</p>
          <p className="mt-1 text-xs text-(--text-muted)">
            No unused access found — all permissions appear to be in use.
          </p>
        </div>
      )}

      {!findingsLoading && totalFindings > 0 && (
        <div className="space-y-3">
          {/* Users with unused permissions */}
          <Section
            id="permissions"
            title="Users with unused permissions"
            count={activeCounts.UnusedPermission}
            expanded={expandedSections.has("permissions")}
            onToggle={() => toggleSection("permissions")}
          >
            {activePermissionsByUser.size === 0 ? (
              <p className="px-4 py-4 text-xs text-(--text-muted)">No unused permission findings.</p>
            ) : (
              <div className="divide-y divide-(--border)">
                {[...activePermissionsByUser.entries()].map(([userArn, userFindings]) => {
                  const isOpen = expandedUsers.has(userArn);
                  return (
                    <div key={userArn}>
                      <div className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-(--bg-hover)">
                        <button
                          onClick={() => toggleUser(userArn)}
                          className="flex items-center gap-2 text-left"
                        >
                          <ChevronIcon open={isOpen} />
                          <span className="font-(family-name:--font-mono) text-xs font-medium text-(--text-primary)">
                            {shortenArn(userArn)}
                          </span>
                          <span className="text-xs text-(--text-muted)">
                            — {userFindings.length} unused service{userFindings.length !== 1 && "s"}
                          </span>
                        </button>
                        <div className="ml-auto">
                          <button
                            onClick={() =>
                              window.alert(
                                `Use agent: Tighten permissions for ${shortenArn(userArn)}`,
                              )
                            }
                            className="rounded-md border border-(--accent)/30 bg-(--accent-dim) px-3 py-1 text-[11px] font-medium text-(--accent) transition-colors hover:bg-(--accent) hover:text-white"
                          >
                            Tighten Permissions
                          </button>
                        </div>
                      </div>
                      {isOpen && (
                        <div className="border-t border-(--border-subtle) bg-(--bg-surface)">
                          {detailsLoading.has(userArn) ? (
                            <p className="px-10 py-3 text-xs text-(--text-muted) animate-pulse">
                              Loading unused permission details...
                            </p>
                          ) : userDetails.has(userArn) ? (
                            userDetails.get(userArn)!.map((detail) => {
                              const services = (detail.findingDetails ?? [])
                                .map((d) => d.unusedPermissionDetails)
                                .filter(Boolean);

                              if (services.length === 0) {
                                return (
                                  <div key={detail.id} className="flex items-center gap-3 px-4 py-2 pl-10 text-xs">
                                    <span className="font-(family-name:--font-mono) text-(--text-secondary)">
                                      Unused permission
                                    </span>
                                    <StatusBadge status={detail.status} />
                                  </div>
                                );
                              }

                              return services.map((svc, i) => (
                                <div
                                  key={`${detail.id}-${i}`}
                                  className="flex items-center gap-3 px-4 py-2 pl-10 text-xs"
                                >
                                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-(--warn)" />
                                  <span className="font-(family-name:--font-mono) font-medium text-(--text-primary)">
                                    {svc!.serviceNamespace ?? "unknown"}
                                  </span>
                                  {svc!.actions && svc!.actions.length > 0 && (
                                    <span className="text-(--text-muted)">
                                      {svc!.actions.length} action{svc!.actions.length !== 1 ? "s" : ""}
                                      {svc!.actions.length <= 3 && (
                                        <span className="ml-1 font-(family-name:--font-mono)">
                                          ({svc!.actions.map((a) => a.action ?? "").filter(Boolean).join(", ")})
                                        </span>
                                      )}
                                    </span>
                                  )}
                                  <StatusBadge status={detail.status} />
                                  {svc!.lastAccessed && (
                                    <span className="ml-auto text-(--text-muted)">
                                      last used {daysSince(svc!.lastAccessed)}d ago
                                    </span>
                                  )}
                                </div>
                              ));
                            })
                          ) : (
                            userFindings.map((f) => (
                              <div
                                key={f.id}
                                className="flex items-center gap-3 px-4 py-2 pl-10 text-xs"
                              >
                                <span className="font-(family-name:--font-mono) text-(--text-secondary)">
                                  {f.findingType}
                                </span>
                                <StatusBadge status={f.status} />
                                <span className="ml-auto text-(--text-muted)">
                                  {f.createdAt ? `${daysSince(f.createdAt)}d ago` : "—"}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Unused Roles */}
          <Section
            id="roles"
            title="Unused Roles"
            count={activeCounts.UnusedIAMRole}
            expanded={expandedSections.has("roles")}
            onToggle={() => toggleSection("roles")}
          >
            {activeRoleFindings.length === 0 ? (
              <p className="px-4 py-4 text-xs text-(--text-muted)">No unused role findings.</p>
            ) : (
              <div className="divide-y divide-(--border)">
                {activeRoleFindings.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-(--bg-hover)"
                  >
                    <span className="font-(family-name:--font-mono) text-xs font-medium text-(--text-primary)">
                      {shortenArn(f.resource)}
                    </span>
                    <span className="text-xs text-(--text-muted)">
                      {f.createdAt ? `${daysSince(f.createdAt)}d old` : ""}
                    </span>
                    <StatusBadge status={f.status} />
                    <div className="ml-auto">
                      <button
                        onClick={() =>
                          setConfirmAction({
                            title: `Delete role ${shortenArn(f.resource)}?`,
                            message: "This will permanently delete the IAM role. Ensure no services depend on it before proceeding.",
                            label: "Delete Role",
                            onConfirm: () => {
                              window.alert(`Delete role via agent: ${shortenArn(f.resource)}`);
                              setConfirmAction(null);
                            },
                          })
                        }
                        className="rounded-md border border-(--danger)/30 bg-(--danger-dim) px-3 py-1 text-[11px] font-medium text-(--danger) transition-colors hover:bg-(--danger) hover:text-white"
                      >
                        Delete Role
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Unused Access Keys */}
          <Section
            id="keys"
            title="Unused Access Keys"
            count={activeCounts.UnusedIAMUserAccessKey}
            expanded={expandedSections.has("keys")}
            onToggle={() => toggleSection("keys")}
          >
            {activeKeyFindings.length === 0 ? (
              <p className="px-4 py-4 text-xs text-(--text-muted)">No unused access key findings.</p>
            ) : (
              <div className="divide-y divide-(--border)">
                {activeKeyFindings.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-(--bg-hover)"
                  >
                    <span className="font-(family-name:--font-mono) text-xs font-medium text-(--text-primary)">
                      {shortenArn(f.resource)}
                    </span>
                    <span className="text-xs text-(--text-muted)">
                      {f.createdAt ? `${daysSince(f.createdAt)}d old` : ""}
                    </span>
                    <StatusBadge status={f.status} />
                    <div className="ml-auto">
                      <button
                        onClick={() =>
                          window.alert(
                            `Deactivate access key via agent: ${shortenArn(f.resource)}`,
                          )
                        }
                        className="rounded-md border border-(--warn)/30 bg-(--warn-dim) px-3 py-1 text-[11px] font-medium text-(--warn) transition-colors hover:bg-(--warn) hover:text-white"
                      >
                        Deactivate Key
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Unused Passwords */}
          <Section
            id="passwords"
            title="Unused Passwords"
            count={activeCounts.UnusedIAMUserPassword}
            expanded={expandedSections.has("passwords")}
            onToggle={() => toggleSection("passwords")}
          >
            {activePasswordFindings.length === 0 ? (
              <p className="px-4 py-4 text-xs text-(--text-muted)">No unused password findings.</p>
            ) : (
              <div className="divide-y divide-(--border)">
                {activePasswordFindings.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-(--bg-hover)"
                  >
                    <span className="font-(family-name:--font-mono) text-xs font-medium text-(--text-primary)">
                      {shortenArn(f.resource)}
                    </span>
                    <span className="text-xs text-(--text-muted)">
                      {f.createdAt ? `${daysSince(f.createdAt)}d old` : ""}
                    </span>
                    <StatusBadge status={f.status} />
                    <div className="ml-auto">
                      <button
                        onClick={() =>
                          window.alert(
                            `Remove console password via agent: ${shortenArn(f.resource)}`,
                          )
                        }
                        className="rounded-md border border-(--danger)/30 bg-(--danger-dim) px-3 py-1 text-[11px] font-medium text-(--danger) transition-colors hover:bg-(--danger) hover:text-white"
                      >
                        Remove Password
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}

      {/* Confirm dialog for destructive actions */}
      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction?.title ?? ""}
        message={confirmAction?.message ?? ""}
        confirmLabel={confirmAction?.label ?? "Confirm"}
        confirmVariant="danger"
        onConfirm={confirmAction?.onConfirm ?? (() => {})}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Create analyzer confirm */}
      <ConfirmDialog
        open={showCreateConfirm}
        title="Create an unused access analyzer?"
        message="This will start analyzing IAM permissions across your account. The analyzer continuously monitors for unused access and generates findings."
        detail="Cost: ~$0.20 per IAM user and role per month"
        confirmLabel="Create Analyzer"
        confirmVariant="default"
        onConfirm={handleCreateAnalyzer}
        onCancel={() => setShowCreateConfirm(false)}
        loading={creating}
      />
    </div>
  );
}
