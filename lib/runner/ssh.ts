import { execFile } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { connectionTarget, loadConfig } from "./config";
import { buildSnapshot, type RawSnapshot } from "./parse";
import { REMOTE_SNAPSHOT_SCRIPT } from "./remote-script";
import type { RunnerSnapshot } from "./types";

const CACHE_TTL_MS = 4_000;
const SSH_TIMEOUT_MS = 25_000;

let askpassPath: string | null = null;

/** ssh reads the password from this helper; it only echoes an env var, so the secret never hits disk or argv. */
function ensureAskpass(): string {
  if (askpassPath) return askpassPath;
  const dir = mkdtempSync(path.join(tmpdir(), "flightdeck-askpass-"));
  const file = path.join(dir, "askpass.sh");
  writeFileSync(file, '#!/bin/sh\nprintf \'%s\\n\' "$FLIGHTDECK_SSH_PASSWORD"\n', { mode: 0o700 });
  process.once("exit", () => rmSync(dir, { recursive: true, force: true }));
  askpassPath = file;
  return file;
}

function runSsh(host: string, user: string, password: string | undefined): Promise<string> {
  const args = [
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ConnectTimeout=10",
    "-o", "ServerAliveInterval=5",
    "-o", "LogLevel=ERROR",
    ...(password
      ? ["-o", "PreferredAuthentications=password,keyboard-interactive", "-o", "PubkeyAuthentication=no", "-o", "NumberOfPasswordPrompts=1"]
      : ["-o", "BatchMode=yes"]),
    `${user}@${host}`,
    "python3 -",
  ];
  const env = password
    ? {
        ...process.env,
        SSH_ASKPASS: ensureAskpass(),
        SSH_ASKPASS_REQUIRE: "force",
        FLIGHTDECK_SSH_PASSWORD: password,
      }
    : process.env;

  return new Promise((resolve, reject) => {
    const child = execFile(
      "ssh",
      args,
      { env, timeout: SSH_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const detail = stderr.trim().split("\n").at(-1) || err.message;
          reject(new Error(`SSH to ${user}@${host} failed: ${detail}`));
        } else {
          resolve(stdout);
        }
      },
    );
    child.stdin?.end(REMOTE_SNAPSHOT_SCRIPT);
  });
}

async function collect(): Promise<RunnerSnapshot> {
  const { host, user, password } = connectionTarget(loadConfig());
  try {
    return buildSnapshot(JSON.parse(await runSsh(host, user, password)) as RawSnapshot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(password ? msg : `${msg}. Set VM_PASSWORD in .env.azure (or RUNNER_VM_PASSWORD) for password auth.`);
  }
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
