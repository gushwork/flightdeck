import { mkdtempSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connectionTarget, hostError, mergeConfig, readSavedConfig, saveConfig, userError } from "./config";

const none = () => undefined;

describe("mergeConfig", () => {
  it("falls back to the default user and no host", () => {
    expect(mergeConfig({}, none)).toMatchObject({ host: null, hostSource: null, user: "azureuser", userSource: "default" });
  });

  it("reads host/user/password from env", () => {
    const env: Record<string, string> = { RUNNER_VM_HOST: "10.0.0.1", RUNNER_VM_USER: "ops", VM_PASSWORD: "pw" };
    expect(mergeConfig({}, (k) => env[k])).toMatchObject({
      host: "10.0.0.1",
      hostSource: "env",
      user: "ops",
      userSource: "env",
      password: "pw",
    });
  });

  it("lets saved Settings values win over env", () => {
    const env: Record<string, string> = { RUNNER_VM_HOST: "10.0.0.1", RUNNER_VM_USER: "ops" };
    expect(mergeConfig({ host: "10.0.0.2" }, (k) => env[k])).toMatchObject({
      host: "10.0.0.2",
      hostSource: "settings",
      user: "ops",
      userSource: "env",
    });
  });
});

describe("validation", () => {
  it("accepts IPs and hostnames", () => {
    for (const h of ["135.233.97.199", "runner.example.com", "2001:db8::1", "vm-1"]) expect(hostError(h)).toBeNull();
    expect(userError("azureuser")).toBeNull();
  });

  it("rejects values ssh would read as options or extra args", () => {
    for (const h of ["-oProxyCommand=x", "a b", "host;rm", "", "a/b"]) expect(hostError(h)).not.toBeNull();
    for (const u of ["-l", "a b", "root@evil"]) expect(userError(u)).not.toBeNull();
  });
});

describe("connectionTarget", () => {
  it("throws a Settings hint when no host is configured", () => {
    expect(() => connectionTarget(mergeConfig({}, none))).toThrow(/Settings/);
  });

  it("throws for an invalid env host", () => {
    expect(() => connectionTarget(mergeConfig({}, (k) => (k === "RUNNER_VM_HOST" ? "-oFoo=1" : undefined)))).toThrow(/Invalid/);
  });

  it("returns the validated target", () => {
    expect(connectionTarget(mergeConfig({ host: "10.0.0.2" }, none))).toEqual({
      host: "10.0.0.2",
      user: "azureuser",
      password: undefined,
    });
  });
});

describe("saved config file", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "fd-runner-cfg-"));
    process.env.FLIGHTDECK_CONFIG_DIR = dir;
  });
  afterEach(() => {
    delete process.env.FLIGHTDECK_CONFIG_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips, trims, and keeps the file private", () => {
    saveConfig({ host: " 10.0.0.9 ", user: "ops" });
    expect(readSavedConfig()).toEqual({ host: "10.0.0.9", user: "ops" });
    expect(statSync(path.join(dir, "runner-vm.json")).mode & 0o777).toBe(0o600);
  });

  it("clears overrides when fields are empty", () => {
    saveConfig({ host: "10.0.0.9", user: "ops" });
    saveConfig({ host: "10.0.0.9", user: "" });
    expect(readSavedConfig()).toEqual({ host: "10.0.0.9", user: undefined });
    saveConfig({ host: "", user: "" });
    expect(readSavedConfig()).toEqual({});
  });

  it("refuses to save an invalid host", () => {
    expect(() => saveConfig({ host: "-oProxyCommand=x" })).toThrow(/Host/);
    expect(readSavedConfig()).toEqual({});
  });
});
