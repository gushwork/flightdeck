import {
  ElasticLoadBalancingV2Client,
  DescribeRulesCommand,
  DescribeTargetHealthCommand,
  paginateDescribeListeners,
  paginateDescribeLoadBalancers,
  paginateDescribeTargetGroups,
  type Action,
  type RuleCondition,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { RDSClient, paginateDescribeDBInstances } from "@aws-sdk/client-rds";
import { LambdaClient, paginateListFunctions } from "@aws-sdk/client-lambda";
import {
  ElastiCacheClient,
  paginateDescribeCacheClusters,
  paginateDescribeCacheSubnetGroups,
} from "@aws-sdk/client-elasticache";
import { ECSClient, DescribeServicesCommand, paginateListClusters, paginateListServices } from "@aws-sdk/client-ecs";
import { awsClientOptions } from "@/lib/aws/client";
import { parallelPool } from "@/lib/github/parallel-pool";
import type {
  LbListener,
  LbTargetGroup,
  VpcCoverage,
  VpcLoadBalancer,
  VpcService,
} from "@/lib/vpc/types";

export async function drain<P, T>(
  pages: AsyncIterable<P>,
  pick: (page: P) => T[] | undefined,
): Promise<T[]> {
  const out: T[] = [];
  for await (const page of pages) out.push(...(pick(page) ?? []));
  return out;
}

/** Optional lookups degrade to a warning instead of failing the whole page (usually IAM). */
export async function optional<T>(
  label: string,
  work: Promise<T>,
  fallback: T,
  warnings: string[],
): Promise<T> {
  try {
    return await work;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`${label} unavailable: ${msg.slice(0, 160)}`);
    return fallback;
  }
}

type WithVpc<T> = T & { vpcId: string };

export interface VpcServicesResult {
  loadBalancers: WithVpc<VpcLoadBalancer>[];
  services: WithVpc<VpcService>[];
  coverage: VpcCoverage;
  /** Labels of lookups still running in the background; the client should ask again shortly. */
  pending: string[];
}

interface CacheEntry {
  at: number;
  data?: unknown;
  inflight?: Promise<unknown>;
}
const slowCache = new Map<string, CacheEntry>();
const PENDING = Symbol("pending");

/**
 * Stale-while-revalidate for slow, rarely-changing listings (Lambda pages 50 functions per call, so
 * big accounts take 20s+). Fresh cache → instant; stale cache → instant + background refresh;
 * cold → wait up to `budgetMs`, then report pending while the load finishes in the background.
 */
async function cachedWithBudget<T>(
  key: string,
  ttlMs: number,
  budgetMs: number,
  load: () => Promise<T>,
): Promise<T | typeof PENDING> {
  const entry = slowCache.get(key) ?? { at: 0 };
  slowCache.set(key, entry);
  const fresh = entry.data !== undefined && Date.now() - entry.at < ttlMs;
  if (fresh) return entry.data as T;
  if (!entry.inflight) {
    entry.inflight = load()
      .then((data) => {
        entry.data = data;
        entry.at = Date.now();
        return data;
      })
      .finally(() => {
        entry.inflight = undefined;
      });
    entry.inflight.catch(() => {});
  }
  if (entry.data !== undefined) return entry.data as T;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<typeof PENDING>((resolve) => {
    timer = setTimeout(() => resolve(PENDING), budgetMs);
  });
  try {
    return (await Promise.race([entry.inflight, budget])) as T | typeof PENDING;
  } finally {
    clearTimeout(timer);
  }
}

const LAMBDA_TTL_MS = 10 * 60_000;
const LAMBDA_BUDGET_MS = 3_000;

// ECS can fan out to many calls; these caps keep one page load bounded.
const MAX_ECS_CLUSTERS = 25;
const MAX_ECS_SERVICES_PER_CLUSTER = 100;

const yesNo = (b: boolean | undefined) => (b ? "yes" : "no");

