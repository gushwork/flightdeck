"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type {
  FlyDomainApplyPreview,
  Route53HostedZoneSummary,
} from "@/lib/domains/types";
import type { FlyCertCheckResult, FlyCertStatus } from "@/lib/fly/types";

interface DomainPreviewModalProps {
  appName: string;
  hostname: string;
  region: string;
  profile?: string;
  workspaceQuery: URLSearchParams;
  onClose: () => void;
  onApplied: () => void;
  onRevalidated?: () => void;
}

function certStatusBannerClass(status: FlyCertStatus): string {
  switch (status) {
    case "ready":
      return "border-(--success)/20 bg-(--success-muted) text-(--success)";
    case "pending":
      return "border-(--warn)/20 bg-(--warn-muted) text-(--warn)";
    case "failed":
      return "border-(--danger)/20 bg-(--danger-muted) text-(--danger)";
    default:
      return "border-(--border) bg-(--bg-muted) text-(--text-muted)";
  }
}

export function DomainPreviewModal({
  appName,
  hostname,
  region,
  profile,
  workspaceQuery,
  onClose,
  onApplied,
  onRevalidated,
}: DomainPreviewModalProps) {
  const [zones, setZones] = useState<Route53HostedZoneSummary[]>([]);
  const [hostedZoneId, setHostedZoneId] = useState("");
  const [preview, setPreview] = useState<FlyDomainApplyPreview | null>(null);
  const [certStatus, setCertStatus] = useState<FlyCertCheckResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [revalidating, setRevalidating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadZones = useCallback(async () => {
    const q = new URLSearchParams(workspaceQuery);
    const res = await fetch(`/api/route53/hosted-zones?${q}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load zones");
    setZones(data.zones ?? []);
  }, [workspaceQuery]);

  const loadPreview = useCallback(async (zoneId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/route53/fly-domains/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appName,
          hostname,
          region,
          profile,
          hostedZoneId: zoneId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preview failed");
      setPreview(data.preview);
      setHostedZoneId(data.preview.hostedZoneId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [appName, hostname, region, profile]);

  const fetchCertStatus = useCallback(async () => {
    const res = await fetch(
      `/api/fly/apps/${encodeURIComponent(appName)}/certs/${encodeURIComponent(hostname)}`,
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Revalidate failed");
    setCertStatus(data.cert);
    return data.cert as FlyCertCheckResult;
  }, [appName, hostname]);

  async function revalidate() {
    setRevalidating(true);
    setError(null);
    try {
      await fetchCertStatus();
      await loadPreview(hostedZoneId || undefined);
      onRevalidated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revalidate failed");
    } finally {
      setRevalidating(false);
    }
  }

  useEffect(() => {
    void loadZones().then(async () => {
      await loadPreview();
      try {
        await fetchCertStatus();
      } catch {
        /* cert check optional on open */
      }
    });
  }, [loadZones, loadPreview, fetchCertStatus]);

  const hasOverwrite = preview?.changes.some(
    (c) => c.action === "UPSERT" && c.currentValues.length > 0,
  );

  const confirmDetail = useMemo(() => {
    if (!preview || !hasOverwrite) return undefined;
    return preview.changes
      .filter((c) => c.action === "UPSERT" && c.currentValues.length > 0)
      .map(
        (c) =>
          `${c.name} ${c.type}: ${c.currentValues.join(", ")} → ${c.values.join(", ")}`,
      )
      .join("\n");
  }, [preview, hasOverwrite]);

  async function apply() {
    if (!preview) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch("/api/route53/fly-domains/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appName,
          hostname,
          hostedZoneId: preview.hostedZoneId,
          region,
          profile,
          changes: preview.changes,
          changesHash: preview.changesHash,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Apply failed");
      setConfirmOpen(false);
      onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={applying ? undefined : onClose} />
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-(--border-hairline) bg-(--bg-elevated) p-6 shadow-sm">
        <h2 className="font-(family-name:--font-display) text-2xl font-medium text-(--text-primary)">
          Route 53 preview
        </h2>
        <p className="mt-1 font-(family-name:--font-mono) text-xs text-(--text-muted)">
          {appName} · {hostname}
        </p>

        <div className="mt-4">
          <label className="text-xs font-medium text-(--text-secondary)">Hosted zone</label>
          <select
            value={hostedZoneId}
            onChange={(e) => {
              setHostedZoneId(e.target.value);
              void loadPreview(e.target.value);
            }}
            className="mt-1 w-full rounded-lg border border-(--border) bg-(--bg-field) px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
          >
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name} {z.privateZone ? "(private)" : ""}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="mt-3 text-sm text-(--danger)">{error}</p>
        )}

        {certStatus && !loading && (
          <div
            className={`mt-4 rounded-lg border px-3 py-2 text-xs font-medium ${certStatusBannerClass(certStatus.status)}`}
          >
            Fly cert: {certStatus.status}
            {certStatus.clientStatus ? ` — ${certStatus.clientStatus}` : ""}
          </div>
        )}

        {loading && (
          <p className="mt-4 text-sm text-(--text-muted)">Loading preview…</p>
        )}

        {preview && !loading && (
          <>
            {preview.warnings.length > 0 && (
              <ul className="mt-4 space-y-1 rounded-lg border border-(--warn)/20 bg-(--warn-muted) px-3 py-2 text-xs text-(--warn)">
                {preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            {preview.changes.length === 0 ? (
              <p className="mt-4 text-sm text-(--text-secondary)">
                No changes needed — records already match Fly requirements.
              </p>
            ) : (
              <table className="mt-4 w-full text-left text-xs">
                <thead className="text-(--text-muted)">
                  <tr>
                    <th className="py-2 pr-2">Name</th>
                    <th className="py-2 pr-2">Type</th>
                    <th className="py-2 pr-2">Route 53 now</th>
                    <th className="py-2 pr-2">Fly requires</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.changes.map((c) => (
                    <tr key={`${c.name}-${c.type}`} className="border-t border-(--border-hairline)">
                      <td className="py-2 pr-2 font-(family-name:--font-mono)">{c.name}</td>
                      <td className="py-2 pr-2">{c.type}</td>
                      <td className="py-2 pr-2 font-(family-name:--font-mono) text-(--text-muted)">
                        {c.currentValues.length > 0 ? c.currentValues.join(", ") : "—"}
                      </td>
                      <td className="py-2 pr-2 font-(family-name:--font-mono) text-(--text-primary)">
                        {c.values.join(", ")}
                      </td>
                      <td className="py-2">
                        <span
                          className={
                            c.action === "UPSERT"
                              ? "text-(--warn)"
                              : "text-(--accent)"
                          }
                        >
                          {c.action}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => void revalidate()}
                disabled={applying || revalidating || loading}
                className="rounded-lg border border-(--border) px-4 py-2 text-sm text-(--text-secondary) hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20 disabled:opacity-50"
              >
                {revalidating ? "Revalidating…" : "Revalidate"}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={applying || revalidating}
                className="rounded-lg border border-(--border) px-4 py-2 text-sm text-(--text-secondary) hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
              >
                Cancel
              </button>
              {preview.changes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={applying || revalidating}
                  className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20 disabled:opacity-50"
                >
                  Apply to Route 53
                </button>
              )}
            </div>
          </>
        )}

        {!preview && !loading && (
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => void revalidate()}
              disabled={revalidating}
              className="rounded-lg border border-(--border) px-4 py-2 text-sm text-(--text-secondary) hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20 disabled:opacity-50"
            >
              {revalidating ? "Revalidating…" : "Revalidate"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-(--border) px-4 py-2 text-sm text-(--text-secondary) hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
            >
              Cancel
            </button>
          </div>
        )}

        <ConfirmDialog
          open={confirmOpen}
          title={hasOverwrite ? "Replace existing DNS records?" : "Create DNS records?"}
          message={
            hasOverwrite
              ? `${preview?.changes.filter((c) => c.action === "UPSERT").length ?? 0} record(s) in ${preview?.hostedZoneName ?? "this zone"} will be updated. Review Route 53 values above before confirming.`
              : `Create ${preview?.changes.length ?? 0} record(s) in ${preview?.hostedZoneName ?? "this zone"}.`
          }
          detail={confirmDetail}
          confirmLabel={hasOverwrite ? "Replace records" : "Create records"}
          confirmVariant={hasOverwrite ? "danger" : "default"}
          loading={applying}
          onConfirm={() => void apply()}
          onCancel={() => setConfirmOpen(false)}
        />
      </div>
    </div>
  );
}
