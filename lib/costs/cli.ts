import { execFile } from "child_process";
import {
  awsRows,
  azureRows,
  costPeriod,
  dedupeAccounts,
  gcpBillingQuery,
  gcpRows,
  rollup,
  type AwsCostResponse,
  type AwsCostRow,
  type AzureQueryResponse,
} from "./rollup";
import type { CloudProvider, CostPeriod, CostsSnapshot, ProviderCost } from "./types";

const CLI_TIMEOUT_MS = 60_000;
/** Billing data lands a few times a day; Cost Explorer bills $0.01 per call and Azure throttles hard. */
const CACHE_TTL_MS = 60 * 60_000;
const ERROR_CACHE_TTL_MS = 60_000;
const AZURE_COST_API = "2023-11-01";
/** Cost Explorer record types reported as credits rather than spend. Tax is left out entirely: it posts only at invoice time. */
const AWS_CREDIT_TYPES = ["Credit", "Refund"];

const SETUP_HINT: Record<CloudProvider, string> = {
  aws: "Install AWS CLI v2 and run `aws configure` (or `aws sso login`).",
  azure: "Install the Azure CLI and run `az login`.",
  gcp: "Install the Google Cloud SDK (provides `bq`) and run `gcloud auth login`.",
};

class CliMissingError extends Error {}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: CLI_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (!err) return resolve(stdout);
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return reject(new CliMissingError(`\`${cmd}\` is not installed or not on PATH.`));
      }
      // bq reports query errors on stdout.
      reject(new Error((stderr.trim() || stdout.trim()).split("\n").at(-1) || err.message));
    });
  });
}

/** Keeps what succeeded across per-profile / per-subscription calls; throws only when every call failed. */
function partial<T>(names: string[], results: PromiseSettledResult<T>[]): { values: T[]; warning?: string } {
  const failed = results.flatMap((r, i) =>
    r.status === "rejected" ? [`${names[i]} (${r.reason instanceof Error ? r.reason.message : r.reason})`] : [],
  );
  if (failed.length === results.length) throw (results[0] as PromiseRejectedResult).reason;
  return {
    values: results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
    ...(failed.length > 0 && { warning: `Not included: ${failed.join("; ")}` }),
  };
}

async function costExplorer(
  profile: string,
  period: CostPeriod,
  groupBy: string[],
  filter: object,
  credit: boolean,
): Promise<AwsCostRow[]> {
  const args = [
    "ce", "get-cost-and-usage",
    "--time-period", `Start=${period.lastMonthStart},End=${period.end}`,
    "--granularity", "MONTHLY",
    "--metrics", "UnblendedCost",
    "--group-by", ...groupBy.map((key) => `Type=DIMENSION,Key=${key}`),
    "--filter", JSON.stringify(filter),
    "--output", "json",
    ...(profile ? ["--profile", profile] : []),
  ];
  const rows: AwsCostRow[] = [];
  let token: string | undefined;
  do {
    const res = JSON.parse(await run("aws", token ? [...args, "--next-page-token", token] : args)) as AwsCostResponse;
    rows.push(...awsRows(res, credit));
    token = res.NextPageToken;
  } while (token);
  return rows;
}

/** Every account the profile can see: spend by service (no credits, refunds or tax) and credits per account. */
async function awsProfileRows(profile: string, period: CostPeriod): Promise<AwsCostRow[]> {
  const [spend, credits] = await Promise.all([
    costExplorer(
      profile, period, ["LINKED_ACCOUNT", "SERVICE"],
      { Not: { Dimensions: { Key: "RECORD_TYPE", Values: [...AWS_CREDIT_TYPES, "Tax"] } } },
      false,
    ),
    costExplorer(
      profile, period, ["LINKED_ACCOUNT"],
      { Dimensions: { Key: "RECORD_TYPE", Values: AWS_CREDIT_TYPES } },
      true,
    ),
  ]);
  return [...spend, ...credits];
}

async function awsCost(period: CostPeriod): Promise<ProviderCost> {
  const listed = (await run("aws", ["configure", "list-profiles"])).split("\n").map((p) => p.trim()).filter(Boolean);
  // No named profiles: fall back to the default chain (env vars, instance role).
  const profiles = listed.length ? listed : [""];
  const { values, warning } = partial(
    profiles.map((p) => `profile ${p || "default chain"}`),
    await Promise.allSettled(profiles.map((p) => awsProfileRows(p, period))),
  );
  const rows = dedupeAccounts(values);
  const accounts = new Set(rows.map((r) => r.account)).size;
  const scope = `${accounts} account${accounts === 1 ? "" : "s"}`;
  return { provider: "aws", status: "ok", scope, ...rollup(rows, period), ...(warning && { warning }) };
}

