import type { GHSecretInventoryRow } from "../secrets-types";
import type { GHSecretsRepo } from "../secrets";

export function makeRepos(n: number, orgPrefix = "test-org"): GHSecretsRepo[] {
  return Array.from({ length: n }, (_, i) => ({
    fullName: `${orgPrefix}/repo-${i}`,
    ownerLogin: orgPrefix,
    defaultBranch: "main",
    private: i % 3 === 0,
  }));
}

export function makeIndexRows(n: number): GHSecretInventoryRow[] {
  const rows: GHSecretInventoryRow[] = [];
  for (let i = 0; i < n; i++) {
    const repoNum = i % 200;
    rows.push({
      name: `SECRET_${i}`,
      kind: i % 5 === 0 ? "variable" : "secret",
      scope: i % 7 === 0 ? "environment" : "repository",
      platform: "actions",
      ownerLogin: "test-org",
      repoFullName: `test-org/repo-${repoNum}`,
      environmentName: i % 7 === 0 ? "production" : undefined,
      updatedAt: new Date().toISOString(),
    });
  }
  return rows;
}

/** Deterministic env count 0–3 per repo index. */
export function envCountForRepoIndex(repoIndex: number): number {
  return repoIndex % 4;
}
