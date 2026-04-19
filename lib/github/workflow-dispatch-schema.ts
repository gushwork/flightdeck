/**
 * Parses `workflow_dispatch.inputs` from workflow YAML (server-only: uses `yaml` package).
 */
import YAML from "yaml";
import type { WorkflowDispatchInputSpec, WorkflowDispatchSchemaResponse } from "./types";

function getWorkflowDispatchInputs(
  onBlock: unknown,
): { found: boolean; inputs: Record<string, Record<string, unknown>> } {
  if (onBlock == null) {
    return { found: false, inputs: {} };
  }

  if (onBlock === "workflow_dispatch") {
    return { found: true, inputs: {} };
  }

  if (Array.isArray(onBlock)) {
    const has = onBlock.some((e) => e === "workflow_dispatch");
    return { found: has, inputs: {} };
  }

  if (typeof onBlock !== "object") {
    return { found: false, inputs: {} };
  }

  const obj = onBlock as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(obj, "workflow_dispatch")) {
    return { found: false, inputs: {} };
  }

  const wd = obj.workflow_dispatch;
  if (wd === false || wd === undefined) {
    return { found: false, inputs: {} };
  }
  if (wd === null || wd === true) {
    return { found: true, inputs: {} };
  }
  if (typeof wd !== "object") {
    return { found: true, inputs: {} };
  }

  const wdo = wd as Record<string, unknown>;
  const inputsRaw = wdo.inputs;
  if (
    !inputsRaw ||
    typeof inputsRaw !== "object" ||
    Array.isArray(inputsRaw)
  ) {
    return { found: true, inputs: {} };
  }

  return { found: true, inputs: inputsRaw as Record<string, Record<string, unknown>> };
}

function mapInputSpec(name: string, raw: Record<string, unknown>): WorkflowDispatchInputSpec {
  const type =
    typeof raw.type === "string" && raw.type.length > 0 ? raw.type : "string";
  const options = Array.isArray(raw.options)
    ? (raw.options as unknown[]).map((o) => String(o))
    : undefined;

  let defaultVal: string | boolean | number | undefined;
  const d = raw.default;
  if (d === undefined || d === null) {
    defaultVal = undefined;
  } else if (typeof d === "boolean" || typeof d === "number") {
    defaultVal = d;
  } else {
    defaultVal = String(d);
  }

  return {
    name,
    description: typeof raw.description === "string" ? raw.description : undefined,
    required: raw.required === true,
    default: defaultVal,
    type,
    options,
  };
}

/**
 * Extract workflow_dispatch input definitions from the full workflow file text.
 */
export function parseWorkflowDispatchFromYaml(yamlText: string): WorkflowDispatchSchemaResponse {
  let doc: unknown;
  try {
    doc = YAML.parse(yamlText);
  } catch {
    return {
      hasWorkflowDispatch: false,
      inputs: [],
      parseError: "Invalid YAML",
    };
  }

  if (!doc || typeof doc !== "object") {
    return { hasWorkflowDispatch: false, inputs: [] };
  }

  const root = doc as Record<string, unknown>;
  const { found, inputs } = getWorkflowDispatchInputs(root.on);

  if (!found) {
    return { hasWorkflowDispatch: false, inputs: [] };
  }

  const specs: WorkflowDispatchInputSpec[] = [];
  for (const [name, spec] of Object.entries(inputs)) {
    if (spec === null || typeof spec !== "object") continue;
    specs.push(mapInputSpec(name, spec as Record<string, unknown>));
  }

  return {
    hasWorkflowDispatch: true,
    inputs: specs,
  };
}
