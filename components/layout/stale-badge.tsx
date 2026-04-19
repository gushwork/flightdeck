"use client";

import { useEffect, useState } from "react";
import { relativeTime } from "@/lib/utils";

export function StaleBadge({
  fetchedAt,
  onRefresh,
}: {
  fetchedAt: string;
  onRefresh: () => void;
}) {
  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    function check() {
      setIsStale(
        (Date.now() - new Date(fetchedAt).getTime()) / 60_000 > 5,
      );
    }
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [fetchedAt]);

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`text-xs ${isStale ? "text-(--warn)" : "text-(--text-muted)"}`}
      >
        Updated {relativeTime(fetchedAt)}
      </span>
      <button
        type="button"
        onClick={onRefresh}
        className={`rounded p-1 transition-colors hover:bg-(--bg-hover) ${
          isStale ? "text-(--warn)" : "text-(--text-muted)"
        }`}
        title="Refresh data"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1.5 2.5v4h4" />
          <path d="M14.5 13.5v-4h-4" />
          <path d="M2.83 10a5.5 5.5 0 009.34 1.5M13.17 6A5.5 5.5 0 003.83 4.5" />
        </svg>
      </button>
    </span>
  );
}
