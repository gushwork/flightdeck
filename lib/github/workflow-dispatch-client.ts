/**
 * Client-safe helpers for workflow_dispatch forms (no YAML / Node).
 */
import type { WorkflowDispatchInputSpec } from "./types";

export function initialDispatchInputValues(
  specs: WorkflowDispatchInputSpec[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const spec of specs) {
    if (spec.default === undefined || spec.default === null) {
      out[spec.name] = "";
      continue;
    }
    if (typeof spec.default === "boolean") {
      out[spec.name] = spec.default ? "true" : "false";
    } else {
      out[spec.name] = String(spec.default);
    }
  }
  return out;
}

export function validateWorkflowDispatchInputs(
  specs: WorkflowDispatchInputSpec[],
  values: Record<string, string>,
): string | null {
  for (const spec of specs) {
    if (!spec.required) continue;
    const v = (values[spec.name] ?? "").trim();
    if (v === "") {
      return `“${spec.name}” is required`;
    }
  }
  return null;
}

/** GitHub dispatches API expects all input values as strings. */
export function serializeWorkflowDispatchInputs(
  specs: WorkflowDispatchInputSpec[],
  values: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const spec of specs) {
    const raw = values[spec.name];
    if (raw === undefined) continue;
    const t = raw.trim();
    if (t === "" && !spec.required) continue;
    if (t !== "") out[spec.name] = t;
  }
  return out;
}