function actionText(actions: Action[] | undefined, tgName: (arn: string) => string) {
  const sorted = [...(actions ?? [])].sort((a, b) => (a.Order ?? 0) - (b.Order ?? 0));
  const tgArns: string[] = [];
  const parts = sorted.map((a) => {
    switch (a.Type) {
      case "forward": {
        const groups = a.ForwardConfig?.TargetGroups ?? (a.TargetGroupArn ? [{ TargetGroupArn: a.TargetGroupArn }] : []);
        const total = groups.reduce((n, g) => n + (("Weight" in g ? g.Weight : undefined) ?? 1), 0);
        const names = groups.map((g) => {
          tgArns.push(g.TargetGroupArn ?? "");
          const w = "Weight" in g ? g.Weight : undefined;
          const name = tgName(g.TargetGroupArn ?? "");
          return groups.length > 1 && w !== undefined ? `${name} (${Math.round((w / total) * 100)}%)` : name;
        });
        return `forward → ${names.join(", ")}`;
      }
      case "redirect": {
        const r = a.RedirectConfig;
        const proto = r?.Protocol && r.Protocol !== "#{protocol}" ? r.Protocol : "same protocol";
        const port = r?.Port && r.Port !== "#{port}" ? `:${r.Port}` : "";
        const host = r?.Host && r.Host !== "#{host}" ? ` ${r.Host}` : "";
        return `redirect ${r?.StatusCode?.replace("HTTP_", "") ?? ""} → ${proto}${port}${host}`;
      }
      case "fixed-response":
        return `fixed response ${a.FixedResponseConfig?.StatusCode ?? ""}`;
      case "authenticate-oidc":
        return "authenticate (OIDC)";
      case "authenticate-cognito":
        return "authenticate (Cognito)";
      default:
        return a.Type ?? "action";
    }
  });
  return { text: parts.join(" → ") || "—", type: sorted.at(-1)?.Type ?? "", tgArns: tgArns.filter(Boolean) };
}

function maskValue(v: string): string {
  return v.length <= 4 ? "••••" : `${v.slice(0, 3)}•••• (${v.length} chars)`;
}

function conditionText(c: RuleCondition): string {
  switch (c.Field) {
    case "host-header":
      return `host ${(c.HostHeaderConfig?.Values ?? c.Values ?? []).join(" | ")}`;
    case "path-pattern":
      return `path ${(c.PathPatternConfig?.Values ?? c.Values ?? []).join(" | ")}`;
    case "http-header":
      // Header rules often carry shared secrets (e.g. CloudFront origin verification) — never echo them.
      return `header ${c.HttpHeaderConfig?.HttpHeaderName} = ${(c.HttpHeaderConfig?.Values ?? []).map(maskValue).join(" | ")}`;
    case "query-string":
      return `query ${(c.QueryStringConfig?.Values ?? []).map((v) => `${v.Key ?? ""}=${v.Value}`).join(" | ")}`;
    case "http-request-method":
      return `method ${(c.HttpRequestMethodConfig?.Values ?? []).join(" | ")}`;
    case "source-ip":
      return `source ${(c.SourceIpConfig?.Values ?? []).join(" | ")}`;
    default:
      return c.Field ?? "condition";
  }
}

