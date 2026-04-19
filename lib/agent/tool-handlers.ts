import {
  getRegion,
  parseProfileParam,
  profileCacheSegment,
} from "@/lib/aws/client";
import { listSecrets } from "@/lib/aws/secrets";
import {
  listAnalyzers,
  listFindings,
} from "@/lib/aws/analyzer";
import { lookupSecretEvents } from "@/lib/aws/cloudtrail";
import { getCached, setCache } from "@/lib/cache";
import { sanitizeForLlm } from "@/lib/agent/filter";
import { generatePlanId } from "@/lib/agent/change-plan";
import type { ChangePlan, PlanStep } from "@/lib/agent/change-plan";
import type { SecretEntry } from "@/lib/types";

const MAX_TOOL_RESULT_LENGTH = 15_000;

/** Region + optional named profile for AWS SDK calls (from agent chat request). */
export interface AwsToolContext {
  region: string;
  profile?: string;
}

async function getSecrets(ctx: AwsToolContext): Promise<SecretEntry[]> {
  const region = getRegion(ctx.region);
  const profile = parseProfileParam(ctx.profile);
  const profSeg = profileCacheSegment(profile);
  const cacheKey = `secrets:${region}:${profSeg}`;
  const cached = await getCached<SecretEntry[]>(cacheKey);
  if (cached) return cached;

  const secrets = await listSecrets(region, undefined, profile);
  await setCache(cacheKey, secrets, 60_000);
  return secrets;
}

function truncateResult(data: unknown): unknown {
  const json = JSON.stringify(data);
  if (json.length <= MAX_TOOL_RESULT_LENGTH) return data;

  if (Array.isArray(data)) {
    const items = [];
    let size = 2;
    for (const item of data) {
      const itemJson = JSON.stringify(item);
      if (size + itemJson.length > MAX_TOOL_RESULT_LENGTH - 100) break;
      items.push(item);
      size += itemJson.length + 1;
    }
    return {
      _truncated: true,
      _message: `Showing ${items.length} of ${data.length} items. Use a more specific query to see others.`,
      items,
    };
  }

  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (Array.isArray(obj[key])) {
        const arr = obj[key] as unknown[];
        const truncatedArr = truncateResult(arr);
        return { ...obj, [key]: truncatedArr };
      }
    }
  }

  return {
    _truncated: true,
    _message: `Result was ${json.length} chars, too large. Try a more specific query.`,
    summary: json.slice(0, 500) + "...",
  };
}

export interface ToolResult {
  type: "data" | "change_plan";
  data?: unknown;
  plan?: ChangePlan;
}

export async function dispatch(
  name: string,
  args: Record<string, unknown>,
  ctx: AwsToolContext,
): Promise<ToolResult> {
  const region = getRegion(ctx.region);
  const profile = parseProfileParam(ctx.profile);

  switch (name) {
    case "list_secrets": {
      const secrets = await getSecrets(ctx);
      const metadata = secrets.map((s) => ({
        name: s.name,
        description: s.description,
        createdDate: s.createdDate,
        lastChangedDate: s.lastChangedDate,
        lastAccessedDate: s.lastAccessedDate,
        tags: s.tags,
        rotationEnabled: s.rotationEnabled,
        lastRotatedDate: s.lastRotatedDate,
      }));
      return {
        type: "data",
        data: sanitizeForLlm({
          secrets: metadata,
          count: metadata.length,
          withoutRotation: secrets.filter((s) => !s.rotationEnabled).length,
        }),
      };
    }

    case "get_secret_metadata": {
      const secrets = await getSecrets(ctx);
      const secret = secrets.find((s) => s.name === args.secretName);
      if (!secret)
        return { type: "data", data: { error: `Secret '${args.secretName}' not found.` } };
      return {
        type: "data",
        data: sanitizeForLlm({
          secret: {
            name: secret.name,
            description: secret.description,
            createdDate: secret.createdDate,
            lastChangedDate: secret.lastChangedDate,
            lastAccessedDate: secret.lastAccessedDate,
            tags: secret.tags,
            rotationEnabled: secret.rotationEnabled,
            rotationRules: secret.rotationRules,
            lastRotatedDate: secret.lastRotatedDate,
            primaryRegion: secret.primaryRegion,
            owningService: secret.owningService,
          },
        }),
      };
    }

    case "list_analyzers": {
      const analyzers = await listAnalyzers(region, profile);
      return { type: "data", data: { analyzers } };
    }

    case "list_analyzer_findings": {
      const findings = await listFindings(
        region,
        args.analyzerArn as string,
        undefined,
        profile,
      );
      return { type: "data", data: { findings, count: findings.length } };
    }

    case "lookup_cloudtrail_events": {
      const result = await lookupSecretEvents(
        region,
        args.resourceName as string,
        undefined,
        profile,
      );
      return { type: "data", data: { events: result.events, count: result.events.length } };
    }

    case "propose_change": {
      const steps = (args.steps as Array<Record<string, unknown>>).map(
        (s): PlanStep => ({
          order: s.order as number,
          description: s.description as string,
          cliCommand: s.cliCommand as string,
          apiCall: s.apiCall as PlanStep["apiCall"],
          outputKey: s.outputKey as string | undefined,
        }),
      );

      const plan: ChangePlan = {
        id: generatePlanId(),
        title: args.title as string,
        steps,
        impact: args.impact as string,
        rollback: args.rollback as string,
        category: (args.category as "atomic" | "dependent") ?? "atomic",
      };

      return { type: "change_plan", plan };
    }

    default:
      return { type: "data", data: { error: `Unknown tool: ${name}` } };
  }
}

export function toolResultToString(result: ToolResult): string {
  if (result.type === "change_plan") {
    return "Change plan is shown in the panel. The user can copy CLI or JSON; there is no automatic execution.";
  }
  const data = truncateResult(result.data);
  return JSON.stringify(data);
}
