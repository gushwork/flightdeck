import { overlaps, parseCidr } from "@/lib/vpc/cidr";
import type {
  FindingSeverity,
  SgRule,
  VpcDetail,
  VpcFinding,
  VpcSecurityGroup,
} from "@/lib/vpc/types";

export type VpcReviewInput = Omit<VpcDetail, "findings" | "score">;

const SENSITIVE_PORTS = [22, 3389];
const WEB_PORTS = new Set(["80", "443"]);
const LB_LABEL = { application: "ALB", network: "NLB", gateway: "GWLB" } as const;
const SEVERITY_ORDER: FindingSeverity[] = ["high", "medium", "low", "info"];
const PENALTY: Record<FindingSeverity, number> = { high: 15, medium: 7, low: 3, info: 0 };

export function isWorldRule(rule: SgRule): boolean {
  return rule.sourceKind === "cidr" && (rule.source === "0.0.0.0/0" || rule.source === "::/0");
}

function portsInclude(ports: string, port: number): boolean {
  if (ports === "All") return true;
  const [from, to = from] = ports.split("-").map(Number);
  return port >= from && port <= to;
}

/** high = all ports or admin ports open to the world; medium = other ports; null = web-only or ICMP. */
export function worldRisk(rule: SgRule): "high" | "medium" | null {
  if (!isWorldRule(rule)) return null;
  if (rule.protocol === "ICMP" || rule.protocol === "ICMPV6") return null;
  if (rule.ports === "All") return "high";
  if (SENSITIVE_PORTS.some((p) => portsInclude(rule.ports, p))) return "high";
  return WEB_PORTS.has(rule.ports) ? null : "medium";
}

export function riskyInbound(sg: VpcSecurityGroup): SgRule[] {
  return sg.inbound.filter((r) => worldRisk(r) !== null);
}

/** Per-resource checks share a rule; repeats of one rule add 25% each, capped at 2× its weight. */
const PER_RESOURCE_RULES = [
  "sg-open", "ip", "blackhole", "overlap", "peering", "lb-http", "tg-empty", "tg-down", "tg-degraded",
  "db-public", "db-unencrypted", "cache-plaintext", "ecs-short",
];

export function ruleOf(findingId: string): string {
  return PER_RESOURCE_RULES.filter((r) => findingId.startsWith(`${r}-`)).sort((a, b) => b.length - a.length)[0] ?? findingId;
}

