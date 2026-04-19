import type OpenAI from "openai";
import { getEnabledAgentToolGroups } from "@/lib/modules/registry";

type Tool = OpenAI.ChatCompletionTool;

const SECRETS_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "list_secrets",
      description:
        "List all Secrets Manager secrets with metadata (rotation status, tags, dates). Never returns secret values.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_secret_metadata",
      description:
        "Get metadata for a specific secret including rotation config, tags, and access dates. Never returns the secret value.",
      parameters: {
        type: "object",
        properties: {
          secretName: {
            type: "string",
            description: "The secret name to look up.",
          },
        },
        required: ["secretName"],
      },
    },
  },
];

const AUDIT_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "list_analyzer_findings",
      description:
        "List IAM Access Analyzer findings. Requires an analyzer ARN. Returns resource-level findings with status and type.",
      parameters: {
        type: "object",
        properties: {
          analyzerArn: {
            type: "string",
            description:
              "The ARN of the Access Analyzer to query. Use list_analyzers first if you don't have it.",
          },
        },
        required: ["analyzerArn"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_analyzers",
      description:
        "List all IAM Access Analyzer analyzers in the account (ACCOUNT and ACCOUNT_UNUSED_ACCESS types).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

const CLOUDTRAIL_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "lookup_cloudtrail_events",
      description:
        "Look up recent CloudTrail events for a specific resource (e.g. a secret). Returns who accessed it and when.",
      parameters: {
        type: "object",
        properties: {
          resourceName: {
            type: "string",
            description:
              "The resource name or identifier to search CloudTrail for.",
          },
        },
        required: ["resourceName"],
      },
    },
  },
];

const PROPOSE_TOOL: Tool[] = [
  {
    type: "function",
    function: {
      name: "propose_change",
      description:
        "Propose a Secrets Manager change for user review. Generates a change plan with steps, CLI commands, impact assessment, and rollback instructions. The user copies CLI/JSON to run out of band.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Short description of the change.",
          },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                order: { type: "number", description: "Step sequence number." },
                description: {
                  type: "string",
                  description: "Human-readable step description.",
                },
                cliCommand: {
                  type: "string",
                  description:
                    "Equivalent AWS CLI command (e.g. aws secretsmanager update-secret ...).",
                },
                apiCall: {
                  type: "object",
                  properties: {
                    service: {
                      type: "string",
                      enum: ["secretsmanager"],
                    },
                    action: {
                      type: "string",
                      description: "The SDK action name.",
                    },
                    params: {
                      type: "object",
                      description:
                        "Parameters for the API call. Use $STEP{N}_{Field} for cross-step references.",
                    },
                  },
                  required: ["service", "action", "params"],
                },
                outputKey: {
                  type: "string",
                  description:
                    "Optional key to capture output for later steps (e.g. STEP1).",
                },
              },
              required: ["order", "description", "cliCommand", "apiCall"],
            },
            description: "Ordered list of API steps.",
          },
          impact: {
            type: "string",
            description:
              "What changes: who gains/loses what access, what resources are affected.",
          },
          rollback: {
            type: "string",
            description: "How to undo the change: step-by-step reversal.",
          },
          category: {
            type: "string",
            enum: ["atomic", "dependent"],
            description:
              "Whether steps are independent (atomic) or depend on each other (dependent).",
          },
        },
        required: ["title", "steps", "impact", "rollback", "category"],
      },
    },
  },
];

export function buildAgentTools(): Tool[] {
  const groups = getEnabledAgentToolGroups();
  const out: Tool[] = [];
  if (groups.has("secrets")) out.push(...SECRETS_TOOLS);
  if (groups.has("audit")) out.push(...AUDIT_TOOLS);
  if (groups.has("cloudtrail")) out.push(...CLOUDTRAIL_TOOLS);
  if (groups.has("propose")) out.push(...PROPOSE_TOOL);
  return out;
}

/** Tools passed to the LLM (derived from module registry). */
export const agentTools: Tool[] = buildAgentTools();
