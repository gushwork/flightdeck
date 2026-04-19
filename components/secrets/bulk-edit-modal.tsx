"use client";

import { useState, useCallback } from "react";
import { useAwsWorkspace } from "@/lib/context/aws-workspace-provider";
import { workspaceSearchParams } from "@/lib/aws/workspace-query";

interface BulkEditModalProps {
  selectedSecrets: string[];
  open: boolean;
  onClose: () => void;
}

interface SecretPreview {
  name: string;
  oldLine: string;
  newLine: string;
}

type ApplyStatus = "pending" | "running" | "success" | "failed";

interface ApplyState {
  name: string;
  status: ApplyStatus;
  error?: string;
}

export function BulkEditModal({
  selectedSecrets,
  open,
  onClose,
}: BulkEditModalProps) {
  const { region, profile } = useAwsWorkspace();
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [previews, setPreviews] = useState<SecretPreview[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applyStates, setApplyStates] = useState<ApplyState[]>([]);
  const [applying, setApplying] = useState(false);

  const doPreview = useCallback(async () => {
    if (!find) return;
    setPreviewLoading(true);
    setPreviews([]);
    const q = workspaceSearchParams(region, profile).toString();

    try {
      const results: SecretPreview[] = [];

      for (const name of selectedSecrets) {
        try {
          const encodedId = encodeURIComponent(name);
          const res = await fetch(`/api/secrets/${encodedId}?${q}`);
          const data = await res.json();
          if (data.error || !data.value?.secretString) continue;

          const raw = data.value.secretString as string;
          if (!raw.includes(find)) continue;

          try {
            const parsed = JSON.parse(raw);
            if (typeof parsed === "object" && parsed !== null) {
              for (const [key, value] of Object.entries(parsed)) {
                const strVal = String(value);
                if (strVal.includes(find)) {
                  results.push({
                    name,
                    oldLine: `  "${key}": ${JSON.stringify(value)}`,
                    newLine: `  "${key}": ${JSON.stringify(strVal.replaceAll(find, replace))}`,
                  });
                  break;
                }
              }
              continue;
            }
          } catch { /* not JSON */ }

          const idx = raw.indexOf(find);
          const start = Math.max(0, idx - 30);
          const end = Math.min(raw.length, idx + find.length + 30);
          results.push({
            name,
            oldLine: raw.slice(start, end),
            newLine: raw.slice(start, end).replaceAll(find, replace),
          });
        } catch { /* skip this secret */ }
      }

      setPreviews(results);
    } finally {
      setPreviewLoading(false);
    }
  }, [find, replace, selectedSecrets, region, profile]);

  const doApply = useCallback(async () => {
    setApplying(true);
    const q = workspaceSearchParams(region, profile).toString();
    const states: ApplyState[] = previews.map((p) => ({
      name: p.name,
      status: "pending" as ApplyStatus,
    }));
    setApplyStates([...states]);

    for (let i = 0; i < previews.length; i++) {
      states[i].status = "running";
      setApplyStates([...states]);

      try {
        const encodedId = encodeURIComponent(previews[i].name);
        const getRes = await fetch(`/api/secrets/${encodedId}?${q}`);
        const getData = await getRes.json();
        if (getData.error) throw new Error(getData.error);

        const oldValue = getData.value.secretString as string;
        const newValue = oldValue.replaceAll(find, replace);

        const putRes = await fetch(`/api/secrets/${encodedId}?${q}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ secretString: newValue }),
        });
        const putData = await putRes.json();
        if (putData.error) throw new Error(putData.error);

        states[i].status = "success";
      } catch (e) {
        states[i].status = "failed";
        states[i].error = e instanceof Error ? e.message : "Unknown error";
      }

      setApplyStates([...states]);
    }

    setApplying(false);
  }, [previews, find, replace, region, profile]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="relative max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-(--border) bg-(--bg-field) p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-(family-name:--font-display) text-xl text-(--text-primary)">
            Bulk Edit
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-(--text-muted) transition-colors hover:bg-(--bg-hover) hover:text-(--text-primary)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <p className="mb-3 text-xs text-(--text-secondary)">
          {selectedSecrets.length} secret{selectedSecrets.length !== 1 ? "s" : ""} selected
        </p>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-(--text-secondary)">
              Find
            </label>
            <input
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder="String to find..."
              className="w-full rounded-md border border-(--border) bg-(--bg-field) px-3 py-1.5 font-(family-name:--font-mono) text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--accent) focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-(--text-secondary)">
              Replace with
            </label>
            <input
              value={replace}
              onChange={(e) => setReplace(e.target.value)}
              placeholder="Replacement string..."
              className="w-full rounded-md border border-(--border) bg-(--bg-field) px-3 py-1.5 font-(family-name:--font-mono) text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--accent) focus:outline-none"
            />
          </div>

          <button
            onClick={doPreview}
            disabled={!find || previewLoading}
            className="rounded-md border border-(--accent) px-4 py-1.5 text-sm font-medium text-(--accent) transition-colors hover:bg-(--accent-dim) disabled:opacity-50"
          >
            {previewLoading ? "Loading preview..." : "Preview"}
          </button>
        </div>

        {previews.length > 0 && (
          <div className="mt-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-(--text-muted)">
              Preview ({previews.length} change{previews.length !== 1 ? "s" : ""})
            </h3>
            {previews.map((p) => {
              const state = applyStates.find((s) => s.name === p.name);
              return (
                <div
                  key={p.name}
                  className="rounded-lg border border-(--border) bg-(--bg-card) p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-(--text-primary)">
                      {p.name}
                    </span>
                    {state && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          state.status === "success"
                            ? "bg-(--success-dim) text-(--success)"
                            : state.status === "failed"
                              ? "bg-(--danger-dim) text-(--danger)"
                              : state.status === "running"
                                ? "bg-(--accent-dim) text-(--accent)"
                                : "bg-(--bg-surface) text-(--text-muted)"
                        }`}
                      >
                        {state.status}
                      </span>
                    )}
                  </div>
                  <pre className="mt-2 rounded-md bg-(--bg-field) px-3 py-2 font-(family-name:--font-mono) text-xs overflow-x-auto">
                    <div className="text-(--danger)">- {p.oldLine}</div>
                    <div className="text-(--success)">+ {p.newLine}</div>
                  </pre>
                  {state?.error && (
                    <p className="mt-1 text-[11px] text-(--danger)">
                      {state.error}
                    </p>
                  )}
                </div>
              );
            })}

            <button
              onClick={doApply}
              disabled={applying}
              className="rounded-md bg-(--accent) px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {applying ? "Applying..." : "Apply Changes"}
            </button>
          </div>
        )}

        {previews.length === 0 && !previewLoading && find && (
          <p className="mt-4 text-center text-sm text-(--text-muted)">
            No matches found for &ldquo;{find}&rdquo; in the selected secrets.
          </p>
        )}
      </div>
    </div>
  );
}
