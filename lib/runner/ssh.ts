import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { connectionTarget, loadConfig } from "./config";
import { run } from "./exec";
import { buildSnapshot, type RawSnapshot } from "./parse";
import { REMOTE_SNAPSHOT_SCRIPT } from "./remote-script";
import type { RunnerSnapshot } from "./types";

const CACHE_TTL_MS = 4_000;
const SSH_TIMEOUT_MS = 25_000;
const AZ_TIMEOUT_MS = 60_000;
/** `az ssh` certificates live ~1h; re-mint well before expiry. */
const CERT_MAX_AGE_MS = 45 * 60_000;

const ACCESS_HINT =
  "Needs `az login` as a user with the 'Virtual Machine Administrator Login' role on the VM, and the AADSSHLoginForLinux extension on the VM.";

let keyDir: string | null = null;
let sshConfig: { host: string; file: string; mintedAt: number } | null = null;

/**
 * `az ssh config` mints a short-lived Entra ID certificate from the `az login` session and writes an
 * ssh config (login user, cert, key) for the host. Reused until near expiry so polls skip the `az` call.
 */
async function ensureSshConfig(host: string): Promise<string> {
  if (sshConfig?.host === host && Date.now() - sshConfig.mintedAt < CERT_MAX_AGE_MS) return sshConfig.file;
  if (!keyDir) {
    const dir = mkdtempSync(path.join(tmpdir(), "flightdeck-azssh-"));
    process.once("exit", () => rmSync(dir, { recursive: true, force: true }));
    keyDir = dir;
  }
  const file = path.join(keyDir, "config");
  const args = ["ssh", "config", "--ip", host, "--file", file, "--keys-destination-folder", path.join(keyDir, "keys")];
  try {
    await run("az", [...args, "--overwrite", "--only-show-errors"], AZ_TIMEOUT_MS);
  } catch (err) {
    throw new Error(`az ssh config failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  sshConfig = { host, file, mintedAt: Date.now() };
  return file;
}

async function runSsh(host: string, user: string): Promise<string> {
  const config = await ensureSshConfig(host);
  const args = [
    "-F", config,
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ConnectTimeout=10",
    "-o", "ServerAliveInterval=5",
    "-o", "LogLevel=ERROR",
    "-o", "BatchMode=yes",
    "-o", "IdentitiesOnly=yes",
    host,
    // Login is the Entra identity; the runner (and its pm2) live under `user`.
    `sudo -n -u ${user} -H python3 -`,
  ];
  try {
    return await run("ssh", args, SSH_TIMEOUT_MS, REMOTE_SNAPSHOT_SCRIPT);
  } catch (err) {
    sshConfig = null; // re-mint next time in case the cert was revoked or roles changed
    const detail = err instanceof Error ? err.message : String(err);
    const hint = /Permission denied|sudo:/.test(detail) ? ` ${ACCESS_HINT}` : "";
    throw new Error(`SSH to ${host} failed: ${detail}.${hint}`);
  }
}

let lastRunnerUrl: string | null = null;

/** Registration URL from the last successful snapshot (lets the fleet find its GitHub scope with no setting). */
export function knownRunnerUrl(): string | null {
  return lastRunnerUrl;
}

async function collect(): Promise<RunnerSnapshot> {
  const { host, user } = connectionTarget(loadConfig());
  const snapshot = buildSnapshot(JSON.parse(await runSsh(host, user)) as RawSnapshot);
  lastRunnerUrl = snapshot.runnerUrl ?? lastRunnerUrl;
  return snapshot;
}

let cache: { at: number; value: RunnerSnapshot } | null = null;
let inflight: Promise<RunnerSnapshot> | null = null;

/** Drop the cached snapshot (e.g. after the host changes in Settings). */
export function clearRunnerCache(): void {
  cache = null;
}

/** One SSH round-trip is shared by every poller within CACHE_TTL_MS. */
export function getRunnerSnapshot(): Promise<RunnerSnapshot> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return Promise.resolve(cache.value);
  inflight ??= collect()
    .then((value) => {
      cache = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
