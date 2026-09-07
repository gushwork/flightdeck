import { describe, expect, it } from "vitest";
import type { SecretEntry } from "@/lib/types";
import type { GHWorkflowRun } from "@/lib/github/types";
import type { EnrichedFlyApp } from "@/lib/fly/types";
import {
  buildFlyExceptions,
  buildGithubExceptions,
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
  it("does not treat waiting, requested, or pending as live", () => {
    const runs = [
      run({ id: 10, status: "waiting", conclusion: null }),
      run({ id: 11, status: "requested", conclusion: null }),
      run({ id: 12, status: "pending", conclusion: null }),
    ];
    expect(githubKpis(runs, NOW)).toEqual({ failed24h: 0, live: 0 });
    expect(buildGithubExceptions(runs, NOW)).toEqual([]);
  });

  it("does not treat startup_failure as a failed exception", () => {
    const runs = [run({ id: 20, status: "completed", conclusion: "startup_failure" })];
    expect(githubKpis(runs, NOW)).toEqual({ failed24h: 0, live: 0 });
    expect(buildGithubExceptions(runs, NOW)).toEqual([]);
  });

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
    expect(rows[0]?.href).toBe("/github/runs?repo=acme%2Fapp&branch=main");
    expect(rows[0]?.severity).toBe("danger");
    expect(rows[1]?.severity).toBe("warn");
  });
});

describe("secretsHygieneStats", () => {
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
  });

  it("maps down to danger and degraded to warn, deep-linking each app", () => {
    const rows = buildFlyExceptions([fly("bad", "degraded"), fly("dead", "down")]);
    expect(rows[0]).toMatchObject({
      severity: "warn",
      href: "/fly/overview?app=bad",
    });
    expect(rows[1]).toMatchObject({
      severity: "danger",
      href: "/fly/overview?app=dead",
    });
  });
});

describe("mergeExceptions", () => {
  it("sorts danger then warn then info, then recency desc; caps at 15; total counts action rows", () => {
    const runs = Array.from({ length: 18 }, (_, i) =>
      run({
        id: i + 1,
        status: "completed",
        conclusion: "failure",
        updatedAt: new Date(NOW - i * 60_000).toISOString(),
      }),
    );
    const gh = buildGithubExceptions(runs, NOW);
    const merged = mergeExceptions(gh);
    expect(merged.visible).toHaveLength(15);
    expect(merged.total).toBe(gh.length);
    expect(merged.dangerCount).toBe(gh.length);
    expect(merged.warnCount).toBe(0);
    expect(merged.visible[0]?.severity).toBe("danger");
    expect(merged.overflow).toEqual([
      { source: "github", count: gh.length - 15, href: "/github/runs" },
    ]);
  });

  it("reports danger and warn counts on the merged result", () => {
    const rows = [
      ...buildGithubExceptions(
        [run({ id: 1, status: "in_progress", conclusion: null })],
        NOW,
      ),
      ...buildFlyExceptions([fly("bad", "degraded")]),
      ...buildFlyExceptions([fly("dead", "down")]),
    ];
    const merged = mergeExceptions(rows);
    expect(merged.total).toBe(3);
    expect(merged.dangerCount).toBe(1);
    expect(merged.warnCount).toBe(2);
    expect(merged.hasDanger).toBe(true);
  });
});

describe("filterRowsBySource", () => {
  it("returns all rows when source is null", () => {
    const rows = buildFlyExceptions([fly("bad", "down")]);
    expect(filterRowsBySource(rows, null)).toEqual(rows);
    expect(filterRowsBySource(rows, "github")).toEqual([]);
  });
});
