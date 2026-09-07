import {
  emptyIndexStats,
  type GHRepoSecretsCockpit,
  type GHSecretsDriftResponse,
  type GHSecretsIndexResponse,
  type GHSecretsMutationResponse,
  type GHSecretsSearchResponse,
} from "./secrets-types";

export function stubIndexResponse(): GHSecretsIndexResponse {
  return {
    index: {
      version: 1,
      rows: [],
      stats: emptyIndexStats(),
      scannedAt: new Date().toISOString(),
      scanDurationMs: 0,
      errors: [],
    },
    stale: false,
    cacheSource: "memory",
  };
}

export function stubSearchResponse(): GHSecretsSearchResponse {
  return { rows: [], total: 0 };
}

export function stubRepoCockpit(fullName: string): GHRepoSecretsCockpit {
  return {
    repoFullName: fullName,
    defaultBranch: "main",
    environments: [],
    repository: { secrets: [], variables: [] },
    inheritedOrg: [],
  };
}

export function stubMutationResponse(preview: boolean): GHSecretsMutationResponse {
  return { preview, results: [] };
}

export function stubDriftResponse(): GHSecretsDriftResponse {
  return { rows: [] };
}
