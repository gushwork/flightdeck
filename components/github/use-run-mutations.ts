"use client";

import { useCallback, useState } from "react";
import type { GHWorkflowRun } from "@/lib/github/types";

interface MutationState {
  pendingRunId: number | null;
  pendingAction: string | null;
  error: string | null;
}

interface UseRunMutationsOptions {
  onMutation?: () => void;
  optimisticUpdate?: (runId: number, patch: Partial<GHWorkflowRun>) => void;
}

export function useRunMutations({
  onMutation,
  optimisticUpdate,
}: UseRunMutationsOptions = {}) {
  const [state, setState] = useState<MutationState>({
    pendingRunId: null,
    pendingAction: null,
    error: null,
  });

  const mutate = useCallback(
    async (
      action: "rerun" | "rerun-failed" | "cancel",
      run: GHWorkflowRun,
    ) => {
      setState({ pendingRunId: run.id, pendingAction: action, error: null });

      // Optimistic update
      if (optimisticUpdate) {
        if (action === "cancel") {
          optimisticUpdate(run.id, { status: "completed", conclusion: "cancelled" });
        } else if (action === "rerun" || action === "rerun-failed") {
          optimisticUpdate(run.id, { status: "queued", conclusion: null });
        }
      }

      try {
        const res = await fetch("/api/github/actions/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            repoFullName: run.repoFullName,
            runId: run.id,
          }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (data.error) throw new Error(data.error);

        onMutation?.();
      } catch (err) {
        // Revert optimistic update on error
        if (optimisticUpdate) {
          optimisticUpdate(run.id, {
            status: run.status,
            conclusion: run.conclusion,
          });
        }
        setState((s) => ({
          ...s,
          error: err instanceof Error ? err.message : "Action failed",
        }));
      } finally {
        setState((s) => ({ ...s, pendingRunId: null, pendingAction: null }));
      }
    },
    [onMutation, optimisticUpdate],
  );

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  return {
    rerun: (run: GHWorkflowRun) => mutate("rerun", run),
    rerunFailed: (run: GHWorkflowRun) => mutate("rerun-failed", run),
    cancel: (run: GHWorkflowRun) => mutate("cancel", run),
    pendingRunId: state.pendingRunId,
    pendingAction: state.pendingAction,
    error: state.error,
    clearError,
  };
}
