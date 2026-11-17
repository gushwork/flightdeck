import { describe, expect, it } from "vitest";
import {
  bootstrapScript,
  createInputErrors,
  hostedLabels,
  nextRunnerName,
  orphanRunners,
  parseLabels,
  parseRunnerRelease,
  registrationUrl,
  scopeError,
  scopeFromRunnerUrl,
} from "./fleet-plan";

const SHA = "a".repeat(64);

describe("GitHub scope", () => {
  it("derives the API scope from a runner registration URL", () => {
    expect(scopeFromRunnerUrl("https://github.com/enterprises/acme")).toBe("enterprises/acme");
    expect(scopeFromRunnerUrl("https://github.com/acme-org/")).toBe("orgs/acme-org");
    expect(scopeFromRunnerUrl("https://github.com/acme/app")).toBe("repos/acme/app");
    expect(scopeFromRunnerUrl("https://example.com/acme")).toBeNull();
    expect(scopeFromRunnerUrl(null)).toBeNull();
  });

  it("maps a scope back to the config.sh URL", () => {
    expect(registrationUrl("enterprises/acme")).toBe("https://github.com/enterprises/acme");
    expect(registrationUrl("orgs/acme")).toBe("https://github.com/acme");
    expect(registrationUrl("repos/acme/app")).toBe("https://github.com/acme/app");
  });

  it("validates saved scopes", () => {
    expect(scopeError("enterprises/acme")).toBeNull();
    expect(scopeError(undefined)).toBeNull();
    expect(scopeError("acme")).toMatch(/Scope/);
    expect(scopeError("orgs/acme/../x")).toMatch(/Scope/);
  });
});

describe("nextRunnerName", () => {
  it("increments the template's numeric suffix past every taken name", () => {
    expect(nextRunnerName("github-runner-001", ["github-runner-001"])).toBe("github-runner-002");
    expect(nextRunnerName("github-runner-001", ["github-runner-001", "github-runner-007"])).toBe("github-runner-008");
    expect(nextRunnerName("runner", ["runner"])).toBe("runner-2");
  });
});

describe("labels", () => {
  it("parses comma or space separated labels without duplicates", () => {
    expect(parseLabels(" dependabot, gpu  gpu,")).toEqual(["dependabot", "gpu"]);
  });

  it("flags labels that shadow GitHub-hosted runners", () => {
    expect(hostedLabels(["dependabot", "ubuntu-latest", "ubuntu-24.04", "windows-2022", "macos-14-arm64"])).toEqual([
      "ubuntu-latest",
      "ubuntu-24.04",
      "windows-2022",
      "macos-14-arm64",
    ]);
  });
});

describe("createInputErrors", () => {
  const ok = { name: "github-runner-002", size: "Standard_D4ads_v7", labels: ["dependabot"] };

  it("accepts a valid request", () => {
    expect(createInputErrors(ok, ["github-runner-001"])).toEqual([]);
  });

  it("rejects bad names, taken names, sizes and labels", () => {
    expect(createInputErrors({ ...ok, name: "Runner_2" }, [])).toHaveLength(1);
    expect(createInputErrors({ ...ok, name: "-x" }, [])).toHaveLength(1);
    expect(createInputErrors(ok, ["GitHub-Runner-002"])[0]).toMatch(/already exists/);
    expect(createInputErrors({ ...ok, size: "D4; rm -rf /" }, [])).toHaveLength(1);
    expect(createInputErrors({ ...ok, labels: ["ok", "bad label'"] }, [])[0]).toMatch(/bad label'/);
  });
});

describe("parseRunnerRelease", () => {
  const release = {
    tag_name: "v2.338.2",
    body: `notes <!-- BEGIN SHA linux-x64 -->${SHA}<!-- END SHA linux-x64 --> more`,
    assets: [{ name: "actions-runner-linux-x64-2.338.2.tar.gz", browser_download_url: "https://example/x64.tar.gz" }],
  };

  it("finds the tarball and its checksum", () => {
    expect(parseRunnerRelease(release, "x64")).toEqual({ version: "2.338.2", url: "https://example/x64.tar.gz", sha256: SHA });
  });

  it("fails loudly when the architecture is missing", () => {
    expect(() => parseRunnerRelease(release, "arm64")).toThrow(/linux-arm64/);
  });
});

describe("bootstrapScript", () => {
  const script = bootstrapScript({
    user: "azureuser",
    release: { version: "2.338.2", url: "https://example/x64.tar.gz", sha256: SHA },
    registrationUrl: "https://github.com/enterprises/acme",
    token: "TOKEN'WITH'QUOTES",
    name: "github-runner-002",
    labels: ["dependabot", "gpu"],
  });

  it("verifies the download and registers as a service", () => {
    expect(script.startsWith("#!/bin/bash\n")).toBe(true);
    expect(script).toContain(`echo '${SHA}  runner.tar.gz' | sha256sum -c -`);
    expect(script).toContain("--url 'https://github.com/enterprises/acme'");
    expect(script).toContain("--labels 'dependabot,gpu'");
    expect(script).toContain("./svc.sh install 'azureuser'");
    expect(script).toContain("apt-get install -y docker.io");
  });

  it("single-quotes values so they cannot break out of the command", () => {
    expect(script).toContain(`--token 'TOKEN'\\''WITH'\\''QUOTES'`);
  });
});

describe("orphanRunners", () => {
  it("lists registrations whose VM is gone", () => {
    const runner = (name: string) => ({ id: 1, name, status: "offline" as const, busy: false, labels: [] });
    expect(orphanRunners([{ name: "github-runner-001" }], [runner("GitHub-Runner-001"), runner("old-runner")])).toEqual([
      runner("old-runner"),
    ]);
  });
});
