import { beforeEach, describe, expect, it, vi } from "vitest";
import { envCountForRepoIndex, makeRepos } from "./__fixtures__/secrets-index-fixture";
import { SECRETS_REPO_CONCURRENCY } from "./secrets-constants";

const LATENCY_MS = 50;
let inFlight = 0;
let maxConcurrent = 0;
let apiCallCount = 0;

vi.mock("@/lib/cache", () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./client", () => ({
  githubFetch: vi.fn(async (path: string) => {
    apiCallCount += 1;
    inFlight += 1;
    maxConcurrent = Math.max(maxConcurrent, inFlight);
    await new Promise((r) => setTimeout(r, LATENCY_MS));
    inFlight -= 1;

    if (path === "/user") {
      return { login: "test-user" };
    }
    if (path.includes("/environments?") && !path.includes("/environments/")) {
      return { environments: [{ name: "production" }] };
    }
    if (path.includes("/environments/") && path.includes("/secrets")) {
      return { secrets: [{ name: "ENV_SECRET", updated_at: "2024-01-01" }] };
    }
    if (path.includes("/environments/") && path.includes("/variables")) {
      return { variables: [{ name: "ENV_VAR", value: "x", updated_at: "2024-01-01" }] };
    }
    if (path.includes("/actions/secrets")) {
      return { secrets: [{ name: "REPO_SECRET", updated_at: "2024-01-01" }] };
    }
    if (path.includes("/actions/variables")) {
      return { variables: [{ name: "REPO_VAR", value: "v", updated_at: "2024-01-01" }] };
    }
    if (path.includes("/dependabot/secrets")) {
      return { secrets: [] };
    }
    if (path.includes("/codespaces/secrets")) {
      return { secrets: [] };
    }
    return { secrets: [], variables: [], environments: [] };
  }),
  githubFetchPaginated: vi.fn(async () => {
    apiCallCount += 1;
    await new Promise((r) => setTimeout(r, LATENCY_MS));
    return makeRepos(200).map((r) => ({
      full_name: r.fullName,
      owner: { login: r.ownerLogin },
      default_branch: r.defaultBranch,
      private: r.private,
    }));
  }),
  getGithubToken: vi.fn().mockResolvedValue("token"),
  invalidateGithubToken: vi.fn(),
}));

describe("buildSecretsIndex perf", () => {
  beforeEach(() => {
    inFlight = 0;
    maxConcurrent = 0;
    apiCallCount = 0;
  });

  it("scans 200 repos with mocked latency in under 5s and respects concurrency", async () => {
    const { buildSecretsIndex } = await import("./secrets-indexer");

    const start = performance.now();
    const doc = await buildSecretsIndex();
    const wallMs = performance.now() - start;

    expect(doc.rows.length).toBeGreaterThan(0);
    expect(doc.stats.reposScanned).toBe(200);
    expect(wallMs).toBeLessThan(5_000);
    // Repo pool (16) × intra-repo parallel base calls (secrets + variables + env list)
    expect(maxConcurrent).toBeLessThanOrEqual(SECRETS_REPO_CONCURRENCY * 3);
    console.log(`scan perf: wallMs=${Math.round(wallMs)} apiCalls=${apiCallCount} maxConcurrent=${maxConcurrent}`);
  });

  it("fixture env distribution is deterministic", () => {
    expect(envCountForRepoIndex(0)).toBe(0);
    expect(envCountForRepoIndex(3)).toBe(3);
  });
});
