"use client";

import { useState } from "react";
import {
  draftsFromEnvMap,
  parseEnvMapFromEnvText,
  parseEnvMapFromJson,
} from "@/lib/amplify-env-map";

type Mode = "json" | "env";

function AmplifyEnvBulkModalInner({
  onClose,
  title,
  variables,
  onSave,
  saving,
  disabled,
}: {
  onClose: () => void;
  title: string;
  variables: Record<string, string>;
  onSave: (next: Record<string, string>) => Promise<void>;
  saving?: boolean;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("json");
  const [jsonText, setJsonText] = useState(() =>
    draftsFromEnvMap(variables).jsonText,
  );
  const [envText, setEnvText] = useState(() =>
    draftsFromEnvMap(variables).envText,
  );
  const [error, setError] = useState<string | null>(null);

  function switchMode(next: Mode) {
    if (next === mode) return;
    try {
      const map =
        mode === "json"
          ? parseEnvMapFromJson(jsonText)
          : parseEnvMapFromEnvText(envText);
      const d = draftsFromEnvMap(map);
      setJsonText(d.jsonText);
      setEnvText(d.envText);
      setMode(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid content for this mode");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let next: Record<string, string>;
    try {
      next =
        mode === "json"
          ? parseEnvMapFromJson(jsonText)
          : parseEnvMapFromEnvText(envText);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid content");
      return;
    }
    try {
      await onSave(next);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  const busy = Boolean(saving || disabled);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={busy ? undefined : onClose}
        aria-hidden
      />
      <div className="relative max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-xl border border-(--border) bg-(--bg-field) shadow-xl">
        <form
          onSubmit={handleSubmit}
          className="flex max-h-[85vh] flex-col p-6"
        >
          <div className="mb-4 flex shrink-0 items-center justify-between gap-2">
            <h2 className="font-(family-name:--font-display) text-xl text-(--text-primary)">
              Bulk edit — {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-md p-1 text-(--text-muted) transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary) disabled:opacity-50"
              aria-label="Close"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>

          <p className="mb-3 text-xs text-(--text-secondary)">
            Edit the full environment map. Saving replaces all variables for this scope.
            Switch tabs to convert between JSON and .env (invalid content blocks the switch).
          </p>

          <div className="mb-4 flex shrink-0 flex-wrap gap-1 border-b border-(--border)">
            {(
              [
                { key: "json" as const, label: "JSON" },
                { key: "env" as const, label: ".env" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => switchMode(t.key)}
                disabled={busy}
                className={`px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                  mode === t.key
                    ? "border-b-2 border-(--accent) text-(--accent)"
                    : "text-(--text-secondary) hover:text-(--text-primary)"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-3 shrink-0 rounded-md border border-(--danger)/20 bg-(--danger-dim) px-3 py-2 text-sm text-(--danger)">
              {error}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-hidden">
            {mode === "json" ? (
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                spellCheck={false}
                disabled={busy}
                rows={18}
                className="max-h-[min(60vh,420px)] w-full resize-y rounded-md border border-(--border) bg-(--bg-surface) px-3 py-2 font-(family-name:--font-mono) text-xs text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--accent) focus:outline-none"
                placeholder='{"KEY":"value"}'
              />
            ) : (
              <textarea
                value={envText}
                onChange={(e) => setEnvText(e.target.value)}
                spellCheck={false}
                disabled={busy}
                rows={18}
                className="max-h-[min(60vh,420px)] w-full resize-y rounded-md border border-(--border) bg-(--bg-surface) px-3 py-2 font-(family-name:--font-mono) text-xs text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--accent) focus:outline-none"
                placeholder="KEY=value"
              />
            )}
          </div>

          <div className="mt-4 flex shrink-0 justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-md border border-(--border) bg-(--bg-surface) px-4 py-1.5 text-sm text-(--text-secondary) hover:bg-(--bg-hover) disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-(--accent) px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AmplifyEnvBulkModal({
  open,
  onClose,
  title,
  variables,
  onSave,
  saving,
  disabled,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  variables: Record<string, string>;
  onSave: (next: Record<string, string>) => Promise<void>;
  saving?: boolean;
  disabled?: boolean;
}) {
  if (!open) return null;
  const resetKey = `${title}-${JSON.stringify(variables)}`;
  return (
    <AmplifyEnvBulkModalInner
      key={resetKey}
      onClose={onClose}
      title={title}
      variables={variables}
      onSave={onSave}
      saving={saving}
      disabled={disabled}
    />
  );
}
