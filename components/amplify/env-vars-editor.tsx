"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { parseEnvFile } from "@/lib/secret-value-format";

function recordToRows(env: Record<string, string>): { key: string; value: string }[] {
  const keys = Object.keys(env).sort((a, b) => a.localeCompare(b));
  return keys.map((key) => ({ key, value: env[key] ?? "" }));
}

function rowsToRecord(rows: { key: string; value: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const k = row.key.trim();
    if (!k) continue;
    out[k] = row.value;
  }
  return out;
}

function EnvVarsEditorInner({
  title,
  titleActions,
  variables,
  onSave,
  disabled,
  saving,
  error,
}: {
  title: string;
  titleActions?: ReactNode;
  variables: Record<string, string>;
  onSave: (next: Record<string, string>) => Promise<void>;
  disabled?: boolean;
  saving?: boolean;
  error?: string | null;
}) {
  const [rows, setRows] = useState(() => recordToRows(variables));
  const [localError, setLocalError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());

  function updateRow(
    index: number,
    field: "key" | "value",
    next: string,
  ) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: next } : row)),
    );
  }

  function addRow() {
    setRows((prev) => [...prev, { key: "", value: "" }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleReveal(index: number) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const allRevealed =
    rows.length > 0 && rows.every((_, i) => revealed.has(i));

  function toggleRevealAll() {
    setRevealed((prev) => {
      if (rows.length === 0) return prev;
      const everyShown = rows.every((_, i) => prev.has(i));
      if (everyShown) return new Set();
      return new Set(rows.map((_, i) => i));
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    const next = rowsToRecord(rows);
    const keys = new Set<string>();
    for (const row of rows) {
      const k = row.key.trim();
      if (!k) continue;
      if (keys.has(k)) {
        setLocalError(`Duplicate key: ${k}`);
        return;
      }
      keys.add(k);
    }
    try {
      await onSave(next);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Save failed");
    }
  }

  function handleEnvPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    const parsed = parseEnvFile(text);
    if (Object.keys(parsed).length === 0) return;
    e.preventDefault();
    setRows(recordToRows(parsed));
    setLocalError(null);
  }

  const mergedError = error ?? localError;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 max-w-full flex-1 items-center gap-2">
          <h3 className="min-w-0 shrink text-sm font-semibold text-(--text-primary)">
            {title}
          </h3>
          {titleActions}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleRevealAll}
            disabled={disabled || saving || rows.length === 0}
            className="rounded-md border border-(--border) bg-(--bg-surface) p-1.5 text-(--text-muted) hover:bg-(--bg-hover) hover:text-(--text-primary) disabled:opacity-50"
            title={allRevealed ? "Hide all values" : "Show all values"}
            aria-label={allRevealed ? "Hide all values" : "Show all values"}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden
            >
              {allRevealed ? (
                <>
                  <path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
                  <circle cx="8" cy="8" r="2" />
                </>
              ) : (
                <>
                  <path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
                  <line x1="3" y1="14" x2="13" y2="2" />
                </>
              )}
            </svg>
          </button>
          <button
            type="button"
            onClick={addRow}
            disabled={disabled || saving}
            className="rounded-md border border-(--border) bg-(--bg-surface) px-2.5 py-1 text-xs font-medium text-(--text-secondary) hover:bg-(--bg-hover) disabled:opacity-50"
          >
            Add variable
          </button>
          <button
            type="submit"
            disabled={disabled || saving}
            className="rounded-md bg-(--accent) px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <p className="text-[11px] text-(--text-muted)">
        Paste .env lines into any value field to replace the table with imported keys.
        Values are stored as Amplify Hosting environment variables (plain text in the API).
      </p>

      {mergedError && (
        <p className="text-xs text-(--danger)">{mergedError}</p>
      )}

      <div className="overflow-x-auto rounded-lg border border-(--border)">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-(--border) bg-(--bg-surface) text-xs text-(--text-muted)">
              <th className="px-3 py-2 font-medium">Key</th>
              <th className="px-3 py-2 font-medium">Value</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-3 py-6 text-center text-xs text-(--text-muted)"
                >
                  No variables. Add one or paste a .env block.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i} className="border-b border-(--border) last:border-0">
                  <td className="px-2 py-1.5 align-top">
                    <input
                      value={row.key}
                      onChange={(e) => updateRow(i, "key", e.target.value)}
                      onPaste={handleEnvPaste}
                      disabled={disabled || saving}
                      className="w-full rounded border border-transparent bg-(--bg-field) px-2 py-1 font-(family-name:--font-mono) text-xs text-(--text-primary) focus:border-(--accent) focus:outline-none"
                      placeholder="NAME"
                      spellCheck={false}
                    />
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <input
                      type={revealed.has(i) ? "text" : "password"}
                      value={row.value}
                      onChange={(e) => updateRow(i, "value", e.target.value)}
                      onPaste={handleEnvPaste}
                      disabled={disabled || saving}
                      className="w-full rounded border border-transparent bg-(--bg-field) px-2 py-1 font-(family-name:--font-mono) text-xs text-(--text-primary) focus:border-(--accent) focus:outline-none"
                      placeholder="value"
                      autoComplete="off"
                    />
                  </td>
                  <td className="px-1 py-1.5 align-top">
                    <div className="flex gap-0.5">
                      <button
                        type="button"
                        onClick={() => toggleReveal(i)}
                        className="rounded p-1 text-(--text-muted) hover:bg-(--bg-hover) hover:text-(--text-primary)"
                        title={revealed.has(i) ? "Hide" : "Show"}
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                          {revealed.has(i) ? (
                            <>
                              <path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
                              <circle cx="8" cy="8" r="2" />
                            </>
                          ) : (
                            <>
                              <path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" />
                              <line x1="3" y1="14" x2="13" y2="2" />
                            </>
                          )}
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        disabled={disabled || saving}
                        className="rounded p-1 text-(--text-muted) hover:bg-(--danger-dim) hover:text-(--danger) disabled:opacity-50"
                        title="Remove"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                          <path d="M4 4l8 8M12 4l-8 8" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </form>
  );
}

export function EnvVarsEditor(props: {
  title: string;
  titleActions?: ReactNode;
  variables: Record<string, string>;
  onSave: (next: Record<string, string>) => Promise<void>;
  disabled?: boolean;
  saving?: boolean;
  error?: string | null;
}) {
  return (
    <EnvVarsEditorInner
      key={JSON.stringify(props.variables)}
      {...props}
    />
  );
}
