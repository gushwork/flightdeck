"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { EnrichedFlyApp, FlyAppStatus } from "@/lib/fly/types";
import {
  getFlyOverviewLead,
  getFlyOverviewLinks,
  overviewAccentCardClass,
  type OverviewAccent,
} from "@/lib/modules/overview-directory";

function linkTitleHoverClass(accent: OverviewAccent | undefined): string {
  switch (accent) {
    case "success": return "group-hover:text-(--success)";
    case "warn":    return "group-hover:text-(--warn)";
    default:        return "group-hover:text-(--accent)";
  }
}

function linkCtaClass(accent: OverviewAccent | undefined): string {
  switch (accent) {
    case "success": return "text-(--success)";
    case "warn":    return "text-(--warn)";
    default:        return "text-(--accent)";
  }
}

function healthColor(h: FlyAppStatus["health"]): string {
  switch (h) {
    case "healthy":  return "bg-(--success)";
    case "degraded": return "bg-(--warn)";
    case "down":     return "bg-(--danger)";
    default:         return "bg-(--text-muted)";
  }
}

function healthLabel(h: FlyAppStatus["health"]): string {
  switch (h) {
    case "healthy":  return "Healthy";
    case "degraded": return "Degraded";
    case "down":     return "Down";
    default:         return "Unknown";
  }
}

function SkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border border-(--border-hairline) bg-(--bg-elevated) p-4"
        >
          <div className="h-4 w-2/3 rounded bg-(--text-muted)/15" />
          <div className="mt-3 h-3 w-1/2 rounded bg-(--text-muted)/10" />
          <div className="mt-4 h-3 w-1/3 rounded bg-(--text-muted)/10" />
        </div>
      ))}
    </div>
  );
}

