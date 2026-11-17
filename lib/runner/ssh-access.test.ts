import { describe, expect, it } from "vitest";
import {
  CLOSED,
  allowedSources,
  coversSsh,
  freePriority,
  ipDecision,
  isNoop,
  managedRule,
  openToInternet,
  sourceMatchesIp,
  withSource,
  withoutSource,
  type Nsg,
  type NsgRule,
} from "./ssh-access";

function rule(over: Partial<NsgRule> & Pick<NsgRule, "name" | "priority">): NsgRule {
  return {
    id: `/rules/${over.name}`,
    direction: "Inbound",
    access: "Allow",
    protocol: "Tcp",
    destinationPortRange: "22",
    sourceAddressPrefix: "*",
    ...over,
  };
}

const nsg = (name: string, rules: NsgRule[]): Nsg => ({ id: `/nsgs/${name}`, name, resourceGroup: "rg", securityRules: rules });

// The state the audit found: portal-default SSH rule open to any source.
const portalDefault = nsg("vm-nsg", [rule({ name: "SSH", priority: 300 })]);

describe("coversSsh", () => {
  it("matches port 22, ranges and wildcards over TCP or any protocol", () => {
    expect(coversSsh(rule({ name: "a", priority: 1 }))).toBe(true);
    expect(coversSsh(rule({ name: "b", priority: 1, destinationPortRange: "20-25" }))).toBe(true);
    expect(coversSsh(rule({ name: "c", priority: 1, destinationPortRange: "*", protocol: "*" }))).toBe(true);
    expect(coversSsh(rule({ name: "d", priority: 1, destinationPortRange: null, destinationPortRanges: ["80", "22"] }))).toBe(true);
  });

  it("ignores other ports, UDP and outbound rules", () => {
    expect(coversSsh(rule({ name: "a", priority: 1, destinationPortRange: "2222" }))).toBe(false);
    expect(coversSsh(rule({ name: "b", priority: 1, protocol: "Udp" }))).toBe(false);
    expect(coversSsh(rule({ name: "c", priority: 1, direction: "Outbound" }))).toBe(false);
  });
});

describe("sourceMatchesIp", () => {
  it("handles wildcards, CIDRs and bare IPs", () => {
    expect(sourceMatchesIp("*", "203.0.113.7")).toBe(true);
    expect(sourceMatchesIp("Internet", "203.0.113.7")).toBe(true);
    expect(sourceMatchesIp("203.0.113.0/24", "203.0.113.7")).toBe(true);
    expect(sourceMatchesIp("203.0.113.7", "203.0.113.7")).toBe(true);
    expect(sourceMatchesIp("198.51.100.1/32", "203.0.113.7")).toBe(false);
    expect(sourceMatchesIp("VirtualNetwork", "203.0.113.7")).toBe(false);
  });
});

describe("openToInternet / ipDecision", () => {
  it("flags the portal default as open", () => {
    expect(openToInternet([portalDefault])).toBe(true);
    expect(ipDecision([portalDefault], "203.0.113.7")).toEqual({ allowed: true, blockedBy: null });
  });

  it("an allowlist is not open, and only lets listed IPs in", () => {
    const g = nsg("vm-nsg", [rule({ name: "SSH", priority: 300, sourceAddressPrefix: "203.0.113.7/32" })]);
    expect(openToInternet([g])).toBe(false);
    expect(ipDecision([g], "203.0.113.7").allowed).toBe(true);
    expect(ipDecision([g], "198.51.100.1")).toEqual({ allowed: false, blockedBy: "vm-nsg (default deny)" });
  });

  it("the first matching rule by priority wins", () => {
    const g = nsg("vm-nsg", [
      rule({ name: "SSH", priority: 300, access: "Deny", sourceAddressPrefix: "Internet" }),
      rule({ name: "AllowAll", priority: 4000, destinationPortRange: "*" }),
    ]);
    expect(openToInternet([g])).toBe(false);
    expect(ipDecision([g], "203.0.113.7")).toEqual({ allowed: false, blockedBy: "vm-nsg / SSH" });
  });

  it("a lower-priority restriction does not close an earlier allow-all", () => {
    const g = nsg("vm-nsg", [
      rule({ name: "AllowAll", priority: 100, destinationPortRange: "*" }),
      rule({ name: "SSH", priority: 300, sourceAddressPrefix: "203.0.113.7/32" }),
    ]);
    expect(openToInternet([g])).toBe(true);
  });

  it("traffic must pass both subnet and NIC NSGs", () => {
    const subnet = nsg("subnet-nsg", []);
    expect(openToInternet([subnet, portalDefault])).toBe(false);
    expect(ipDecision([subnet, portalDefault], "203.0.113.7").blockedBy).toBe("subnet-nsg (default deny)");
  });
});

describe("managed rule changes", () => {
  it("picks the highest-precedence rule dedicated to port 22", () => {
    const g = nsg("vm-nsg", [
      rule({ name: "Wide", priority: 100, destinationPortRange: "*" }),
      rule({ name: "SSH-late", priority: 500 }),
      rule({ name: "SSH", priority: 300 }),
    ]);
    expect(managedRule(g)?.name).toBe("SSH");
    expect(managedRule(nsg("empty", []))).toBeUndefined();
  });

  it("allowing my IP on an open rule drops the wildcard", () => {
    const r = managedRule(portalDefault);
    expect(allowedSources(r)).toEqual([]);
    expect(withSource(r, "203.0.113.7/32")).toEqual({ access: "Allow", sources: ["203.0.113.7/32"] });
  });

  it("allowing adds to an existing allowlist without duplicates", () => {
    const r = rule({ name: "SSH", priority: 300, sourceAddressPrefix: null, sourceAddressPrefixes: ["198.51.100.1/32", "203.0.113.7/32"] });
    expect(withSource(r, "203.0.113.7/32").sources).toEqual(["198.51.100.1/32", "203.0.113.7/32"]);
    expect(isNoop(r, withSource(r, "203.0.113.7/32"))).toBe(true);
  });

  it("allowing on a closed rule starts a fresh allowlist", () => {
    const closed = rule({ name: "SSH", priority: 300, access: "Deny", sourceAddressPrefix: "Internet" });
    expect(withSource(closed, "203.0.113.7/32")).toEqual({ access: "Allow", sources: ["203.0.113.7/32"] });
    expect(isNoop(closed, CLOSED)).toBe(true);
  });

  it("removing the last address closes the rule", () => {
    const r = rule({ name: "SSH", priority: 300, sourceAddressPrefix: "203.0.113.7/32" });
    expect(withoutSource(r, "203.0.113.7/32")).toEqual(CLOSED);
    const two = rule({ name: "SSH", priority: 300, sourceAddressPrefix: null, sourceAddressPrefixes: ["a/32", "b/32"] });
    expect(withoutSource(two, "a/32")).toEqual({ access: "Allow", sources: ["b/32"] });
  });

  it("finds a free priority for a new rule", () => {
    expect(freePriority(nsg("e", []))).toBe(300);
    expect(freePriority(nsg("e", [rule({ name: "x", priority: 300 }), rule({ name: "y", priority: 310 })]))).toBe(320);
  });
});
