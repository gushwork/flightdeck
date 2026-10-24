import type { ConsoleResource } from "@/lib/vpc/links";
import type { ResourceKind, VpcDetail, VpcLoadBalancer, VpcServiceKind } from "@/lib/vpc/types";

export const KIND_LABEL: Record<ResourceKind, string> = {
  instance: "EC2 instance",
  "nat-gateway": "NAT gateway",
  "load-balancer": "Load balancer",
  database: "Database",
  lambda: "Lambda",
  cache: "Cache",
  container: "ECS service",
  endpoint: "VPC endpoint",
  "internet-gateway": "Internet gateway",
  "egress-igw": "Egress-only IGW",
  "vpn-gateway": "VPN gateway",
  "tgw-attachment": "TGW attachment",
  peering: "Peering",
  "network-interface": "Network interface",
  other: "Other",
};

export const LB_LABEL: Record<VpcLoadBalancer["type"], string> = {
  application: "ALB",
  network: "NLB",
  gateway: "GWLB",
};

export interface ResourceRow {
  key: string;
  kind: ResourceKind;
  id: string;
  name: string;
  state: string;
  subnetIds: string[];
  azs: string[];
  ips: string[];
  detail: string;
  attributes: [string, string][];
  securityGroupIds: string[];
  endpoint?: string;
  consoleType: ConsoleResource;
  /** Overrides `consoleType` for services outside the EC2/VPC consoles. */
  href?: string;
  /** Set on load balancer rows so the UI can open the Load balancers view. */
  lbArn?: string;
  /** true when the row is inferred from network interfaces rather than the owning service's API. */
  inferred?: boolean;
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const shortService = (s: string) => s.split(".").slice(-1)[0];
const compact = (pairs: [string, string | undefined][]): [string, string][] =>
  pairs.filter((p): p is [string, string] => !!p[1]);

export function lbHealth(lb: VpcLoadBalancer): { healthy: number; total: number } {
  const targets = lb.targetGroups.flatMap((t) => t.targets);
  return { healthy: targets.filter((t) => t.health === "healthy").length, total: targets.length };
}

/** One inventory row per thing a person would recognise (ENIs fold into their owner). */
export function buildResourceRows(vpc: VpcDetail): ResourceRow[] {
  const azOf = (subnetId: string) => vpc.subnets.find((s) => s.id === subnetId)?.az ?? "";
  const rows: ResourceRow[] = [];
  const vpcLevel = (r: Omit<ResourceRow, "subnetIds" | "azs" | "ips" | "securityGroupIds">): ResourceRow => ({
    ...r,
    subnetIds: [],
    azs: [],
    ips: [],
    securityGroupIds: [],
  });

  for (const i of vpc.instances) {
    rows.push({
      key: i.id,
      kind: "instance",
      id: i.id,
      name: i.name || i.id,
      state: i.state,
      subnetIds: [i.subnetId],
      azs: [i.az],
      ips: [i.privateIp, i.publicIp].filter((x): x is string => !!x),
      detail: [i.type, i.iamProfile?.split("/").pop()].filter(Boolean).join(" · "),
      attributes: compact([
        ["Instance type", i.type],
        ["Private IP", i.privateIp],
        ["Public IP", i.publicIp],
        ["IAM role profile", i.iamProfile?.split("/").pop()],
        ["Launched", i.launchTime?.slice(0, 10)],
      ]),
      securityGroupIds: i.securityGroupIds,
      consoleType: "instance",
    });
  }

  for (const lb of vpc.loadBalancers) {
    const { healthy, total } = lbHealth(lb);
    rows.push({
      key: lb.arn,
      kind: "load-balancer",
      id: lb.arn.split(":loadbalancer/")[1] ?? lb.name,
      name: lb.name,
      state: lb.state,
      subnetIds: lb.subnetIds,
      azs: lb.azs,
      ips: [],
      detail: `${LB_LABEL[lb.type]} · ${lb.scheme} · ${lb.listeners.length} listener${lb.listeners.length === 1 ? "" : "s"}${
        total ? ` · ${healthy}/${total} healthy` : ""
      }`,
      attributes: compact([
        ["Type", LB_LABEL[lb.type]],
        ["Scheme", lb.scheme],
        ["IP type", lb.ipType],
        ["Listeners", lb.listeners.map((l) => `${l.protocol}:${l.port}`).join(", ") || "none"],
        ["Target groups", String(lb.targetGroups.length)],
        ["Targets healthy", total ? `${healthy} of ${total}` : "no targets"],
        ["Created", lb.createdAt?.slice(0, 10)],
      ]),
      securityGroupIds: lb.securityGroupIds,
      endpoint: lb.dnsName,
      consoleType: "load-balancer",
      lbArn: lb.arn,
    });
  }

  for (const s of vpc.services) {
    rows.push({
      key: `${s.kind}:${s.id}`,
      kind: s.kind,
      id: s.id,
      name: s.name,
      state: s.state,
      subnetIds: s.subnetIds,
      azs: uniq(s.subnetIds.map(azOf).filter(Boolean)),
      ips: [],
      detail: s.attributes
        .slice(0, 2)
        .map(([, v]) => v)
        .join(" · "),
      attributes: s.attributes,
      securityGroupIds: s.securityGroupIds,
      endpoint: s.endpoint,
      consoleType: "network-interface",
      href: s.consoleUrl,
    });
  }

  for (const n of vpc.natGateways) {
    rows.push({
      key: n.id,
      kind: "nat-gateway",
      id: n.id,
      name: n.name || n.id,
      state: n.state,
      subnetIds: [n.subnetId],
      azs: [n.az],
      ips: [n.publicIp, n.privateIp].filter((x): x is string => !!x),
      detail: `${n.connectivity} NAT`,
      attributes: compact([
        ["Connectivity", n.connectivity],
        ["Elastic IP", n.publicIp],
        ["Private IP", n.privateIp],
        ["Used by", `${vpc.subnets.filter((s) => s.egressTarget === n.id).length} subnet(s)`],
      ]),
      securityGroupIds: [],
      consoleType: "nat-gateway",
    });
  }

  for (const e of vpc.endpoints) {
    rows.push({
      key: e.id,
      kind: "endpoint",
      id: e.id,
      name: shortService(e.service),
      state: e.state,
      subnetIds: e.subnetIds,
      azs: uniq(e.subnetIds.map(azOf).filter(Boolean)),
      ips: [],
      detail: `${e.type} · ${e.service}${e.privateDns ? " · private DNS" : ""}`,
      attributes: compact([
        ["Service", e.service],
        ["Type", e.type],
        ["Private DNS", e.type === "Interface" ? (e.privateDns ? "on" : "off") : undefined],
        ["Route tables", e.type === "Gateway" ? String(e.routeTableIds.length) : undefined],
      ]),
      securityGroupIds: [],
      consoleType: "endpoint",
    });
  }

  if (vpc.internetGatewayId) {
    rows.push(
      vpcLevel({
        key: vpc.internetGatewayId,
        kind: "internet-gateway",
        id: vpc.internetGatewayId,
        name: vpc.internetGatewayId,
        state: "attached",
        detail: "Internet access for public subnets",
        attributes: [["Public subnets", String(vpc.subnets.filter((s) => s.tier === "public").length)]],
        consoleType: "internet-gateway",
      }),
    );
  }
  for (const g of vpc.egressOnlyIgws) {
    rows.push(vpcLevel({ key: g.id, kind: "egress-igw", id: g.id, name: g.id, state: g.state, detail: "IPv6 egress only", attributes: [], consoleType: "egress-igw" }));
  }
  for (const g of vpc.vpnGateways) {
    rows.push(vpcLevel({ key: g.id, kind: "vpn-gateway", id: g.id, name: g.id, state: g.state, detail: g.type, attributes: [["Type", g.type]], consoleType: "vpn-gateway" }));
  }
  for (const a of vpc.tgwAttachments) {
    rows.push({
      key: a.id,
      kind: "tgw-attachment",
      id: a.id,
      name: a.tgwId,
      state: a.state,
      subnetIds: a.subnetIds,
      azs: uniq(a.subnetIds.map(azOf).filter(Boolean)),
      ips: [],
      detail: "Transit gateway attachment",
      attributes: [["Transit gateway", a.tgwId]],
      securityGroupIds: [],
      consoleType: "tgw-attachment",
    });
  }
  for (const p of vpc.peerings) {
    rows.push(
      vpcLevel({
        key: p.id,
        kind: "peering",
        id: p.id,
        name: p.name || p.id,
        state: p.status,
        detail: `${p.role} · ${p.peerVpcId} (${p.peerRegion}) · ${p.peerCidrs.join(", ")}`,
        attributes: [
          ["Peer VPC", p.peerVpcId],
          ["Peer CIDR", p.peerCidrs.join(", ")],
          ["Peer account", p.peerOwner],
          ["Peer region", p.peerRegion],
          ["This VPC is the", p.role],
        ],
        consoleType: "peering",
      }),
    );
  }

  // ENIs owned by things already listed are folded away. For services whose API answered and
  // returned something in this VPC, the real rows replace ENI-based guesses.
  const folded = new Set(["instance", "nat-gateway", "endpoint"]);
  const realKinds = new Set<VpcServiceKind>(vpc.services.map((s) => s.kind));
  const covered = (kind: ResourceKind) =>
    (kind === "database" || kind === "lambda" || kind === "cache" || kind === "container") &&
    vpc.coverage[kind] &&
    realKinds.has(kind);
  const knownLbs = new Set(vpc.loadBalancers.map((lb) => `lb:${lb.name}`));

  const groups = new Map<string, typeof vpc.enis>();
  for (const eni of vpc.enis) {
    if (folded.has(eni.kind) || covered(eni.kind)) continue;
    if (eni.kind === "load-balancer" && knownLbs.has(eni.group)) continue;
    const key = `${eni.kind}:${eni.group}`;
    groups.set(key, [...(groups.get(key) ?? []), eni]);
  }
  for (const [key, enis] of groups) {
    const first = enis[0];
    rows.push({
      key,
      kind: first.kind,
      id: first.id,
      name: first.label,
      state: first.status,
      subnetIds: uniq(enis.map((e) => e.subnetId)),
      azs: uniq(enis.map((e) => e.az)),
      ips: enis.flatMap((e) => e.privateIps),
      detail: `${enis.length} network interface${enis.length === 1 ? "" : "s"}${first.description ? ` · ${first.description}` : ""}`,
      attributes: compact([
        ["Description", first.description],
        ["Interfaces", enis.map((e) => e.id).join(", ")],
        ["Managed by AWS", first.requesterManaged ? "yes" : "no"],
      ]),
      securityGroupIds: uniq(enis.flatMap((e) => e.securityGroupIds)),
      consoleType: "network-interface",
      inferred: true,
    });
  }
  return rows;
}

export function rowsToCsv(rows: ResourceRow[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = ["type", "name", "id", "state", "subnets", "azs", "ips", "detail"];
  const body = rows.map((r) =>
    [KIND_LABEL[r.kind], r.name, r.id, r.state, r.subnetIds.join(" "), r.azs.join(" "), r.ips.join(" "), r.detail]
      .map(esc)
      .join(","),
  );
  return [head.join(","), ...body].join("\n");
}