async function fetchLoadBalancers(client: ElasticLoadBalancingV2Client): Promise<WithVpc<VpcLoadBalancer>[]> {
  const [lbs, tgs] = await Promise.all([
    drain(paginateDescribeLoadBalancers({ client }, {}), (p) => p.LoadBalancers),
    drain(paginateDescribeTargetGroups({ client }, {}), (p) => p.TargetGroups),
  ]);
  const tgName = (arn: string) => tgs.find((t) => t.TargetGroupArn === arn)?.TargetGroupName ?? arn.split("/").at(-2) ?? arn;

  const health = new Map(
    await parallelPool(tgs, 8, async (tg) => {
      const res = await client
        .send(new DescribeTargetHealthCommand({ TargetGroupArn: tg.TargetGroupArn }))
        .catch(() => ({ TargetHealthDescriptions: [] }));
      return [tg.TargetGroupArn ?? "", res.TargetHealthDescriptions ?? []] as const;
    }),
  );

  return parallelPool(lbs, 6, async (lb): Promise<WithVpc<VpcLoadBalancer>> => {
    const arn = lb.LoadBalancerArn ?? "";
    const rawListeners = await drain(paginateDescribeListeners({ client }, { LoadBalancerArn: arn }), (p) => p.Listeners).catch(
      () => [],
    );
    const listeners: LbListener[] = await parallelPool(rawListeners, 4, async (l) => {
      const action = actionText(l.DefaultActions, tgName);
      const isHttp = l.Protocol === "HTTP" || l.Protocol === "HTTPS";
      const rules = isHttp
        ? ((await client.send(new DescribeRulesCommand({ ListenerArn: l.ListenerArn })).catch(() => ({ Rules: [] }))).Rules ?? [])
        : [];
      return {
        arn: l.ListenerArn ?? "",
        protocol: l.Protocol ?? "",
        port: l.Port,
        action: action.text,
        actionType: action.type,
        targetGroupArns: action.tgArns,
        certificates: l.Certificates?.length ?? 0,
        sslPolicy: l.SslPolicy,
        rules: rules
          .filter((r) => !r.IsDefault)
          .sort((a, b) => Number(a.Priority) - Number(b.Priority))
          .map((r) => {
            const ra = actionText(r.Actions, tgName);
            return {
              priority: r.Priority ?? "",
              conditions: (r.Conditions ?? []).map(conditionText),
              action: ra.text,
              targetGroupArns: ra.tgArns,
            };
          }),
      };
    });
    const targetGroups: LbTargetGroup[] = tgs
      .filter((t) => t.LoadBalancerArns?.includes(arn))
      .map((t) => ({
        arn: t.TargetGroupArn ?? "",
        name: t.TargetGroupName ?? "",
        protocol: t.Protocol ?? "",
        port: t.Port,
        targetType: t.TargetType ?? "",
        healthCheck: [t.HealthCheckProtocol, t.HealthCheckPath, t.HealthCheckPort && `port ${t.HealthCheckPort}`]
          .filter(Boolean)
          .join(" "),
        targets: (health.get(t.TargetGroupArn ?? "") ?? []).map((h) => ({
          id: h.Target?.Id ?? "",
          port: h.Target?.Port,
          az: h.Target?.AvailabilityZone,
          health: h.TargetHealth?.State ?? "unknown",
          reason: h.TargetHealth?.Description ?? h.TargetHealth?.Reason,
        })),
      }));
    return {
      vpcId: lb.VpcId ?? "",
      arn,
      name: lb.LoadBalancerName ?? "",
      type: (lb.Type ?? "application") as VpcLoadBalancer["type"],
      scheme: lb.Scheme === "internal" ? "internal" : "internet-facing",
      state: lb.State?.Code ?? "",
      dnsName: lb.DNSName ?? "",
      ipType: lb.IpAddressType ?? "ipv4",
      subnetIds: (lb.AvailabilityZones ?? []).map((z) => z.SubnetId).filter((x): x is string => !!x),
      azs: (lb.AvailabilityZones ?? []).map((z) => z.ZoneName).filter((x): x is string => !!x),
      securityGroupIds: lb.SecurityGroups ?? [],
      createdAt: lb.CreatedTime?.toISOString(),
      listeners: listeners.sort((a, b) => (a.port ?? 0) - (b.port ?? 0)),
      targetGroups,
    };
  });
}

async function fetchDatabases(client: RDSClient, region: string): Promise<WithVpc<VpcService>[]> {
  const dbs = await drain(paginateDescribeDBInstances({ client }, {}), (p) => p.DBInstances);
  return dbs.map((db) => {
    const id = db.DBInstanceIdentifier ?? "";
    const group = db.DBSubnetGroup?.Subnets ?? [];
    const azs = [db.AvailabilityZone, db.SecondaryAvailabilityZone].filter(Boolean);
    const placed = group.filter((s) => azs.includes(s.SubnetAvailabilityZone?.Name)).map((s) => s.SubnetIdentifier ?? "");
    const endpoint = db.Endpoint?.Address ? `${db.Endpoint.Address}:${db.Endpoint.Port}` : undefined;
    return {
      vpcId: db.DBSubnetGroup?.VpcId ?? "",
      kind: "database",
      id,
      name: id,
      state: db.DBInstanceStatus ?? "",
      subnetIds: placed.length ? placed : group.map((s) => s.SubnetIdentifier ?? ""),
      securityGroupIds: (db.VpcSecurityGroups ?? []).map((g) => g.VpcSecurityGroupId ?? ""),
      endpoint,
      attributes: [
        ["Engine", `${db.Engine} ${db.EngineVersion ?? ""}`.trim()],
        ["Class", db.DBInstanceClass ?? ""],
        ...(db.DBClusterIdentifier ? [["Cluster", db.DBClusterIdentifier] as [string, string]] : []),
        ...(!db.DBClusterIdentifier && db.AllocatedStorage
          ? [["Storage", `${db.AllocatedStorage} GiB ${db.StorageType ?? ""}`] as [string, string]]
          : []),
        ["Availability zone", azs.join(" + ")],
        ["Multi-AZ", yesNo(db.MultiAZ)],
        ["Publicly accessible", yesNo(db.PubliclyAccessible)],
        ["Encrypted", yesNo(db.StorageEncrypted)],
        ["Backups kept", `${db.BackupRetentionPeriod ?? 0} days`],
        ["Subnet group", `${db.DBSubnetGroup?.DBSubnetGroupName ?? "—"} (${group.length} subnets)`],
      ],
      consoleUrl: `https://${region}.console.aws.amazon.com/rds/home?region=${region}#database:id=${id};is-cluster=false`,
      facts: {
        publiclyAccessible: db.PubliclyAccessible,
        encrypted: db.StorageEncrypted,
        multiAz: db.MultiAZ,
        clusterMember: !!db.DBClusterIdentifier,
      },
    };
  });
}

