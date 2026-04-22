import { exec, execFile } from "child_process";
import { promisify } from "util";
import type {
  FlyApp,
  FlyAppStatus,
  FlyMachine,
  FlySecret,
  MachineCheck,
} from "./types";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const CLI_ENV = {
  ...process.env,
  PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin",
};

let resolvedBinary: string | null = null;

async function resolveBinary(): Promise<string> {
  if (resolvedBinary) return resolvedBinary;
  for (const name of ["flyctl", "fly"]) {
    try {
      const { stdout } = await execAsync(`which ${name}`, { env: CLI_ENV });
      if (stdout.trim()) {
        resolvedBinary = stdout.trim();
        return resolvedBinary;
      }
    } catch {
      /* try next */
    }
  }
  throw new Error(
    "flyctl/fly CLI not found. Install from https://fly.io/docs/flyctl/install/ and run `fly auth login`.",
  );
}

async function flyJson<T>(args: string[], timeoutMs = 15_000): Promise<T> {
  const bin = await resolveBinary();
  const { stdout, stderr } = await execFileAsync(bin, [...args, "-j"], {
    env: CLI_ENV,
    timeout: timeoutMs,
  });
  if (!stdout.trim()) {
    if (stderr.includes("not authenticated") || stderr.includes("No access token"))
      throw new Error("Fly CLI not authenticated. Run `fly auth login`.");
    throw new Error(stderr.trim() || "flyctl returned empty output");
  }
  return JSON.parse(stdout) as T;
}

async function flyExec(
  args: string[],
  opts?: { stdin?: string; timeoutMs?: number },
): Promise<string> {
  const bin = await resolveBinary();
  const child = execFile(bin, args, {
    env: CLI_ENV,
    timeout: opts?.timeoutMs ?? 30_000,
  });
  if (opts?.stdin && child.stdin) {
    child.stdin.write(opts.stdin);
    child.stdin.end();
  }
  return new Promise((resolve, reject) => {
    let out = "";
    let err = "";
    child.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
    child.stderr?.on("data", (d: Buffer) => { err += d.toString(); });
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(err.trim() || `flyctl exited ${code}`));
      else resolve(out.trim());
    });
    child.on("error", reject);
  });
}

// ─── Raw CLI response shapes ─────────────────────────────────────────────────

interface RawApp {
  Name: string;
  Status: string;
  Deployed: boolean;
  Hostname: string;
  Organization: { Name: string; Slug: string };
  CurrentRelease?: { Status: string; CreatedAt: string };
}

interface RawMachineCheck {
  name: string;
  status: string;
  output: string;
  updated_at: string;
}

interface RawMachine {
  id: string;
  name: string;
  state: string;
  region: string;
  created_at: string;
  updated_at: string;
  checks?: RawMachineCheck[];
  image_ref?: { labels?: Record<string, string> };
}

interface RawStatus {
  ID: string;
  Hostname: string;
  Deployed: boolean;
  Machines?: RawMachine[];
}

interface RawSecret {
  name: string;
  digest: string;
  status: string;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function listApps(): Promise<FlyApp[]> {
  const raw = await flyJson<RawApp[]>(["apps", "list"]);
  return raw.map((a) => ({
    name: a.Name,
    status: a.Status,
    deployed: a.Deployed,
    hostname: a.Hostname,
    org: a.Organization.Name,
    orgSlug: a.Organization.Slug,
    currentReleaseStatus: a.CurrentRelease?.Status ?? "",
    currentReleaseAt: a.CurrentRelease?.CreatedAt ?? "",
  }));
}

function deriveHealth(machines: FlyMachine[]): FlyAppStatus["health"] {
  if (machines.length === 0) return "unknown";
  const started = machines.filter((m) => m.state === "started");
  if (started.length === 0) return "down";
  const allChecks = started.flatMap((m) => m.checks);
  if (allChecks.some((c) => c.status === "critical")) return "degraded";
  if (allChecks.some((c) => c.status === "warning")) return "degraded";
  if (allChecks.length > 0 && allChecks.every((c) => c.status === "passing"))
    return "healthy";
  return started.length === machines.length ? "healthy" : "degraded";
}

function parseMachineCheck(raw: RawMachineCheck): MachineCheck {
  const status = (["passing", "warning", "critical"].includes(raw.status)
    ? raw.status
    : "unknown") as MachineCheck["status"];
  return { name: raw.name, status, output: raw.output, updatedAt: raw.updated_at };
}

export async function getAppStatus(appName: string): Promise<FlyAppStatus> {
  const raw = await flyJson<RawStatus>(["status", "-a", appName]);
  const machines: FlyMachine[] = (raw.Machines ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    state: m.state,
    region: m.region,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
    checks: (m.checks ?? []).map(parseMachineCheck),
    runtime: m.image_ref?.labels?.fly_launch_runtime ?? "",
  }));
  return {
    appName: raw.ID,
    hostname: raw.Hostname,
    deployed: raw.Deployed,
    machines,
    health: deriveHealth(machines),
  };
}

/**
 * Fetch status for multiple apps with bounded concurrency.
 */
export async function getAppsStatus(
  appNames: string[],
  concurrency = 4,
): Promise<FlyAppStatus[]> {
  const results: FlyAppStatus[] = [];
  const queue = [...appNames];
  async function worker() {
    while (queue.length > 0) {
      const name = queue.shift()!;
      try {
        results.push(await getAppStatus(name));
      } catch {
        results.push({
          appName: name,
          hostname: "",
          deployed: false,
          machines: [],
          health: "unknown",
        });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, appNames.length) }, worker));
  return results;
}

export async function listSecrets(appName: string): Promise<FlySecret[]> {
  const raw = await flyJson<RawSecret[]>(["secrets", "list", "-a", appName]);
  return raw.map((s) => ({ name: s.name, digest: s.digest, status: s.status }));
}

export async function setSecrets(
  appName: string,
  secrets: Record<string, string>,
): Promise<string> {
  const stdin = Object.entries(secrets)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  return flyExec(["secrets", "import", "-a", appName, "--detach"], { stdin });
}

export async function unsetSecrets(
  appName: string,
  names: string[],
): Promise<string> {
  if (names.length === 0) return "";
  return flyExec(["secrets", "unset", "-a", appName, "--detach", ...names]);
}
