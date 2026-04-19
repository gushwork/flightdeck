"use client";

interface OverwriteCopyDialogProps {
  open: boolean;
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  overwrite: boolean;
  onOverwriteChange: (value: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function OverwriteCopyDialog({
  open,
  title,
  message,
  detail,
  confirmLabel = "Copy anyway",
  overwrite,
  onOverwriteChange,
  onConfirm,
  onCancel,
  loading,
}: OverwriteCopyDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={loading ? undefined : onCancel}
        aria-hidden
      />
      <div
        className="relative w-full max-w-md rounded-lg border border-(--border) bg-(--bg-field) p-6 shadow-xl"
        role="dialog"
        aria-modal
        aria-labelledby="overwrite-copy-title"
      >
        <h3
          id="overwrite-copy-title"
          className="text-base font-semibold text-(--text-primary)"
        >
          {title}
        </h3>
        <p className="mt-2 text-sm text-(--text-secondary)">{message}</p>
        {detail && (
          <div className="mt-3 max-h-40 overflow-y-auto rounded-md bg-(--bg-surface) p-3 font-(family-name:--font-mono) text-xs text-(--text-muted)">
            {detail}
          </div>
        )}
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm text-(--text-secondary)">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(e) => onOverwriteChange(e.target.checked)}
            disabled={loading}
            className="mt-0.5 rounded border-(--border)"
          />
          <span>
            Overwrite the existing entity in the target account (default policy
            version for policies; replace trust and policies for roles; sync
            policies for users).
          </span>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-md border border-(--border) bg-(--bg-surface) px-4 py-1.5 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-hover) disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || !overwrite}
            className="rounded-md bg-(--accent) px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
