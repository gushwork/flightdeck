import { getCached, setCache } from "@/lib/cache";
import { parallelPool } from "./parallel-pool";
import {
  fetchOrgCodespacesSecrets,
  fetchRepoCodespacesSecrets,
  fetchUserCodespacesSecrets,
} from "./secrets-codespaces";
import {
  fetchOrgDependabotSecrets,
  fetchRepoDependabotSecrets,
} from "./secrets-dependabot";
import {
  SECRETS_INDEX_CACHE_KEY,
  SECRETS_INDEX_TTL_MS,
  SECRETS_ORG_CONCURRENCY,
  SECRETS_PER_REPO_TIMEOUT_MS,
  SECRETS_REPO_CONCURRENCY,
} from "./secrets-constants";
import {
  fetchOrgActionsRows,
  fetchRepoActionsRows,
  getAuthenticatedUserLogin,
  listAllAccessibleRepos,
  type GHSecretsRepo,
} from "./secrets";
import {
  emptyIndexStats,
  type GHRepoSecretsCockpit,
  type GHSecretInventoryRow,
  type GHSecretsIndexDocument,
  type GHSecretsIndexResponse,
} from "./secrets-types";

export { filterIndex } from "./filter-index";

type MemoryCacheEntry = {
  document: GHSecretsIndexDocument;
  expiresAt: number;
};

let memoryCache: MemoryCacheEntry | null = null;

function emptyIndexDocument(): GHSecretsIndexDocument {
  return {
    version: 1,
    rows: [],
    stats: emptyIndexStats(),
    scannedAt: "",
    scanDurationMs: 0,
    errors: [],
  };
}

function computeStats(
  rows: GHSecretInventoryRow[],
  reposScanned: number,
  reposWithErrors: number,
  orgsScanned: number,
): GHSecretsIndexDocument["stats"] {
  const stats = emptyIndexStats();
  stats.reposScanned = reposScanned;
  stats.reposWithErrors = reposWithErrors;
  stats.orgsScanned = orgsScanned;

  for (const row of rows) {
    if (row.kind === "secret") stats.totalSecrets += 1;
    else stats.totalVariables += 1;
    stats.byScope[row.scope] += 1;
    stats.byPlatform[row.platform] += 1;
  }

  return stats;
}

async function fetchWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    fn()
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

type PlatformTask =
  | { kind: "dependabot-org"; org: string }
  | { kind: "dependabot-repo"; repo: GHSecretsRepo }
  | { kind: "codespaces-user"; userLogin: string }
  | { kind: "codespaces-org"; org: string }
  | { kind: "codespaces-repo"; repo: GHSecretsRepo };

async function runPlatformTask(task: PlatformTask): Promise<GHSecretInventoryRow[]> {
  switch (task.kind) {
    case "dependabot-org":
      return fetchOrgDependabotSecrets(task.org);
    case "dependabot-repo":
      return fetchRepoDependabotSecrets(task.repo.fullName, task.repo.ownerLogin);
    case "codespaces-user":
      return fetchUserCodespacesSecrets(task.userLogin);
    case "codespaces-org":
      return fetchOrgCodespacesSecrets(task.org);
    case "codespaces-repo":
      return fetchRepoCodespacesSecrets(task.repo.fullName, task.repo.ownerLogin);
  }
}

function buildPlatformTasks(
  repos: GHSecretsRepo[],
  orgLogins: string[],
  userLogin: string,
): PlatformTask[] {
  const tasks: PlatformTask[] = [{ kind: "codespaces-user", userLogin }];
  for (const org of orgLogins) {
    tasks.push({ kind: "dependabot-org", org });
    tasks.push({ kind: "codespaces-org", org });
  }
  for (const repo of repos) {
    tasks.push({ kind: "dependabot-repo", repo });
    tasks.push({ kind: "codespaces-repo", repo });
  }
  return tasks;
}

