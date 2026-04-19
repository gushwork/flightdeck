"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  WorkflowDispatchInputSpec,
  WorkflowDispatchSchemaResponse,
} from "@/lib/github/types";
import {
  initialDispatchInputValues,
  serializeWorkflowDispatchInputs,
  validateWorkflowDispatchInputs,
} from "@/lib/github/workflow-dispatch-client";

// ─── Schema fetch ───────────────────────────────────────────────────────────────

export function useWorkflowDispatchSchema(
  repoFullName: string | undefined,
  workflowId: number | undefined,
  enabled: boolean,
) {
  const [data, setData] = useState<WorkflowDispatchSchemaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canFetch = Boolean(enabled && repoFullName && workflowId != null);

  useEffect(() => {
    if (!canFetch || repoFullName === undefined || workflowId == null) return;
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- loading/error mirror in-flight fetch */
    setLoading(true);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    const url = `/api/github/actions/workflows/dispatch-schema?repo=${encodeURIComponent(repoFullName)}&workflowId=${workflowId}`;
    fetch(url)
      .then(async (res) => {
        const json = (await res.json()) as WorkflowDispatchSchemaResponse & { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Failed to load schema");
        return json;
      })
      .then((schema) => {
        if (!cancelled) setData(schema);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canFetch, repoFullName, workflowId]);

  return {
    schema: canFetch ? data : null,
    loading: canFetch ? loading : false,
    error: canFetch ? error : null,
  };
}

// ─── Single input row ─────────────────────────────────────────────────────────

function DispatchInputRow({
  spec,
  value,
  onChange,
  compact,
}: {
  spec: WorkflowDispatchInputSpec;
  value: string;
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  const label = spec.description || spec.name;
  const t = (spec.type ?? "string").toLowerCase();
  const labelClass = compact
    ? "mb-1 block text-[11px] font-medium text-(--text-muted)"
    : "mb-1 block text-xs font-medium text-(--text-secondary)";
  const fieldClass = compact
    ? "w-full rounded-lg border border-(--border) bg-(--bg-field) px-2 py-1.5 font-(family-name:--font-mono) text-xs text-(--text-primary) outline-none focus:border-(--accent) focus:ring-1 focus:ring-(--accent)/30"
    : "w-full rounded-lg border border-(--border) bg-(--bg-field) px-3 py-2 text-sm text-(--text-primary) outline-none focus:border-(--accent) focus:ring-1 focus:ring-(--accent)/30 font-(family-name:--font-mono)";

  if (t === "choice" && spec.options && spec.options.length > 0) {
    return (
      <label className="block">
        <span className={labelClass}>
          {label}
          {spec.required && <span className="text-(--danger)"> *</span>}
        </span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={fieldClass}
        >
          {!spec.required && <option value="">—</option>}
          {spec.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (t === "boolean") {
    const v = value === "" ? "false" : value;
    return (
      <label className="block">
        <span className={labelClass}>
          {label}
          {spec.required && <span className="text-(--danger)"> *</span>}
        </span>
        <select value={v} onChange={(e) => onChange(e.target.value)} className={fieldClass}>
          <option value="false">false</option>
          <option value="true">true</option>
        </select>
      </label>
    );
  }

  if (t === "number") {
    return (
      <label className="block">
        <span className={labelClass}>
          {label}
          {spec.required && <span className="text-(--danger)"> *</span>}
        </span>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={fieldClass}
        />
      </label>
    );
  }

  return (
    <label className="block">
      <span className={labelClass}>
        {label}
        {spec.required && <span className="text-(--danger)"> *</span>}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={spec.name}
        className={fieldClass}
      />
    </label>
  );
}

// ─── Full form ────────────────────────────────────────────────────────────────

interface WorkflowDispatchFormProps {
  repoFullName: string;
  workflowId: number;
  /** Fetch YAML + parse when true */
  enabled: boolean;
  compact?: boolean;
  /** Wider submit button + spacing (drawer footer) */
  variant?: "inline" | "drawer";
  onSuccess: () => void | Promise<void>;
}

export function WorkflowDispatchForm({
  repoFullName,
  workflowId,
  enabled,
  compact,
  variant = "inline",
  onSuccess,
}: WorkflowDispatchFormProps) {
  const { schema, loading, error: loadError } = useWorkflowDispatchSchema(
    repoFullName,
    workflowId,
    enabled,
  );
  const [ref, setRef] = useState("main");
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [submitLoading, setSubmitLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!schema) return;
    setRef(schema.suggestedRef ?? "main");
    setInputValues(initialDispatchInputValues(schema.inputs));
    setLocalError(null);
    setOkMsg(null);
  }, [schema, repoFullName, workflowId]);

  const specs = schema?.inputs ?? [];

  const setInput = useCallback((name: string, v: string) => {
    setInputValues((prev) => ({ ...prev, [name]: v }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!schema || !ref.trim()) return;
    const validationErr = validateWorkflowDispatchInputs(specs, inputValues);
    if (validationErr) {
      setLocalError(validationErr);
      return;
    }
    setSubmitLoading(true);
    setLocalError(null);
    setOkMsg(null);
    try {
      const inputsPayload = serializeWorkflowDispatchInputs(specs, inputValues);
      const res = await fetch("/api/github/actions/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "dispatch",
          repoFullName,
          workflowId,
          ref: ref.trim(),
          inputs: inputsPayload,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Dispatch failed");
      setOkMsg("Workflow run queued");
      onSuccess();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Dispatch failed");
    } finally {
      setSubmitLoading(false);
    }
  }, [schema, ref, specs, inputValues, repoFullName, workflowId, onSuccess]);

  const refFieldClass = compact
    ? "min-w-0 flex-1 rounded-lg border border-(--border) bg-(--bg-field) px-2 py-1.5 font-(family-name:--font-mono) text-xs text-(--text-primary) outline-none focus:border-(--accent) focus:ring-1 focus:ring-(--accent)/30"
    : "w-full rounded-lg border border-(--border) bg-(--bg-field) px-3 py-2 font-(family-name:--font-mono) text-sm text-(--text-primary) outline-none focus:border-(--accent) focus:ring-1 focus:ring-(--accent)/30";

  const refFullWidthClass = compact
    ? "w-full rounded-lg border border-(--border) bg-(--bg-field) px-2 py-1.5 font-(family-name:--font-mono) text-xs text-(--text-primary) outline-none focus:border-(--accent) focus:ring-1 focus:ring-(--accent)/30"
    : "w-full rounded-lg border border-(--border) bg-(--bg-field) px-3 py-2 font-(family-name:--font-mono) text-sm text-(--text-primary) outline-none focus:border-(--accent) focus:ring-1 focus:ring-(--accent)/30";

  const canSubmit =
    Boolean(schema) && !loading && !submitLoading && ref.trim().length > 0;

  const refLabelClass =
    compact
      ? "mb-1 block text-[11px] font-medium text-(--text-muted)"
      : "mb-1.5 block text-xs font-medium text-(--text-secondary)";

  const manyInputs = specs.length > 0;
  const showInlineRun = !manyInputs;

  return (
    <div className="space-y-3">
      {loading && (
        <p className={compact ? "text-[11px] text-(--text-muted)" : "text-sm text-(--text-muted)"}>
          Loading workflow inputs…
        </p>
      )}
      {loadError && (
        <p className={compact ? "text-[11px] text-(--danger)" : "text-sm text-(--danger)"}>{loadError}</p>
      )}
      {schema && !schema.hasWorkflowDispatch && (
        <p className="rounded border border-(--warn)/25 bg-(--warn)/5 px-2 py-1.5 text-[11px] text-(--warn)">
          No <code className="font-(family-name:--font-mono)">workflow_dispatch</code> in this file’s{" "}
          <code className="font-(family-name:--font-mono)">on:</code> block. GitHub may reject a manual
          run.
        </p>
      )}
      {schema?.parseError && schema.parseError !== "Invalid YAML" && (
        <p className="text-[11px] text-(--text-muted)">{schema.parseError}</p>
      )}

      <label className="block">
        <span className={refLabelClass}>Branch or tag (ref)</span>
        {showInlineRun ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="main"
              className={refFieldClass}
              aria-label="Branch ref"
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="shrink-0 rounded-lg bg-(--accent) px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {submitLoading ? "…" : "Run"}
            </button>
          </div>
        ) : (
          <input
            type="text"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="main"
            className={refFullWidthClass}
            aria-label="Branch ref"
          />
        )}
      </label>

      {manyInputs && (
        <div className={`space-y-2 ${compact ? "max-h-52 overflow-y-auto pr-1" : ""}`}>
          <p className="text-[11px] font-medium text-(--text-muted)">Inputs</p>
          {specs.map((spec) => (
            <DispatchInputRow
              key={spec.name}
              spec={spec}
              value={inputValues[spec.name] ?? ""}
              onChange={(v) => setInput(spec.name, v)}
              compact={compact}
            />
          ))}
        </div>
      )}

      {manyInputs && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={
            variant === "drawer"
              ? "w-full rounded-lg bg-(--accent) px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              : "w-full rounded-lg bg-(--accent) px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          }
        >
          {submitLoading ? (variant === "drawer" ? "Triggering…" : "…") : variant === "drawer" ? "Run workflow" : "Run"}
        </button>
      )}

      {localError && (
        <p className={compact ? "text-[11px] text-(--danger)" : "text-sm text-(--danger)"} role="alert">
          {localError}
        </p>
      )}
      {okMsg && (
        <p className={compact ? "text-[11px] text-(--success)" : "text-sm text-(--success)"} role="status">
          {okMsg}
        </p>
      )}
    </div>
  );
}
