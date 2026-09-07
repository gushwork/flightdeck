"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { relativeTime } from "@/components/github/run-utils";
import { useAwsWorkspace } from "@/lib/context/aws-workspace-provider";
import { useData } from "@/lib/context/data-provider";
import { useGithubData } from "@/lib/context/github-data-provider";
import {
  buildFlyExceptions,
  buildGithubExceptions,
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

const SEVERITY_TEXT: Record<"danger" | "warn" | "info", string> = {
  danger: "Critical",
  warn: "Watch",
  info: "Info",
};

const severityDot: Record<"danger" | "warn" | "info", string> = {
  danger: "bg-(--danger)",
  warn: "bg-(--warn)",
  info: "bg-(--accent)",
};

const REFRESH_INTERVAL_MS = 90 * 1000;

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

function HeroSkeleton() {
  return (
    <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-4 shadow-sm sm:col-span-2">
      <div className="mb-3 h-3 w-24 animate-pulse rounded bg-(--bg-muted)" />
      <div className="h-10 w-16 animate-pulse rounded bg-(--bg-muted)" />
      <div className="mt-2 h-3 w-40 animate-pulse rounded bg-(--bg-muted)" />
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
  hasSuccessfulData,
  label,
  lastUpdated,
  onSelect,
  retry,
  sub,
  unavailable,
  value,
}: {
  active: boolean;
  context: string;
  error?: string | null;
  hasSuccessfulData: boolean;
  label: string;
  lastUpdated: string | null;
  onSelect: () => void;
  retry?: () => void;
  sub: string;
  /** True when this platform failed to load — dims the tile so the hero total is not misread. */
  unavailable?: boolean;
  value: number;
}) {
  return (
    <div
      className={`rounded-xl border bg-(--bg-elevated) px-5 py-4 shadow-sm transition-colors ${
        unavailable
          ? "border-(--border-hairline) opacity-60"
          : active
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
        {error && !hasSuccessfulData ? (
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
            {error ? (
              <span className="mt-2 block text-[11px] font-medium text-(--warn)">
                Data may be stale · {error}
              </span>
            ) : null}
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
    secretsFetchedAt,
    loadSecrets,
    refreshSecrets,
  } = useData();
  const github = useGithubData();
  const requestedSecrets = useRef(false);

  const [flyApps, setFlyApps] = useState<EnrichedFlyApp[]>([]);
  const [flyError, setFlyError] = useState<string | null>(null);
  const [flyLoading, setFlyLoading] = useState(true);
  const [flyFetchedAt, setFlyFetchedAt] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

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

  // Operational cadence: keep the inbox fresh without user attention. GitHub
  // polling is handled by its provider; this interval covers AWS + Fly slices.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setNowMs(Date.now());
      void loadFlyApps();
      void refreshSecrets();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loadFlyApps, refreshSecrets]);

  const githubStats = githubKpis(github.runs, nowMs);
  const secretStats = secretsHygieneStats(secrets, nowMs);
  const flyUnhealthy = flyUnhealthyCount(flyApps);

  const githubHasSuccessfulData = github.fetchedAt !== null;
  const secretsHaveSuccessfulData = secretsFetchedAt !== null;
  const flyHasSuccessfulData = flyFetchedAt !== null;
  const githubSettled = githubHasSuccessfulData || github.error !== null;
  const secretsSettled = secretsHaveSuccessfulData || secretsError !== null;
  const flySettled = flyHasSuccessfulData || flyError !== null;

  const githubRows = githubHasSuccessfulData
    ? buildGithubExceptions(github.runs, nowMs)
    : [];
  const flyRows = flyHasSuccessfulData ? buildFlyExceptions(flyApps) : [];
  const filtered = filterRowsBySource(
    [...githubRows, ...flyRows],
    source,
  );
  const merged = mergeExceptions(filtered);

  const unavailablePlatforms = [
    github.error ? SOURCE_LABELS.github : null,
    secretsError ? SOURCE_LABELS.secrets : null,
    flyError ? SOURCE_LABELS.fly : null,
  ].filter((s): s is string => s !== null);
  const visiblePlatformCount = 3 - unavailablePlatforms.length;

  const loadingWithoutData =
    !githubSettled || !secretsSettled || !flySettled;
  const heroReady =
    source === "github"
      ? githubSettled
      : source === "secrets"
        ? secretsSettled
        : source === "fly"
          ? flySettled
          : githubSettled && secretsSettled && flySettled;
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

  const fetchedAtTimes = [
    github.fetchedAt,
    secretsFetchedAt,
    flyFetchedAt,
  ]
    .filter((t): t is string => t !== null)
    .map((t) => new Date(t).getTime());
  const latestFetchedAt = fetchedAtTimes.length
    ? new Date(Math.max(...fetchedAtTimes)).toISOString()
    : null;

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
          <span>
            {latestFetchedAt
              ? `Updated ${relativeTime(latestFetchedAt)}`
              : "Loading…"}
          </span>
        </div>
      </header>

      {unavailablePlatforms.length > 0 && !loadingWithoutData ? (
        <div
          role="status"
          className="rounded-xl border border-(--warn)/30 bg-(--warn-muted) px-4 py-3 text-xs text-(--warn)"
        >
          {unavailablePlatforms.join(" · ")} unavailable — totals cover{" "}
          {visiblePlatformCount} of 3 platforms. Retry from a tile below.
        </div>
      ) : null}

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
        aria-label="Attention summary"
      >
        {!heroReady ? (
          <HeroSkeleton />
        ) : (
          <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-4 shadow-sm sm:col-span-2">
            <p className="text-xs font-medium text-(--text-secondary)">
              {source ? `${SOURCE_LABELS[source]} items` : "Items needing action"}
            </p>
            <div className="mt-2 flex items-end gap-3">
              <span
                className={`font-(family-name:--font-mono) text-4xl font-light tabular-nums ${
                  merged.dangerCount > 0
                    ? "text-(--danger)"
                    : "text-(--text-primary)"
                }`}
              >
                {merged.dangerCount}
              </span>
              {merged.warnCount > 0 ? (
                <span className="mb-1 rounded-lg bg-(--warn-muted) px-2 py-1 text-[11px] font-medium text-(--warn)">
                  +{merged.warnCount} watch
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[11px] text-(--text-faint)">
              {merged.total === 0
                ? "Nothing failing right now"
                : merged.dangerCount > 0
                  ? "Critical items — open the first row"
                  : "No failures; watch items below"}
            </p>
          </div>
        )}

        {!githubSettled ? (
          <TileSkeleton />
        ) : (
          <MetricTile
            active={source === "github"}
            context="GitHub CLI"
            error={github.error}
            hasSuccessfulData={githubHasSuccessfulData}
            label="GitHub"
            lastUpdated={
              github.fetchedAt ? relativeTime(github.fetchedAt) : null
            }
            onSelect={() => selectSource("github")}
            retry={() => void github.refresh()}
            sub={
              githubStats.live > 0
                ? `${githubStats.failed24h} failed in 24h · ${githubStats.live} live`
                : `${githubStats.failed24h} failed in 24h`
            }
            unavailable={Boolean(github.error)}
            value={githubStats.failed24h}
          />
        )}

        {!secretsSettled ? (
          <TileSkeleton />
        ) : (
          <MetricTile
            active={source === "secrets"}
            context={`${profile || "Default"} · ${region}`}
            error={secretsError}
            hasSuccessfulData={secretsHaveSuccessfulData}
            label="Secrets hygiene"
            lastUpdated={
              secretsFetchedAt ? relativeTime(secretsFetchedAt) : null
            }
            onSelect={() => selectSource("secrets")}
            retry={() => void refreshSecrets()}
            sub={`${secretStats.unrotated} unrotated · ${secretStats.stale} stale`}
            unavailable={Boolean(secretsError)}
            value={secretStats.hygiene}
          />
        )}

        {!flySettled ? (
          <TileSkeleton />
        ) : (
          <div>
            <MetricTile
              active={source === "fly"}
              context="Fly CLI"
              error={flyError}
              hasSuccessfulData={flyHasSuccessfulData}
              label="Fly"
              lastUpdated={
                flyFetchedAt ? relativeTime(flyFetchedAt) : null
              }
              onSelect={() => selectSource("fly")}
              retry={() => void loadFlyApps()}
              sub={`${flyApps.length} apps`}
              unavailable={Boolean(flyError)}
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
              {merged.visible.map((row, index) => (
                <li
                  key={row.id}
                  className={`flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-(--bg-hover) ${
                    index === 0 && source === null && merged.hasDanger
                      ? "bg-(--danger-muted)/50"
                      : ""
                  }`}
                >
                  <span
                    className={`flex shrink-0 items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      row.severity === "danger"
                        ? "bg-(--danger-muted) text-(--danger)"
                        : row.severity === "warn"
                          ? "bg-(--warn-muted) text-(--warn)"
                          : "bg-(--accent-dim) text-(--accent)"
                    }`}
                  >
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${severityDot[row.severity]}`}
                      aria-hidden
                    />
                    {SEVERITY_TEXT[row.severity]}
                  </span>
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

      {/* Standing hygiene debt lives here, not in the exception queue. */}
      <section aria-labelledby="hygiene-heading">
        <h2
          id="hygiene-heading"
          className="mb-3 text-sm font-semibold text-(--text-primary)"
        >
          Secrets hygiene
        </h2>
        {secretsError ? (
          <p className="text-xs text-(--text-faint)">
            Unavailable{secretsError ? ` · ${secretsError}` : ""}
          </p>
        ) : secretStats.hygiene > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-(family-name:--font-mono) text-2xl font-light tabular-nums text-(--text-primary)">
              {secretStats.hygiene}
            </span>
            <span className="text-xs text-(--text-secondary)">of {secrets.length} secrets carry standing debt:</span>
            <Link
              href="/secrets?filter=no-rotation"
              className="rounded-lg bg-(--warn-muted) px-2 py-1 text-[11px] font-medium text-(--warn) hover:bg-(--warn-muted)/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
            >
              {secretStats.unrotated} unrotated
            </Link>
            <Link
              href="/secrets?filter=stale"
              className="rounded-lg bg-(--accent-dim) px-2 py-1 text-[11px] font-medium text-(--accent) hover:bg-(--accent-dim)/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
            >
              {secretStats.stale} stale (&gt;180d)
            </Link>
          </div>
        ) : (
          <p className="text-xs text-(--text-faint)">
            All {secrets.length} secrets rotated and recently accessed.
          </p>
        )}
      </section>
    </div>
  );
}
