"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

export default function AmplifyBrowsePage() {
  const { region, profile } = useAwsWorkspace();
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
      <h1 className="font-(family-name:--font-display) text-3xl text-(--text-primary)">
        Amplify apps
      </h1>
      <p className="max-w-2xl text-sm text-(--text-secondary)">
        Browse Amplify Hosting applications in the selected region. Open an app to
        edit <strong className="text-(--text-primary)">app-level</strong> and{" "}
        <strong className="text-(--text-primary)">per-branch</strong> environment
        variables via the Amplify Console API. SSM-backed console secrets are not
        covered here.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by name, app ID, or domain…"
          className="w-full max-w-md rounded-md border border-(--border) bg-(--bg-field) px-3 py-1.5 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--accent) focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-md border border-(--border) bg-(--bg-surface) px-3 py-1.5 text-sm text-(--text-secondary) hover:bg-(--bg-hover) disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-(--danger)/20 bg-(--danger-dim) px-4 py-3">
          <p className="text-sm text-(--danger)">{error}</p>
        </div>
      )}

      {loading && (
        <p className="text-sm text-(--text-muted)">Loading Amplify apps…</p>
      )}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-(--border)">
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
              {filtered.map((a) => (
                <tr
                  key={a.appId}
                  className="border-b border-(--border) last:border-0 hover:bg-(--bg-hover)"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/amplify/${encodeURIComponent(a.appId)}`}
                      className="font-medium text-(--accent) hover:underline"
                    >
                      {a.name || "(unnamed)"}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-(family-name:--font-mono) text-xs text-(--text-secondary)">
                    {a.appId}
                  </td>
                  <td className="px-3 py-2 text-xs text-(--text-secondary)">
                    {a.defaultDomain ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-(--text-secondary)">
                    {a.productionBranchName ?? "—"}
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
    </div>
  );
}
