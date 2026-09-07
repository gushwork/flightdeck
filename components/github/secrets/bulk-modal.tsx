"use client";

import { useState } from "react";
import type {
  GHSecretInventoryRow,
  GHSecretMutationAction,
  GHSecretsMutationResponse,
} from "@/lib/github/secrets-types";
import { ConfirmDialog } from "@/components/confirm-dialog";

function rowToTarget(row: GHSecretInventoryRow) {
  return {
    platform: row.platform,
    scope: row.scope,
    ownerLogin: row.ownerLogin,
    repoFullName: row.repoFullName,
    environmentName: row.environmentName,
    name: row.name,
  };
}

export function SecretsBulkModal({
  open,
  action,
  rows,
  onClose,
  onComplete,
}: {
  open: boolean;
  action: GHSecretMutationAction;
  rows: GHSecretInventoryRow[];
  onClose: () => void;
  onComplete: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<GHSecretsMutationResponse | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isSet = action === "set-secret" || action === "set-variable";
  const isDelete = action === "delete-secret" || action === "delete-variable";

  if (!open) return null;

  const targets = rows.map(rowToTarget);

  const runPreview = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/github/secrets/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          targets,
          value: isSet ? value : undefined,
          preview: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preview failed");
      setPreview(data);
      setConfirmOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  };

  const runApply = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/github/secrets/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          targets,
          value: isSet ? value : undefined,
          preview: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bulk mutation failed");
      setConfirmOpen(false);
      setPreview(null);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk mutation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-lg rounded-xl border border-(--border-hairline) bg-(--bg-elevated) p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-(--text-primary)">Bulk {action.replace("-", " ")}</h2>
          <p className="mt-1 text-xs text-(--text-muted)">{targets.length} targets selected</p>

          <ul className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-(--border-hairline) bg-(--bg-field) p-2 text-[11px] font-(family-name:--font-mono) text-(--text-secondary)">
            {targets.slice(0, 20).map((t, i) => (
              <li key={i}>
                {t.name} @ {t.repoFullName ?? t.ownerLogin}
                {t.environmentName ? ` / ${t.environmentName}` : ""}
              </li>
            ))}
            {targets.length > 20 && <li>…and {targets.length - 20} more</li>}
          </ul>

          {isSet && (
            <input
              type={action === "set-secret" ? "password" : "text"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Value to apply to all targets"
              className="mt-3 w-full rounded-lg border border-(--border) bg-(--bg-field) px-2.5 py-1.5 font-(family-name:--font-mono) text-xs outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
            />
          )}

          {error && <p className="mt-2 text-xs text-(--danger)">{error}</p>}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-(--border) px-3 py-1.5 text-xs text-(--text-secondary) hover:bg-(--bg-hover)"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || (isSet && !value.trim())}
              onClick={() => (isDelete ? setConfirmOpen(true) : runPreview())}
              className="rounded-lg bg-(--accent) px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {isDelete ? "Delete all" : "Preview"}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={`Apply to ${targets.length} targets?`}
        message={
          preview
            ? `${preview.results.filter((r) => r.ok).length} targets will be updated.`
            : "This action cannot be undone for secrets."
        }
        confirmLabel="Apply"
        confirmVariant={isDelete ? "danger" : "default"}
        loading={busy}
        onConfirm={() => void runApply()}
        onCancel={() => {
          setConfirmOpen(false);
          setPreview(null);
        }}
      />
    </>
  );
}
