import { describe, expect, it } from "vitest";
import { classifyEni } from "@/lib/vpc/eni";

describe("classifyEni", () => {
  it("recognises owners from type and description", () => {
    expect(classifyEni({ id: "eni-1", attachedInstanceId: "i-1" }).kind).toBe("instance");
    expect(classifyEni({ id: "eni-2", interfaceType: "nat_gateway" }).kind).toBe("nat-gateway");
    expect(classifyEni({ id: "eni-3", description: "VPC Endpoint Interface vpce-1" }).kind).toBe("endpoint");
    expect(classifyEni({ id: "eni-4", description: "RDSNetworkInterface" }).kind).toBe("database");
  });

  it("groups load balancer ENIs under one name", () => {
    const a = classifyEni({ id: "eni-5", description: "ELB app/web/abc123" });
    const b = classifyEni({ id: "eni-6", description: "ELB app/web/abc123" });
    expect(a).toMatchObject({ kind: "load-balancer", label: "ALB web" });
    expect(a.group).toBe(b.group);
  });

  it("names lambda functions and flags unattached ENIs", () => {
    const l = classifyEni({ id: "eni-7", description: "AWS Lambda VPC ENI-my-fn-12345678-1234-1234-1234-123456789abc" });
    expect(l).toMatchObject({ kind: "lambda", label: "Lambda my-fn" });
    expect(classifyEni({ id: "eni-8", status: "available" }).kind).toBe("network-interface");
  });
});
