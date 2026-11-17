import { randomUUID } from "crypto";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { githubFetch, invalidateMemo, memoize } from "@/lib/github/client";
import { connectionTarget, loadConfig } from "./config";
import { run } from "./exec";
import {
  bootstrapScript,
  createInputErrors,
  nextRunnerName,
  orphanRunners,
  parseRunnerRelease,
  registrationUrl,
  scopeFromRunnerUrl,
} from "./fleet-plan";
import { az, discover, forgetTarget, type Target } from "./nsg";
import { clearRunnerCache, knownRunnerUrl } from "./ssh";
import type {
  CreateRunnerVmInput,
  GhRunnerInfo,
  RunnerFleet,
  RunnerOperation,
  RunnerOperationKind,
  RunnerVm,
} from "./types";

const VM_TIMEOUT_MS = 20 * 60_000;
const ONLINE_TIMEOUT_MS = 20 * 60_000;
const ONLINE_POLL_MS = 15_000;
const FLEET_TTL_MS = 5_000;
const TEMPLATE_TTL_MS = 5 * 60_000;
const MAX_OPERATIONS = 20;
const TAGS = ["managed-by=flightdeck", "role=github-runner"];

interface AzVm {
  id: string;
  name: string;
  location: string;
  zones?: string[] | null;
  timeCreated?: string | null;
  tags?: Record<string, string> | null;
  hardwareProfile: { vmSize: string };
  storageProfile: {
    imageReference?: { id?: string | null; publisher?: string; offer?: string; sku?: string } | null;
    osDisk: { diskSizeGB?: number | null; managedDisk?: { id?: string; storageAccountType?: string } | null };
    dataDisks?: { managedDisk?: { id?: string } | null }[] | null;
  };
  networkProfile: { networkInterfaces: { id: string }[] };
  securityProfile?: { securityType?: string; uefiSettings?: { secureBootEnabled?: boolean; vTpmEnabled?: boolean } | null } | null;
  osProfile?: { adminUsername?: string } | null;
  /** Only with `az vm list -d`. */
  powerState?: string | null;
  publicIps?: string | null;
}

interface AzNic {
  networkSecurityGroup?: { id: string } | null;
  ipConfigurations: { publicIPAddress?: { id: string } | null }[];
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const now = () => new Date().toISOString();

// ─── Operations (background create / kill) ────────────────────────────────────

// Kept on globalThis so a dev-server hot reload doesn't orphan a VM that is still being built.
const store = globalThis as typeof globalThis & { __flightdeckRunnerOps?: RunnerOperation[] };
const operations = (store.__flightdeckRunnerOps ??= []);

export function listOperations(): RunnerOperation[] {
  return operations.slice().reverse();
}

function startOperation(kind: RunnerOperationKind, vm: string, work: (log: (text: string) => void) => Promise<void>) {
  if (operations.some((o) => o.status === "running" && o.vm === vm)) {
    throw new Error(`${vm} already has a ${kind} in progress.`);
  }
  const op: RunnerOperation = { id: randomUUID(), kind, vm, status: "running", startedAt: now(), finishedAt: null, steps: [], error: null };
  operations.push(op);
  operations.splice(0, Math.max(0, operations.length - MAX_OPERATIONS));
  const log = (text: string) => op.steps.push({ at: now(), text });
  void work(log)
    .then(
      () => {
        op.status = "succeeded";
      },
      (err: unknown) => {
        op.status = "failed";
        op.error = message(err);
      },
    )
    .finally(() => {
      op.finishedAt = now();
      invalidateMemo("runner-fleet");
    });
  return op;
}

// ─── Reading the fleet ────────────────────────────────────────────────────────

/** Saved/env scope, else the scope the configured runner reported over SSH. */
function currentScope(): string | null {
  return loadConfig().scope ?? scopeFromRunnerUrl(knownRunnerUrl());
}

async function context(): Promise<{ t: Target; vm: { name: string; resourceGroup: string }; runnerUser: string }> {
  const cfg = loadConfig();
  const t = await discover(connectionTarget(cfg).host);
  if (!t.vm) throw new Error("The runner host's public IP is not attached to an Azure VM, so there is no VM to copy or list.");
  return { t, vm: t.vm, runnerUser: cfg.user };
}

function templateVm(vm: { name: string; resourceGroup: string }): Promise<AzVm> {
  return memoize(`runner-template:${vm.resourceGroup}/${vm.name}`, TEMPLATE_TTL_MS, () =>
    az<AzVm>(["vm", "show", "-g", vm.resourceGroup, "-n", vm.name]),
  );
}

async function githubRunners(scope: string): Promise<GhRunnerInfo[]> {
  const res = await githubFetch<{
    runners: { id: number; name: string; status: string; busy: boolean; labels: { name: string; type: string }[] }[];
  }>(`/${scope}/actions/runners?per_page=100`);
  return res.runners.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status === "online" ? "online" : "offline",
    busy: r.busy,
    labels: r.labels.filter((l) => l.type === "custom").map((l) => l.name),
  }));
}