async function fetchFunctions(client: LambdaClient, region: string): Promise<WithVpc<VpcService>[]> {
  const fns = await drain(paginateListFunctions({ client }, {}), (p) => p.Functions);
  return fns
    .filter((f) => f.VpcConfig?.VpcId)
    .map((f) => {
      const name = f.FunctionName ?? "";
      return {
        vpcId: f.VpcConfig?.VpcId ?? "",
        kind: "lambda",
        id: name,
        name,
        state: (f.State ?? "active").toLowerCase(),
        subnetIds: f.VpcConfig?.SubnetIds ?? [],
        securityGroupIds: f.VpcConfig?.SecurityGroupIds ?? [],
        attributes: [
          ["Runtime", f.Runtime ?? (f.PackageType === "Image" ? "container image" : "—")],
          ["Memory", `${f.MemorySize ?? 128} MB`],
          ["Timeout", `${f.Timeout ?? 3} s`],
          ["Architecture", (f.Architectures ?? ["x86_64"]).join(", ")],
          ["Last modified", f.LastModified?.slice(0, 10) ?? "—"],
        ],
        consoleUrl: `https://${region}.console.aws.amazon.com/lambda/home?region=${region}#/functions/${encodeURIComponent(name)}`,
        facts: {},
      };
    });
}

async function fetchCaches(client: ElastiCacheClient, region: string): Promise<WithVpc<VpcService>[]> {
  const [clusters, groups] = await Promise.all([
    drain(paginateDescribeCacheClusters({ client }, { ShowCacheNodeInfo: true }), (p) => p.CacheClusters),
    drain(paginateDescribeCacheSubnetGroups({ client }, {}), (p) => p.CacheSubnetGroups),
  ]);
  return clusters.map((c) => {
    const group = groups.find((g) => g.CacheSubnetGroupName === c.CacheSubnetGroupName);
    const nodeAzs = (c.CacheNodes ?? []).map((n) => n.CustomerAvailabilityZone).concat(c.PreferredAvailabilityZone);
    const subnets = group?.Subnets ?? [];
    const placed = subnets.filter((s) => nodeAzs.includes(s.SubnetAvailabilityZone?.Name)).map((s) => s.SubnetIdentifier ?? "");
    const ep = c.ConfigurationEndpoint ?? c.CacheNodes?.[0]?.Endpoint;
    const id = c.CacheClusterId ?? "";
    return {
      vpcId: group?.VpcId ?? "",
      kind: "cache",
      id,
      name: id,
      state: c.CacheClusterStatus ?? "",
      subnetIds: placed.length ? placed : subnets.map((s) => s.SubnetIdentifier ?? ""),
      securityGroupIds: (c.SecurityGroups ?? []).map((g) => g.SecurityGroupId ?? ""),
      endpoint: ep?.Address ? `${ep.Address}:${ep.Port}` : undefined,
      attributes: [
        ["Engine", `${c.Engine} ${c.EngineVersion ?? ""}`.trim()],
        ["Node type", c.CacheNodeType ?? ""],
        ["Nodes", String(c.NumCacheNodes ?? 0)],
        ...(c.ReplicationGroupId ? [["Replication group", c.ReplicationGroupId] as [string, string]] : []),
        ["Encryption in transit", yesNo(c.TransitEncryptionEnabled)],
        ["Encryption at rest", yesNo(c.AtRestEncryptionEnabled)],
      ],
      consoleUrl: `https://${region}.console.aws.amazon.com/elasticache/home?region=${region}#/${c.Engine ?? "redis"}/${id}`,
      facts: { transitEncryption: c.TransitEncryptionEnabled, encrypted: c.AtRestEncryptionEnabled },
    };
  });
}

