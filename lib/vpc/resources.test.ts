import { describe, expect, it } from "vitest";
import { buildResourceRows, rowsToCsv } from "@/lib/vpc/resources";
import type { VpcDetail, VpcEni } from "@/lib/vpc/types";

const eni = (o: Partial<VpcEni> & { id: string }): VpcEni => ({
  description: "",
  subnetId: "subnet-a",
  az: "us-east-1a",
  status: "in-use",
  privateIps: ["10.0.0.5"],
  securityGroupIds: [],
  requesterManaged: false,
  kind: "other",
  label: "x",
  group: o.id,
  ...o,
});

const base = {
  subnets: [{ id: "subnet-a", az: "us-east-1a" }],
  instances: [{ id: "i-1", name: "web", type: "t3.micro", state: "running", az: "us-east-1a", subnetId: "subnet-a", privateIp: "10.0.0.4", securityGroupIds: [] }],
  natGateways: [],
  endpoints: [],
  egressOnlyIgws: [],
  vpnGateways: [],
  tgwAttachments: [],
  peerings: [],
  internetGatewayId: "igw-1",
  loadBalancers: [],
  services: [],
  coverage: { loadBalancers: true, database: true, lambda: true, cache: true, container: true },
  enis: [
    eni({ id: "eni-1", kind: "instance", attachedInstanceId: "i-1", group: "i-1" }),
    eni({ id: "eni-2", kind: "load-balancer", label: "ALB web", group: "lb:web" }),
    eni({ id: "eni-3", kind: "load-balancer", label: "ALB web", group: "lb:web", subnetId: "subnet-b", az: "us-east-1b" }),
  ],
} as unknown as VpcDetail;

describe("buildResourceRows", () => {
  it("folds instance ENIs and collapses load balancer ENIs", () => {
    const rows = buildResourceRows(base);
    expect(rows.map((r) => r.kind).sort()).toEqual(["instance", "internet-gateway", "load-balancer"]);
    const lb = rows.find((r) => r.kind === "load-balancer")!;
    expect(lb.subnetIds).toEqual(["subnet-a", "subnet-b"]);
    expect(lb.detail).toContain("2 network interfaces");
  });

  it("replaces ENI guesses with real load balancers and services", () => {
    const real = {
      ...base,
      loadBalancers: [{ arn: "arn:aws:elasticloadbalancing:x:loadbalancer/app/web/1", name: "web", type: "application", scheme: "internal", state: "active", dnsName: "d", ipType: "ipv4", subnetIds: ["subnet-a"], azs: ["us-east-1a"], securityGroupIds: [], listeners: [], targetGroups: [] }],
      services: [{ kind: "database", id: "db1", name: "db1", state: "available", subnetIds: ["subnet-a"], securityGroupIds: [], attributes: [["Engine", "postgres 16"]], consoleUrl: "u", facts: {} }],
      enis: [...base.enis, eni({ id: "eni-9", kind: "database", label: "RDS / Aurora" })],
    } as unknown as VpcDetail;
    const rows = buildResourceRows(real);
    expect(rows.filter((r) => r.kind === "load-balancer")).toHaveLength(1);
    expect(rows.find((r) => r.kind === "load-balancer")?.inferred).toBeUndefined();
    expect(rows.filter((r) => r.kind === "database").map((r) => r.id)).toEqual(["db1"]);
    const noApi = { ...real, coverage: { ...real.coverage, database: false } } as VpcDetail;
    expect(buildResourceRows(noApi).filter((r) => r.kind === "database")).toHaveLength(2);
  });

  it("exports CSV with quoting", () => {
    const csv = rowsToCsv(buildResourceRows(base));
    expect(csv.split("\n")[0]).toBe("type,name,id,state,subnets,azs,ips,detail");
    expect(csv).toContain("EC2 instance,web,i-1,running");
  });
});