function imageOf(vm: AzVm): string | null {
  const ref = vm.storageProfile.imageReference;
  if (ref?.id) return ref.id;
  return ref?.publisher && ref.offer && ref.sku ? `${ref.publisher}:${ref.offer}:${ref.sku}:latest` : null;
}

async function buildFleet(): Promise<Omit<RunnerFleet, "operations">> {
  const { t, vm } = await context();
  const scope = currentScope();
  const [template, vms, gh] = await Promise.all([
    templateVm(vm),
    az<AzVm[]>(["vm", "list", "-g", vm.resourceGroup, "-d"]),
    scope
      ? githubRunners(scope).then(
          (runners) => ({ runners, error: null }),
          (err: unknown) => ({ runners: [] as GhRunnerInfo[], error: message(err) }),
        )
      : Promise.resolve({
          runners: [] as GhRunnerInfo[],
          error: "GitHub scope unknown. Set it in Settings → Runner VM (for example enterprises/<slug>).",
        }),
  ]);
  const byName = new Map(gh.runners.map((r) => [r.name.toLowerCase(), r]));
  const rows: RunnerVm[] = vms
    .map((v) => ({
      id: v.id,
      name: v.name,
      location: v.location,
      zone: v.zones?.[0] ?? null,
      size: v.hardwareProfile.vmSize,
      powerState: v.powerState ?? null,
      publicIp: v.publicIps?.split(",")[0]?.trim() || null,
      createdAt: v.timeCreated ?? null,
      createdByFlightdeck: v.tags?.["managed-by"] === "flightdeck",
      isConfigured: v.name.toLowerCase() === vm.name.toLowerCase(),
      runner: byName.get(v.name.toLowerCase()) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const taken = [...rows.map((r) => r.name), ...gh.runners.map((r) => r.name)];
  return {
    resourceGroup: vm.resourceGroup,
    scope,
    githubError: gh.error,
    template: {
      name: template.name,
      size: template.hardwareProfile.vmSize,
      location: template.location,
      zone: template.zones?.[0] ?? null,
      image: imageOf(template) ?? "unknown image",
      diskGb: template.storageProfile.osDisk.diskSizeGB ?? null,
      sshNsg: t.nicNsgId?.split("/").at(-1) ?? null,
    },
    vms: rows,
    orphans: orphanRunners(rows, gh.runners),
    defaults: {
      name: nextRunnerName(template.name, taken),
      size: template.hardwareProfile.vmSize,
      labels: byName.get(template.name.toLowerCase())?.labels ?? [],
    },
  };
}

export async function getFleet(): Promise<RunnerFleet> {
  return { ...(await memoize("runner-fleet", FLEET_TTL_MS, buildFleet)), operations: listOperations() };
}

// ─── Create ───────────────────────────────────────────────────────────────────

async function deleteIfExists(id: string): Promise<boolean> {
  try {
    await az(["resource", "delete", "--ids", id], VM_TIMEOUT_MS);
    return true;
  } catch (err) {
    if (/ResourceNotFound|NotFound|could not be found|was not found/i.test(message(err))) return false;
    throw err;
  }
}

async function waitForRunner(scope: string, name: string): Promise<void> {
  const deadline = Date.now() + ONLINE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, ONLINE_POLL_MS));
    const runner = (await githubRunners(scope).catch(() => [])).find((r) => r.name.toLowerCase() === name);
    if (runner?.status === "online") return;
  }
  throw new Error(
    `${name} did not come online within ${ONLINE_TIMEOUT_MS / 60_000} minutes. The VM exists; allow your IP, SSH in and read /var/log/flightdeck-runner-bootstrap.log.`,
  );
}

interface ProvisionPlan {
  input: CreateRunnerVmInput;
  scope: string;
  resourceGroup: string;
  subnetId: string;
  /** The template NIC's NSG, shared so one SSH allowlist covers every runner; null = the subnet's NSG governs. */
  nsgId: string | null;
  template: AzVm;
  image: string;
  runnerUser: string;
}

