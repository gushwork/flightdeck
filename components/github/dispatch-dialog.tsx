"use client";

import { useState, useEffect, useRef } from "react";
import type { GHWorkflow } from "@/lib/github/types";
import { WorkflowDispatchForm } from "@/components/github/workflow-dispatch-form";

interface DispatchDialogProps {
  open: boolean;
  workflows: GHWorkflow[];
  defaultRepoFullName?: string;
  defaultWorkflowId?: number;
  onClose: () => void;
  onDispatched: () => void;
}

export function DispatchDialog(props: DispatchDialogProps) {
  if (!props.open) return null;
  return (
    <DispatchDialogContent
      key={`${props.defaultRepoFullName ?? ""}:${props.defaultWorkflowId ?? ""}`}
      {...props}
    />
  );
}

function DispatchDialogContent({
  open,
  workflows,
  defaultRepoFullName,
  defaultWorkflowId,
  onClose,
  onDispatched,
}: DispatchDialogProps) {
  const [repo, setRepo] = useState(defaultRepoFullName ?? "");
  const [workflowId, setWorkflowId] = useState(
    defaultWorkflowId ? String(defaultWorkflowId) : "",
  );
  const firstInputRef = useRef<HTMLSelectElement>(null);

  // Focus first field on open
  useEffect(() => {
    if (open) {
      setTimeout(() => firstInputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keyboard dismiss
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const repos = [...new Set(workflows.map((w) => w.repoFullName))].sort();
  const repoWorkflows = workflows.filter((w) => w.repoFullName === repo);
  const numericWorkflowId = workflowId ? Number(workflowId) : NaN;
  const canShowForm =
    repo && workflowId && Number.isFinite(numericWorkflowId);

  const selectClass =
    "w-full rounded-lg border border-(--border) bg-(--bg-field) px-3 py-2 text-sm text-(--text-primary) outline-none transition-colors focus:border-(--accent) focus:ring-1 focus:ring-(--accent)/30";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal aria-labelledby="dispatch-title">
      <div className="absolute inset-0 bg-black/25" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-(--border) bg-(--bg-field) p-6 shadow-xl">
        <h3 id="dispatch-title" className="text-base font-semibold text-(--text-primary)">
          Trigger workflow
        </h3>
        <p className="mt-1 text-sm text-(--text-muted)">
          Manually dispatch a workflow_dispatch event. Inputs are read from the workflow YAML.
        </p>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">Repository</span>
            <select
              ref={firstInputRef}
              value={repo}
              onChange={(e) => {
                setRepo(e.target.value);
                setWorkflowId("");
              }}
              className={selectClass}
              required
            >
              <option value="">Select repository…</option>
              {repos.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-(--text-secondary)">Workflow</span>
            <select
              value={workflowId}
              onChange={(e) => setWorkflowId(e.target.value)}
              className={selectClass}
              required
              disabled={!repo}
            >
              <option value="">Select workflow…</option>
              {repoWorkflows.map((w) => (
                <option key={w.id} value={String(w.id)}>{w.name}</option>
              ))}
            </select>
          </label>
        </div>

        {canShowForm && (
          <div className="mt-6 border-t border-(--border-hairline) pt-5">
            <WorkflowDispatchForm
              key={`${repo}-${workflowId}`}
              repoFullName={repo}
              workflowId={numericWorkflowId}
              enabled={open && canShowForm}
              variant="drawer"
              onSuccess={() => {
                onDispatched();
                onClose();
              }}
            />
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-(--border) bg-(--bg-surface) px-4 py-1.5 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-hover)"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
