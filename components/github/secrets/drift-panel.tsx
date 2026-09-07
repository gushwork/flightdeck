"use client";

import { useCallback, useEffect, useState } from "react";
import type { GHSecretsDriftResponse } from "@/lib/github/secrets-types";
import { SecretsDriftMatrix } from "./drift-matrix";

export function SecretsDriftPanel({
  onBulkFix,
}: {
  onBulkFix?: (name: string, kind: "secret" | "variable") => void;
}) {
  const [drift, setDrift] = useState<GHSecretsDriftResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/github/secrets/drift");
      const data = await res.json();
      if (res.ok) setDrift(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (expanded && !drift) void load();
  }, [expanded, drift, load]);

  return (
    <section className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <h2 className="text-sm font-semibold text-(--text-primary)">Drift audit</h2>
          <p className="text-xs text-(--text-muted)">Secrets present in some repos but missing in others</p>
        </div>
        <span className="text-xs text-(--text-faint)">{expanded ? "Hide" : "Show"}</span>
      </button>
      {expanded && (
        <div className="mt-4">
          {loading && <p className="text-xs text-(--text-muted)">Computing drift…</p>}
          {drift && <SecretsDriftMatrix rows={drift.rows} onBulkFix={onBulkFix} />}
        </div>
      )}
    </section>
  );
}
