"use client";

import type { GHSecretsIndexStats } from "@/lib/github/secrets-types";

export function SecretsStatRibbon({ stats }: { stats: GHSecretsIndexStats }) {
  const cards = [
    { label: "Secrets", value: stats.totalSecrets },
    { label: "Variables", value: stats.totalVariables },
    { label: "Repos scanned", value: stats.reposScanned },
    { label: "Orgs", value: stats.orgsScanned },
    { label: "Repo errors", value: stats.reposWithErrors, warn: stats.reposWithErrors > 0 },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-4 shadow-sm"
        >
          <div
            className="font-(family-name:--font-mono) text-3xl font-light tabular-nums"
            style={{ color: c.warn ? "var(--warn)" : "var(--text-primary)" }}
          >
            {c.value}
          </div>
          <div className="text-xs font-medium text-(--text-secondary)">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
