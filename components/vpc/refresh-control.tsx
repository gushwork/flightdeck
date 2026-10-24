"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { GhostButton, relativeTime } from "./ui";

/** Refresh button with a live "updated 12s ago" label. */
export function RefreshControl({
  updatedAt,
  refreshing,
  onRefresh,
}: {
  updatedAt: number | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-2">
      {updatedAt && (
        <span className="text-[11px] text-(--text-faint)" aria-live="polite">
          Updated {relativeTime(updatedAt, now)}
        </span>
      )}
      <GhostButton onClick={onRefresh} disabled={refreshing} title="Refresh  (r)">
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={cn(refreshing && "animate-spin")}
        >
          <path d="M13.5 8a5.5 5.5 0 11-1.6-3.9M13.5 2.5v3h-3" />
        </svg>
        {refreshing ? "Refreshing" : "Refresh"}
      </GhostButton>
    </div>
  );
}
