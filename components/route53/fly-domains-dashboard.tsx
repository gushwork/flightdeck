"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAwsWorkspace } from "@/lib/context/aws-workspace-provider";
import { workspaceSearchParams } from "@/lib/aws/workspace-query";
import type { FlyAppDomainRow, FlyCertStatus } from "@/lib/fly/types";
import { buildAppDomainRow } from "@/lib/fly/certs";
import { DomainPreviewModal } from "./domain-preview-modal";

type Filter = "configured" | "all" | "attention" | "verified";

const DEFAULT_FILTER: Filter = "configured";

const FILTER_LABELS: Record<Filter, string> = {
  configured: "Custom domains",
  all: "All apps",
  attention: "Needs attention",
  verified: "Verified",
};

function certBadgeClass(status: FlyCertStatus): string {
  switch (status) {
    case "ready":
      return "border-(--success)/20 bg-(--success-muted) text-(--success)";
    case "pending":
      return "border-(--warn)/20 bg-(--warn-muted) text-(--warn)";
    case "failed":
      return "border-(--danger)/20 bg-(--danger-muted) text-(--danger)";
    default:
      return "border-(--border) bg-(--bg-muted) text-(--text-muted)";
  }
}

export function FlyDomainsDashboard() {
  const { region, profile } = useAwsWorkspace();
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterParam = searchParams.get("filter");
  const filter: Filter =
    filterParam && filterParam in FILTER_LABELS
      ? (filterParam as Filter)
      : DEFAULT_FILTER;

  const [apps, setApps] = useState<FlyAppDomainRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ app: string; hostname: string } | null>(null);
  const [revalidating, setRevalidating] = useState<string | null>(null);

  const revalidateKey = (appName: string, hostname?: string) =>
    hostname ? `${appName}:${hostname}` : `${appName}:*`;

  const revalidateCert = useCallback(async (appName: string, hostname: string) => {
    const key = revalidateKey(appName, hostname);
    setRevalidating(key);
    setError(null);
    try {
      const res = await fetch(
        `/api/fly/apps/${encodeURIComponent(appName)}/certs/${encodeURIComponent(hostname)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Revalidate failed");
      const cert = data.cert as {
        status: FlyCertStatus;
        clientStatus?: string;
        dnsConfigured?: boolean;
      };
      setApps((prev) =>
        prev.map((app) => {
          if (app.appName !== appName) return app;
          const certs = app.certs.map((c) =>
            c.hostname === hostname
              ? {
                  hostname: c.hostname,
                  status: cert.status,
                  clientStatus: cert.clientStatus,
                  dnsConfigured: cert.dnsConfigured,
                }
              : c,
          );
          return buildAppDomainRow(app.appName, app.org, app.defaultHostname, certs);
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revalidate failed");
    } finally {
      setRevalidating(null);
    }
  }, []);

  const revalidateApp = useCallback(
    async (app: FlyAppDomainRow) => {
      if (app.certs.length === 0) return;
      setRevalidating(revalidateKey(app.appName));
      setError(null);
      try {
        const results = await Promise.all(
          app.certs.map(async (c) => {
            const res = await fetch(
              `/api/fly/apps/${encodeURIComponent(app.appName)}/certs/${encodeURIComponent(c.hostname)}`,
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Revalidate failed");
            return { hostname: c.hostname, cert: data.cert };
          }),
        );
        setApps((prev) =>
          prev.map((row) => {
            if (row.appName !== app.appName) return row;
            const certs = row.certs.map((c) => {
              const hit = results.find((r) => r.hostname === c.hostname);
              if (!hit) return c;
              return {
                hostname: c.hostname,
                status: hit.cert.status as FlyCertStatus,
                clientStatus: hit.cert.clientStatus as string | undefined,
                dnsConfigured: hit.cert.dnsConfigured as boolean | undefined,
              };
            });
            return buildAppDomainRow(row.appName, row.org, row.defaultHostname, certs);
          }),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Revalidate failed");
      } finally {
        setRevalidating(null);
      }
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fly/domains");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setApps(data.apps ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Fly apps");
      setApps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setFilter = (f: Filter) => {
    const p = new URLSearchParams(searchParams.toString());
    if (f === DEFAULT_FILTER) p.delete("filter");
    else p.set("filter", f);
    router.replace(`?${p.toString()}`, { scroll: false });
  };

  const filtered = useMemo(() => {
    if (filter === "configured") return apps.filter((a) => a.certs.length > 0);
    if (filter === "attention") return apps.filter((a) => a.needsAttention);
    if (filter === "verified") {
      return apps.filter((a) => a.certs.some((c) => c.status === "ready"));
    }
    return apps;
  }, [apps, filter]);

  const stats = useMemo(() => {
    const attention = apps.filter((a) => a.needsAttention).length;
    const verified = apps.reduce(
      (n, a) => n + a.certs.filter((c) => c.status === "ready").length,
      0,
    );
    return { total: apps.length, attention, verified };
  }, [apps]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Fly apps", value: stats.total },
          { label: "Verified custom domains", value: stats.verified },
          { label: "Needs attention", value: stats.attention },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-4 shadow-sm"
          >
            <p className="font-(family-name:--font-mono) text-3xl font-light tabular-nums text-(--text-primary)">
              {loading ? "—" : s.value}
            </p>
            <p className="text-xs font-medium text-(--text-secondary)">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="sticky top-0 z-10 -mx-8 bg-(--bg-deep)/90 px-8 py-3 backdrop-blur-sm border-b border-(--border-hairline)">
        <div className="flex flex-wrap items-center gap-2">
          {(["configured", "all", "attention", "verified"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20 ${
                filter === f
                  ? "border-(--accent)/40 bg-(--accent-muted) text-(--accent)"
                  : "border-(--border) bg-(--bg-elevated) text-(--text-secondary) hover:bg-(--bg-hover)"
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="ml-auto rounded-lg border border-(--border) bg-(--bg-elevated) px-3 py-1.5 text-xs font-medium text-(--text-secondary) hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-(--danger)/20 bg-(--danger-muted) px-4 py-3 text-sm text-(--danger)">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-(--border-hairline) bg-(--bg-elevated) shadow-sm">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-(--border-hairline) bg-(--bg-field) text-xs font-medium text-(--text-muted)">
            <tr>
              <th className="px-4 py-3">App</th>
              <th className="hidden px-4 py-3 md:table-cell">Org</th>
              <th className="hidden px-4 py-3 lg:table-cell">Default hostname</th>
              <th className="px-4 py-3">Custom domains</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-(--text-muted)">
                  Loading Fly apps…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-(--text-muted)">
                  No apps match this filter.
                </td>
              </tr>
            )}
            {filtered.map((app) => (
              <Fragment key={app.appName}>
                <tr
                  className={`border-b border-(--border-hairline) ${
                    app.needsAttention
                      ? "border-l-4 border-l-(--warn) bg-(--warn-muted)"
                      : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded(expanded === app.appName ? null : app.appName)
                      }
                      className="font-medium text-(--text-primary) hover:text-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
                    >
                      {app.appName}
                    </button>
                  </td>
                  <td className="hidden px-4 py-3 text-(--text-secondary) md:table-cell">
                    {app.org}
                  </td>
                  <td className="hidden px-4 py-3 font-(family-name:--font-mono) text-xs text-(--text-muted) lg:table-cell">
                    {app.defaultHostname}
                  </td>
                  <td className="px-4 py-3">
                    {app.certs.length === 0 ? (
                      <span className="text-xs text-(--text-faint)">None</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {app.certs.map((c) => (
                          <span
                            key={c.hostname}
                            className={`inline-flex max-w-[min(100%,14rem)] truncate rounded-lg border px-2 py-0.5 text-[11px] font-medium ${certBadgeClass(c.status)}`}
                            title={c.hostname}
                          >
                            {c.hostname}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {app.certs.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => void revalidateApp(app)}
                        disabled={revalidating === revalidateKey(app.appName)}
                        className="whitespace-nowrap rounded-lg border border-(--border) bg-(--bg-elevated) px-2.5 py-1.5 text-xs font-medium text-(--text-secondary) hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20 disabled:opacity-50"
                      >
                        {revalidating === revalidateKey(app.appName)
                          ? "Revalidating…"
                          : "Revalidate"}
                      </button>
                    ) : (
                      <span className="text-xs text-(--text-faint)">—</span>
                    )}
                  </td>
                </tr>
                {expanded === app.appName && app.certs.length > 0 && (
                  <tr className="border-b border-(--border-hairline) bg-(--bg-field)">
                    <td colSpan={5} className="px-4 py-3">
                      <ul className="space-y-2">
                        {app.certs.map((c) => {
                          const certKey = revalidateKey(app.appName, c.hostname);
                          const busy = revalidating === certKey;
                          return (
                          <li
                            key={c.hostname}
                            className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                          >
                            <span className="min-w-0 font-(family-name:--font-mono) text-xs text-(--text-secondary)">
                              <span className="break-all">{c.hostname}</span>
                              <span className={`ml-2 inline-flex ${certBadgeClass(c.status)} rounded px-1.5 py-0.5`}>
                                {c.status}
                              </span>
                            </span>
                            <div className="flex shrink-0 flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void revalidateCert(app.appName, c.hostname)}
                                disabled={busy || revalidating === revalidateKey(app.appName)}
                                className="whitespace-nowrap rounded-lg border border-(--border) bg-(--bg-elevated) px-3 py-1.5 text-xs font-medium text-(--text-secondary) hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20 disabled:opacity-50"
                              >
                                {busy ? "Revalidating…" : "Revalidate"}
                              </button>
                              {(c.status === "pending" || c.status === "failed") && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPreview({ app: app.appName, hostname: c.hostname })
                                  }
                                  className="whitespace-nowrap rounded-lg bg-(--accent) px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
                                >
                                  Configure in Route 53
                                </button>
                              )}
                            </div>
                          </li>
                          );
                        })}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {preview && (
        <DomainPreviewModal
          appName={preview.app}
          hostname={preview.hostname}
          region={region}
          profile={profile.trim() || undefined}
          workspaceQuery={workspaceSearchParams(region, profile)}
          onClose={() => setPreview(null)}
          onApplied={() => {
            setPreview(null);
            void load();
          }}
          onRevalidated={() => void load()}
        />
      )}
    </div>
  );
}
