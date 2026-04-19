"use client";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  confirmVariant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  message,
  detail,
  confirmLabel = "Confirm",
  confirmVariant = "danger",
  onConfirm,
  onCancel,
  loading,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={loading ? undefined : onCancel}
      />
      <div className="relative w-full max-w-md rounded-lg border border-(--border) bg-(--bg-field) p-6 shadow-xl">
        <h3 className="text-base font-semibold text-(--text-primary)">
          {title}
        </h3>
        <p className="mt-2 text-sm text-(--text-secondary)">{message}</p>
        {detail && (
          <div className="mt-3 max-h-40 overflow-y-auto rounded-md bg-(--bg-surface) p-3 font-(family-name:--font-mono) text-xs text-(--text-muted)">
            {detail}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-md border border-(--border) bg-(--bg-surface) px-4 py-1.5 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-hover) disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-md px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 ${
              confirmVariant === "danger" ? "bg-(--danger)" : "bg-(--accent)"
            }`}
          >
            {loading ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
