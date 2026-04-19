"use client";

import type { ChangePlan, PlanExecution } from "@/lib/agent/change-plan";

interface ChangePlanCardProps {
  plan: ChangePlan;
  onCopyCli: () => void;
  onCopyJson: () => void;
  onReject: () => void;
  /** Server execution is optional; IAM module used to wire Approve to an API. */
  showApprove?: boolean;
  onApprove?: () => void;
  execution?: PlanExecution;
}

function StepStatusIcon({ status }: { status: string }) {
  if (status === "running") {
    return (
      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-(--accent) border-t-transparent" />
    );
  }
  if (status === "success") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        className="text-(--success)"
      >
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M4.5 7L6.5 9L9.5 5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (status === "failed") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        className="text-(--danger)"
      >
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M5 5L9 9M9 5L5 9"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-(--border)" />
  );
}

export function ChangePlanCard({
  plan,
  onCopyCli,
  onCopyJson,
  onReject,
  showApprove = false,
  onApprove,
  execution,
}: ChangePlanCardProps) {
  const isExecuting =
    execution?.status === "running" || execution?.status === "pending";
  const isComplete = execution?.status === "completed";
  const isFailed = execution?.status === "failed";

  return (
    <div className="overflow-hidden rounded-lg border border-(--border) bg-(--bg-card)">
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-(--border) bg-(--bg-surface) px-3 py-2">
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="shrink-0 text-(--accent)"
        >
          <rect
            x="2"
            y="2"
            width="10"
            height="10"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M5 7H9M7 5V9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <span className="text-xs font-semibold text-(--text-primary)">
          {plan.title}
        </span>
        {isComplete && (
          <span className="ml-auto rounded-full bg-(--success)/10 px-2 py-0.5 text-[10px] font-medium text-(--success)">
            Complete
          </span>
        )}
        {isFailed && (
          <span className="ml-auto rounded-full bg-(--danger)/10 px-2 py-0.5 text-[10px] font-medium text-(--danger)">
            Failed
          </span>
        )}
      </div>

      <div className="space-y-2.5 p-3">
        {/* Steps */}
        <div className="space-y-1.5">
          {plan.steps.map((step) => {
            const stepExec = execution?.steps.find(
              (s) => s.order === step.order,
            );
            return (
              <div key={step.order} className="space-y-1">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">
                    <StepStatusIcon status={stepExec?.status ?? "pending"} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] leading-snug text-(--text-secondary)">
                      <span className="font-medium text-(--text-primary)">
                        {step.order}.
                      </span>{" "}
                      {step.description}
                    </p>
                    <pre className="mt-1 overflow-x-auto rounded bg-(--bg-field) px-2 py-1.5 font-(family-name:--font-mono) text-[10px] leading-relaxed text-(--text-secondary)">
                      {step.cliCommand}
                    </pre>
                  </div>
                </div>
                {stepExec?.status === "failed" && stepExec.error && (
                  <p className="ml-5.5 rounded bg-(--danger)/5 px-2 py-1 text-[10px] text-(--danger)">
                    {stepExec.error}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Impact */}
        <div className="rounded-md border border-(--warn)/30 bg-(--warn)/5 px-2.5 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-(--warn)">
            Impact
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-(--text-secondary)">
            {plan.impact}
          </p>
        </div>

        {/* Rollback */}
        <div className="rounded-md bg-(--bg-surface) px-2.5 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">
            Rollback
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-(--text-muted)">
            {plan.rollback}
          </p>
        </div>

        {/* Actions */}
        {!isComplete && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {showApprove && onApprove && (
              <button
                type="button"
                onClick={onApprove}
                disabled={isExecuting}
                className="rounded-md bg-(--accent) px-3 py-1.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {isExecuting ? "Executing…" : "Approve"}
              </button>
            )}
            <button
              onClick={onCopyCli}
              className="rounded-md border border-(--border) bg-(--bg-field) px-3 py-1.5 text-[11px] font-medium text-(--text-secondary) transition-colors hover:border-(--accent) hover:text-(--accent)"
            >
              Copy CLI
            </button>
            <button
              onClick={onCopyJson}
              className="rounded-md border border-(--border) bg-(--bg-field) px-3 py-1.5 text-[11px] font-medium text-(--text-secondary) transition-colors hover:border-(--accent) hover:text-(--accent)"
            >
              Copy JSON
            </button>
            <button
              onClick={onReject}
              disabled={isExecuting}
              className="rounded-md border border-(--border) bg-(--bg-field) px-3 py-1.5 text-[11px] font-medium text-(--text-muted) transition-colors hover:border-(--danger) hover:text-(--danger) disabled:opacity-40"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