export async function buildSecretsIndex(): Promise<GHSecretsIndexDocument> {
  const started = Date.now();
  const rows: GHSecretInventoryRow[] = [];
  const errors: GHSecretsIndexDocument["errors"] = [];
  let reposWithErrors = 0;

  const userLogin = await getAuthenticatedUserLogin();
  const repos = await listAllAccessibleRepos();
  const orgSet = new Set<string>();

  for (const repo of repos) {
    if (repo.ownerLogin !== userLogin) orgSet.add(repo.ownerLogin);
  }

  const orgLogins = [...orgSet];

  const orgResults = await parallelPool(orgLogins, SECRETS_ORG_CONCURRENCY, (org) =>
    fetchOrgActionsRows(org, { includeValues: false }),
  );

  for (let i = 0; i < orgLogins.length; i++) {
    const org = orgLogins[i];
    const result = orgResults[i];
    if (result.error) {
      errors.push({ target: `org:${org}`, message: result.error });
      for (const r of result.rows) rows.push({ ...r, accessError: result.error });
    } else {
      rows.push(...result.rows);
    }
  }

  const repoResults = await parallelPool(repos, SECRETS_REPO_CONCURRENCY, (repo) =>
    fetchWithTimeout(
      () => fetchRepoActionsRows(repo, { includeValues: false }),
      SECRETS_PER_REPO_TIMEOUT_MS,
    ),
  );

  for (let i = 0; i < repos.length; i++) {
    const result = repoResults[i];
    const repo = repos[i];
    if (!result) {
      reposWithErrors += 1;
      errors.push({
        target: repo.fullName,
        message: `Timed out after ${SECRETS_PER_REPO_TIMEOUT_MS}ms`,
      });
      continue;
    }
    if (result.error) {
      reposWithErrors += 1;
      errors.push({ target: repo.fullName, message: result.error });
    }
    rows.push(...result.rows);
  }

  const platformTasks = buildPlatformTasks(repos, orgLogins, userLogin);
  const platformRowGroups = await parallelPool(
    platformTasks,
    SECRETS_REPO_CONCURRENCY,
    runPlatformTask,
  );
  for (const group of platformRowGroups) {
    rows.push(...group);
  }

  const document: GHSecretsIndexDocument = {
    version: 1,
    rows,
    stats: computeStats(rows, repos.length, reposWithErrors, orgLogins.length),
    scannedAt: new Date().toISOString(),
    scanDurationMs: Date.now() - started,
    errors,
  };

  await setCache(SECRETS_INDEX_CACHE_KEY, document, SECRETS_INDEX_TTL_MS);
  memoryCache = {
    document,
    expiresAt: Date.now() + SECRETS_INDEX_TTL_MS,
  };

  return document;
}

async function readCachedDocument(): Promise<{
  document: GHSecretsIndexDocument | null;
  cacheSource: GHSecretsIndexResponse["cacheSource"];
  stale: boolean;
}> {
  const pgCached = await getCached<GHSecretsIndexDocument>(SECRETS_INDEX_CACHE_KEY);
  if (pgCached) {
    return { document: pgCached, cacheSource: "postgres", stale: false };
  }

  if (memoryCache && Date.now() < memoryCache.expiresAt) {
    return { document: memoryCache.document, cacheSource: "memory", stale: false };
  }

  if (memoryCache) {
    return { document: memoryCache.document, cacheSource: "memory", stale: true };
  }

  return { document: null, cacheSource: "live", stale: true };
}

export async function getSecretsIndexResponse(
  forceRefresh = false,
): Promise<GHSecretsIndexResponse> {
  if (forceRefresh) {
    const index = await buildSecretsIndex();
    return { index, stale: false, cacheSource: "live" };
  }

  const cached = await readCachedDocument();
  if (cached.document) {
    return {
      index: cached.document,
      stale: cached.stale,
      cacheSource: cached.cacheSource,
    };
  }

  return {
    index: emptyIndexDocument(),
    stale: true,
    cacheSource: "live",
  };
}

export async function getRepoCockpit(repoFullName: string): Promise<GHRepoSecretsCockpit> {
  const repos = await listAllAccessibleRepos();
  const repo = repos.find((r) => r.fullName === repoFullName);
  if (!repo) {
    return {
      repoFullName,
      defaultBranch: "main",
      environments: [],
      repository: { secrets: [], variables: [] },
      inheritedOrg: [],
    };
  }

  const { rows } = await fetchRepoActionsRows(repo, { includeValues: true });
  const repoSecrets = rows.filter((r) => r.scope === "repository" && r.kind === "secret");
  const repoVars = rows.filter((r) => r.scope === "repository" && r.kind === "variable");

  const envMap = new Map<
    string,
    { secrets: GHSecretInventoryRow[]; variables: GHSecretInventoryRow[] }
  >();
  for (const row of rows) {
    if (row.scope !== "environment" || !row.environmentName) continue;
    const entry = envMap.get(row.environmentName) ?? { secrets: [], variables: [] };
    if (row.kind === "secret") entry.secrets.push(row);
    else entry.variables.push(row);
    envMap.set(row.environmentName, entry);
  }

  const inheritedOrg: GHRepoSecretsCockpit["inheritedOrg"] = [];
  if (repo.ownerLogin !== (await getAuthenticatedUserLogin())) {
    const { rows: orgRows } = await fetchOrgActionsRows(repo.ownerLogin, { includeValues: true });
    inheritedOrg.push({
      orgLogin: repo.ownerLogin,
      secrets: orgRows.filter((r) => r.kind === "secret"),
      variables: orgRows.filter((r) => r.kind === "variable"),
    });
  }

  return {
    repoFullName,
    defaultBranch: repo.defaultBranch,
    repository: { secrets: repoSecrets, variables: repoVars },
    environments: [...envMap.entries()].map(([name, data]) => ({
      name,
      secrets: data.secrets,
      variables: data.variables,
    })),
    inheritedOrg,
  };
}

export async function invalidateSecretsIndexCache(): Promise<void> {
  memoryCache = null;
}
