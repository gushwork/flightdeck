"use client";

import { useState } from "react";
import { useAwsWorkspace } from "@/lib/context/aws-workspace-provider";
import type { SecretReplaceResult, SecretReplaceStatus } from "@/lib/types";

interface BulkEditModalProps {
  selectedSecrets: string[];
  open: boolean;
  /** `applied` is true when at least one secret was written, so the caller can refresh. */
  onClose: (applied: boolean) => void;
}

const STATUS_STYLE: Record<SecretReplaceStatus, string> = {
  "will-change": "bg-(--accent-dim) text-(--accent)",
  updated: "bg-(--success-dim) text-(--success)",
  failed: "bg-(--danger-dim) text-(--danger)",
  "no-match": "bg-(--bg-surface) text-(--text-muted)",
};

export function BulkEditModal({ selectedSecrets, open, onClose }: BulkEditModalProps) {
  const { region, profile } = useAwsWorkspace();
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [results, setResults] = useState<SecretReplaceResult[] | null>(null);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  async function runReplace(names: string[], dryRun: boolean): Promise<SecretReplaceResult[]> {
    const res = await fetch("/api/secrets/replace", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names, find, replace, dryRun, region, profile: profile.trim() || undefined }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error ?? `Request failed (${res.status})`);
    return data.results as SecretReplaceResult[];
  }

  async function doPreview() {
    setBusy("preview");
    setError(null);
    setApplied(false);
    try {
      setResults(await runReplace(selectedSecrets, true));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(null);
    }
  }

  async function doApply() {
    const names = (results ?? []).filter((r) => r.status === "will-change").map((r) => r.name);
    if (names.length === 0) return;
    setBusy("apply");
    setError(null);
    try {
      // The server re-reads each secret and recomputes the replace on its latest value.
      const written = new Map((await runReplace(names, false)).map((r) => [r.name, r]));
      setResults((current) => (current ?? []).map((r) => written.get(r.name) ?? r));
      setApplied([...written.values()].some((r) => r.status === "updated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setBusy(null);
    }
  }

  function editInput(setter: (value: string) => void, value: string) {
    setter(value);
    setResults(null);
    setError(null);
  }

  function close() {
    const wasApplied = applied;
    setFind("");
    setReplace("");
    setResults(null);
    setError(null);
    setApplied(false);
    onClose(wasApplied);
  }

  if (!open) return null;

  const count = (status: SecretReplaceStatus) => (results ?? []).filter((r) => r.status === status).length;
  const withChanges = (results ?? []).filter((r) => r.status !== "no-match");
  const noMatch = (results ?? []).filter((r) => r.status === "no-match");
  const pending = count("will-change");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={close} />
      <div className="relative max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-(--border) bg-(--bg-field) p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-(family-name:--font-display) text-xl text-(--text-primary)">Bulk Edit</h2>
          <button
            onClick={close}
            aria-label="Close"
            className="rounded-md p-1 text-(--text-muted) transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <p className="mb-3 text-xs text-(--text-secondary)">
          {selectedSecrets.length} secret{selectedSecrets.length !== 1 ? "s" : ""} selected · case-sensitive, values only
          (keys are not renamed) · each secret is re-read from AWS right before it is written
        </p>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-(--text-secondary)">Find</label>
            <input
              value={find}
              onChange={(e) => editInput(setFind, e.target.value)}
              placeholder="String to find..."
              className="w-full rounded-md border border-(--border) bg-(--bg-field) px-3 py-1.5 font-(family-name:--font-mono) text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--accent) focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-(--text-secondary)">Replace with</label>
            <input
              value={replace}
              onChange={(e) => editInput(setReplace, e.target.value)}
              placeholder="Replacement string..."
              className="w-full rounded-md border border-(--border) bg-(--bg-field) px-3 py-1.5 font-(family-name:--font-mono) text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--accent) focus:outline-none"
            />
          </div>

          <button
            onClick={() => void doPreview()}
            disabled={!find || find === replace || busy !== null || selectedSecrets.length === 0}
            className="rounded-md border border-(--accent) px-4 py-1.5 text-sm font-medium text-(--accent) transition-colors hover:bg-(--accent-dim) disabled:opacity-50"
          >
            {busy === "preview" ? "Loading preview..." : "Preview"}
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-(--danger)">{error}</p>}

        {results && (
          <div className="mt-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-(--text-muted)">
              {pending > 0 && `${pending} will change · `}
              {count("updated") > 0 && `${count("updated")} updated · `}
              {count("failed") > 0 && `${count("failed")} failed · `}
              {noMatch.length} no match
            </h3>

            {withChanges.map((r) => (
              <div key={r.name} className="rounded-lg border border-(--border) bg-(--bg-card) p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-(--text-primary)">{r.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[r.status]}`}>
                    {r.status}
                  </span>
                  {r.versionId && r.status === "updated" && (
                    <span className="ml-auto font-(family-name:--font-mono) text-[11px] text-(--text-muted)">
                      v {r.versionId.slice(0, 8)}
                    </span>
                  )}
                </div>
                {r.changes.length > 0 && (
                  <pre className="mt-2 space-y-1 overflow-x-auto rounded-md bg-(--bg-field) px-3 py-2 font-(family-name:--font-mono) text-xs">
                    {r.changes.map((c, i) => (
                      <div key={c.key ?? i}>
                        {(c.key || c.occurrences > 1) && (
                          <div className="text-(--text-muted)">
                            {c.key}
                            {c.occurrences > 1 ? ` (${c.occurrences}×)` : ""}
                          </div>
                        )}
                        <div className="text-(--danger)">- {c.before}</div>
                        <div className="text-(--success)">+ {c.after}</div>
                      </div>
                    ))}
                  </pre>
                )}
                {r.error && <p className="mt-1 text-[11px] text-(--danger)">{r.error}</p>}
              </div>
            ))}

            {noMatch.length > 0 && (
              <p className="text-xs text-(--text-muted)">
                &ldquo;{find}&rdquo; not found in the current value of:{" "}
                <span className="font-(family-name:--font-mono)">{noMatch.map((r) => r.name).join(", ")}</span>
              </p>
            )}

            {pending > 0 && (
              <button
                onClick={() => void doApply()}
                disabled={busy !== null}
                className="rounded-md bg-(--accent) px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy === "apply" ? "Applying..." : `Apply to ${pending} secret${pending !== 1 ? "s" : ""}`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
