"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { EnvSearchPanel } from "@/components/amplify/env-search-panel";
import { amplifyHref, parseAmplifyMode } from "@/lib/amplify/page-url";
import { useAwsWorkspace } from "@/lib/context/aws-workspace-provider";
import { workspaceSearchParams } from "@/lib/aws/workspace-query";
import type { AmplifyAppSummary } from "@/lib/types";

async function fetchAllApps(
  region: string,
  profile: string | undefined,
): Promise<AmplifyAppSummary[]> {
  const out: AmplifyAppSummary[] = [];
  let nextToken: string | undefined;
  do {
    const q = workspaceSearchParams(region, profile ?? "");
    if (nextToken) q.set("nextToken", nextToken);
    const res = await fetch(`/api/amplify/apps?${q}`);
    const data = (await res.json()) as {
      apps?: AmplifyAppSummary[];
      nextToken?: string;
      error?: string;
    };
    if (!res.ok) throw new Error(data.error ?? "Failed to list apps");
    out.push(...(data.apps ?? []));
    nextToken = data.nextToken;
  } while (nextToken);
  return out;
}

function AmplifyPageContent() {
  const { region, profile } = useAwsWorkspace();
  const router = useRouter();
  const params = useSearchParams();
  const mode = parseAmplifyMode(params.get("mode"));
  const [apps, setApps] = useState<AmplifyAppSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchAllApps(region, profile.trim() || undefined);
      setApps(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load apps");
      setApps([]);
    } finally {
      setLoading(false);
    }
  }, [region, profile]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return apps;
    const q = search.toLowerCase();
    return apps.filter(
      (a) =>
        a.appId.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.defaultDomain ?? "").toLowerCase().includes(q),
    );
  }, [apps, search]);

  return (
    <div className="space-y-4">
      <h1 className="font-(family-name:--font-display) text-2xl font-medium text-(--text-primary)">
        Amplify
      </h1>

      <div className="w-full max-w-52 rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-4 shadow-sm">
        <p className="font-(family-name:--font-mono) text-3xl font-light tabular-nums text-(--text-primary)">
          {apps.length}
        </p>
        <p className="mt-1 text-xs font-medium text-(--text-secondary)">
          Amplify apps
        </p>
      </div>

      <div className="sticky top-0 z-10 -mx-8 flex flex-wrap items-center gap-3 border-b border-(--border-hairline) bg-(--bg-deep)/90 px-8 py-3 backdrop-blur-sm">
        {mode === "browse" && (
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter by name, app ID, or domain…"
            className="w-full max-w-md rounded-lg border border-(--border) bg-(--bg-field) px-3 py-1.5 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
          />
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              router.replace(
                mode === "search"
                  ? amplifyHref()
                  : amplifyHref({ mode: "search" }),
              )
            }
            className="rounded-lg border border-(--accent) px-3 py-1.5 text-xs font-medium text-(--accent) transition-colors hover:bg-(--accent-dim) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
          >
            {mode === "search" ? "Browse apps" : "Env search"}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-(--border) bg-(--bg-elevated) px-3 py-1.5 text-xs font-medium text-(--text-secondary) hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20 disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-(--danger)/20 bg-(--danger-dim) px-4 py-3">
          <p className="text-sm text-(--danger)">{error}</p>
        </div>
      )}

      {mode === "browse" ? (
        <>
          <p className="max-w-2xl text-sm text-(--text-secondary)">
            Browse Amplify Hosting applications in the selected region. Open an app
            to edit app-level and per-branch environment variables.
          </p>

          {loading && (
            <div className="h-24 animate-pulse rounded-xl bg-(--bg-muted)" />
          )}

          {!loading && !error && (
            <div className="overflow-x-auto rounded-xl border border-(--border) bg-(--bg-field)">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-(--border) bg-(--bg-surface) text-xs text-(--text-muted)">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">App ID</th>
                    <th className="px-3 py-2 font-medium">Default domain</th>
                    <th className="px-3 py-2 font-medium">Production branch</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((app) => (
                    <tr
                      key={app.appId}
                      className="border-b border-(--border) last:border-0 hover:bg-(--bg-hover)"
                    >
                      <td className="px-3 py-2">
                        <Link
                          href={`/amplify/${encodeURIComponent(app.appId)}`}
                          className="font-medium text-(--accent) hover:underline"
                        >
                          {app.name || "(unnamed)"}
                        </Link>
                      </td>
                      <td className="px-3 py-2 font-(family-name:--font-mono) text-xs text-(--text-secondary)">
                        {app.appId}
                      </td>
                      <td className="px-3 py-2 text-xs text-(--text-secondary)">
                        {app.defaultDomain ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-(--text-secondary)">
                        {app.productionBranchName ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-(--text-muted)">
                  {apps.length === 0
                    ? "No Amplify apps in this region."
                    : "No apps match your filter."}
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <EnvSearchPanel initialQuery={params.get("q") ?? ""} />
      )}
    </div>
  );
}

export default function AmplifyPage() {
  return (
    <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-(--bg-muted)" />}>
      <AmplifyPageContent />
    </Suspense>
  );
}
