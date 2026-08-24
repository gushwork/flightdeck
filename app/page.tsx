"use client";

import { Suspense } from "react";
import { NeedsAttentionDashboard } from "@/components/dashboard/needs-attention";

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="h-8 w-48 animate-pulse rounded bg-(--bg-muted)" />
          <div className="grid gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-xl bg-(--bg-muted)"
              />
            ))}
          </div>
        </div>
      }
    >
      <NeedsAttentionDashboard />
    </Suspense>
  );
}