async function fetchEcsServices(
  client: ECSClient,
  region: string,
  subnetVpc: Map<string, string>,
): Promise<WithVpc<VpcService>[]> {
  const clusters = (await drain(paginateListClusters({ client }, {}), (p) => p.clusterArns)).slice(0, MAX_ECS_CLUSTERS);
  const perCluster = await parallelPool(clusters, 4, async (cluster) => {
    const arns = (await drain(paginateListServices({ client }, { cluster }), (p) => p.serviceArns)).slice(
      0,
      MAX_ECS_SERVICES_PER_CLUSTER,
    );
    const chunks = Array.from({ length: Math.ceil(arns.length / 10) }, (_, i) => arns.slice(i * 10, i * 10 + 10));
    const described = await parallelPool(chunks, 3, (services) =>
      client.send(new DescribeServicesCommand({ cluster, services })).then((r) => r.services ?? []),
    );
    return described.flat();
  });
  return perCluster.flat().flatMap((s): WithVpc<VpcService>[] => {
    const net = s.networkConfiguration?.awsvpcConfiguration;
    const subnetIds = net?.subnets ?? [];
    const vpcId = subnetIds.map((id) => subnetVpc.get(id)).find(Boolean);
    if (!net || !vpcId) return [];
    const clusterName = s.clusterArn?.split("/").at(-1) ?? "";
    const name = s.serviceName ?? "";
    return [
      {
        vpcId,
        kind: "container",
        id: `${clusterName}/${name}`,
        name,
        state: (s.status ?? "").toLowerCase(),
        subnetIds,
        securityGroupIds: net.securityGroups ?? [],
        attributes: [
          ["Cluster", clusterName],
          ["Launch type", s.launchType ?? s.capacityProviderStrategy?.map((c) => c.capacityProvider).join(", ") ?? "—"],
          ["Tasks", `${s.runningCount ?? 0} running / ${s.desiredCount ?? 0} desired${s.pendingCount ? ` / ${s.pendingCount} pending` : ""}`],
          ["Task definition", s.taskDefinition?.split("/").at(-1) ?? "—"],
          ["Public IP", net.assignPublicIp === "ENABLED" ? "assigned" : "not assigned"],
        ],
        consoleUrl: `https://${region}.console.aws.amazon.com/ecs/v2/clusters/${clusterName}/services/${encodeURIComponent(name)}/health?region=${region}`,
        facts: { desired: s.desiredCount, running: s.runningCount },
      },
    ];
  });
}

/** Load balancers and managed services that live inside VPCs, for the whole region at once. */
export async function fetchVpcServices(
  region: string,
  profile: string | undefined,
  subnetVpc: Map<string, string>,
  warnings: string[],
): Promise<VpcServicesResult> {
  const opts = awsClientOptions(region, profile);
  const ok = { loadBalancers: true, database: true, lambda: true, cache: true, container: true };
  const pending: string[] = [];
  // Mark a service as not covered when its API fails, so ENI-based guesses stay visible.
  const guard = <T,>(key: keyof VpcCoverage, work: Promise<T[]>): Promise<T[]> =>
    work.catch((err) => {
      ok[key] = false;
      throw err;
    });

  const [loadBalancers, databases, functions, caches, containers] = await Promise.all([
    optional("Load balancers", guard("loadBalancers", fetchLoadBalancers(new ElasticLoadBalancingV2Client(opts))), [], warnings),
    optional("RDS databases", guard("database", fetchDatabases(new RDSClient(opts), region)), [], warnings),
    optional(
      "Lambda functions",
      guard(
        "lambda",
        cachedWithBudget(`lambda|${region}|${profile ?? ""}`, LAMBDA_TTL_MS, LAMBDA_BUDGET_MS, () =>
          fetchFunctions(new LambdaClient(opts), region),
        ).then((r) => {
          if (r !== PENDING) return r;
          ok.lambda = false;
          pending.push("Lambda functions");
          return [];
        }),
      ),
      [],
      warnings,
    ),
    optional("ElastiCache clusters", guard("cache", fetchCaches(new ElastiCacheClient(opts), region)), [], warnings),
    optional("ECS services", guard("container", fetchEcsServices(new ECSClient(opts), region, subnetVpc)), [], warnings),
  ]);

  return { loadBalancers, services: [...databases, ...functions, ...caches, ...containers], coverage: ok, pending };
}
