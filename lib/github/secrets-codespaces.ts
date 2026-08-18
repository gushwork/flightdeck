import { githubFetch } from "./client";
import type { GHSecretInventoryRow } from "./secrets-types";

type RawSecret = { name: string; updated_at?: string };

function encodeRepoPath(repoFullName: string): string {
  return repoFullName
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
}

export async function fetchUserCodespacesSecrets(
  userLogin: string,
): Promise<GHSecretInventoryRow[]> {
  try {
    const data = await githubFetch<{ secrets: RawSecret[] }>(
      "/user/codespaces/secrets?per_page=100",
    );
    return (data.secrets ?? []).map((s) => ({
      name: s.name,
      kind: "secret" as const,
      scope: "codespaces_user" as const,
      platform: "codespaces" as const,
      ownerLogin: userLogin,
      updatedAt: s.updated_at,
    }));
  } catch {
    return [];
  }
}

export async function fetchOrgCodespacesSecrets(org: string): Promise<GHSecretInventoryRow[]> {
  try {
    const data = await githubFetch<{ secrets: RawSecret[] }>(
      `/orgs/${encodeURIComponent(org)}/codespaces/secrets?per_page=100`,
    );
    return (data.secrets ?? []).map((s) => ({
      name: s.name,
      kind: "secret" as const,
      scope: "organization" as const,
      platform: "codespaces" as const,
      ownerLogin: org,
      updatedAt: s.updated_at,
    }));
  } catch {
    return [];
  }
}

export async function fetchRepoCodespacesSecrets(
  repoFullName: string,
  ownerLogin: string,
): Promise<GHSecretInventoryRow[]> {
  const path = encodeRepoPath(repoFullName);
  try {
    const data = await githubFetch<{ secrets: RawSecret[] }>(
      `/repos/${path}/codespaces/secrets?per_page=100`,
    );
    return (data.secrets ?? []).map((s) => ({
      name: s.name,
      kind: "secret" as const,
      scope: "repository" as const,
      platform: "codespaces" as const,
      ownerLogin,
      repoFullName,
      updatedAt: s.updated_at,
    }));
  } catch {
    return [];
  }
}
