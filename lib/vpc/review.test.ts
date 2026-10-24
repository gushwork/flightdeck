import { describe, expect, it } from "vitest";
import { gradeOf, reviewVpc, ruleOf, scoreOf, worldRisk, type VpcReviewInput } from "@/lib/vpc/review";
import type {
  LbListener,
  LbTargetGroup,
  SgRule,
  VpcLoadBalancer,
  VpcSecurityGroup,
  VpcService,
  VpcSubnet,
} from "@/lib/vpc/types";

const subnet = (o: Partial<VpcSubnet> & { id: string }): VpcSubnet => ({
  name: "",
  cidr: "10.0.0.0/24",
  ipv6Cidrs: [],
  az: "us-east-1a",
  azId: "use1-az1",
  state: "available",
  totalIps: 251,
  availableIps: 200,
  mapPublicIpOnLaunch: false,
  defaultForAz: false,
  tier: "private",
  eniCount: 1,
  instanceCount: 0,
  natGatewayIds: [],
  tags: {},
  ...o,
});

const vpc = (o: Partial<VpcReviewInput> = {}): VpcReviewInput => ({
  id: "vpc-1",
  name: "main",
  ownerId: "1",
  cidr: "10.0.0.0/16",
  cidrs: [{ cidr: "10.0.0.0/16", kind: "ipv4", state: "associated", primary: true }],
  isDefault: false,
  state: "available",
  tenancy: "default",
  dnsSupport: true,
  dnsHostnames: true,
  tags: {},
  egressOnlyIgws: [],
  subnets: [subnet({ id: "subnet-a", az: "us-east-1a" }), subnet({ id: "subnet-b", az: "us-east-1b" })],
  routeTables: [],
  natGateways: [],
  endpoints: [],
  instances: [],
  enis: [],
  securityGroups: [],
  networkAcls: [],
  peerings: [],
  tgwAttachments: [],
  vpnGateways: [],
  flowLogs: [{ id: "fl-1", status: "ACTIVE", trafficType: "ALL", destination: "x" }],
  loadBalancers: [],
  services: [],
  coverage: { loadBalancers: true, database: true, lambda: true, cache: true, container: true },
  ...o,
});

const sg = (o: Partial<VpcSecurityGroup>): VpcSecurityGroup => ({
  id: "sg-1",
  name: "web",
  description: "",
  isDefault: false,
  inbound: [],
  outbound: [],
  eniCount: 1,
  referencedBy: [],
  ...o,
});

const world = (ports: string, protocol = "TCP"): SgRule => ({ protocol, ports, source: "0.0.0.0/0", sourceKind: "cidr" });

const ids = (v: VpcReviewInput, others: VpcReviewInput[] = []) => reviewVpc(v, others).map((f) => f.id);

describe("worldRisk", () => {
  it("rates exposure", () => {
    expect(worldRisk(world("22"))).toBe("high");
    expect(worldRisk(world("0-65535"))).toBe("high");
    expect(worldRisk(world("All", "All"))).toBe("high");
    expect(worldRisk(world("5432"))).toBe("medium");
    expect(worldRisk(world("443"))).toBeNull();
    expect(worldRisk(world("All", "ICMP"))).toBeNull();
    expect(worldRisk({ ...world("22"), source: "10.0.0.0/8" })).toBeNull();
  });
});

describe("reviewVpc", () => {
  it("is quiet for a healthy VPC", () => {
    expect(ids(vpc()).filter((id) => id !== "empty-subnets")).toEqual([]);
  });

  it("flags world-open SSH on attached groups as high, unattached as low", () => {
    const attached = reviewVpc(vpc({ securityGroups: [sg({ inbound: [world("22")] })] }));
    expect(attached.find((f) => f.id === "sg-open-sg-1")?.severity).toBe("high");
    const loose = reviewVpc(vpc({ securityGroups: [sg({ inbound: [world("22")], eniCount: 0 })] }));
    expect(loose.find((f) => f.id === "sg-open-sg-1")?.severity).toBe("low");
  });

  it("flags missing flow logs only when readable", () => {
    expect(ids(vpc({ flowLogs: [] }))).toContain("no-flow-logs");
    expect(ids(vpc({ flowLogs: null }))).not.toContain("no-flow-logs");
  });

  it("flags single-AZ, nearly full subnets and NAT coverage", () => {
    expect(ids(vpc({ subnets: [subnet({ id: "subnet-a" })] }))).toContain("single-az");
    const full = reviewVpc(vpc({ subnets: [subnet({ id: "s1", availableIps: 10 }), subnet({ id: "s2", az: "us-east-1b" })] }));
    expect(full.find((f) => f.id === "ip-s1")?.severity).toBe("high");
    const nat = vpc({
      subnets: [subnet({ id: "a", az: "us-east-1a" }), subnet({ id: "b", az: "us-east-1b" })],
      natGateways: [{ id: "nat-1", name: "", subnetId: "x", az: "us-east-1a", state: "available", connectivity: "public" }],
    });
    expect(ids(nat)).toContain("nat-not-per-az");
  });

  it("flags CIDR overlap with another VPC", () => {
    const other = vpc({ id: "vpc-2", name: "other", cidrs: [{ cidr: "10.0.5.0/24", kind: "ipv4", state: "associated", primary: true }] });
    expect(ids(vpc(), [other])).toContain("overlap-vpc-2");
    expect(ids(vpc(), [vpc({ id: "vpc-3", cidrs: [{ cidr: "192.168.0.0/16", kind: "ipv4", state: "associated", primary: true }] })])).not.toContain("overlap-vpc-3");
  });
});

