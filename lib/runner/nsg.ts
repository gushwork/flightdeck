import { lookup } from "dns/promises";
import { ipToInt } from "@/lib/vpc/cidr";
import { connectionTarget, loadConfig } from "./config";
import { run } from "./exec";
import {
  CLOSED,
  allowedSources,
  freePriority,
  ipDecision,
  isNoop,
  managedRule,
  openToInternet,
  ruleView,
  withSource,
  withoutSource,
  type Nsg,
  type SshRuleChange,
} from "./ssh-access";
import type { RunnerSshAccess, RunnerSshAction } from "./types";

const AZ_TIMEOUT_MS = 120_000;
const MY_IP_TTL_MS = 60_000;
const RULE_DESCRIPTION = "Runner SSH allowlist, managed by Flightdeck";
const IP_ECHO_URLS = ["https://checkip.amazonaws.com", "https://api.ipify.org"];

/** Next step for the common `az` failures, so a DNS blip doesn't read like a permissions problem. */
export function azHint(detail: string): string {
  if (/Failed to resolve|nodename nor servname|Name or service not known|getaddrinfo|ENOTFOUND|Max retries exceeded|Connection (refused|reset|aborted)|timed out/i.test(detail)) {
    return "Could not reach Azure. Check your internet connection, VPN or DNS, then Recheck.";
  }
  if (/az login|AADSTS|refresh token|InteractionRequired|token.*expired/i.test(detail)) {
    return "Your Azure session expired. Run `az login`, then Recheck.";
  }
  if (/AuthorizationFailed|does not have authorization|\bForbidden\b/i.test(detail)) {
    return "Your az login user is not allowed to do this. The SSH panel needs Network Contributor on the VM's network security group; creating or killing VMs needs Contributor on the resource group.";
  }
  return "";
}

export async function az<T>(args: string[], timeout = AZ_TIMEOUT_MS): Promise<T> {
  try {
    // A `--query` that resolves to null prints nothing at all.
    const out = (await run("az", [...args, "--only-show-errors", "-o", "json"], timeout)).trim();
    return (out ? JSON.parse(out) : null) as T;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const hint = azHint(detail);
    throw new Error(`az ${args.slice(0, 3).join(" ")} failed: ${detail}${hint ? ` ${hint}` : ""}`);
  }
}

export interface Target {
  host: string;
  /** Subnet of the VM's primary IP configuration (new runner VMs join it). */
  subnetId: string | null;
  /** Every NSG on the path, subnet first then NIC. */
  nsgIds: string[];
  /** Where the managed rule lives: the NIC's NSG, else the subnet's. */
  managedNsgId: string;
  /** The NIC's own NSG; new runner VMs attach this one so one allowlist covers them all. */
  nicNsgId: string | null;
  vm: { name: string; resourceGroup: string } | null;
}

let target: Target | null = null;

/** Forget discovered resource IDs (after the configured VM is deleted, for example). */
export function forgetTarget(): void {
  target = null;
}

/** Host → public IP resource → NIC → NSGs. Resource IDs don't change, so this runs once per host. */
export async function discover(host: string): Promise<Target> {
  if (target?.host === host) return target;
  const ip = ipToInt(host) !== null ? host : (await lookup(host, { family: 4 })).address;
  // `ip` is dotted IPv4 here, so it is safe inside the JMESPath literal.
  const ipConfigId = await az<string | null>([
    "network", "public-ip", "list", "--query", `[?ipAddress=='${ip}'] | [0].ipConfiguration.id`,
  ]);
  if (!ipConfigId || !/\/networkInterfaces\//i.test(ipConfigId)) {
    throw new Error(
      `No public IP ${ip} attached to a VM network interface in the current az subscription (\`az account show\`).`,
    );
  }
  const nic = await az<{
    networkSecurityGroup?: { id: string } | null;
    ipConfigurations: { id: string; subnet?: { id: string } | null }[];
    virtualMachine?: { id: string } | null;
  }>(["network", "nic", "show", "--ids", ipConfigId.replace(/\/ipConfigurations\/[^/]+$/i, "")]);
  const ipConfig = nic.ipConfigurations.find((c) => c.id.toLowerCase() === ipConfigId.toLowerCase());
  const subnetNsg = ipConfig?.subnet
    ? await az<string | null>(["network", "vnet", "subnet", "show", "--ids", ipConfig.subnet.id, "--query", "networkSecurityGroup.id"])
    : null;
  const nicNsg = nic.networkSecurityGroup?.id ?? null;
  const nsgIds = [subnetNsg, nicNsg].filter((id): id is string => Boolean(id));
  if (nsgIds.length === 0) {
    throw new Error("The VM has no network security group on its NIC or subnet, so Flightdeck cannot manage SSH access.");
  }
  const vmMatch = nic.virtualMachine?.id.match(/\/resourceGroups\/([^/]+)\/.*\/virtualMachines\/([^/]+)$/i);
  target = {
    host,
    subnetId: ipConfig?.subnet?.id ?? null,
    nsgIds,
    managedNsgId: nicNsg ?? nsgIds[0],
    nicNsgId: nicNsg,
    vm: vmMatch ? { resourceGroup: vmMatch[1], name: vmMatch[2] } : null,
  };
  return target;
}

let myIpCache: { at: number; ip: string } | null = null;

/** Flightdeck runs on your machine, so its public egress IPv4 is yours. */
async function myPublicIp(): Promise<string> {
  if (myIpCache && Date.now() - myIpCache.at < MY_IP_TTL_MS) return myIpCache.ip;
  for (const url of IP_ECHO_URLS) {
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
      const ip = (await res.text()).trim();
      if (res.ok && ipToInt(ip) !== null) {
        myIpCache = { at: Date.now(), ip };
        return ip;
      }
    } catch {
      // try the next echo service
    }
  }
  throw new Error("Could not look up your public IP (checkip.amazonaws.com and api.ipify.org both failed).");
}

