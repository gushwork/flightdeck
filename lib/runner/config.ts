import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { homedir } from "os";
import path from "path";
import { parseEnvFile } from "@/lib/secret-value-format";
import type { RunnerConfigView, RunnerHostSource, RunnerUserSource } from "./types";

export const DEFAULT_USER = "azureuser";

const HOST_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,252}$/;
const USER_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,31}$/;

/** Overrides saved from Settings. The SSH password is never stored here — it stays in env / `.env.azure`. */
export interface SavedRunnerConfig {
  host?: string;
  user?: string;
}

export interface RunnerVmConfig {
  host: string | null;
  hostSource: RunnerHostSource;
  user: string;
  userSource: RunnerUserSource;
  password: string | undefined;
}

function configFile(): string {
  const dir = process.env.FLIGHTDECK_CONFIG_DIR || path.join(homedir(), ".flightdeck");
  return path.join(dir, "runner-vm.json");
}

// Host and user end up in ssh's argv: reject anything ssh could parse as an option or extra argument.
export function hostError(host: string | undefined): string | null {
  if (host === undefined || HOST_RE.test(host)) return null;
  return "Host must be an IP address or hostname (letters, digits, dots, dashes, colons).";
}

export function userError(user: string | undefined): string | null {
  if (user === undefined || USER_RE.test(user)) return null;
  return "User may only contain letters, digits, dots, dashes and underscores.";
}

function clean(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function readSavedConfig(): SavedRunnerConfig {
  try {
    const raw = JSON.parse(readFileSync(configFile(), "utf8")) as Record<string, unknown>;
    return { host: clean(raw.host), user: clean(raw.user) };
  } catch {
    return {};
  }
}

/** Empty fields drop that override (falling back to env); both empty removes the file. */
export function saveConfig(input: SavedRunnerConfig): void {
  const host = clean(input.host);
  const user = clean(input.user);
  const error = hostError(host) ?? userError(user);
  if (error) throw new Error(error);

  const file = configFile();
  if (!host && !user) {
    rmSync(file, { force: true });
    return;
  }
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify({ host, user }, null, 2)}\n`, { mode: 0o600 });
}

/** Saved Settings value wins over `RUNNER_VM_*` env; `get` looks up env-style keys. */
export function mergeConfig(saved: SavedRunnerConfig, get: (key: string) => string | undefined): RunnerVmConfig {
  const envHost = get("RUNNER_VM_HOST");
  const envUser = get("RUNNER_VM_USER");
  return {
    host: saved.host ?? envHost ?? null,
    hostSource: saved.host ? "settings" : envHost ? "env" : null,
    user: saved.user ?? envUser ?? DEFAULT_USER,
    userSource: saved.user ? "settings" : envUser ? "env" : "default",
    password: get("RUNNER_VM_PASSWORD") ?? get("VM_PASSWORD"),
  };
}

/** `.env.azure` is not auto-loaded by Next, so read it from the working directory. */
function readEnvAzure(): Record<string, string> {
  try {
    return parseEnvFile(readFileSync(path.join(process.cwd(), ".env.azure"), "utf8"));
  } catch {
    return {};
  }
}

export function loadConfig(): RunnerVmConfig {
  const file = readEnvAzure();
  return mergeConfig(readSavedConfig(), (key) => process.env[key] || file[key] || undefined);
}

/** Validated host/user/password ready for ssh; throws a user-facing message otherwise. */
export function connectionTarget(cfg: RunnerVmConfig): { host: string; user: string; password: string | undefined } {
  if (!cfg.host) {
    throw new Error("Runner VM host is not set. Add it in Settings → Runner VM (or RUNNER_VM_HOST in .env.azure).");
  }
  const error = hostError(cfg.host) ?? userError(cfg.user);
  if (error) throw new Error(`Invalid runner VM config (${cfg.hostSource ?? "env"}): ${error}`);
  return { host: cfg.host, user: cfg.user, password: cfg.password };
}

/** What the Settings page needs: saved overrides, the effective values, and whether a password exists. */
export function configView(): RunnerConfigView {
  const saved = readSavedConfig();
  const cfg = loadConfig();
  return {
    saved: { host: saved.host ?? "", user: saved.user ?? "" },
    effective: { host: cfg.host, hostSource: cfg.hostSource, user: cfg.user, userSource: cfg.userSource },
    hasPassword: Boolean(cfg.password),
  };
}