describe("load balancer and service checks", () => {
  const lb = (o: Partial<VpcLoadBalancer> = {}): VpcLoadBalancer => ({
    arn: "arn:lb/app/web/1",
    name: "web",
    type: "application",
    scheme: "internet-facing",
    state: "active",
    dnsName: "web.example",
    ipType: "ipv4",
    subnetIds: [],
    azs: [],
    securityGroupIds: [],
    listeners: [],
    targetGroups: [],
    ...o,
  });
  const listener = (protocol: string, actionType: string): LbListener => ({
    arn: protocol,
    protocol,
    port: protocol === "HTTP" ? 80 : 443,
    action: "",
    actionType,
    targetGroupArns: [],
    rules: [],
    certificates: 0,
  });
  const tg = (health: string[]): LbTargetGroup => ({
    arn: `tg-${health.join("")}`,
    name: "web-tg",
    protocol: "HTTP",
    port: 80,
    targetType: "instance",
    healthCheck: "HTTP /",
    targets: health.map((h, i) => ({ id: `i-${i}`, health: h })),
  });

  it("flags plain HTTP on internet-facing ALBs but not redirects", () => {
    expect(ids(vpc({ loadBalancers: [lb({ listeners: [listener("HTTP", "forward")] })] }))).toContain("lb-http-arn:lb/app/web/1");
    expect(ids(vpc({ loadBalancers: [lb({ listeners: [listener("HTTP", "redirect")] })] }))).not.toContain("lb-http-arn:lb/app/web/1");
    expect(ids(vpc({ loadBalancers: [lb({ scheme: "internal", listeners: [listener("HTTP", "forward")] })] }))).toEqual(
      expect.not.arrayContaining(["lb-http-arn:lb/app/web/1"]),
    );
  });

  it("grades target health", () => {
    const sev = (health: string[]) => reviewVpc(vpc({ loadBalancers: [lb({ targetGroups: [tg(health)] })] }))[0]?.severity;
    expect(sev(["unhealthy", "unhealthy"])).toBe("high");
    expect(sev(["healthy", "unhealthy"])).toBe("medium");
    expect(sev([])).toBe("low");
    expect(ids(vpc({ loadBalancers: [lb({ targetGroups: [tg(["healthy"])] })] })).filter((i) => i.startsWith("tg-"))).toEqual([]);
  });

  it("flags public, unencrypted, single-AZ databases and short ECS services", () => {
    const db = (facts: VpcService["facts"]): VpcService => ({
      kind: "database",
      id: "db1",
      name: "db1",
      state: "available",
      subnetIds: [],
      securityGroupIds: [],
      attributes: [],
      consoleUrl: "",
      facts,
    });
    const found = ids(vpc({ services: [db({ publiclyAccessible: true, encrypted: false, multiAz: false })] }));
    expect(found).toEqual(expect.arrayContaining(["db-public-db1", "db-unencrypted-db1", "db-single-az"]));
    expect(ids(vpc({ services: [db({ multiAz: false, clusterMember: true })] }))).not.toContain("db-single-az");
    const ecs = { ...db({ desired: 3, running: 1 }), kind: "container" as const, id: "c/s", name: "s" };
    expect(ids(vpc({ services: [ecs] }))).toContain("ecs-short-c/s");
  });
});

describe("score", () => {
  it("subtracts weighted penalties and grades", () => {
    const f = (severity: "high" | "medium" | "low" | "info") => ({ id: severity, severity, title: "", detail: "", resourceIds: [], view: "review" as const });
    expect(scoreOf([])).toBe(100);
    expect(scoreOf([f("high"), f("medium"), f("low"), f("info")])).toBe(75);
    expect(scoreOf(Array.from({ length: 10 }, (_, i) => ({ ...f("high"), id: `rule-${i}` })))).toBe(0);
    // Ten copies of one per-resource rule cost at most twice its weight.
    expect(scoreOf(Array.from({ length: 10 }, (_, i) => ({ ...f("high"), id: `db-public-db${i}` })))).toBe(70);
    expect(ruleOf("sg-open-sg-123")).toBe("sg-open");
    expect(ruleOf("no-flow-logs")).toBe("no-flow-logs");
    expect(gradeOf(95).label).toBe("Excellent");
    expect(gradeOf(30).tone).toBe("danger");
  });
});
