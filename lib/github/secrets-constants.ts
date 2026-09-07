export const SECRETS_INDEX_CACHE_KEY = "github:secrets:index:v1";
export const SECRETS_INDEX_TTL_MS = 600_000;
export const SECRETS_REPO_CONCURRENCY = 16;
export const SECRETS_ORG_CONCURRENCY = 8;
export const SECRETS_ENV_CONCURRENCY = 4;
export const SECRETS_PER_REPO_TIMEOUT_MS = 5_000;
/** When true, repo/env API calls within a single repo run in parallel. */
export const SECRETS_INTRA_REPO_PARALLEL = true;