function relativeTime(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function FlyOverviewClient({
  initialApps,
  initialError,
}: {
  initialApps: EnrichedFlyApp[];
  initialError: string | null;
}) {
  const [apps, setApps] = useState<EnrichedFlyApp[]>(initialApps);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  const fetchApps = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/fly/apps?status=1");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setApps(data.apps ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const lead = getFlyOverviewLead();
  const links = getFlyOverviewLinks();

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <header className="relative overflow-hidden rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-6 py-8 shadow-sm sm:px-8">
        <div
          className="pointer-events-none absolute -right-10 -top-14 h-52 w-52 rounded-full bg-(--success)/18 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-16 -left-8 h-48 w-48 rounded-full bg-(--accent)/12 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute bottom-6 right-1/3 h-36 w-36 rounded-full bg-(--warn)/10 blur-2xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-(--success)">
              Fly.io
            </p>
            <h1 className="mt-2 font-(family-name:--font-display) text-2xl font-medium tracking-tight text-(--text-primary)">
              Fly.io in this workspace
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-(--text-secondary)">
              {lead}
            </p>
            <p className="mt-4 text-sm text-(--text-muted)">
              Authentication uses your local{" "}
              <code className="rounded border border-(--border-hairline) bg-(--success-muted)/50 px-1.5 py-0.5 font-(family-name:--font-mono) text-[12px] text-(--text-primary)">
                flyctl
              </code>{" "}
              session. Run{" "}
              <code className="rounded border border-(--border-hairline) bg-(--success-muted)/50 px-1.5 py-0.5 font-(family-name:--font-mono) text-[12px] text-(--text-primary)">
                fly auth login
              </code>{" "}
              if not authenticated.
            </p>
          </div>
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(145deg,var(--success-muted),var(--accent-muted))] shadow-sm sm:mt-6"
            aria-hidden
          >
            {/** Same mark as `icons.fly` in `components/layout/sidebar.tsx` */}
            <svg width="32" height="32" viewBox="0 0 24 24" className="shrink-0 text-(--accent)" aria-hidden>
              <path
                fill="currentColor"
                d="M11.987 0c-2.45-.01-5.002.925-6.541 2.897-1.17 1.502-1.664 3.474-1.49 5.356.29 2.112 1.476 3.96 2.676 5.672a41.5 41.5 0 0 0 4.216 4.831c-1.063.832-1.943 2.286-1.357 3.644.821 2.32 4.665 2.05 5.122-.372.39-1.288-.694-2.533-1.428-3.309 2.388-2.431 4.706-5.036 6.17-8.145.595-1.32.902-2.802.614-4.24-.28-2.341-1.823-4.473-3.967-5.46C14.76.266 13.364.016 11.987 0m-.236 1.577v15.534C9.881 13.483 7.724 9.266 8.73 5.069c.35-1.539 1.253-3.309 3.02-3.492m1.996.04c1.534.357 3.031 1.096 3.906 2.48 1.3 1.93 1.318 4.55.1 6.521-1.268 2.395-3.06 4.463-4.916 6.415 1.472-2.974 3.074-6.106 3.182-9.5-.043-2.08-.438-4.612-2.272-5.916M11.97 20.103c.848.342 1.597 1.983.153 2.173-.664.15-1.367-.599-.995-1.222.213-.355.488-.73.842-.95"
              />
            </svg>
          </div>
        </div>
      </header>

      {/* App health grid */}
      <section aria-labelledby="fly-apps-heading">
        <div className="mb-5 flex items-center justify-between">
          <h2 id="fly-apps-heading" className="font-(family-name:--font-display) text-lg text-(--text-primary)">
            App health
          </h2>
          <button
            type="button"
            onClick={fetchApps}
            disabled={loading}
            className="rounded-lg border border-(--border-hairline) bg-(--bg-elevated) px-3 py-1.5 text-xs font-medium text-(--text-secondary) transition-colors hover:border-(--accent)/40 hover:text-(--accent) disabled:opacity-50"
          >
            {loading ? "Loading\u2026" : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-(--danger)/30 bg-(--danger)/5 px-4 py-3 text-sm text-(--danger)">
            {error}
          </div>
        )}

        {loading && apps.length === 0 ? (
          <SkeletonGrid />
        ) : apps.length === 0 && !error ? (
          <p className="text-sm text-(--text-muted)">No Fly apps found in your account.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {apps.map((app) => {
              const sd = app.status_detail;
              const health = sd?.health ?? "unknown";
              const machines = sd?.machines ?? [];
              const startedCount = machines.filter((m) => m.state === "started").length;
              const regions = [...new Set(machines.map((m) => m.region))].sort();

              return (
                <div
                  key={app.name}
                  className="group rounded-xl border border-(--border-hairline) bg-(--bg-elevated) p-4 shadow-sm transition-colors hover:border-(--success)/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-(--text-primary)">
                        {app.name}
                      </p>
                      <p className="mt-0.5 text-[11px] text-(--text-muted)">
                        {app.org}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-(--border-hairline) px-2 py-0.5 text-[11px] font-medium">
                      <span className={`inline-block h-2 w-2 rounded-full ${healthColor(health)}`} />
                      {healthLabel(health)}
                    </span>
                  </div>

                  <div className="mt-4 space-y-1.5 text-[12px] text-(--text-secondary)">
                    <div className="flex justify-between">
                      <span>Machines</span>
                      <span className="font-(family-name:--font-mono) tabular-nums">
                        {startedCount}/{machines.length} running
                      </span>
                    </div>
                    {regions.length > 0 && (
                      <div className="flex justify-between">
                        <span>Regions</span>
                        <span className="font-(family-name:--font-mono) uppercase">
                          {regions.join(", ")}
                        </span>
                      </div>
                    )}
                    {app.currentReleaseAt && (
                      <div className="flex justify-between">
                        <span>Last deploy</span>
                        <span>{relativeTime(app.currentReleaseAt)}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Link
                      href={`/fly/secrets?app=${encodeURIComponent(app.name)}`}
                      className="rounded-lg border border-(--border-hairline) px-2.5 py-1 text-[11px] font-semibold text-(--success) transition-colors hover:border-(--success)/40 hover:bg-(--success-muted)/50"
                    >
                      Secrets
                    </Link>
                    <a
                      href={`https://fly.io/apps/${app.name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-(--border-hairline) px-2.5 py-1 text-[11px] font-semibold text-(--text-secondary) transition-colors hover:border-(--accent)/40 hover:text-(--accent)"
                    >
                      Dashboard ↗
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Where to go next */}
      <section aria-labelledby="fly-links-heading">
        <h2
          id="fly-links-heading"
          className="mb-5 font-(family-name:--font-display) text-lg text-(--text-primary)"
        >
          Where to go next
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {links.map((link) => {
            const a = link.accent ?? "accent";
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`group block h-full rounded-xl border p-4 transition-colors ${overviewAccentCardClass(a)}`}
                >
                  <h3
                    className={`text-base font-semibold text-(--text-primary) transition-colors ${linkTitleHoverClass(link.accent)}`}
                  >
                    {link.label}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-(--text-secondary)">
                    {link.description}
                  </p>
                  <span
                    className={`mt-4 inline-block text-xs font-semibold ${linkCtaClass(link.accent)}`}
                  >
                    Open →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
