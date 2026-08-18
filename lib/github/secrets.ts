import { githubFetch, githubFetchPaginated } from "./client";
import { parallelPool } from "./parallel-pool";
import { encryptSecretForGithub } from "./secrets-crypto";
import {
  SECRETS_ENV_CONCURRENCY,
  SECRETS_INTRA_REPO_PARALLEL,
} from "./secrets-constants";
import type {
  GHSecretInventoryRow,
  GHSecretKind,
  GHSecretMutationTarget,
  GHSecretsMutationRequest,
  GHSecretsMutationResponse,
  GHSecretsMutationResult,
} from "./secrets-types";

type RawSecret = {
  name: string;
  created_at?: string;
  updated_at?: string;
};

type RawVariable = {
  name: string;
  value?: string;
  created_at?: string;
  updated_at?: string;
};

type RawPublicKey = {
  key_id: string;
  key: string;
};

type RawEnvironment = {
  name: string;
};

type RawOrgSecret = RawSecret & {
  visibility?: "all" | "private" | "selected";
  selected_repositories_url?: string;
};

export type GHSecretsRepo = {
  fullName: string;
  ownerLogin: string;
  defaultBranch: string;
  private: boolean;
};

export type FetchRowsOptions = {
  /** When false (index scan), variable plaintext is omitted from rows. */
  includeValues?: boolean;
};

function encodeRepoPath(repoFullName: string): string {
  return repoFullName
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
}

