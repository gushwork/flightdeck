"use client";

import { useEffect, useRef, useState } from "react";
import {
  type SecretOriginalKind,
  draftFromMode,
  parseEnvFile,
  serializeEnvFile,
  stringToEditorDrafts,
} from "@/lib/secret-value-format";

export type EditMode = "kv" | "json" | "env";

interface SecretValueEditorProps {
  secretString: string;
  onSave: (next: string) => Promise<void>;
  onCancel: () => void;
}

export function SecretValueEditor({
  secretString,
  onSave,
  onCancel,
}: SecretValueEditorProps) {
  const [mode, setMode] = useState<EditMode>("kv");
  const [originalKind, setOriginalKind] = useState<SecretOriginalKind>("plain");
  const [kvRows, setKvRows] = useState<{ key: string; value: string }[]>([]);
  const [jsonText, setJsonText] = useState("");
  const [envText, setEnvText] = useState("");
  /** Bumps when `secretString` loads so JSON/.env textareas remount with fresh `defaultValue`. */
  const [textAreaKey, setTextAreaKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const jsonTextareaRef = useRef<HTMLTextAreaElement>(null);
  const envTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const d = stringToEditorDrafts(secretString);
    setKvRows(d.kvRows);
    setJsonText(d.jsonText);
    setEnvText(d.envText);
    setOriginalKind(d.originalKind);
    setMode("kv");
    setError(null);
    setTextAreaKey((k) => k + 1);
  }, [secretString]);

  function liveJsonText(): string {
    if (mode === "json" && jsonTextareaRef.current) {
      return jsonTextareaRef.current.value;
    }
    return jsonText;
  }

  function liveEnvText(): string {
    if (mode === "env" && envTextareaRef.current) {
      return envTextareaRef.current.value;
    }
    return envText;
  }

  function applyDraftsFromString(s: string) {
    const d = stringToEditorDrafts(s);
    setKvRows(d.kvRows);
    setJsonText(d.jsonText);
    setEnvText(d.envText);
    if (d.originalKind === "object") setOriginalKind("object");
  }

  function switchMode(next: EditMode) {
    if (next === mode) return;
    try {
      const s = draftFromMode(
        mode,
        kvRows,
        liveJsonText(),
        liveEnvText(),
        originalKind,
      );
      applyDraftsFromString(s);
      setMode(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid value for this mode");
    }
  }

  function addKvRow() {
    setKvRows((prev) => {
      const next = [...prev, { key: "", value: "" }];
      if (prev.length >= 1) setOriginalKind("object");
      return next;
    });
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
      try {
        JSON.parse(trimmed);
        return;
      } catch {
        /* may be .env */
      }
    }
    const pasted = parseEnvFile(text);
    if (Object.keys(pasted).length === 0) return;
    e.preventDefault();
    const existing = parseEnvFile(liveEnvText());
    const merged = { ...existing, ...pasted };
    const next = serializeEnvFile(merged);
    setEnvText(next);
    if (envTextareaRef.current) {
      envTextareaRef.current.value = next;
    }
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let next: string;
    try {
      next = draftFromMode(
        mode,
        kvRows,
        liveJsonText(),
        liveEnvText(),
        originalKind,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid value");
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const modeTabs: { key: EditMode; label: string }[] = [
    { key: "kv", label: "Key–value" },
    { key: "json", label: "JSON" },
    { key: "env", label: ".env" },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-wrap gap-1 border-b border-(--border)">
        {modeTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => switchMode(t.key)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
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
        <div className="rounded-md border border-(--danger)/20 bg-(--danger-dim) px-3 py-2 text-sm text-(--danger)">
          {error}
        </div>
      )}

      {mode === "kv" && (
        <div className="space-y-2">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={addKvRow}
              className="text-xs font-medium text-(--accent) hover:underline"
            >
              Add key
            </button>
          </div>
          <p className="text-[11px] text-(--text-muted)">
            Plain-text secrets use a single row with key <code className="font-(family-name:--font-mono)">value</code>.
            Add more keys to store JSON object.
          </p>
          <div className="space-y-2">
            {kvRows.map((row, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={row.key}
                  onChange={(e) => updateKvRow(index, "key", e.target.value)}
                  placeholder="Key"
                  className="min-w-0 flex-1 rounded-md border border-(--border) bg-(--bg-field) px-2 py-1.5 font-(family-name:--font-mono) text-xs text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
                />
                <input
                  type="text"
                  value={row.value}
                  onChange={(e) => updateKvRow(index, "value", e.target.value)}
                  placeholder="Value"
                  className="min-w-0 flex-2 rounded-md border border-(--border) bg-(--bg-field) px-2 py-1.5 font-(family-name:--font-mono) text-xs text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
                />
                <button
                  type="button"
                  onClick={() => removeKvRow(index)}
                  disabled={kvRows.length <= 1}
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
            rows={14}
            spellCheck={false}
            className="w-full rounded-md border border-(--border) bg-(--bg-field) px-3 py-2 font-(family-name:--font-mono) text-xs text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
            placeholder='JSON object, e.g. {"KEY":"value"} — or raw text'
          />
          <p className="mt-1 text-[11px] text-(--text-muted)">
            Valid JSON is normalized. Invalid JSON is saved as raw text (plain secret).
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
            rows={14}
            spellCheck={false}
            className="w-full rounded-md border border-(--border) bg-(--bg-field) px-3 py-2 font-(family-name:--font-mono) text-xs text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--accent) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/20"
            placeholder={"KEY=value\nOTHER=\"quoted value\""}
          />
          <p className="mt-1 text-[11px] text-(--text-muted)">
            Parsed as .env (KEY=value). Stored as JSON object unless a single{" "}
            <code className="font-(family-name:--font-mono)">value=…</code> line for plain secrets.
          </p>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md border border-(--border) bg-(--bg-surface) px-4 py-1.5 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-hover) disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-(--accent) px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
