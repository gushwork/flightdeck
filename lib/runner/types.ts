/** Client-safe DTOs for the self-hosted GitHub Actions runner on the Azure VM. */

export type RunnerState = "busy" | "idle" | "offline";

export type RunnerJobResult =
  | "running"
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  | "unknown";

export interface RunnerJob {
  /** Runner plan id — unique per job execution. */
  id: string;
  name: string | null;
  repo: string | null;
  workflow: string | null;
  runId: string | null;
  runNumber: string | null;
  runAttempt: string | null;
  event: string | null;
  ref: string | null;
  sha: string | null;
  actor: string | null;
  result: RunnerJobResult;
  /** ISO-8601 UTC */
  startedAt: string | null;
  /** ISO-8601 UTC; null while running */
  completedAt: string | null;
  durationSec: number | null;
  /** Runner (and VM) the job ran on. */
  runner: string | null;
}

export interface RunnerHistoryStats {
  total: number;
  success: number;
  failure: number;
  last24h: number;
  avgDurationSec: number | null;
  /** Oldest job still present in the runner's _diag logs. */
  oldestAt: string | null;
}

export interface RunnerSnapshot {
  collectedAt: string;
  state: RunnerState;
  runnerName: string | null;
  runnerUrl: string | null;
  runnerVersion: string | null;
  hostname: string | null;
  /** How the listener is supervised (pm2 app), if any. */
  supervisor: { name: string | null; status: string | null; restarts: number | null } | null;
  listenerUptimeSec: number | null;
  vm: {
    uptimeSec: number | null;
    load: number[];
    memTotal: number | null;
    memAvailable: number | null;
    diskTotal: number | null;
    diskFree: number | null;
  };
  currentJob: RunnerJob | null;
  jobs: RunnerJob[];
  stats: RunnerHistoryStats;
}

export type RunnerHostSource = "settings" | "env" | null;
export type RunnerUserSource = "settings" | "env" | "default";

/** An NSG rule as the runner page shows it. */
export interface RunnerSshRule {
  nsg: string;
  resourceGroup: string;
  name: string;
  priority: number;
  access: string;
  sources: string[];
}

/** Who can reach the runner VM's SSH port, from its network security group(s). */
export interface RunnerSshAccess {
  checkedAt: string;
  host: string;
  vm: { name: string; resourceGroup: string } | null;
  /** Any internet address can reach port 22. */
  openToInternet: boolean;
  /** Public IPv4 of the machine running Flightdeck; null when the lookup failed (see `myIpError`). */
  myIp: string | null;
  myIpError?: string;
  myIpAllowed: boolean;
  /** NSG / rule that blocks your IP, when it is blocked. */
  blockedBy: string | null;
  /** The port-22 rule Flightdeck edits; null when the NSG has none yet (one is created on first allow). */
  rule: RunnerSshRule | null;
  /** Specific addresses on that rule that may connect. */
  allowed: string[];
  /**
   * VMs the managed rule covers (the configured VM first, then every other VM whose NIC shares the NSG),
   * each with the command to open a shell yourself. Flightdeck never runs it.
   */
  connect: { vm: string; command: string }[];
  /** Subnets that NSG is attached to: it also covers every VM in them. */
  subnets: string[];
  /** Account the runner runs under (for `sudo -iu` after you log in). */
  runnerUser: string;
}

export type RunnerSshAction = { action: "allow-my-ip" } | { action: "remove"; source: string } | { action: "close" };

/** A self-hosted runner registration on GitHub. */
export interface GhRunnerInfo {
  id: number;
  name: string;
  status: "online" | "offline";
  busy: boolean;
  /** Labels you set (GitHub's automatic self-hosted/OS/arch labels left out). */
  labels: string[];
}

/** An Azure VM in the runner resource group, joined to its GitHub runner by name. */
export interface RunnerVm {
  id: string;
  name: string;
  location: string;
  zone: string | null;
  size: string;
  /** e.g. "VM running", "VM deallocated"; null when Azure did not report it. */
  powerState: string | null;
  publicIp: string | null;
  createdAt: string | null;
  createdByFlightdeck: boolean;
  /** The VM the rest of this page reads (Settings → Runner VM host). */
  isConfigured: boolean;
  runner: GhRunnerInfo | null;
}

export type RunnerOperationKind = "create" | "kill";

/** A create or kill running in the background on the Flightdeck server. */
export interface RunnerOperation {
  id: string;
  kind: RunnerOperationKind;
  vm: string;
  status: "running" | "succeeded" | "failed";
  startedAt: string;
  finishedAt: string | null;
  steps: { at: string; text: string }[];
  error: string | null;
}

export interface RunnerFleet {
  resourceGroup: string;
  /** GitHub API scope runners register to (enterprises/x, orgs/x or repos/o/r); null when unknown. */
  scope: string | null;
  /** Why GitHub runner data is missing (no scope, API error). */
  githubError: string | null;
  /** New VMs copy this one. */
  template: {
    name: string;
    size: string;
    location: string;
    zone: string | null;
    image: string;
    diskGb: number | null;
    /** NSG new VMs share with the template (one SSH allowlist for all); null = the subnet's NSG governs. */
    sshNsg: string | null;
  };
  vms: RunnerVm[];
  /** GitHub registrations with no matching VM. */
  orphans: GhRunnerInfo[];
  defaults: CreateRunnerVmInput;
  operations: RunnerOperation[];
}

export interface CreateRunnerVmInput {
  name: string;
  size: string;
  labels: string[];
}

export type RunnerFleetAction =
  | { action: "create"; input: CreateRunnerVmInput }
  | { action: "kill"; vm: string; confirm: string }
  | { action: "remove-registration"; runnerId: number };

/** Settings-page view of the runner VM connection. */
export interface RunnerConfigView {
  /** Overrides saved from Settings; empty string when none. */
  saved: { host: string; user: string; scope: string };
  effective: {
    host: string | null;
    hostSource: RunnerHostSource;
    user: string;
    userSource: RunnerUserSource;
    scope: string | null;
  };
}
