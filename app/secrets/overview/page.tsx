"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useData } from "@/lib/context/data-provider";
import { relativeTime, daysSince } from "@/lib/utils";
import { Skeleton } from "@/components/layout/loading-skeleton";

type Severity = "danger" | "warn" | "info";

interface TriageItem {
  severity: Severity;
  label: string;
  href: string;
  action: string;
}

const SEVERITY_ORDER: Record<Severity, number> = { danger: 0, warn: 1, info: 2 };
const MAX_TRIAGE_ITEMS = 10;

type StatVariant = "default" | "accent" | "success" | "warn";

function StatCard({
  label,
  value,
  detail,
  detailColor,
  variant = "default",
}: {
  label: string;
  value: number;
  detail: string;
  detailColor: string;
  variant?: StatVariant;
}) {
  const shell =
    variant === "accent"
      ? "border-(--accent)/30 bg-(--accent-muted) shadow-[inset_0_1px_0_0_rgba(79,70,229,0.12)]"
      : variant === "success"
        ? "border-(--success)/25 bg-(--success-muted) shadow-[inset_0_1px_0_0_rgba(21,128,61,0.08)]"
        : variant === "warn"
          ? "border-(--warn)/25 bg-(--warn-muted) shadow-[inset_0_1px_0_0_rgba(194,65,12,0.08)]"
          : "border-(--border-hairline) bg-(--bg-elevated)";

  return (
    <div className={`rounded-xl border px-5 py-4 shadow-sm ${shell}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-(--text-muted)">
        {label}
      </p>
      <p className="mt-1 font-(family-name:--font-mono) text-3xl font-semibold tabular-nums text-(--text-primary)">
        {value}
      </p>
      <p className={`mt-1 text-xs ${detailColor}`}>{detail}</p>
    </div>
  );
}

function HealthBar({
  label,
  value,
  suffix = "%",
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  const color =
    value > 80
      ? "bg-(--success)"
      : value > 40
        ? "bg-(--accent)"
        : "bg-(--warn)";

  return (
    <div className="flex items-center gap-3">
      <span className="w-[120px] shrink-0 text-xs text-(--text-secondary)">
        {label}
      </span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-(--bg-muted)">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="w-[48px] shrink-0 text-right font-(family-name:--font-mono) text-xs tabular-nums text-(--text-primary)">
        {Math.round(value)}
        {suffix}
      </span>
    </div>
  );
}

function SeverityDot({ severity }: { severity: Severity }) {
  const color =
    severity === "danger"
      ? "bg-(--danger)"
      : severity === "warn"
        ? "bg-(--warn)"
        : "bg-(--accent)";
  return <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

function SkeletonStatCards() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-4"
        >
          <Skeleton className="mb-2 h-3 w-16" />
          <Skeleton className="mb-2 h-8 w-12" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

function SkeletonHealth() {
  return (
    <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-4 shadow-sm">
      <Skeleton className="mb-4 h-4 w-32" />
      <div className="space-y-3">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  );
}

function SkeletonTriageSection() {
  return (
    <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-6 py-5 shadow-sm">
      <Skeleton className="mb-5 h-5 w-40" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-2 w-2 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SecretsOverviewPage() {
  const router = useRouter();
  const {
    secrets,
    secretsLoading,
    secretsError,
    refreshSecrets,
    loadSecrets,
  } = useData();

  const [triageFocusIndex, setTriageFocusIndex] = useState<number | null>(null);
  const visibleItemsRef = useRef<TriageItem[]>([]);

  useEffect(() => {
    loadSecrets();
  }, [loadSecrets]);

  const loading = secretsLoading;
  const error = secretsError;

  const handleRefresh = () => {
    refreshSecrets();
  };

  const safeSecrets = secrets ?? [];

  const rotationEnabled = safeSecrets.filter((s) => s.rotationEnabled).length;
  const totalSecrets = safeSecrets.length;
  const rotationPct =
    totalSecrets > 0 ? (rotationEnabled / totalSecrets) * 100 : 0;
  const taggedSecrets = safeSecrets.filter(
    (s) => Object.keys(s.tags).length > 0,
  ).length;
  const taggedPct =
    totalSecrets > 0 ? (taggedSecrets / totalSecrets) * 100 : 0;

  const secretsWithoutRotation = safeSecrets.filter((s) => !s.rotationEnabled);
  const staleSecrets = safeSecrets.filter(
    (s) => s.lastAccessedDate && daysSince(s.lastAccessedDate) > 180,
  );

  const triageItems: TriageItem[] = [];
  if (secretsWithoutRotation.length > 0) {
    triageItems.push({
      severity: "warn",
      label: `${secretsWithoutRotation.length} secret${secretsWithoutRotation.length === 1 ? "" : "s"} without auto-rotation`,
      href: "/secrets",
      action: "Review",
    });
  }
  const staleSorted = [...staleSecrets].sort((a, b) => {
    const da = a.lastAccessedDate ? daysSince(a.lastAccessedDate) : 0;
    const db = b.lastAccessedDate ? daysSince(b.lastAccessedDate) : 0;
    return db - da;
  });
  for (const s of staleSorted.slice(0, 8)) {
    const d = daysSince(s.lastAccessedDate!);
    triageItems.push({
      severity: "info",
      label: `${s.name} not accessed in ${d} days`,
      href: `/secrets/${encodeURIComponent(s.name)}`,
      action: "View",
    });
  }
  triageItems.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  const visibleItems = triageItems.slice(0, MAX_TRIAGE_ITEMS);
  const overflowCount = triageItems.length - MAX_TRIAGE_ITEMS;

  const triageCount = visibleItems.length;

  const triageFocusEffective =
    triageCount === 0 || triageFocusIndex === null
      ? null
      : Math.min(triageFocusIndex, triageCount - 1);

  useEffect(() => {
    visibleItemsRef.current = visibleItems;
  }, [visibleItems]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" ||
        el.isContentEditable
      ) {
        return;
      }

      if (e.key === "R" && e.shiftKey) {
        e.preventDefault();
        refreshSecrets();
        return;
      }

      const items = visibleItemsRef.current;
      const n = items.length;
      if (n === 0) return;

      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        setTriageFocusIndex((prev) => {
          if (e.key === "j") {
            if (prev === null) return 0;
            return Math.min(prev + 1, n - 1);
          }
          if (prev === null) return n - 1;
          return Math.max(prev - 1, 0);
        });
        return;
      }

      if (e.key === "Enter") {
        const idx =
          triageCount === 0 || triageFocusIndex === null
            ? null
            : Math.min(triageFocusIndex, triageCount - 1);
        if (idx === null) return;
        const item = items[idx];
        if (item) {
          e.preventDefault();
          router.push(item.href);
        }
      }
    }

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [refreshSecrets, router, triageFocusIndex, triageCount]);

  const lastUpdated =
    safeSecrets.length > 0
      ? safeSecrets.reduce((latest, s) => {
          const t = new Date(s.lastChangedDate || s.createdDate).getTime();
          return t > latest ? t : latest;
        }, 0)
      : null;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-(--danger)/25 bg-(--danger-muted) px-4 py-3">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="var(--danger)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
          >
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 5v3.5M8 10.5v.5" />
          </svg>
          <p className="flex-1 text-sm text-(--danger)">{error}</p>
          <button
            onClick={handleRefresh}
            className="rounded-lg bg-(--danger) px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            Retry
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-(family-name:--font-display) text-3xl font-medium tracking-tight text-(--text-primary)">
            Workspace insights
          </h1>
          <p className="mt-1 text-sm text-(--text-secondary)">
            Secrets Manager health for the current profile and region.{" "}
            <Link href="/secrets" className="font-medium text-(--accent) hover:underline">
              Back to browse
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-(--text-muted)">
              Data as of {relativeTime(new Date(lastUpdated).toISOString())}
            </span>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            title="Refresh (Shift+R)"
            aria-label="Refresh data"
            className="rounded-lg border border-(--border-subtle) bg-(--bg-elevated) px-3 py-1.5 text-xs font-medium text-(--text-secondary) transition-colors hover:bg-(--bg-hover) disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {loading && safeSecrets.length === 0 ? (
        <SkeletonStatCards />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Secrets"
            value={totalSecrets}
            detail={`${rotationEnabled} with rotation`}
            detailColor="text-(--success)"
          />
          <StatCard
            label="Without rotation"
            value={secretsWithoutRotation.length}
            detail={
              secretsWithoutRotation.length === 0
                ? "All configured"
                : "Review rotation rules"
            }
            detailColor={
              secretsWithoutRotation.length > 0
                ? "text-(--warn)"
                : "text-(--success)"
            }
          />
          <StatCard
            label="Stale (&gt;180d)"
            value={staleSecrets.length}
            detail={
              staleSecrets.length === 0
                ? "No idle secrets by access date"
                : "Consider rotation or archival"
            }
            detailColor={
              staleSecrets.length > 0 ? "text-(--warn)" : "text-(--success)"
            }
          />
        </div>
      )}

      {loading && safeSecrets.length === 0 ? (
        <SkeletonHealth />
      ) : (
        <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-4 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-(--text-primary)">
            Secrets health
          </h2>
          <div className="space-y-3">
            <HealthBar label="Rotation coverage" value={rotationPct} />
            <HealthBar label="Tagged" value={taggedPct} />
            <div className="flex items-center gap-3">
              <span className="w-[120px] shrink-0 text-xs text-(--text-secondary)">
                Stale (&gt;180d)
              </span>
              <span
                className={`font-(family-name:--font-mono) text-xs tabular-nums ${
                  staleSecrets.length > 0 ? "text-(--warn)" : "text-(--success)"
                }`}
              >
                {staleSecrets.length}
              </span>
            </div>
          </div>
        </div>
      )}

      {loading && safeSecrets.length === 0 ? (
        <SkeletonTriageSection />
      ) : (
        <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-6 py-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-(family-name:--font-display) text-xl text-(--text-primary)">
              Attention needed
            </h2>
            {visibleItems.length > 0 && (
              <span className="text-[11px] text-(--text-faint)">
                j/k navigate · Enter open ·{" "}
                <kbd className="rounded border border-(--border) px-1 py-0.5 font-(family-name:--font-mono) text-[10px]">
                  Shift+R
                </kbd>{" "}
                refresh
              </span>
            )}
          </div>

          {visibleItems.length === 0 ? (
            <p className="py-4 text-center text-sm text-(--text-muted)">
              Nothing needs attention right now.
            </p>
          ) : (
            <div className="divide-y divide-(--border-hairline)">
              {visibleItems.map((item, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 rounded-lg px-2 py-3 first:pt-2 last:pb-2 -mx-2 transition-colors ${
                    triageFocusEffective === i
                      ? "bg-(--accent-muted)"
                      : ""
                  }`}
                >
                  <SeverityDot severity={item.severity} />
                  <span className="flex-1 text-sm text-(--text-secondary)">
                    {item.label}
                  </span>
                  <Link
                    href={item.href}
                    className="shrink-0 text-xs font-medium text-(--accent) transition-colors hover:underline"
                  >
                    {item.action} →
                  </Link>
                </div>
              ))}
            </div>
          )}

          {overflowCount > 0 && (
            <p className="mt-3 border-t border-(--border-hairline) pt-3 text-xs text-(--text-muted)">
              and {overflowCount} more item{overflowCount === 1 ? "" : "s"}{" "}
              need{overflowCount === 1 ? "s" : ""} attention
            </p>
          )}
        </div>
      )}
    </div>
  );
}
