"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { relativeTime } from "@/components/github/run-utils";
import { useAwsWorkspace } from "@/lib/context/aws-workspace-provider";
import { useData } from "@/lib/context/data-provider";
import { useGithubData } from "@/lib/context/github-data-provider";
import {
  buildFlyExceptions,
  buildGithubExceptions,
  buildSecretsExceptions,
  filterRowsBySource,
  flyUnhealthyCount,
  githubKpis,
  mergeExceptions,
  secretsHygieneStats,
  type ExceptionSource,
} from "@/lib/dashboard/exceptions";
import type { EnrichedFlyApp } from "@/lib/fly/types";

const SOURCE_LABELS: Record<ExceptionSource, string> = {
  github: "GitHub",
  secrets: "Secrets",
  fly: "Fly",
};

const severityDot: Record<"danger" | "warn" | "info", string> = {
  danger: "bg-(--danger)",
  warn: "bg-(--warn)",
  info: "bg-(--accent)",
};

function validSource(value: string | null): ExceptionSource | null {
  return value === "github" || value === "secrets" || value === "fly"
    ? value
    : null;
}

function TileSkeleton() {
  return (
    <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-4 shadow-sm">
      <div className="mb-2 h-3 w-16 animate-pulse rounded bg-(--bg-muted)" />
      <div className="h-8 w-12 animate-pulse rounded bg-(--bg-muted)" />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-1" aria-label="Loading attention items">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5"
        >
          <div className="h-2 w-2 animate-pulse rounded-full bg-(--bg-muted)" />
          <div className="h-3 w-16 animate-pulse rounded bg-(--bg-muted)" />
          <div className="h-3 flex-1 animate-pulse rounded bg-(--bg-muted)" />
          <div className="h-3 w-10 animate-pulse rounded bg-(--bg-muted)" />
        </div>
      ))}
    </div>
  );
}

