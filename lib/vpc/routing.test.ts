import { describe, expect, it } from "vitest";
import { classifyTier, describeTarget, resolveRoute } from "@/lib/vpc/routing";
import type { VpcRoute } from "@/lib/vpc/types";

const r = (destination: string, target: string, state = "active"): VpcRoute => ({ destination, target, state, origin: "" });

describe("classifyTier", () => {
  it("public when default goes to an IGW", () => {
    expect(classifyTier([r("10.0.0.0/16", "local"), r("0.0.0.0/0", "igw-1")])).toEqual({ tier: "public", egress: "igw-1" });
  });
  it("private when default goes to NAT", () => {
    expect(classifyTier([r("10.0.0.0/16", "local"), r("0.0.0.0/0", "nat-1")])).toEqual({ tier: "private", egress: "nat-1" });
  });
  it("isolated without a default route, and ignores blackholes", () => {
    expect(classifyTier([r("10.0.0.0/16", "local")]).tier).toBe("isolated");
    expect(classifyTier([r("0.0.0.0/0", "igw-gone", "blackhole")]).tier).toBe("isolated");
  });
});

describe("resolveRoute", () => {
  const routes = [r("10.0.0.0/16", "local"), r("0.0.0.0/0", "nat-1"), r("10.0.5.0/24", "pcx-1"), r("pl-1234", "vpce-1")];

  it("longest prefix wins", () => {
    expect(resolveRoute(routes, "10.0.5.7")?.winner?.target).toBe("pcx-1");
    expect(resolveRoute(routes, "10.0.9.9")?.winner?.target).toBe("local");
    expect(resolveRoute(routes, "8.8.8.8")?.winner?.target).toBe("nat-1");
  });
  it("drops when nothing matches and flags link-local", () => {
    expect(resolveRoute([r("10.0.0.0/16", "local")], "8.8.8.8")?.winner).toBeUndefined();
    expect(resolveRoute(routes, "169.254.169.254")).toMatchObject({ linkLocal: true, winner: undefined });
  });
  it("does not evaluate prefix lists and rejects bad input", () => {
    expect(resolveRoute(routes, "8.8.8.8")?.considered.find((c) => c.route.destination === "pl-1234")?.evaluated).toBe(false);
    expect(resolveRoute(routes, "nope")).toBeNull();
  });
});

describe("describeTarget", () => {
  it("classifies targets", () => {
    expect(describeTarget("nat-1").kind).toBe("nat");
    expect(describeTarget("local").kind).toBe("local");
    expect(describeTarget("tgw-1").kind).toBe("transit");
  });
});
