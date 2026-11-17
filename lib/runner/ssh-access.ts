/**
 * Pure rules for SSH (TCP 22) reachability through Azure network security groups.
 * Client-safe; the `az` calls live in `nsg.ts`.
 */
import { containsIp, ipToInt, parseCidr } from "@/lib/vpc/cidr";
import type { RunnerSshRule } from "./types";

/** The subset of `az network nsg show` output these rules read. */
export interface NsgRule {
  id: string;
  name: string;
  priority: number;
  direction: string;
  access: string;
  protocol: string;
  sourceAddressPrefix?: string | null;
  sourceAddressPrefixes?: string[] | null;
  destinationPortRange?: string | null;
  destinationPortRanges?: string[] | null;
}

export interface Nsg {
  id: string;
  name: string;
  resourceGroup: string;
  securityRules: NsgRule[];
  /** NICs and subnets the NSG is attached to. */
  networkInterfaces?: { id: string }[] | null;
  subnets?: { id: string }[] | null;
}

/** What Flightdeck writes to the managed rule. */
export interface SshRuleChange {
  access: "Allow" | "Deny";
  sources: string[];
}

/** Closed = deny the Internet tag. VNet sources (e.g. Azure Bastion) keep working via the default AllowVnetInBound. */
export const CLOSED: SshRuleChange = { access: "Deny", sources: ["Internet"] };

const SSH_PORT = 22;
const WILDCARDS = new Set(["*", "any", "internet", "0.0.0.0/0"]);

export const isWildcard = (prefix: string) => WILDCARDS.has(prefix.trim().toLowerCase());

export function sourcesOf(rule: NsgRule): string[] {
  return [rule.sourceAddressPrefix, ...(rule.sourceAddressPrefixes ?? [])].filter((p): p is string => Boolean(p));
}

function portsOf(rule: NsgRule): string[] {
  return [rule.destinationPortRange, ...(rule.destinationPortRanges ?? [])].filter((p): p is string => Boolean(p));
}

function portInSpec(spec: string, port: number): boolean {
  if (spec === "*") return true;
  const [lo, hi = lo] = spec.split("-").map(Number);
  return port >= lo && port <= hi;
}

/** Inbound rule that applies to TCP 22. */
export function coversSsh(rule: NsgRule): boolean {
  if (rule.direction !== "Inbound") return false;
  if (!["tcp", "*"].includes(rule.protocol.toLowerCase())) return false;
  return portsOf(rule).some((spec) => portInSpec(spec, SSH_PORT));
}

/** True when `prefix` (a wildcard, CIDR or bare IPv4) covers `ip`. Other service tags never match. */
export function sourceMatchesIp(prefix: string, ip: string): boolean {
  if (isWildcard(prefix)) return true;
  const n = ipToInt(ip);
  const cidr = parseCidr(prefix.includes("/") ? prefix : `${prefix}/32`);
  return n !== null && cidr !== null && containsIp(cidr, n);
}

const byPriority = (a: NsgRule, b: NsgRule) => a.priority - b.priority;

/**
 * Inbound traffic must pass every NSG on its path (subnet, then NIC). In each, the first SSH rule by
 * priority whose source matches decides; no match falls through to Azure's DenyAllInBound.
 */
function decide(nsgs: Nsg[], matches: (prefix: string) => boolean): { allowed: boolean; blockedBy: string | null } {
  for (const nsg of nsgs) {
    const rule = nsg.securityRules.filter(coversSsh).sort(byPriority).find((r) => sourcesOf(r).some(matches));
    if (!rule) return { allowed: false, blockedBy: `${nsg.name} (default deny)` };
    if (rule.access !== "Allow") return { allowed: false, blockedBy: `${nsg.name} / ${rule.name}` };
  }
  return { allowed: nsgs.length > 0, blockedBy: null };
}

/** Any internet address can reach port 22 (only wildcard sources count, so specific allowlists don't). */
export const openToInternet = (nsgs: Nsg[]) => decide(nsgs, isWildcard).allowed;

export const ipDecision = (nsgs: Nsg[], ip: string) => decide(nsgs, (p) => sourceMatchesIp(p, ip));

/** The rule Flightdeck edits: the highest-precedence inbound rule dedicated to TCP 22. */
export function managedRule(nsg: Nsg): NsgRule | undefined {
  return nsg.securityRules
    .filter((r) => coversSsh(r) && portsOf(r).every((spec) => spec === String(SSH_PORT)))
    .sort(byPriority)[0];
}

/** Specific addresses the managed rule lets in (empty when it denies or only has wildcards). */
export function allowedSources(rule: NsgRule | undefined): string[] {
  return rule?.access === "Allow" ? sourcesOf(rule).filter((p) => !isWildcard(p)) : [];
}

/** Add one address; drops any wildcard, so an open rule becomes allowlist-only. */
export function withSource(rule: NsgRule | undefined, prefix: string): SshRuleChange {
  return { access: "Allow", sources: [...new Set([...allowedSources(rule), prefix])] };
}

/** Remove one address; removing the last one closes the rule. */
export function withoutSource(rule: NsgRule | undefined, prefix: string): SshRuleChange {
  const rest = allowedSources(rule).filter((p) => p !== prefix);
  return rest.length > 0 ? { access: "Allow", sources: rest } : CLOSED;
}

export function isNoop(rule: NsgRule | undefined, change: SshRuleChange): boolean {
  if (!rule || rule.access !== change.access) return false;
  const current = sourcesOf(rule);
  return current.length === change.sources.length && change.sources.every((p) => current.includes(p));
}

/** Priority for a new rule: 300 (the portal's SSH default) or the next free slot after it. */
export function freePriority(nsg: Nsg): number {
  const used = new Set(nsg.securityRules.filter((r) => r.direction === "Inbound").map((r) => r.priority));
  for (let p = 300; p <= 4096; p += 10) if (!used.has(p)) return p;
  throw new Error(`No free inbound priority on ${nsg.name}`);
}

export function ruleView(nsg: Nsg, rule: NsgRule): RunnerSshRule {
  return {
    nsg: nsg.name,
    resourceGroup: nsg.resourceGroup,
    name: rule.name,
    priority: rule.priority,
    access: rule.access,
    sources: sourcesOf(rule),
  };
}