function MetricTile({
  active,
  context,
  error,
  label,
  lastUpdated,
  onSelect,
  retry,
  sub,
  value,
}: {
  active: boolean;
  context: string;
  error?: string | null;
  label: string;
  lastUpdated: string | null;
  onSelect: () => void;
  retry?: () => void;
  sub: string;
  value: number;
}) {
  return (
    <div
      className={`rounded-xl border bg-(--bg-elevated) px-5 py-4 shadow-sm transition-colors ${
        active
          ? "border-(--accent)/50 ring-2 ring-(--accent)/20"
          : "border-(--border-hairline)"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="-m-2 block w-[calc(100%+1rem)] rounded-lg p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
        aria-pressed={active}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-(--text-secondary)">
            {label}
          </span>
          <span className="text-[10px] text-(--text-faint)">{context}</span>
        </span>
        {error ? (
          <span className="mt-3 block text-xs leading-relaxed text-(--danger)">
            {error}
          </span>
        ) : (
          <>
            <span className="mt-2 block font-(family-name:--font-mono) text-2xl font-light tabular-nums text-(--text-primary)">
              {value}
            </span>
            <span className="mt-1 block text-[11px] text-(--text-faint)">
              {sub}
            </span>
          </>
        )}
      </button>
      <div className="mt-3 flex min-h-5 items-center justify-between gap-2 border-t border-(--border-hairline) pt-2 text-[10px] text-(--text-faint)">
        <span>{lastUpdated ? `Updated ${lastUpdated}` : "Not updated"}</span>
        {error && retry ? (
          <button
            type="button"
            onClick={retry}
            className="rounded-lg px-2 py-1 font-medium text-(--accent) hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
          >
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function NeedsAttentionDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const source = validSource(searchParams.get("source"));
  const { profile, region } = useAwsWorkspace();
  const {
    secrets,
    secretsLoading,
    secretsError,
    loadSecrets,
    refreshSecrets,
  } = useData();
  const github = useGithubData();
  const requestedSecrets = useRef(false);

  const [flyApps, setFlyApps] = useState<EnrichedFlyApp[]>([]);
  const [flyError, setFlyError] = useState<string | null>(null);
  const [flyLoading, setFlyLoading] = useState(true);
  const [flyFetchedAt, setFlyFetchedAt] = useState<string | null>(null);

  useEffect(() => {
    if (
      requestedSecrets.current ||
      secrets.length > 0 ||
      secretsLoading ||
      secretsError
    ) {
      return;
    }
    requestedSecrets.current = true;
    void loadSecrets();
  }, [
    loadSecrets,
    secrets.length,
    secretsError,
    secretsLoading,
  ]);

  const loadFlyApps = useCallback(async (signal?: AbortSignal) => {
    setFlyLoading(true);
    setFlyError(null);
    try {
      const response = await fetch("/api/fly/apps?status=1", { signal });
      const data = (await response.json()) as {
        apps?: EnrichedFlyApp[];
        error?: string;
      };
      if (!response.ok || data.error) {
        const message = data.error ?? "Failed to load Fly apps";
        if (response.status === 401 || message.toLowerCase().includes("auth")) {
          throw new Error("Fly CLI is not authenticated");
        }
        throw new Error(message);
      }
      setFlyApps(data.apps ?? []);
      setFlyFetchedAt(new Date().toISOString());
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      setFlyError(
        error instanceof Error ? error.message : "Failed to load Fly apps",
      );
    } finally {
      if (!signal?.aborted) setFlyLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadFlyApps(controller.signal);
    return () => controller.abort();
  }, [loadFlyApps]);

  const nowMs = Date.now();
  const githubStats = githubKpis(github.runs, nowMs);
  const secretStats = secretsHygieneStats(secrets, nowMs);
  const flyUnhealthy = flyUnhealthyCount(flyApps);
  const secretUpdatedAt = useMemo(() => {
    let latest: string | null = null;
    for (const secret of secrets) {
      const candidate = secret.lastChangedDate || secret.createdDate;
      if (
        candidate &&
        (!latest || new Date(candidate).getTime() > new Date(latest).getTime())
      ) {
        latest = candidate;
      }
    }
    return latest;
  }, [secrets]);

  const githubRows = github.error
    ? []
    : buildGithubExceptions(github.runs, nowMs);
  const secretResult = secretsError
    ? { rows: [], omittedStale: 0 }
    : buildSecretsExceptions(secrets, nowMs);
  const flyRows = flyError ? [] : buildFlyExceptions(flyApps);
  const filtered = filterRowsBySource(
    [...githubRows, ...secretResult.rows, ...flyRows],
    source,
  );
  const merged = mergeExceptions(
    filtered,
    source === null || source === "secrets"
      ? secretResult.omittedStale
      : 0,
  );

  const loadingWithoutData =
    (github.loading && github.runs.length === 0) ||
    (secretsLoading && secrets.length === 0) ||
    (flyLoading && flyApps.length === 0);
  const allSlicesSucceeded =
    !github.loading &&
    !secretsLoading &&
    !flyLoading &&
    !github.error &&
    !secretsError &&
    !flyError;

  const selectSource = (nextSource: ExceptionSource) => {
    const params = new URLSearchParams(searchParams.toString());
    if (source === nextSource) {
      params.delete("source");
    } else {
      params.set("source", nextSource);
    }
    const query = params.toString();
    router.replace(query ? `/?${query}` : "/", { scroll: false });
  };

  const flyAuthError = flyError === "Fly CLI is not authenticated";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-medium font-(family-name:--font-display) text-(--text-primary)">
          Needs attention
        </h1>
        <p className="mt-1 text-sm text-(--text-secondary)">
          Which item do I open first?
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-(--text-faint)">
          <span>
            AWS {profile || "Default"} · {region}
          </span>
          <span>GitHub CLI</span>
          <span>Fly CLI</span>
        </div>
      </header>

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
        aria-label="Attention summary"
      >
        <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-4 shadow-sm sm:col-span-2">
          <p className="text-xs font-medium text-(--text-secondary)">
            {source ? SOURCE_LABELS[source] : "All platforms"}
          </p>
          <div className="mt-2 flex items-end gap-3">
            <span
              className={`font-(family-name:--font-mono) text-4xl font-light tabular-nums ${
                merged.total > 0 && merged.hasDanger
                  ? "text-(--danger)"
                  : "text-(--text-primary)"
              }`}
            >
              {merged.total}
            </span>
            {merged.total > 0 && merged.hasDanger ? (
              <span className="mb-1 rounded-lg bg-(--danger-muted) px-2 py-1 text-[11px] font-medium text-(--danger)">
                need action
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] text-(--text-faint)">
            {source ? "Filtered attention items" : "Items across connected platforms"}
          </p>
        </div>

        {github.loading && github.runs.length === 0 ? (
          <TileSkeleton />
        ) : (
          <MetricTile
            active={source === "github"}
            context="GitHub CLI"
            error={github.error}
            label="GitHub"
            lastUpdated={
              github.fetchedAt ? relativeTime(github.fetchedAt) : null
            }
            onSelect={() => selectSource("github")}
            retry={() => void github.refresh()}
            sub={
              githubStats.live > 0
                ? `${githubStats.live} live`
                : "failed in 24h"
            }
            value={githubStats.failed24h}
          />
        )}

        {secretsLoading && secrets.length === 0 ? (
          <TileSkeleton />
        ) : (
          <MetricTile
            active={source === "secrets"}
            context={`${profile || "Default"} · ${region}`}
            error={secretsError}
            label="Secrets"
            lastUpdated={secretUpdatedAt ? relativeTime(secretUpdatedAt) : null}
            onSelect={() => selectSource("secrets")}
            retry={() => void refreshSecrets()}
            sub={`${secretStats.unrotated} unrotated / ${secretStats.stale} stale`}
            value={secretStats.hygiene}
          />
        )}

        {flyLoading && flyApps.length === 0 ? (
          <TileSkeleton />
        ) : (
          <div>
            <MetricTile
              active={source === "fly"}
              context="Fly CLI"
              error={flyError}
              label="Fly"
              lastUpdated={
                flyFetchedAt ? relativeTime(flyFetchedAt) : null
              }
              onSelect={() => selectSource("fly")}
              retry={() => void loadFlyApps()}
              sub={`${flyApps.length} apps`}
              value={flyUnhealthy}
            />
            {flyAuthError ? (
              <Link
                href="/settings"
                className="mt-2 inline-block rounded-lg px-2 py-1 text-[11px] font-medium text-(--accent) hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
              >
                Settings
              </Link>
            ) : null}
          </div>
        )}
      </section>

      <section aria-labelledby="attention-list-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2
            id="attention-list-heading"
            className="text-sm font-semibold text-(--text-primary)"
          >
            Open next
          </h2>
          {source ? (
            <button
              type="button"
              onClick={() => selectSource(source)}
              className="rounded-lg px-2 py-1 text-[11px] font-medium text-(--accent) hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
            >
              Clear filter
            </button>
          ) : null}
        </div>

        {merged.visible.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-(--border-hairline) bg-(--bg-elevated) shadow-sm">
            <ul className="divide-y divide-(--border-hairline)">
              {merged.visible.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${severityDot[row.severity]}`}
                    aria-label={row.severity}
                  />
                  <span className="w-14 shrink-0 text-[11px] font-medium text-(--text-muted)">
                    {SOURCE_LABELS[row.source]}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-(--text-primary)">
                    {row.label}
                  </span>
                  {row.ageLabel ? (
                    <span className="shrink-0 font-(family-name:--font-mono) text-[10px] tabular-nums text-(--text-faint)">
                      {row.ageLabel}
                    </span>
                  ) : null}
                  <Link
                    href={row.href}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-(--accent) hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
                  >
                    {row.actionLabel}
                  </Link>
                </li>
              ))}
            </ul>
            {merged.overflow.length > 0 ? (
              <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-(--border-hairline) px-3 py-2.5">
                {merged.overflow.map((overflow) => (
                  <Link
                    key={overflow.source}
                    href={overflow.href}
                    className="rounded-lg text-[11px] text-(--text-muted) hover:text-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
                  >
                    {overflow.count} more on {SOURCE_LABELS[overflow.source]}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ) : allSlicesSucceeded && merged.total === 0 ? (
          <p className="py-8 text-sm font-medium text-(--text-secondary)">
            Nothing needs attention.
          </p>
        ) : null}

        {loadingWithoutData ? <ListSkeleton /> : null}
      </section>
    </div>
  );
}