async function provision(p: ProvisionPlan, log: (text: string) => void): Promise<void> {
  const { input, scope, resourceGroup: rg, template } = p;
  const arch = /arm64/i.test(template.storageProfile.imageReference?.sku ?? "") ? "arm64" : "x64";

  log("Looking up the latest GitHub Actions runner release");
  const release = parseRunnerRelease(await githubFetch("/repos/actions/runner/releases/latest"), arch);
  log(`Requesting a one-hour registration token for ${scope}`);
  const { token } = await githubFetch<{ token: string }>(`/${scope}/actions/runners/registration-token`, { method: "POST" });

  const dir = mkdtempSync(path.join(tmpdir(), "flightdeck-newvm-"));
  const ip = `${input.name}-ip`;
  const nsgName = p.nsgId?.split("/").at(-1) ?? null;
  try {
    const customData = path.join(dir, "bootstrap.sh");
    writeFileSync(
      customData,
      bootstrapScript({ user: p.runnerUser, release, registrationUrl: registrationUrl(scope), token, name: input.name, labels: input.labels }),
      { mode: 0o600 },
    );
    // Azure insists on an admin SSH key. Sign-in goes through Entra ID, so this key is thrown away.
    const key = path.join(dir, "admin_key");
    await run("ssh-keygen", ["-t", "ed25519", "-N", "", "-q", "-C", `${input.name}-unused-admin-key`, "-f", key], 30_000);

    log(
      nsgName
        ? `Sharing network security group ${nsgName} with ${template.name}, so the SSH access allowlist covers this VM too`
        : `${template.name}'s NIC has no network security group; the subnet's NSG controls SSH for this VM too`,
    );

    const sec = template.securityProfile;
    const disk = template.storageProfile.osDisk;
    log(`Creating VM ${input.name} (${input.size}, ${p.image}); this takes a few minutes`);
    let vmId: string;
    try {
      vmId = (
        await az<{ id: string }>(
          [
            "vm", "create", "-g", rg, "-n", input.name, "--location", template.location,
            ...(template.zones?.[0] ? ["--zone", template.zones[0]] : []),
            "--size", input.size,
            "--image", p.image,
            "--admin-username", template.osProfile?.adminUsername ?? "azureuser",
            "--authentication-type", "ssh",
            "--ssh-key-values", `${key}.pub`,
            "--subnet", p.subnetId,
            // An existing NSG by ID is attached as is; "" means no NIC NSG.
            "--nsg", p.nsgId ?? "",
            "--public-ip-address", ip,
            "--public-ip-sku", "Standard",
            ...(sec?.securityType === "TrustedLaunch"
              ? [
                  "--security-type", "TrustedLaunch",
                  "--enable-secure-boot", String(Boolean(sec.uefiSettings?.secureBootEnabled)),
                  "--enable-vtpm", String(Boolean(sec.uefiSettings?.vTpmEnabled)),
                ]
              : []),
            ...(disk.managedDisk?.storageAccountType ? ["--storage-sku", disk.managedDisk.storageAccountType] : []),
            ...(disk.diskSizeGB ? ["--os-disk-size-gb", String(disk.diskSizeGB)] : []),
            "--os-disk-delete-option", "Delete",
            "--nic-delete-option", "Delete",
            "--assign-identity", "[system]",
            "--custom-data", customData,
            "--tags", ...TAGS,
          ],
          VM_TIMEOUT_MS,
        )
      ).id;
    } catch (err) {
      // Never the shared NSG: other runners use it.
      log("VM creation failed; removing the network interface and public IP created for it");
      const base = `/subscriptions/${p.subnetId.split("/")[2]}/resourceGroups/${rg}/providers/Microsoft.Network`;
      for (const id of [`${base}/networkInterfaces/${input.name}VMNic`, `${base}/publicIPAddresses/${ip}`]) {
        await deleteIfExists(id).catch(() => false);
      }
      throw err;
    }

    log("Enabling Entra ID SSH login (AADSSHLoginForLinux)");
    await az(
      ["vm", "extension", "set", "-g", rg, "--vm-name", input.name, "--publisher", "Microsoft.Azure.ActiveDirectory", "--name", "AADSSHLoginForLinux"],
      VM_TIMEOUT_MS,
    );

    log("Granting you Virtual Machine Administrator Login on the new VM");
    try {
      const me = await az<string>(["ad", "signed-in-user", "show", "--query", "id"]);
      await az([
        "role", "assignment", "create", "--assignee-object-id", me, "--assignee-principal-type", "User",
        "--role", "Virtual Machine Administrator Login", "--scope", vmId,
      ]);
    } catch (err) {
      log(`Could not assign the role (${message(err)}). Assign it yourself before using az ssh on this VM.`);
    }

    log("Waiting for the runner to come online. First boot installs Docker and the runner, usually 3 to 6 minutes");
    await waitForRunner(scope, input.name);
    log(`${input.name} is online in GitHub`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Validates, then builds the VM in the background. Returns the operation to watch. */
export async function createRunnerVm(input: CreateRunnerVmInput): Promise<RunnerOperation> {
  invalidateMemo("runner-fleet");
  const fleet = await getFleet();
  if (!fleet.scope || fleet.githubError) throw new Error(fleet.githubError ?? "GitHub scope unknown.");
  const errors = createInputErrors(input, [...fleet.vms.map((v) => v.name), ...fleet.orphans.map((r) => r.name)]);
  if (errors.length) throw new Error(errors.join(" "));

  const { t, vm, runnerUser } = await context();
  const template = await templateVm(vm);
  const image = imageOf(template);
  if (!image) throw new Error(`Cannot tell which image ${template.name} was built from, so it cannot be copied.`);
  if (!t.subnetId) throw new Error(`Cannot find ${template.name}'s subnet.`);
  const plan: ProvisionPlan = {
    input,
    scope: fleet.scope,
    resourceGroup: vm.resourceGroup,
    subnetId: t.subnetId,
    nsgId: t.nicNsgId,
    template,
    image,
    runnerUser,
  };
  return startOperation("create", input.name, (log) => provision(plan, log));
}

// ─── Kill ─────────────────────────────────────────────────────────────────────

async function destroy(row: RunnerVm, scope: string | null, log: (text: string) => void): Promise<void> {
  if (!scope) log("GitHub scope unknown, so any runner registration for this VM was left in place.");
  else if (!row.runner) log("No GitHub runner registered under this name.");
  else {
    log(`Removing runner ${row.runner.name} from GitHub`);
    await githubFetch(`/${scope}/actions/runners/${row.runner.id}`, { method: "DELETE" });
  }

  const vm = await az<AzVm>(["vm", "show", "--ids", row.id]);
  const nics = await Promise.all(vm.networkProfile.networkInterfaces.map((n) => az<AzNic>(["network", "nic", "show", "--ids", n.id])));
  const nicIds = vm.networkProfile.networkInterfaces.map((n) => n.id);
  const ipIds = nics.flatMap((n) => n.ipConfigurations.flatMap((c) => (c.publicIPAddress ? [c.publicIPAddress.id] : [])));
  const nsgIds = [...new Set(nics.flatMap((n) => (n.networkSecurityGroup ? [n.networkSecurityGroup.id] : [])))];
  const diskIds = [vm.storageProfile.osDisk.managedDisk?.id, ...(vm.storageProfile.dataDisks ?? []).map((d) => d.managedDisk?.id)].filter(
    (id): id is string => Boolean(id),
  );
  const leaf = (id: string) => id.split("/").at(-1);

  log(`Deleting VM ${row.name}`);
  await az(["vm", "delete", "--ids", row.id, "--yes"], VM_TIMEOUT_MS);
  // NICs before their public IPs and NSGs; each step skips what Azure already removed with the VM.
  for (const ids of [nicIds, ipIds, diskIds]) {
    for (const id of ids) if (await deleteIfExists(id)) log(`Deleted ${leaf(id)}`);
  }
  for (const id of nsgIds) {
    const users = await az<{ nics: number; subnets: number } | null>([
      "network", "nsg", "show", "--ids", id, "--query", "{nics: length(networkInterfaces || `[]`), subnets: length(subnets || `[]`)}",
    ]).catch(() => null);
    if (users && users.nics + users.subnets === 0 && (await deleteIfExists(id))) log(`Deleted ${leaf(id)}`);
    else if (users) log(`Kept ${leaf(id)}: still attached to other resources`);
  }

  if (row.isConfigured) {
    forgetTarget();
    clearRunnerCache();
    log("This was the VM the Runner page reads. Point Settings → Runner VM at another VM.");
  }
}

/** Deregisters and deletes a VM with its NIC, public IP, disks and (unused) NSG, in the background. */
export async function killRunnerVm(name: string, confirm: string): Promise<RunnerOperation> {
  if (confirm !== name) throw new Error("Type the VM name exactly to confirm.");
  invalidateMemo("runner-fleet");
  const fleet = await getFleet();
  const row = fleet.vms.find((v) => v.name === name);
  if (!row) throw new Error(`No VM named ${name} in ${fleet.resourceGroup}.`);
  if (row.runner?.busy) throw new Error(`${name} is running a job. Wait for it to finish, then kill it.`);
  return startOperation("kill", name, (log) => destroy(row, fleet.scope, log));
}

/** Removes a GitHub registration that has no VM behind it. */
export async function removeRegistration(runnerId: number): Promise<void> {
  invalidateMemo("runner-fleet");
  const fleet = await getFleet();
  const runner = fleet.orphans.find((r) => r.id === runnerId);
  if (!fleet.scope || !runner) throw new Error("Only registrations without a VM can be removed here. Kill the VM instead.");
  if (runner.busy) throw new Error(`${runner.name} is running a job.`);
  await githubFetch(`/${fleet.scope}/actions/runners/${runnerId}`, { method: "DELETE" });
  invalidateMemo("runner-fleet");
}
