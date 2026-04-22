"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { AmplifyEnvBulkModal } from "@/components/amplify/amplify-env-bulk-modal";
import { EnvVarsEditor } from "@/components/amplify/env-vars-editor";
import { useAwsWorkspace } from "@/lib/context/aws-workspace-provider";
import { workspaceSearchParams } from "@/lib/aws/workspace-query";
import type { AmplifyAppSnapshot } from "@/lib/types";

type BulkTarget = { kind: "app" } | { kind: "branch"; name: string };

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
      aria-hidden
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

function AmplifyAppDetailInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const rawId = params.appId;
  const appId = typeof rawId === "string" ? decodeURIComponent(rawId) : "";
  const branchHighlight = searchParams.get("branch");

  const { region, profile } = useAwsWorkspace();
  const [snapshot, setSnapshot] = useState<AmplifyAppSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingApp, setSavingApp] = useState(false);
  const [savingBranch, setSavingBranch] = useState<string | null>(null);
  const [openBranches, setOpenBranches] = useState<Set<string>>(() => new Set());
  const [bulkTarget, setBulkTarget] = useState<BulkTarget | null>(null);

  const branchRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  const load = useCallback(async () => {
    if (!appId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = workspaceSearchParams(region, profile).toString();
      const res = await fetch(
        `/api/amplify/apps/${encodeURIComponent(appId)}?${qs}`,
      );
      const data = (await res.json()) as {
        snapshot?: AmplifyAppSnapshot;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load app");
      setSnapshot(data.snapshot ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load app");
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [appId, region, profile]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!branchHighlight || !snapshot) return;
    setOpenBranches((prev) => new Set(prev).add(branchHighlight));
    const id = window.setTimeout(() => {
      const el = branchRefs.current.get(branchHighlight);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
    return () => window.clearTimeout(id);
  }, [branchHighlight, snapshot]);

  async function saveAppEnv(next: Record<string, string>) {
    if (!appId) return;
    setSavingApp(true);
    try {
      const qs = workspaceSearchParams(region, profile).toString();
      const res = await fetch(
        `/api/amplify/apps/${encodeURIComponent(appId)}?${qs}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ environmentVariables: next }),
        },
      );
      const data = (await res.json()) as {
        snapshot?: AmplifyAppSnapshot;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      if (data.snapshot) setSnapshot(data.snapshot);
    } finally {
      setSavingApp(false);
    }
  }

  async function saveBranchEnv(branchName: string, next: Record<string, string>) {
    if (!appId) return;
    setSavingBranch(branchName);
    try {
      const qs = workspaceSearchParams(region, profile).toString();
      const res = await fetch(
        `/api/amplify/apps/${encodeURIComponent(appId)}/branches/${encodeURIComponent(branchName)}?${qs}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ environmentVariables: next }),
        },
      );
      const data = (await res.json()) as {
        snapshot?: AmplifyAppSnapshot;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      if (data.snapshot) setSnapshot(data.snapshot);
    } finally {
      setSavingBranch(null);
    }
  }

  function toggleBranch(name: string) {
    setOpenBranches((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  if (!appId) {
    return (
      <p className="text-sm text-(--danger)">Invalid app id.</p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/amplify"
          className="text-xs font-medium text-(--accent) hover:underline"
        >
          ← Amplify apps
        </Link>
        <h1 className="mt-2 font-(family-name:--font-display) text-3xl text-(--text-primary)">
          {snapshot?.name ?? (loading ? "Loading…" : "App")}
        </h1>
        <p className="mt-1 font-(family-name:--font-mono) text-xs text-(--text-muted)">
          {appId}
        </p>
        {snapshot?.defaultDomain && (
          <p className="mt-1 text-sm text-(--text-secondary)">
            {snapshot.defaultDomain}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-(--danger)/20 bg-(--danger-dim) px-4 py-3">
          <p className="text-sm text-(--danger)">{error}</p>
        </div>
      )}

      {loading && (
        <p className="text-sm text-(--text-muted)">Loading environment data…</p>
      )}

      {!loading && snapshot && (
        <>
          <section className="rounded-xl border border-(--border) bg-(--bg-card) p-4">
            <EnvVarsEditor
              title="App-level environment variables"
              titleActions={
                <button
                  type="button"
                  onClick={() => setBulkTarget({ kind: "app" })}
                  disabled={savingApp || savingBranch !== null}
                  className="shrink-0 rounded-md border border-(--border) bg-(--bg-surface) px-3 py-1 text-xs font-medium text-(--text-secondary) hover:bg-(--bg-hover) disabled:opacity-50"
                >
                  Bulk edit (JSON / .env)
                </button>
              }
              variables={snapshot.appEnvironmentVariables}
              onSave={saveAppEnv}
              saving={savingApp}
              error={null}
            />
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-(--text-primary)">
              Branches
            </h2>
            {snapshot.branches.length === 0 ? (
              <p className="text-sm text-(--text-muted)">No branches.</p>
            ) : (
              snapshot.branches.map((b) => {
                const open = openBranches.has(b.branchName);
                return (
                  <div
                    key={b.branchName}
                    ref={(el) => {
                      branchRefs.current.set(b.branchName, el);
                    }}
                    className={`rounded-xl border bg-(--bg-card) ${
                      branchHighlight === b.branchName
                        ? "border-(--accent) ring-1 ring-(--accent)/30"
                        : "border-(--border)"
                    }`}
                  >
                    <div className="flex items-stretch gap-1">
                      <button
                        type="button"
                        onClick={() => toggleBranch(b.branchName)}
                        className="flex min-w-0 flex-1 items-center gap-2 px-4 py-3 text-left text-sm font-medium text-(--text-primary) hover:bg-(--bg-hover)"
                      >
                        <Chevron open={open} />
                        <span className="truncate">{b.branchName}</span>
                        <span className="ml-auto shrink-0 text-xs font-normal text-(--text-muted)">
                          {Object.keys(b.environmentVariables).length} vars
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setBulkTarget({ kind: "branch", name: b.branchName })
                        }
                        disabled={
                          savingApp ||
                          (savingBranch !== null &&
                            savingBranch !== b.branchName)
                        }
                        className="shrink-0 self-center rounded-md border border-(--border) bg-(--bg-surface) px-2.5 py-1.5 text-xs font-medium text-(--text-secondary) hover:bg-(--bg-hover) disabled:opacity-50"
                      >
                        Bulk edit
                      </button>
                    </div>
                    {open && (
                      <div className="border-t border-(--border) px-4 pb-4 pt-2">
                        <EnvVarsEditor
                          title={`Branch: ${b.branchName}`}
                          variables={b.environmentVariables}
                          onSave={(next) => saveBranchEnv(b.branchName, next)}
                          saving={savingBranch === b.branchName}
                          error={null}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </section>

          {bulkTarget && (
            <AmplifyEnvBulkModal
              open
              onClose={() => setBulkTarget(null)}
              title={
                bulkTarget.kind === "app"
                  ? "App"
                  : `Branch: ${bulkTarget.name}`
              }
              variables={
                bulkTarget.kind === "app"
                  ? snapshot.appEnvironmentVariables
                  : snapshot.branches.find(
                      (x) => x.branchName === bulkTarget.name,
                    )?.environmentVariables ?? {}
              }
              onSave={async (next) => {
                if (bulkTarget.kind === "app") await saveAppEnv(next);
                else await saveBranchEnv(bulkTarget.name, next);
              }}
              saving={
                bulkTarget.kind === "app"
                  ? savingApp
                  : savingBranch === bulkTarget.name
              }
              disabled={
                bulkTarget.kind === "app"
                  ? savingBranch !== null
                  : savingApp ||
                    (savingBranch !== null &&
                      savingBranch !== bulkTarget.name)
              }
            />
          )}
        </>
      )}
    </div>
  );
}

export default function AmplifyAppDetailPage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-(--text-muted)">Loading app…</p>
      }
    >
      <AmplifyAppDetailInner />
    </Suspense>
  );
}
