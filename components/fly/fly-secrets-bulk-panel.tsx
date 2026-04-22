"use client";

import { useRef, useState } from "react";
import {
  parseEnvFile,
  serializeEnvFile,
} from "@/lib/secret-value-format";
import {
  parseEnvMapFromJson,
  parseEnvMapFromEnvText,
  draftsFromEnvMap,
} from "@/lib/amplify-env-map";

type BulkMode = "kv" | "json" | "env";

interface FlySecretsBulkPanelProps {
  onApply: (set: Record<string, string>) => Promise<void>;
  disabled?: boolean;
}

function kvRowsToMap(rows: { key: string; value: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (!k) continue;
    out[k] = r.value;
  }
  return out;
}

export function FlySecretsBulkPanel({ onApply, disabled }: FlySecretsBulkPanelProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<BulkMode>("kv");
  const [kvRows, setKvRows] = useState<{ key: string; value: string }[]>([
    { key: "", value: "" },
  ]);
  const [jsonText, setJsonText] = useState("{}");
  const [envText, setEnvText] = useState("");
  const [textAreaKey, setTextAreaKey] = useState(0);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const jsonTextareaRef = useRef<HTMLTextAreaElement>(null);
  const envTextareaRef = useRef<HTMLTextAreaElement>(null);

  function liveJsonText(): string {
    if (mode === "json" && jsonTextareaRef.current) return jsonTextareaRef.current.value;
    return jsonText;
  }

  function liveEnvText(): string {
    if (mode === "env" && envTextareaRef.current) return envTextareaRef.current.value;
    return envText;
  }

  function resolveMap(): Record<string, string> {
    switch (mode) {
      case "kv":
        return kvRowsToMap(kvRows);
      case "json":
        return parseEnvMapFromJson(liveJsonText());
      case "env":
        return parseEnvMapFromEnvText(liveEnvText());
    }
  }

  function syncDraftsFromMap(map: Record<string, string>) {
    const d = draftsFromEnvMap(map);
    setJsonText(d.jsonText);
    setEnvText(d.envText);
    setKvRows(
      Object.keys(map).length > 0
        ? Object.entries(map).map(([key, value]) => ({ key, value }))
        : [{ key: "", value: "" }],
    );
    setTextAreaKey((k) => k + 1);
  }

  function switchMode(next: BulkMode) {
    if (next === mode) return;
    try {
      const map = resolveMap();
      syncDraftsFromMap(map);
      setMode(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid content for this mode");
    }
  }

  function addKvRow() {
    setKvRows((prev) => [...prev, { key: "", value: "" }]);
  }

  function removeKvRow(index: number) {
    setKvRows((prev) => prev.filter((_, i) => i !== index));
  }

  function updateKvRow(index: number, field: "key" | "value", next: string) {
    setKvRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: next } : row)),
    );
  }

  function handleEnvPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    const trimmed = text.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try { JSON.parse(trimmed); return; } catch { /* may be .env */ }
    }
    const pasted = parseEnvFile(text);
    if (Object.keys(pasted).length === 0) return;
    e.preventDefault();
    const existing = parseEnvFile(liveEnvText());
    const merged = { ...existing, ...pasted };
    const next = serializeEnvFile(merged);
    setEnvText(next);
    if (envTextareaRef.current) envTextareaRef.current.value = next;
    setError(null);
  }

  function handleClear() {
    setKvRows([{ key: "", value: "" }]);
    setJsonText("{}");
    setEnvText("");
    setError(null);
    setTextAreaKey((k) => k + 1);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let map: Record<string, string>;
    try {
      map = resolveMap();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid content");
      return;
    }
    if (Object.keys(map).length === 0) {
      setError("Add at least one KEY=value pair to apply.");
      return;
    }
    setApplying(true);
    try {
      await onApply(map);
      handleClear();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply");
    } finally {
      setApplying(false);
    }
  }

  const busy = applying || disabled;

  const modeTabs: { key: BulkMode; label: string }[] = [
    { key: "kv", label: "Key\u2013value" },
    { key: "json", label: "JSON" },
    { key: "env", label: ".env" },
  ];

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-dashed border-(--border) px-4 py-2.5 text-xs font-medium text-(--text-secondary) transition-colors hover:border-(--accent)/40 hover:text-(--accent)"
      >
        Bulk set secrets (JSON / .env)
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-(--border-hairline) bg-(--bg-elevated) shadow-sm">
      <form onSubmit={handleSubmit}>
        <div className="flex items-center justify-between border-b border-(--border-hairline) px-5 py-3">
          <h3 className="text-sm font-semibold text-(--text-primary)">Bulk set secrets</h3>
          <button
            type="button"
            onClick={() => { setOpen(false); handleClear(); }}
            className="rounded-md p-1 text-(--text-muted) transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="flex flex-wrap gap-1 border-b border-(--border)">
            {modeTabs.map((t) => (
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
            <div className="rounded-md border border-(--danger)/20 bg-(--danger)/5 px-3 py-2 text-sm text-(--danger)">
              {error}
            </div>
          )}

          {mode === "kv" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-(--text-muted)">
                  Each row becomes one secret. Existing secrets with matching names will be overwritten.
                </p>
                <button
                  type="button"
                  onClick={addKvRow}
                  disabled={busy}
                  className="text-xs font-medium text-(--accent) hover:underline disabled:opacity-50"
                >
                  Add key
                </button>
              </div>
              <div className="space-y-2">
                {kvRows.map((row, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={row.key}
                      onChange={(e) => updateKvRow(index, "key", e.target.value)}
                      placeholder="KEY"
                      disabled={busy}
                      className="min-w-0 flex-1 rounded-md border border-(--border) bg-(--bg-field) px-2 py-1.5 font-(family-name:--font-mono) text-xs text-(--text-primary) placeholder:text-(--text-muted) outline-none focus:border-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20 disabled:opacity-50"
                    />
                    <input
                      type="text"
                      value={row.value}
                      onChange={(e) => updateKvRow(index, "value", e.target.value)}
                      placeholder="value"
                      disabled={busy}
                      className="min-w-0 flex-2 rounded-md border border-(--border) bg-(--bg-field) px-2 py-1.5 font-(family-name:--font-mono) text-xs text-(--text-primary) placeholder:text-(--text-muted) outline-none focus:border-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20 disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => removeKvRow(index)}
                      disabled={kvRows.length <= 1 || busy}
                      className="shrink-0 rounded-md border border-(--border) px-2 py-1.5 text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-hover) disabled:opacity-40"
                      title="Remove row"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mode === "json" && (
            <div>
              <textarea
                key={`json-${textAreaKey}`}
                ref={jsonTextareaRef}
                defaultValue={jsonText}
                onInput={(e) => setJsonText(e.currentTarget.value)}
                rows={10}
                spellCheck={false}
                disabled={busy}
                className="w-full rounded-md border border-(--border) bg-(--bg-field) px-3 py-2 font-(family-name:--font-mono) text-xs text-(--text-primary) placeholder:text-(--text-muted) outline-none focus:border-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20 disabled:opacity-50"
                placeholder={'{"DATABASE_URL": "postgres://...", "API_KEY": "sk-..."}'}
              />
              <p className="mt-1 text-[11px] text-(--text-muted)">
                Paste a JSON object whose keys are secret names and values are their values.
              </p>
            </div>
          )}

          {mode === "env" && (
            <div>
              <textarea
                key={`env-${textAreaKey}`}
                ref={envTextareaRef}
                defaultValue={envText}
                onInput={(e) => setEnvText(e.currentTarget.value)}
                onPaste={handleEnvPaste}
                rows={10}
                spellCheck={false}
                disabled={busy}
                className="w-full rounded-md border border-(--border) bg-(--bg-field) px-3 py-2 font-(family-name:--font-mono) text-xs text-(--text-primary) placeholder:text-(--text-muted) outline-none focus:border-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20 disabled:opacity-50"
                placeholder={"DATABASE_URL=postgres://...\nAPI_KEY=\"sk-...\""}
              />
              <p className="mt-1 text-[11px] text-(--text-muted)">
                Paste .env content (KEY=value per line). Pasting merges into existing entries.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleClear}
              disabled={busy}
              className="rounded-lg border border-(--border) bg-(--bg-field) px-3 py-1.5 text-xs text-(--text-secondary) transition-colors hover:bg-(--bg-hover) disabled:opacity-50"
            >
              Clear
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-(--accent) px-4 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {applying ? "Applying\u2026" : "Apply"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