async function azureCost(period: CostPeriod): Promise<ProviderCost> {
  const subs = JSON.parse(
    await run("az", ["account", "list", "--query", "[?state=='Enabled'].{id:id,name:name}", "-o", "json"]),
  ) as { id: string; name: string }[];
  if (subs.length === 0) {
    return { provider: "azure", status: "unconfigured", error: `No enabled subscriptions. ${SETUP_HINT.azure}` };
  }
  const body = JSON.stringify({
    type: "ActualCost",
    timeframe: "Custom",
    timePeriod: { from: `${period.lastMonthStart}T00:00:00Z`, to: `${period.end}T00:00:00Z` },
    dataset: {
      granularity: "Monthly",
      aggregation: { totalCost: { name: "Cost", function: "Sum" } },
      grouping: [{ type: "Dimension", name: "ServiceName" }],
    },
  });
  const { values, warning } = partial(
    subs.map((s) => s.name),
    await Promise.allSettled(
      subs.map(async (s) => {
        const out = await run("az", [
          "rest", "--method", "post",
          "--url", `https://management.azure.com/subscriptions/${s.id}/providers/Microsoft.CostManagement/query?api-version=${AZURE_COST_API}`,
          // The default az client-type quota is shared and usually spent (429); our own ClientType gets a fresh one.
          "--headers", "ClientType=flightdeck",
          "--body", body,
          "-o", "json",
        ]);
        return azureRows(JSON.parse(out) as AzureQueryResponse);
      }),
    ),
  );
  const scope = subs.length === 1 ? subs[0].name : `${subs.length} subscriptions`;
  return { provider: "azure", status: "ok", scope, ...rollup(values.flat(), period), ...(warning && { warning }) };
}

/** GCP has no CLI that reports spend; it reads the Cloud Billing export in BigQuery via `bq`. */
async function gcpCost(period: CostPeriod): Promise<ProviderCost> {
  const source = process.env.GCP_BILLING_EXPORT?.trim();
  if (!source) {
    return {
      provider: "gcp",
      status: "unconfigured",
      error:
        "Set GCP_BILLING_EXPORT to the BigQuery dataset receiving your Cloud Billing export (project.dataset). " +
        SETUP_HINT.gcp,
    };
  }
  const sql = gcpBillingQuery(source, period);
  let out: string;
  try {
    out = await run("bq", [
      "--quiet", "--format=json", `--project_id=${source.split(".")[0]}`,
      "query", "--nouse_legacy_sql", "--max_rows=10000", sql,
    ]);
  } catch (err) {
    if (err instanceof Error && /does not match any table|was not found/.test(err.message)) {
      return {
        provider: "gcp",
        status: "unconfigured",
        error: `No billing export table in ${source} yet. Google writes the first one a few hours after the export is enabled.`,
      };
    }
    throw err;
  }
  const scope = source.split(".").slice(1).join(".");
  return { provider: "gcp", status: "ok", scope, ...rollup(gcpRows(JSON.parse(out.trim() || "[]")), period) };
}

async function settle(provider: CloudProvider, load: () => Promise<ProviderCost>): Promise<ProviderCost> {
  try {
    return await load();
  } catch (err) {
    if (err instanceof CliMissingError) {
      return { provider, status: "unconfigured", error: `${err.message} ${SETUP_HINT[provider]}` };
    }
    return { provider, status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

async function collect(): Promise<CostsSnapshot> {
  const period = costPeriod(new Date());
  const providers = await Promise.all([
    settle("aws", () => awsCost(period)),
    settle("azure", () => azureCost(period)),
    settle("gcp", () => gcpCost(period)),
  ]);
  return { period, providers, fetchedAt: new Date().toISOString() };
}

let cached: { at: number; ttl: number; snapshot: Promise<CostsSnapshot> } | null = null;

/** Spend per cloud (in-flight requests share one CLI run). Never rejects. */
export function getCosts(refresh = false): Promise<CostsSnapshot> {
  if (cached && !refresh && Date.now() - cached.at < cached.ttl) return cached.snapshot;
  const entry = { at: Date.now(), ttl: CACHE_TTL_MS, snapshot: collect() };
  // Retry failed providers soon instead of pinning an error (e.g. a 429) for an hour.
  void entry.snapshot.then((s) => {
    if (s.providers.some((p) => p.status === "error")) entry.ttl = ERROR_CACHE_TTL_MS;
  });
  cached = entry;
  return entry.snapshot;
}