async function safeFetch<T>(fn: () => Promise<T>): Promise<{ data?: T; error?: string }> {
  try {
    return { data: await fn() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getAuthenticatedUserLogin(): Promise<string> {
  const user = await githubFetch<{ login: string }>("/user");
  return user.login;
}

export async function listAllAccessibleRepos(): Promise<GHSecretsRepo[]> {
  const raw = await githubFetchPaginated<{
    full_name: string;
    owner: { login: string };
    default_branch: string;
    private: boolean;
  }>("/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed");

  return raw.map((r) => ({
    fullName: r.full_name,
    ownerLogin: r.owner.login,
    defaultBranch: r.default_branch ?? "main",
    private: r.private,
  }));
}

async function listOrgSecretNames(org: string): Promise<RawOrgSecret[]> {
  const data = await githubFetch<{ secrets: RawOrgSecret[] }>(
    `/orgs/${encodeURIComponent(org)}/actions/secrets?per_page=100`,
  );
  return data.secrets ?? [];
}

async function listOrgVariableNames(org: string): Promise<RawVariable[]> {
  const data = await githubFetch<{ variables: RawVariable[] }>(
    `/orgs/${encodeURIComponent(org)}/actions/variables?per_page=100`,
  );
  return data.variables ?? [];
}

async function listRepoSecretNames(repoFullName: string): Promise<RawSecret[]> {
  const path = encodeRepoPath(repoFullName);
  const data = await githubFetch<{ secrets: RawSecret[] }>(
    `/repos/${path}/actions/secrets?per_page=100`,
  );
  return data.secrets ?? [];
}

async function listRepoVariableNames(repoFullName: string): Promise<RawVariable[]> {
  const path = encodeRepoPath(repoFullName);
  const data = await githubFetch<{ variables: RawVariable[] }>(
    `/repos/${path}/actions/variables?per_page=100`,
  );
  return data.variables ?? [];
}

export async function listRepoEnvironments(repoFullName: string): Promise<string[]> {
  const path = encodeRepoPath(repoFullName);
  const data = await githubFetch<{ environments: RawEnvironment[] }>(
    `/repos/${path}/environments?per_page=100`,
  );
  return (data.environments ?? []).map((e) => e.name);
}

async function listEnvSecrets(repoFullName: string, env: string): Promise<RawSecret[]> {
  const path = encodeRepoPath(repoFullName);
  const data = await githubFetch<{ secrets: RawSecret[] }>(
    `/repos/${path}/environments/${encodeURIComponent(env)}/secrets?per_page=100`,
  );
  return data.secrets ?? [];
}

async function listEnvVariables(repoFullName: string, env: string): Promise<RawVariable[]> {
  const path = encodeRepoPath(repoFullName);
  const data = await githubFetch<{ variables: RawVariable[] }>(
    `/repos/${path}/environments/${encodeURIComponent(env)}/variables?per_page=100`,
  );
  return data.variables ?? [];
}

function toSecretRow(
  partial: Omit<GHSecretInventoryRow, "kind"> & { kind?: GHSecretKind },
): GHSecretInventoryRow {
  return { kind: "secret", ...partial };
}

function toVariableRow(
  partial: Omit<GHSecretInventoryRow, "kind"> & { kind?: GHSecretKind },
  includeValues: boolean,
  rawValue?: string,
): GHSecretInventoryRow {
  return {
    kind: "variable",
    ...partial,
    ...(includeValues && rawValue !== undefined ? { value: rawValue } : {}),
  };
}

export async function fetchOrgActionsRows(
  org: string,
  options: FetchRowsOptions = {},
): Promise<{ rows: GHSecretInventoryRow[]; error?: string }> {
  const includeValues = options.includeValues ?? false;
  const rows: GHSecretInventoryRow[] = [];

  const [secretsResult, varsResult] = SECRETS_INTRA_REPO_PARALLEL
    ? await Promise.all([
        safeFetch(() => listOrgSecretNames(org)),
        safeFetch(() => listOrgVariableNames(org)),
      ])
    : [
        await safeFetch(() => listOrgSecretNames(org)),
        await safeFetch(() => listOrgVariableNames(org)),
      ];

  if (secretsResult.error) return { rows, error: secretsResult.error };

  for (const s of secretsResult.data ?? []) {
    rows.push(
      toSecretRow({
        name: s.name,
        scope: "organization",
        platform: "actions",
        ownerLogin: org,
        updatedAt: s.updated_at,
        visibility: s.visibility,
      }),
    );
  }

  if (varsResult.error && rows.length === 0) return { rows, error: varsResult.error };

  for (const v of varsResult.data ?? []) {
    rows.push(
      toVariableRow(
        {
          name: v.name,
          scope: "organization",
          platform: "actions",
          ownerLogin: org,
          updatedAt: v.updated_at,
        },
        includeValues,
        v.value,
      ),
    );
  }

  return { rows, error: varsResult.error };
}

async function fetchEnvRows(
  repo: GHSecretsRepo,
  envName: string,
  includeValues: boolean,
): Promise<{ rows: GHSecretInventoryRow[]; error?: string }> {
  const rows: GHSecretInventoryRow[] = [];
  let error: string | undefined;

  const [envSecrets, envVars] = SECRETS_INTRA_REPO_PARALLEL
    ? await Promise.all([
        safeFetch(() => listEnvSecrets(repo.fullName, envName)),
        safeFetch(() => listEnvVariables(repo.fullName, envName)),
      ])
    : [
        await safeFetch(() => listEnvSecrets(repo.fullName, envName)),
        await safeFetch(() => listEnvVariables(repo.fullName, envName)),
      ];

  if (envSecrets.error) error = envSecrets.error;
  for (const s of envSecrets.data ?? []) {
    rows.push(
      toSecretRow({
        name: s.name,
        scope: "environment",
        platform: "actions",
        ownerLogin: repo.ownerLogin,
        repoFullName: repo.fullName,
        environmentName: envName,
        updatedAt: s.updated_at,
      }),
    );
  }

  if (envVars.error && !error) error = envVars.error;
  for (const v of envVars.data ?? []) {
    rows.push(
      toVariableRow(
        {
          name: v.name,
          scope: "environment",
          platform: "actions",
          ownerLogin: repo.ownerLogin,
          repoFullName: repo.fullName,
          environmentName: envName,
          updatedAt: v.updated_at,
        },
        includeValues,
        v.value,
      ),
    );
  }

  return { rows, error };
}

export async function fetchRepoActionsRows(
  repo: GHSecretsRepo,
  options: FetchRowsOptions = {},
): Promise<{ rows: GHSecretInventoryRow[]; error?: string }> {
  const includeValues = options.includeValues ?? false;
  const rows: GHSecretInventoryRow[] = [];
  let error: string | undefined;

  const [secretsResult, varsResult, envsResult] = SECRETS_INTRA_REPO_PARALLEL
    ? await Promise.all([
        safeFetch(() => listRepoSecretNames(repo.fullName)),
        safeFetch(() => listRepoVariableNames(repo.fullName)),
        safeFetch(() => listRepoEnvironments(repo.fullName)),
      ])
    : [
        await safeFetch(() => listRepoSecretNames(repo.fullName)),
        await safeFetch(() => listRepoVariableNames(repo.fullName)),
        await safeFetch(() => listRepoEnvironments(repo.fullName)),
      ];

  if (secretsResult.error) error = secretsResult.error;
  for (const s of secretsResult.data ?? []) {
    rows.push(
      toSecretRow({
        name: s.name,
        scope: "repository",
        platform: "actions",
        ownerLogin: repo.ownerLogin,
        repoFullName: repo.fullName,
        updatedAt: s.updated_at,
      }),
    );
  }

  if (varsResult.error && !error) error = varsResult.error;
  for (const v of varsResult.data ?? []) {
    rows.push(
      toVariableRow(
        {
          name: v.name,
          scope: "repository",
          platform: "actions",
          ownerLogin: repo.ownerLogin,
          repoFullName: repo.fullName,
          updatedAt: v.updated_at,
        },
        includeValues,
        v.value,
      ),
    );
  }

  if (envsResult.error && !error) error = envsResult.error;

  const envNames = envsResult.data ?? [];
  if (envNames.length > 0) {
    const envResults = await parallelPool(envNames, SECRETS_ENV_CONCURRENCY, (envName) =>
      fetchEnvRows(repo, envName, includeValues),
    );
    for (const envResult of envResults) {
      if (envResult.error && !error) error = envResult.error;
      rows.push(...envResult.rows);
    }
  }

  return { rows, error };
}

async function getPublicKey(
  target: GHSecretMutationTarget,
): Promise<RawPublicKey> {
  if (target.scope === "organization") {
    return githubFetch<RawPublicKey>(
      `/orgs/${encodeURIComponent(target.ownerLogin)}/actions/secrets/public-key`,
    );
  }
  if (!target.repoFullName) throw new Error("repoFullName required for repo/env secrets");
  const path = encodeRepoPath(target.repoFullName);
  if (target.scope === "environment") {
    if (!target.environmentName) throw new Error("environmentName required");
    return githubFetch<RawPublicKey>(
      `/repos/${path}/environments/${encodeURIComponent(target.environmentName)}/secrets/public-key`,
    );
  }
  return githubFetch<RawPublicKey>(`/repos/${path}/actions/secrets/public-key`);
}

function secretPutPath(target: GHSecretMutationTarget, name: string): string {
  const encName = encodeURIComponent(name);
  if (target.scope === "organization") {
    return `/orgs/${encodeURIComponent(target.ownerLogin)}/actions/secrets/${encName}`;
  }
  if (!target.repoFullName) throw new Error("repoFullName required");
  const path = encodeRepoPath(target.repoFullName);
  if (target.scope === "environment") {
    if (!target.environmentName) throw new Error("environmentName required");
    return `/repos/${path}/environments/${encodeURIComponent(target.environmentName)}/secrets/${encName}`;
  }
  return `/repos/${path}/actions/secrets/${encName}`;
}

function variablePutPath(target: GHSecretMutationTarget, name: string): string {
  const encName = encodeURIComponent(name);
  if (target.scope === "organization") {
    return `/orgs/${encodeURIComponent(target.ownerLogin)}/actions/variables/${encName}`;
  }
  if (!target.repoFullName) throw new Error("repoFullName required");
  const path = encodeRepoPath(target.repoFullName);
  if (target.scope === "environment") {
    if (!target.environmentName) throw new Error("environmentName required");
    return `/repos/${path}/environments/${encodeURIComponent(target.environmentName)}/variables/${encName}`;
  }
  return `/repos/${path}/actions/variables/${encName}`;
}

function deletePath(target: GHSecretMutationTarget, kind: GHSecretKind, name: string): string {
  return kind === "secret" ? secretPutPath(target, name) : variablePutPath(target, name);
}

async function applySingleMutation(
  action: GHSecretsMutationRequest["action"],
  target: GHSecretMutationTarget,
  value?: string,
): Promise<GHSecretsMutationResult> {
  try {
    if (action === "set-secret") {
      if (!value) throw new Error("value required for set-secret");
      const { key, key_id } = await getPublicKey(target);
      const encrypted = await encryptSecretForGithub(key, key_id, value);
      await githubFetch(secretPutPath(target, target.name), {
        method: "PUT",
        body: encrypted,
      });
    } else if (action === "set-variable") {
      if (!value) throw new Error("value required for set-variable");
      await githubFetch(variablePutPath(target, target.name), {
        method: "PATCH",
        body: { name: target.name, value },
      });
    } else if (action === "delete-secret") {
      await githubFetch(deletePath(target, "secret", target.name), { method: "DELETE" });
    } else if (action === "delete-variable") {
      await githubFetch(deletePath(target, "variable", target.name), { method: "DELETE" });
    }
    return { target, ok: true };
  } catch (err) {
    return {
      target,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function executeMutations(
  req: GHSecretsMutationRequest,
): Promise<GHSecretsMutationResponse> {
  const results: GHSecretsMutationResult[] = [];

  for (const target of req.targets) {
    if (req.preview) {
      results.push({ target, ok: true });
      continue;
    }
    results.push(await applySingleMutation(req.action, target, req.value));
  }

  return { preview: req.preview, results };
}
