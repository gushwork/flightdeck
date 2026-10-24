import type { ResourceKind } from "@/lib/vpc/types";

export interface EniInput {
  id: string;
  description?: string;
  interfaceType?: string;
  attachedInstanceId?: string;
  status?: string;
}

export interface EniClass {
  kind: ResourceKind;
  label: string;
  group: string;
}

const lambdaName = (d: string) =>
  d.replace(/^AWS Lambda VPC ENI-/, "").replace(/-[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/, "");

/** Works out which AWS service owns a network interface from its type and description. */
export function classifyEni(e: EniInput): EniClass {
  const desc = e.description ?? "";
  const type = e.interfaceType ?? "interface";

  if (e.attachedInstanceId) {
    return { kind: "instance", label: "EC2 instance", group: e.attachedInstanceId };
  }
  if (type === "nat_gateway" || desc.startsWith("Interface for NAT Gateway")) {
    return { kind: "nat-gateway", label: "NAT gateway", group: e.id };
  }
  if (type === "vpc_endpoint" || desc.startsWith("VPC Endpoint Interface")) {
    return { kind: "endpoint", label: "VPC endpoint", group: e.id };
  }
  const elb = /^ELB (app|net|gwy)\/([^/]+)\//.exec(desc);
  if (elb) {
    const label = { app: "ALB", net: "NLB", gwy: "GWLB" }[elb[1] as "app" | "net" | "gwy"];
    return { kind: "load-balancer", label: `${label} ${elb[2]}`, group: `lb:${elb[2]}` };
  }
  if (desc.startsWith("ELB ")) {
    const name = desc.slice(4);
    return { kind: "load-balancer", label: `CLB ${name}`, group: `lb:${name}` };
  }
  if (type === "network_load_balancer" || type === "gateway_load_balancer") {
    return { kind: "load-balancer", label: type === "network_load_balancer" ? "NLB" : "GWLB", group: e.id };
  }
  if (desc.includes("RDSNetworkInterface")) {
    return { kind: "database", label: "RDS / Aurora", group: e.id };
  }
  if (type === "lambda" || desc.startsWith("AWS Lambda VPC ENI")) {
    const name = lambdaName(desc);
    return { kind: "lambda", label: name ? `Lambda ${name}` : "Lambda", group: `lambda:${name || e.id}` };
  }
  if (/elasticache/i.test(desc)) return { kind: "cache", label: "ElastiCache", group: e.id };
  if (/amazon eks|aws-k8s|eks cluster/i.test(desc)) {
    return { kind: "container", label: "EKS", group: e.id };
  }
  if (desc.startsWith("arn:aws:ecs")) return { kind: "container", label: "ECS task", group: e.id };
  if (type === "transit_gateway") return { kind: "other", label: "Transit gateway", group: e.id };
  if (desc.startsWith("EFS mount target")) return { kind: "other", label: "EFS mount target", group: e.id };
  if (e.status === "available") {
    return { kind: "network-interface", label: "Unattached ENI", group: e.id };
  }
  return { kind: "other", label: desc || "Network interface", group: e.id };
}