export function scoreOf(findings: VpcFinding[]): number {
  const groups = new Map<string, number>();
  for (const f of findings) {
    const key = `${ruleOf(f.id)}|${f.severity}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  let penalty = 0;
  for (const [key, n] of groups) {
    penalty += PENALTY[key.split("|")[1] as FindingSeverity] * Math.min(2, 1 + 0.25 * (n - 1));
  }
  return Math.max(0, Math.round(100 - penalty));
}

export function gradeOf(score: number): { label: string; tone: "success" | "accent" | "warn" | "danger" } {
  if (score >= 90) return { label: "Excellent", tone: "success" };
  if (score >= 75) return { label: "Good", tone: "accent" };
  if (score >= 55) return { label: "Needs work", tone: "warn" };
  return { label: "At risk", tone: "danger" };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Design and hygiene review. Pure: same VPC in, same findings out. */
export function reviewVpc(vpc: VpcReviewInput, others: VpcReviewInput[] = []): VpcFinding[] {
  const out: VpcFinding[] = [];
  const add = (f: VpcFinding) => out.push(f);
  const subnetName = (id: string) => vpc.subnets.find((s) => s.id === id)?.name || id;

  for (const sg of vpc.securityGroups) {
    const risky = riskyInbound(sg);
    if (risky.length === 0) continue;
    const high = risky.some((r) => worldRisk(r) === "high");
    const attached = sg.eniCount > 0;
    const ports = [...new Set(risky.map((r) => (r.ports === "All" ? "all ports" : `port ${r.ports}`)))];
    add({
      id: `sg-open-${sg.id}`,
      severity: !attached ? "low" : high ? "high" : "medium",
      title: `${sg.name} is open to the internet on ${ports.join(", ")}`,
      detail: `${plural(risky.length, "inbound rule")} ${risky.length === 1 ? "allows" : "allow"} 0.0.0.0/0 or ::/0. ${
        attached ? `Attached to ${plural(sg.eniCount, "network interface")}.` : "Not attached to anything right now."
      }`,
      fix: "Limit the source to a known CIDR (office, VPN) or another security group, or front the service with a load balancer.",
      resourceIds: [sg.id],
      view: "security",
    });
  }

  const defaultSg = vpc.securityGroups.find((s) => s.isDefault && s.eniCount > 0);
  if (defaultSg) {
    add({
      id: "default-sg-in-use",
      severity: "medium",
      title: `Default security group is attached to ${plural(defaultSg.eniCount, "interface")}`,
      detail: "The default group allows all traffic between its members, which makes access hard to reason about.",
      fix: "Create purpose-built security groups and move workloads off the default group.",
      resourceIds: [defaultSg.id],
      view: "security",
    });
  }

  if (vpc.flowLogs !== null && vpc.flowLogs.length === 0) {
    add({
      id: "no-flow-logs",
      severity: "medium",
      title: "VPC flow logs are not enabled",
      detail: "Without flow logs you cannot see who talked to what, which slows down incident response and debugging.",
      fix: "Enable flow logs to CloudWatch Logs or S3 (start with REJECT traffic if volume is a concern).",
      resourceIds: [vpc.id],
      view: "connectivity",
    });
  }

  const azs = new Set(vpc.subnets.map((s) => s.az));
  if (vpc.subnets.length > 0 && azs.size < 2) {
    add({
      id: "single-az",
      severity: "medium",
      title: "All subnets live in a single availability zone",
      detail: "One AZ outage takes everything in this VPC down.",
      fix: "Add subnets in at least two AZs and spread workloads across them.",
      resourceIds: vpc.subnets.map((s) => s.id),
      view: "topology",
    });
  }

  const natAzs = new Set(vpc.natGateways.filter((n) => n.state !== "deleted").map((n) => n.az));
  const privateAzs = new Set(vpc.subnets.filter((s) => s.tier === "private").map((s) => s.az));
  if (natAzs.size > 0 && privateAzs.size > natAzs.size) {
    add({
      id: "nat-not-per-az",
      severity: "medium",
      title: `NAT gateways cover ${natAzs.size} of ${privateAzs.size} AZs with private subnets`,
      detail: "Private subnets in other AZs send egress traffic across AZs (extra cost) and lose internet access if the NAT's AZ fails.",
      fix: "Run one NAT gateway per AZ and point each AZ's private route table at its local NAT.",
      resourceIds: vpc.natGateways.map((n) => n.id),
      view: "connectivity",
    });
  }

  for (const s of vpc.subnets) {
    const used = s.totalIps - s.availableIps;
    const pct = s.totalIps > 0 ? used / s.totalIps : 0;
    if (pct < 0.75) continue;
    add({
      id: `ip-${s.id}`,
      severity: pct >= 0.9 ? "high" : "medium",
      title: `${subnetName(s.id)} is ${Math.round(pct * 100)}% full`,
      detail: `${s.availableIps} of ${s.totalIps} addresses left in ${s.cidr}. Autoscaling, ENIs and Lambda can exhaust a small subnet quickly.`,
      fix: "Add a larger subnet (or a secondary CIDR) and shift new workloads there.",
      resourceIds: [s.id],
      view: "planner",
    });
  }

  const misconfigured = vpc.subnets.filter((s) => s.tier !== "public" && s.mapPublicIpOnLaunch);
  if (misconfigured.length > 0) {
    add({
      id: "auto-ip-private",
      severity: "low",
      title: `${plural(misconfigured.length, "non-public subnet")} auto-assign public IPs`,
      detail: "Instances there get a public IP that cannot be reached, because the subnet has no route to an internet gateway.",
      fix: "Turn off auto-assign public IPv4 on those subnets.",
      resourceIds: misconfigured.map((s) => s.id),
      view: "subnets",
    });
  }

  const empty = vpc.subnets.filter((s) => s.eniCount === 0);
  if (empty.length > 0) {
    add({
      id: "empty-subnets",
      severity: "info",
      title: `${plural(empty.length, "subnet")} ${empty.length === 1 ? "has" : "have"} nothing in ${empty.length === 1 ? "it" : "them"}`,
      detail: "No network interfaces live there. It may be spare capacity or a leftover.",
      resourceIds: empty.map((s) => s.id),
      view: "subnets",
    });
  }

  const interfaceDns = vpc.endpoints.filter((e) => e.type === "Interface" && e.privateDns);
  if (interfaceDns.length > 0 && !(vpc.dnsSupport && vpc.dnsHostnames)) {
    add({
      id: "endpoint-dns",
      severity: "medium",
      title: "Private DNS for interface endpoints needs both DNS settings on",
      detail: `DNS resolution is ${vpc.dnsSupport ? "on" : "off"} and DNS hostnames is ${vpc.dnsHostnames ? "on" : "off"}. Endpoint names will not resolve to private IPs.`,
      fix: "Enable DNS resolution and DNS hostnames on the VPC.",
      resourceIds: [vpc.id, ...interfaceDns.map((e) => e.id)],
      view: "connectivity",
    });
  }

  const hasS3Gateway = vpc.endpoints.some((e) => e.type === "Gateway" && e.service.endsWith(".s3"));
  if (vpc.natGateways.length > 0 && privateAzs.size > 0 && !hasS3Gateway) {
    add({
      id: "no-s3-gateway-endpoint",
      severity: "low",
      title: "No S3 gateway endpoint behind the NAT gateway",
      detail: "S3 traffic from private subnets is going through NAT and paying per-GB processing fees.",
      fix: "Create a free S3 gateway endpoint and attach it to the private route tables.",
      resourceIds: vpc.natGateways.map((n) => n.id),
      view: "connectivity",
    });
  }

  for (const rt of vpc.routeTables) {
    const dead = rt.routes.filter((r) => r.state === "blackhole");
    if (dead.length === 0) continue;
    add({
      id: `blackhole-${rt.id}`,
      severity: "medium",
      title: `${rt.name || rt.id} has ${plural(dead.length, "blackhole route")}`,
      detail: `${dead.map((r) => `${r.destination} → ${r.target}`).join(", ")} points at a resource that no longer exists, so matching traffic is dropped.`,
      fix: "Delete the route or recreate its target.",
      resourceIds: [rt.id],
      view: "routing",
    });
  }

  const idleTables = vpc.routeTables.filter((rt) => !rt.main && rt.subnetIds.length === 0);
  if (idleTables.length > 0) {
    add({
      id: "unused-route-tables",
      severity: "low",
      title: `${plural(idleTables.length, "route table")} not associated with any subnet`,
      detail: "Unused route tables are clutter and a place for stale routes to hide.",
      resourceIds: idleTables.map((rt) => rt.id),
      view: "routing",
    });
  }

  const loose = vpc.enis.filter((e) => e.kind === "network-interface");
  if (loose.length > 0) {
    add({
      id: "unattached-enis",
      severity: "low",
      title: `${plural(loose.length, "network interface")} not attached to anything`,
      detail: "Detached ENIs keep their private IPs and security group memberships.",
      resourceIds: loose.map((e) => e.id),
      view: "resources",
    });
  }

  const unusedSgs = vpc.securityGroups.filter((s) => !s.isDefault && s.eniCount === 0 && s.referencedBy.length === 0);
  if (unusedSgs.length > 0) {
    add({
      id: "unused-sgs",
      severity: "low",
      title: `${plural(unusedSgs.length, "security group")} unused`,
      detail: "Not attached to any interface and not referenced by another group's rules.",
      resourceIds: unusedSgs.map((s) => s.id),
      view: "security",
    });
  }

  const mine = vpc.cidrs.filter((c) => c.kind === "ipv4").map((c) => parseCidr(c.cidr));
  for (const other of others) {
    if (other.id === vpc.id) continue;
    const clash = other.cidrs
      .filter((c) => c.kind === "ipv4")
      .map((c) => parseCidr(c.cidr))
      .some((o) => o && mine.some((m) => m && overlaps(m, o)));
    if (!clash) continue;
    add({
      id: `overlap-${other.id}`,
      severity: vpc.isDefault || other.isDefault ? "low" : "medium",
      title: `CIDR overlaps with ${other.name || other.id}`,
      detail: "Overlapping VPCs cannot be peered or joined through a transit gateway.",
      fix: "Pick a non-overlapping range for new VPCs; the planner view shows what is free.",
      resourceIds: [vpc.id, other.id],
      view: "planner",
    });
  }

  for (const p of vpc.peerings) {
    if (["active", "provisioning", "deleted"].includes(p.status)) continue;
    add({
      id: `peering-${p.id}`,
      severity: "low",
      title: `Peering ${p.name || p.id} is ${p.status}`,
      detail: `Peering with ${p.peerVpcId} is not active, so no traffic flows.`,
      resourceIds: [p.id],
      view: "connectivity",
    });
  }

  for (const lb of vpc.loadBalancers) {
    const label = `${LB_LABEL[lb.type]} ${lb.name}`;
    if (lb.type === "application" && lb.scheme === "internet-facing") {
      const plain = lb.listeners.filter((l) => l.protocol === "HTTP" && l.actionType !== "redirect");
      if (plain.length > 0) {
        add({
          id: `lb-http-${lb.arn}`,
          severity: "medium",
          title: `${label} serves plain HTTP to the internet`,
          detail: `Port ${plain.map((l) => l.port).join(", ")} forwards unencrypted requests instead of redirecting to HTTPS.`,
          fix: "Change the HTTP listener's default action to a 301 redirect to HTTPS:443.",
          resourceIds: [lb.arn],
          view: "load-balancers",
        });
      }
    }
    for (const tg of lb.targetGroups) {
      const bad = tg.targets.filter((t) => t.health === "unhealthy");
      if (tg.targets.length === 0) {
        add({
          id: `tg-empty-${tg.arn}`,
          severity: "low",
          title: `Target group ${tg.name} has no registered targets`,
          detail: `Requests ${label} routes to it get a 503.`,
          resourceIds: [lb.arn],
          view: "load-balancers",
        });
      } else if (bad.length === tg.targets.length) {
        add({
          id: `tg-down-${tg.arn}`,
          severity: "high",
          title: `Target group ${tg.name} has no healthy targets`,
          detail: `All ${plural(tg.targets.length, "target")} fail the health check (${tg.healthCheck}). ${label} answers with 502/503.`,
          fix: "Check the health check path and port, and that the targets' security group allows the load balancer.",
          resourceIds: [lb.arn],
          view: "load-balancers",
        });
      } else if (bad.length > 0) {
        add({
          id: `tg-degraded-${tg.arn}`,
          severity: "medium",
          title: `${bad.length} of ${tg.targets.length} targets unhealthy in ${tg.name}`,
          detail: bad[0].reason ?? "Some targets fail the health check, so capacity is reduced.",
          resourceIds: [lb.arn],
          view: "load-balancers",
        });
      }
    }
  }

  for (const s of vpc.services) {
    if (s.kind === "database") {
      if (s.facts.publiclyAccessible) {
        add({
          id: `db-public-${s.id}`,
          severity: "high",
          title: `Database ${s.name} is publicly accessible`,
          detail: "It has a public DNS address; only its security group stands between it and the internet.",
          fix: "Turn off public accessibility and connect through a bastion, VPN or SSM port forwarding.",
          resourceIds: [s.id, ...s.securityGroupIds],
          view: "resources",
        });
      }
      if (s.facts.encrypted === false) {
        add({
          id: `db-unencrypted-${s.id}`,
          severity: "medium",
          title: `Database ${s.name} storage is not encrypted`,
          detail: "Data, snapshots and replicas are stored unencrypted at rest.",
          fix: "Encryption is set at creation: snapshot, copy the snapshot with encryption, restore, then cut over.",
          resourceIds: [s.id],
          view: "resources",
        });
      }
    }
    if (s.kind === "cache" && s.facts.transitEncryption === false) {
      add({
        id: `cache-plaintext-${s.id}`,
        severity: "low",
        title: `Cache ${s.name} does not encrypt traffic in transit`,
        detail: "Clients talk to it in plain text inside the VPC.",
        resourceIds: [s.id],
        view: "resources",
      });
    }
    if (s.kind === "container" && s.facts.desired !== undefined && (s.facts.running ?? 0) < s.facts.desired) {
      add({
        id: `ecs-short-${s.id}`,
        severity: "medium",
        title: `ECS service ${s.name} is running ${s.facts.running ?? 0} of ${s.facts.desired} tasks`,
        detail: "Tasks are failing to start or to stay healthy.",
        fix: "Check the service events and stopped-task reasons in the ECS console.",
        resourceIds: [s.id],
        view: "resources",
      });
    }
  }

  const singleAzDbs = vpc.services.filter((s) => s.kind === "database" && s.facts.multiAz === false && !s.facts.clusterMember);
  if (singleAzDbs.length > 0) {
    add({
      id: "db-single-az",
      severity: "low",
      title: `${plural(singleAzDbs.length, "database")} ${singleAzDbs.length === 1 ? "runs" : "run"} in a single AZ`,
      detail: `${singleAzDbs.map((s) => s.name).join(", ")}. An AZ outage or maintenance event takes ${singleAzDbs.length === 1 ? "it" : "them"} offline. Read replicas are often fine this way.`,
      fix: "Enable Multi-AZ for production primaries.",
      resourceIds: singleAzDbs.map((s) => s.id),
      view: "resources",
    });
  }

  const azOf = (id: string) => vpc.subnets.find((x) => x.id === id)?.az;
  const oneAzFunctions = vpc.services.filter(
    (s) => s.kind === "lambda" && new Set(s.subnetIds.map(azOf).filter(Boolean)).size === 1,
  );
  if (oneAzFunctions.length > 0) {
    add({
      id: "lambda-single-az",
      severity: "low",
      title: `${plural(oneAzFunctions.length, "Lambda function")} attached to subnets in one AZ`,
      detail: "If that AZ has trouble, invocations that need the VPC fail.",
      fix: "Attach VPC functions to subnets in at least two AZs.",
      resourceIds: oneAzFunctions.map((s) => s.id),
      view: "resources",
    });
  }

  if (vpc.isDefault && vpc.subnets.length > 0 && vpc.subnets.every((s) => s.tier === "public")) {
    add({
      id: "default-vpc",
      severity: "info",
      title: "This is the default VPC",
      detail: "Every subnet is public by design. Fine for experiments; production workloads usually deserve a purpose-built VPC with private tiers.",
      resourceIds: [vpc.id],
      view: "topology",
    });
  }

  return out.sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      a.title.localeCompare(b.title),
  );
}
