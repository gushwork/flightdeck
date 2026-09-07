"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { filterIndexRows, searchParamsFromRecord } from "@/lib/github/filter-index";
import type {
  GHSecretInventoryRow,
  GHSecretsIndexResponse,
} from "@/lib/github/secrets-types";
import { SecretsStatRibbon } from "./stat-ribbon";
import { SecretsFilterBar } from "./filter-bar";
import { SecretsInventoryTable, inventoryRowKey } from "./inventory-table";
import { SecretsScanProgress } from "./scan-progress";
import { SecretsRepoDrawer } from "./repo-drawer";
import { SecretsDriftPanel } from "./drift-panel";
import { SecretsBulkModal } from "./bulk-modal";

function DashboardContent() {
  const searchParams = useSearchParams();
  const [indexResponse, setIndexResponse] = useState<GHSecretsIndexResponse | null>(null);
  const [allRows, setAllRows] = useState<GHSecretInventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanStartedAt, setScanStartedAt] = useState<number | null>(null);
  const [scanElapsedSec, setScanElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [drawerRepo, setDrawerRepo] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<
    "set-secret" | "set-variable" | "delete-secret" | "delete-variable"
  >("set-secret");
  const [page, setPage] = useState(1);

  const filterParams = useMemo(() => {
    const record: Record<string, string | undefined> = {};
    for (const key of ["q", "owner", "scope", "platform", "kind", "repo", "environment"]) {
      const v = searchParams.get(key);
      if (v) record[key] = v;
    }
    return searchParamsFromRecord(record);
  }, [searchParams]);

  const filteredRows = useMemo(
    () => filterIndexRows(allRows, filterParams),
    [allRows, filterParams],
  );

  useEffect(() => {
    setPage(1);
  }, [filterParams]);

  useEffect(() => {
    if (!scanning || scanStartedAt === null) return;
    const id = window.setInterval(() => {
      setScanElapsedSec(Math.floor((Date.now() - scanStartedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [scanning, scanStartedAt]);

  const loadIndex = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/github/secrets/index");
      const data = (await res.json()) as GHSecretsIndexResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load index");
      setIndexResponse(data);
      setAllRows(data.index.rows ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setScanning(true);
    setScanStartedAt(Date.now());
    setScanElapsedSec(0);
    setError(null);
    try {
      const res = await fetch("/api/github/secrets/index", { method: "POST", body: "{}" });
      const data = (await res.json()) as GHSecretsIndexResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Refresh failed");
      setIndexResponse(data);
      setAllRows(data.index.rows ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setScanning(false);
      setScanStartedAt(null);
    }
  }, []);

  useEffect(() => {
    void loadIndex();
  }, [loadIndex]);

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectedRows = filteredRows.filter((r) => selected.has(inventoryRowKey(r)));
  const neverScanned = indexResponse !== null && !indexResponse.index.scannedAt;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-(family-name:--font-display) text-2xl font-medium text-(--text-primary)">
            Secrets
          </h1>
          <p className="mt-1 text-sm text-(--text-muted)">
            Actions secrets and variables across all accessible repositories.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={scanning}
          className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {scanning ? "Scanning…" : neverScanned ? "Scan repositories" : "Refresh index"}
        </button>
      </div>

      {neverScanned && !scanning && (
        <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-5 py-4 shadow-sm">
          <p className="text-sm font-medium text-(--text-secondary)">No inventory yet</p>
          <p className="mt-1 text-xs text-(--text-muted)">
            Scanning all accessible repositories can take a minute or more. Click{" "}
            <strong className="font-medium text-(--text-secondary)">Scan repositories</strong> to
            start.
          </p>
        </div>
      )}

      <SecretsScanProgress
        active={scanning}
        message={
          scanning
            ? `Scanning all repositories (${scanElapsedSec}s elapsed)…`
            : indexResponse?.index.scannedAt
              ? `Scanned ${indexResponse.index.stats.reposScanned} repos in ${Math.round(indexResponse.index.scanDurationMs / 1000)}s`
              : undefined
        }
      />

      {error && (
        <div className="rounded-lg border border-(--danger)/20 bg-(--danger)/5 px-4 py-3 text-sm text-(--danger)">
          {error}
        </div>
      )}

      {indexResponse && !neverScanned && (
        <>
          {indexResponse.stale && (
            <p className="text-xs text-(--warn)">Index may be stale — refresh for latest data.</p>
          )}
          <SecretsStatRibbon stats={indexResponse.index.stats} />
        </>
      )}

      <Suspense fallback={null}>
        <SecretsFilterBar />
      </Suspense>

      <SecretsDriftPanel
        onBulkFix={(name, kind) => {
          const matching = filteredRows.filter((r) => r.name === name && r.kind === kind);
          setSelected(new Set(matching.map(inventoryRowKey)));
          setBulkAction(kind === "secret" ? "set-secret" : "set-variable");
          setBulkOpen(true);
        }}
      />

      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-(--border-hairline) bg-(--bg-elevated) px-4 py-3">
          <span className="text-xs text-(--text-secondary)">{selected.size} selected</span>
          <button
            type="button"
            onClick={() => {
              setBulkAction("set-secret");
              setBulkOpen(true);
            }}
            className="rounded-lg bg-(--accent) px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            Bulk edit
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs text-(--text-muted) hover:text-(--text-primary)"
          >
            Clear
          </button>
        </div>
      )}

      {loading && !indexResponse ? (
        <p className="text-sm text-(--text-muted)">Loading inventory…</p>
      ) : (
        <SecretsInventoryTable
          rows={filteredRows}
          page={page}
          onPageChange={setPage}
          selected={selected}
          onToggleSelect={toggleSelect}
          onSelectRepo={setDrawerRepo}
        />
      )}

      <SecretsRepoDrawer
        repoFullName={drawerRepo}
        open={drawerRepo !== null}
        onClose={() => setDrawerRepo(null)}
        onMutated={() => void refresh()}
      />

      <SecretsBulkModal
        open={bulkOpen}
        action={bulkAction}
        rows={selectedRows}
        onClose={() => setBulkOpen(false)}
        onComplete={() => {
          setBulkOpen(false);
          setSelected(new Set());
          void refresh();
        }}
      />
    </div>
  );
}

export function SecretsInventoryDashboard() {
  return (
    <Suspense fallback={<p className="text-sm text-(--text-muted)">Loading…</p>}>
      <DashboardContent />
    </Suspense>
  );
}
