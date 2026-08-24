import { describe, expect, it } from "vitest";
import type { SecretEntry } from "@/lib/types";
import type { GHWorkflowRun } from "@/lib/github/types";
import type { EnrichedFlyApp } from "@/lib/fly/types";
import {
  buildFlyExceptions,
  buildGithubExceptions,
  buildSecretsExceptions,
  filterRowsBySource,
  flyUnhealthyCount,
  githubKpis,
  mergeExceptions,
  secretsHygieneStats,
} from "./exceptions";

const NOW = Date.parse("2026-08-24T12:00:00.000Z");

function secret(partial: Partial<SecretEntry> & Pick<SecretEntry, "name">): SecretEntry {
  return {
    arn: `arn:aws:secretsmanager:us-east-1:1:secret:${partial.name}`,
    createdDate: "2026-01-01T00:00:00.000Z",
    tags: {},
    rotationEnabled: true,
    ...partial,
  };
}

function run(
  partial: Partial<GHWorkflowRun> & Pick<GHWorkflowRun, "id" | "status" | "conclusion">,
): GHWorkflowRun {
  return {
    name: null,
    workflowName: "deploy",
    workflowId: 1,
    repoFullName: "acme/app",
    headBranch: "main",
    headSha: "abc",
    event: "push",
    createdAt: "2026-08-24T11:00:00.000Z",
    updatedAt: "2026-08-24T11:30:00.000Z",
    runAttempt: 1,
    htmlUrl: "https://github.com/acme/app/actions/runs/1",
    runNumber: 1,
    actor: null,
    ...partial,
  };
}

function fly(name: string, health: "healthy" | "degraded" | "down" | "unknown" | null): EnrichedFlyApp {
  return {
    name,
    status: "running",
    deployed: true,
    hostname: `${name}.fly.dev`,
    org: "o",
    orgSlug: "o",
    currentReleaseStatus: "complete",
    currentReleaseAt: "2026-08-01T00:00:00.000Z",
    status_detail: health
      ? {
          appName: name,
          hostname: `${name}.fly.dev`,
          deployed: true,
          machines: [],
          health,
        }
      : null,
  };
}

describe("githubKpis / buildGithubExceptions", () => {
  it("counts failed-in-24h and live separately; skips old failures", () => {
    const runs = [
      run({ id: 1, status: "completed", conclusion: "failure" }),
      run({
        id: 2,
        status: "completed",
        conclusion: "failure",
        updatedAt: "2026-08-20T12:00:00.000Z",
      }),
      run({ id: 3, status: "in_progress", conclusion: null }),
    ];
    expect(githubKpis(runs, NOW)).toEqual({ failed24h: 1, live: 1 });
    const rows = buildGithubExceptions(runs, NOW);
    expect(rows.map((r) => r.id)).toEqual(["github-fail-1", "github-live-3"]);
    expect(rows[0]?.href).toBe("/github");
    expect(rows[0]?.severity).toBe("danger");
    expect(rows[1]?.severity).toBe("warn");
  });
});

describe("secretsHygieneStats / buildSecretsExceptions", () => {
  it("hygiene is union of unrotated and stale", () => {
    const secrets = [
      secret({ name: "a", rotationEnabled: false }),
      secret({ name: "b", lastAccessedDate: "2025-01-01T00:00:00.000Z" }),
      secret({
        name: "both",
        rotationEnabled: false,
        lastAccessedDate: "2025-01-01T00:00:00.000Z",
      }),
      secret({ name: "ok" }),
    ];
    expect(secretsHygieneStats(secrets, NOW)).toEqual({
      unrotated: 2,
      stale: 2,
      hygiene: 3,
    });
  });

  it("aggregates unrotated when count > 5", () => {
    const secrets = Array.from({ length: 6 }, (_, i) =>
      secret({ name: `u${i}`, rotationEnabled: false }),
    );
    const { rows } = buildSecretsExceptions(secrets, NOW);
    expect(rows.filter((r) => r.id.startsWith("secrets-unrotated"))).toHaveLength(1);
    expect(rows[0]?.href).toBe("/secrets?filter=no-rotation");
    expect(rows[0]?.label).toBe("6 secrets without auto-rotation");
  });

  it("caps stale rows at 8 and reports omittedStale", () => {
    const secrets = Array.from({ length: 10 }, (_, i) =>
      secret({
        name: `s${i}`,
        lastAccessedDate: `2025-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
      }),
    );
    const { rows, omittedStale } = buildSecretsExceptions(secrets, NOW);
    expect(rows.filter((r) => r.id.startsWith("secrets-stale-"))).toHaveLength(8);
    expect(omittedStale).toBe(2);
  });
});

describe("buildFlyExceptions / flyUnhealthyCount", () => {
  it("includes degraded and down only", () => {
    const apps = [
      fly("ok", "healthy"),
      fly("bad", "degraded"),
      fly("dead", "down"),
      fly("mystery", "unknown"),
      fly("empty", null),
    ];
    expect(flyUnhealthyCount(apps)).toBe(2);
    const rows = buildFlyExceptions(apps);
    expect(rows.map((r) => r.id)).toEqual(["fly-bad", "fly-dead"]);
    expect(rows.every((r) => r.href === "/fly/overview")).toBe(true);
  });
});

describe("mergeExceptions", () => {
  it("sorts danger then warn then info, then recency desc; caps at 15; hero total includes omitted stale", () => {
    const runs = Array.from({ length: 12 }, (_, i) =>
      run({
        id: i + 1,
        status: "completed",
        conclusion: "failure",
        updatedAt: new Date(NOW - i * 60_000).toISOString(),
      }),
    );
    const gh = buildGithubExceptions(runs, NOW);
    const secrets = Array.from({ length: 10 }, (_, i) =>
      secret({
        name: `stale-${i}`,
        lastAccessedDate: "2025-01-01T00:00:00.000Z",
      }),
    );
    const { rows, omittedStale } = buildSecretsExceptions(secrets, NOW);
    const merged = mergeExceptions([...gh, ...rows], omittedStale);
    expect(merged.visible).toHaveLength(15);
    expect(merged.total).toBe(gh.length + rows.length + omittedStale);
    expect(merged.visible[0]?.severity).toBe("danger");
    expect(merged.overflow.some((o) => o.source === "secrets" && o.count >= 2)).toBe(true);
  });
});

describe("filterRowsBySource", () => {
  it("returns all rows when source is null", () => {
    const rows = buildFlyExceptions([fly("bad", "down")]);
    expect(filterRowsBySource(rows, null)).toEqual(rows);
    expect(filterRowsBySource(rows, "github")).toEqual([]);
  });
});
