"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SecretsBrowseFilter } from "@/lib/secrets/page-url";

interface InsightsPanelProps {
  total: number;
  rotationPct: number;
  staleCount: number;
  unrotatedCount: number;
  staleNames: { name: string; days: number }[];
  filter: SecretsBrowseFilter;
  onFilter: (filter: SecretsBrowseFilter) => void;
}

interface TriageItem {
  key: string;
  label: string;
  href?: string;
  filter?: SecretsBrowseFilter;
}

export function InsightsPanel({
  total,
  rotationPct,
  staleCount,
  unrotatedCount,
  staleNames,
  filter,
  onFilter,
}: InsightsPanelProps) {
  const router = useRouter();
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const itemsRef = useRef<TriageItem[]>([]);

  const items = useMemo<TriageItem[]>(
    () => [
      ...(unrotatedCount > 0
        ? [{
            key: "unrotated",
            label: `${unrotatedCount} secret${unrotatedCount === 1 ? "" : "s"} without auto-rotation`,
            filter: "no-rotation" as const,
          }]
        : []),
      ...staleNames.map(({ name, days }) => ({
        key: name,
        label: `${name} not accessed in ${days} days`,
        href: `/secrets/${encodeURIComponent(name)}`,
      })),
    ],
    [staleNames, unrotatedCount],
  );

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      const currentItems = itemsRef.current;
      if (currentItems.length === 0) return;

      if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        setFocusIndex((current) => {
          if (event.key === "j") {
            return current === null ? 0 : Math.min(current + 1, currentItems.length - 1);
          }
          return current === null ? currentItems.length - 1 : Math.max(current - 1, 0);
        });
        return;
      }

      if (event.key === "Enter" && focusIndex !== null) {
        const item = currentItems[Math.min(focusIndex, currentItems.length - 1)];
        if (!item) return;
        event.preventDefault();
        if (item.filter) onFilter(item.filter);
        else if (item.href) router.push(item.href);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [focusIndex, onFilter, router]);

  const stats: {
    label: string;
    value: number;
    detail: string;
    target: SecretsBrowseFilter;
  }[] = [
    { label: "Total", value: total, detail: "All secrets", target: "all" },
    {
      label: "Rotation %",
      value: Math.round(rotationPct),
      detail: `${unrotatedCount} without auto-rotation`,
      target: "no-rotation",
    },
    {
      label: "Stale",
      value: staleCount,
      detail: "Not accessed in 180+ days",
      target: "stale",
    },
  ];

  return (
    <section className="space-y-4" aria-label="Secrets insights">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <button
            key={stat.label}
            type="button"
            onClick={() => onFilter(stat.target)}
            className={`rounded-xl border bg-(--bg-elevated) px-5 py-4 text-left shadow-sm transition-colors hover:border-(--accent)/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20 ${
              filter === stat.target
                ? "border-(--accent)/40"
                : "border-(--border-hairline)"
            }`}
          >
            <p className="text-xs font-medium text-(--text-secondary)">{stat.label}</p>
            <p className="mt-1 font-(family-name:--font-mono) text-3xl font-light tabular-nums text-(--text-primary)">
              {stat.value}
            </p>
            <p className="mt-1 text-[11px] text-(--text-faint)">{stat.detail}</p>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-(--text-primary)">Attention needed</h2>
          {items.length > 0 && (
            <span className="text-[11px] text-(--text-faint)">j/k navigate · Enter open</span>
          )}
        </div>
        {items.length === 0 ? (
          <p className="py-2 text-sm text-(--text-muted)">Nothing needs attention right now.</p>
        ) : (
          <div className="divide-y divide-(--border-hairline)">
            {items.map((item, index) => (
              <div
                key={item.key}
                className={`-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 ${
                  focusIndex === index ? "bg-(--accent-muted)" : ""
                }`}
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-(--warn)" />
                <span className="flex-1 text-sm text-(--text-secondary)">{item.label}</span>
                {item.filter ? (
                  <button
                    type="button"
                    onClick={() => onFilter(item.filter!)}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-(--accent) hover:bg-(--accent-muted) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
                  >
                    Review →
                  </button>
                ) : (
                  <Link
                    href={item.href!}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-(--accent) hover:bg-(--accent-muted) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
                  >
                    View →
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
