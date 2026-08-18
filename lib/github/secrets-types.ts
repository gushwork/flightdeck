export type GHSecretKind = "secret" | "variable";

export type GHSecretScope =
  | "organization"
  | "repository"
  | "environment"
  | "codespaces_user";

export type GHSecretPlatform = "actions" | "dependabot" | "codespaces";

export type GHSecretInventoryRow = {
  name: string;
  kind: GHSecretKind;
  scope: GHSecretScope;
  platform: GHSecretPlatform;
  ownerLogin: string;
  repoFullName?: string;
  environmentName?: string;
  updatedAt?: string;
  /** Populated only in live repo cockpit responses — omitted from cached index. */
  value?: string;
  visibility?: "all" | "private" | "selected";
  selectedRepos?: string[];
  accessError?: string;
};

export type GHSecretsIndexStats = {
  totalSecrets: number;
  totalVariables: number;
  byScope: Record<GHSecretScope, number>;
  byPlatform: Record<GHSecretPlatform, number>;
  reposScanned: number;
  reposWithErrors: number;
  orgsScanned: number;
};

export type GHSecretsIndexDocument = {
  version: 1;
  rows: GHSecretInventoryRow[];
  stats: GHSecretsIndexStats;
  scannedAt: string;
  scanDurationMs: number;
  errors: Array<{ target: string; message: string }>;
};

export type GHSecretsIndexResponse = {
  index: GHSecretsIndexDocument;
  stale: boolean;
  cacheSource: "postgres" | "memory" | "live";
};

export type GHSecretsSearchParams = {
  q?: string;
  owner?: string;
  scope?: GHSecretScope;
  platform?: GHSecretPlatform;
  kind?: GHSecretKind;
  repo?: string;
  environment?: string;
};

export type GHSecretsSearchResponse = {
  rows: GHSecretInventoryRow[];
  total: number;
};

export type GHSecretMutationTarget = {
  platform: GHSecretPlatform;
  scope: GHSecretScope;
  ownerLogin: string;
  repoFullName?: string;
  environmentName?: string;
  name: string;
};

export type GHSecretMutationAction =
  | "set-secret"
  | "set-variable"
  | "delete-secret"
  | "delete-variable";

export type GHSecretsMutationRequest = {
  action: GHSecretMutationAction;
  targets: GHSecretMutationTarget[];
  value?: string;
  preview: boolean;
};

export type GHSecretsMutationResult = {
  target: GHSecretMutationTarget;
  ok: boolean;
  error?: string;
};

export type GHSecretsMutationResponse = {
  preview: boolean;
  results: GHSecretsMutationResult[];
};

export type GHRepoSecretsCockpit = {
  repoFullName: string;
  defaultBranch: string;
  environments: Array<{
    name: string;
    secrets: GHSecretInventoryRow[];
    variables: GHSecretInventoryRow[];
  }>;
  repository: {
    secrets: GHSecretInventoryRow[];
    variables: GHSecretInventoryRow[];
  };
  inheritedOrg: Array<{
    orgLogin: string;
    secrets: GHSecretInventoryRow[];
    variables: GHSecretInventoryRow[];
  }>;
};

export type GHSecretsDriftRow = {
  name: string;
  kind: GHSecretKind;
  presentIn: number;
  missingIn: number;
  missingTargets: GHSecretMutationTarget[];
};

export type GHSecretsDriftResponse = {
  rows: GHSecretsDriftRow[];
};

export type PlatformFetchContext = {
  repos: Array<{ fullName: string; ownerLogin: string; defaultBranch: string }>;
  orgLogins: string[];
  userLogin: string;
};

export type GHPlatformFetcher = {
  platform: GHSecretPlatform;
  fetchRows: (ctx: PlatformFetchContext) => Promise<GHSecretInventoryRow[]>;
};

export function emptyIndexStats(): GHSecretsIndexStats {
  return {
    totalSecrets: 0,
    totalVariables: 0,
    byScope: {
      organization: 0,
      repository: 0,
      environment: 0,
      codespaces_user: 0,
    },
    byPlatform: {
      actions: 0,
      dependabot: 0,
      codespaces: 0,
    },
    reposScanned: 0,
    reposWithErrors: 0,
    orgsScanned: 0,
  };
}
