"use client";

import { useState } from "react";
import type {
  GHSecretMutationAction,
  GHSecretMutationTarget,
  GHSecretsMutationResponse,
} from "@/lib/github/secrets-types";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function SecretsMutationForm({
  target,
  action,
  onComplete,
}: {
  target: GHSecretMutationTarget;
  action: GHSecretMutationAction;
  onComplete?: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [preview, setPreview] = useState<GHSecretsMutationResponse | null>(null);

  const isSet = action === "set-secret" || action === "set-variable";
  const isDelete = action === "delete-secret" || action === "delete-variable";

  const runPreview = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/github/secrets/mutations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          targets: [target],
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
      const res = await fetch("/api/github/secrets/mutations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          targets: [target],
          value: isSet ? value : undefined,
          preview: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Mutation failed");
      if (data.results?.some((r: { ok: boolean }) => !r.ok)) {
        const msg = data.results.find((r: { error?: string }) => r.error)?.error;
        throw new Error(msg ?? "Mutation failed");
      }
      setConfirmOpen(false);
      setPreview(null);
      setValue("");
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mutation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {isSet && (
        <input
          type={action === "set-secret" ? "password" : "text"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={action === "set-secret" ? "Secret value" : "Variable value"}
          className="w-full rounded-lg border border-(--border) bg-(--bg-field) px-2.5 py-1.5 font-(family-name:--font-mono) text-xs text-(--text-primary) outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
        />
      )}
      {error && (
        <p className="text-xs text-(--danger)">{error}</p>
      )}
      <button
        type="button"
        disabled={busy || (isSet && !value.trim())}
        onClick={() => (isDelete ? setConfirmOpen(true) : runPreview())}
        className={
          isDelete
            ? "rounded-lg border border-(--danger)/20 bg-(--danger)/5 px-3 py-1.5 text-xs font-semibold text-(--danger) hover:bg-(--danger)/10 disabled:opacity-50"
            : "rounded-lg bg-(--accent) px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
        }
      >
        {isDelete ? "Delete" : "Preview change"}
      </button>

      <ConfirmDialog
        open={confirmOpen}
        title={isDelete ? `Delete ${target.name}?` : `Apply change to ${target.name}?`}
        message={
          preview
            ? `Will ${action.replace("-", " ")} on ${target.scope} scope.`
            : "This cannot be undone for secrets."
        }
        confirmLabel={isDelete ? "Delete" : "Apply"}
        confirmVariant={isDelete ? "danger" : "default"}
        loading={busy}
        onConfirm={() => void (preview || isDelete ? runApply() : runPreview())}
        onCancel={() => {
          setConfirmOpen(false);
          setPreview(null);
        }}
      />
    </div>
  );
}
