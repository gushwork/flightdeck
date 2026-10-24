import { containsIp, ipToInt, parseCidr } from "@/lib/vpc/cidr";
import type { SubnetTier, VpcRoute } from "@/lib/vpc/types";

const DEFAULT_DESTINATIONS = ["0.0.0.0/0", "::/0"];

/** Tier from the effective route table: IGW default = public, other default = private, none = isolated. */
export function classifyTier(routes: VpcRoute[]): { tier: SubnetTier; egress?: string } {
  const defaults = routes.filter(
    (r) => DEFAULT_DESTINATIONS.includes(r.destination) && r.state !== "blackhole",
  );
  const igw = defaults.find((r) => r.target.startsWith("igw-"));
  if (igw) return { tier: "public", egress: igw.target };
  const first = defaults.find((r) => r.destination === "0.0.0.0/0") ?? defaults[0];
  if (first) return { tier: "private", egress: first.target };
  return { tier: "isolated" };
}

export type TargetKind =
  | "local"
  | "internet"
  | "nat"
  | "endpoint"
  | "peering"
  | "transit"
  | "vpn"
  | "appliance"
  | "egress-igw"
  | "unknown";

export interface TargetInfo {
  kind: TargetKind;
  label: string;
  tone: "success" | "accent" | "warn" | "danger" | "muted";
}

export function describeTarget(target: string): TargetInfo {
  if (target === "local") return { kind: "local", label: "Local (inside VPC)", tone: "muted" };
  if (target.startsWith("igw-")) return { kind: "internet", label: "Internet gateway", tone: "success" };
  if (target.startsWith("eigw-")) return { kind: "egress-igw", label: "Egress-only IGW", tone: "accent" };
  if (target.startsWith("nat-")) return { kind: "nat", label: "NAT gateway", tone: "accent" };
  if (target.startsWith("vpce-")) return { kind: "endpoint", label: "Gateway endpoint", tone: "accent" };
  if (target.startsWith("pcx-")) return { kind: "peering", label: "VPC peering", tone: "accent" };
  if (target.startsWith("tgw-")) return { kind: "transit", label: "Transit gateway", tone: "accent" };
  if (target.startsWith("vgw-")) return { kind: "vpn", label: "Virtual private gateway", tone: "accent" };
  if (target.startsWith("eni-") || target.startsWith("i-")) {
    return { kind: "appliance", label: "Instance / appliance", tone: "warn" };
  }
  return { kind: "unknown", label: target, tone: "muted" };
}

export interface RouteConsidered {
  route: VpcRoute;
  /** false for prefix lists and IPv6 routes — not evaluated against an IPv4 address. */
  evaluated: boolean;
  matches: boolean;
  prefix: number;
}

export interface RouteResolution {
  winner?: VpcRoute;
  considered: RouteConsidered[];
  linkLocal: boolean;
}

/** Longest-prefix match of an IPv4 address against a route table. */
export function resolveRoute(routes: VpcRoute[], ip: string): RouteResolution | null {
  const n = ipToInt(ip);
  if (n === null) return null;
  const linkLocal = n >= (169 * 256 + 254) * 65536 && n < (169 * 256 + 255) * 65536;
  const considered = routes
    .map((route): RouteConsidered => {
      const cidr = parseCidr(route.destination);
      if (!cidr) return { route, evaluated: false, matches: false, prefix: -1 };
      return { route, evaluated: true, matches: containsIp(cidr, n), prefix: cidr.prefix };
    })
    .sort((a, b) => b.prefix - a.prefix);
  // Link-local traffic (metadata, DNS, NTP) never reaches the route table.
  const winner = linkLocal ? undefined : considered.find((c) => c.matches)?.route;
  return { winner, considered, linkLocal };
}