async function readNsgs(t: Target): Promise<Nsg[]> {
  try {
    return await Promise.all(t.nsgIds.map((id) => az<Nsg>(["network", "nsg", "show", "--ids", id])));
  } catch (err) {
    target = null; // rediscover next time in case the NIC or NSG was swapped
    throw err;
  }
}

type VmRef = { name: string; resourceGroup: string };

function sshCommand(vm: VmRef): string {
  return `az ssh vm --resource-group ${vm.resourceGroup} --name ${vm.name}`;
}

/** NIC → VM never changes, so each NIC is looked up once. */
const vmOfNic = new Map<string, VmRef | null>();

async function vmBehindNic(nicId: string): Promise<VmRef | null> {
  const key = nicId.toLowerCase();
  if (!vmOfNic.has(key)) {
    const vmId = await az<string | null>(["network", "nic", "show", "--ids", nicId, "--query", "virtualMachine.id"]).catch(() => null);
    const m = vmId?.match(/\/resourceGroups\/([^/]+)\/.*\/virtualMachines\/([^/]+)$/i);
    vmOfNic.set(key, m ? { resourceGroup: m[1], name: m[2] } : null);
  }
  return vmOfNic.get(key) ?? null;
}

/** The configured VM first, then every other VM whose NIC uses the same NSG. */
async function coveredVms(t: Target, nsg: Nsg): Promise<{ vm: string; command: string }[]> {
  const others = await Promise.all((nsg.networkInterfaces ?? []).map((n) => vmBehindNic(n.id)));
  const seen = new Set<string>();
  const out: { vm: string; command: string }[] = [];
  const add = (vm: VmRef) => {
    if (seen.has(vm.name.toLowerCase())) return;
    seen.add(vm.name.toLowerCase());
    out.push({ vm: vm.name, command: sshCommand(vm) });
  };
  if (t.vm) add(t.vm);
  else out.push({ vm: t.host, command: `az ssh vm --ip ${t.host}` });
  for (const vm of others) if (vm) add(vm);
  return out.slice(0, 1).concat(out.slice(1).sort((a, b) => a.vm.localeCompare(b.vm)));
}

async function load(): Promise<{ t: Target; nsgs: Nsg[]; managed: Nsg; access: RunnerSshAccess }> {
  const { host, user } = connectionTarget(loadConfig());
  const t = await discover(host);
  const [nsgs, me] = await Promise.all([
    readNsgs(t),
    myPublicIp().then(
      (ip) => ({ ip, error: undefined }),
      (err: unknown) => ({ ip: null, error: err instanceof Error ? err.message : String(err) }),
    ),
  ]);
  const managed = nsgs.find((n) => n.id.toLowerCase() === t.managedNsgId.toLowerCase()) ?? nsgs[0];
  const rule = managedRule(managed);
  const connect = await coveredVms(t, managed);
  const mine = me.ip ? ipDecision(nsgs, me.ip) : { allowed: false, blockedBy: null };
  const access: RunnerSshAccess = {
    checkedAt: new Date().toISOString(),
    host,
    vm: t.vm,
    openToInternet: openToInternet(nsgs),
    myIp: me.ip,
    ...(me.error && { myIpError: me.error }),
    myIpAllowed: mine.allowed,
    blockedBy: mine.blockedBy,
    rule: rule ? ruleView(managed, rule) : null,
    allowed: allowedSources(rule),
    connect,
    subnets: (managed.subnets ?? []).map((s) => s.id.split("/").at(-1) ?? s.id),
    runnerUser: user,
  };
  return { t, nsgs, managed, access };
}

export async function getSshAccess(): Promise<RunnerSshAccess> {
  return (await load()).access;
}

async function writeRule(nsg: Nsg, change: SshRuleChange): Promise<void> {
  const rule = managedRule(nsg);
  if (isNoop(rule, change)) return;
  const common = ["--access", change.access, "--source-address-prefixes", ...change.sources, "--description", RULE_DESCRIPTION];
  if (rule) {
    await az(["network", "nsg", "rule", "update", "--ids", rule.id, ...common]);
    return;
  }
  const name = nsg.securityRules.some((r) => r.name.toLowerCase() === "ssh") ? "Flightdeck-SSH" : "SSH";
  await az([
    "network", "nsg", "rule", "create",
    "--resource-group", nsg.resourceGroup,
    "--nsg-name", nsg.name,
    "--name", name,
    "--priority", String(freePriority(nsg)),
    "--direction", "Inbound",
    "--protocol", "Tcp",
    "--source-port-ranges", "*",
    "--destination-address-prefixes", "*",
    "--destination-port-ranges", "22",
    ...common,
  ]);
}

/** Applies one allowlist change to the managed NSG rule and returns the fresh state. */
export async function changeSshAccess(input: RunnerSshAction): Promise<RunnerSshAccess> {
  const { managed, access } = await load();
  const rule = managedRule(managed);
  let change: SshRuleChange;
  if (input.action === "allow-my-ip") {
    if (!access.myIp) throw new Error(access.myIpError ?? "Could not look up your public IP.");
    change = withSource(rule, `${access.myIp}/32`);
  } else if (input.action === "remove") {
    if (!access.allowed.includes(input.source)) throw new Error(`${input.source} is not on the SSH allowlist.`);
    change = withoutSource(rule, input.source);
  } else {
    change = CLOSED;
  }
  await writeRule(managed, change);
  return getSshAccess();
}
