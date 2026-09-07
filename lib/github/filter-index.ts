import type {
  GHSecretInventoryRow,
  GHSecretsIndexDocument,
  GHSecretsSearchParams,
} from "./secrets-types";

/** Pure client-safe filter over index rows (no server imports). */
export function filterIndexRows(
  rows: GHSecretInventoryRow[],
  params: GHSecretsSearchParams,
): GHSecretInventoryRow[] {
  const q = params.q?.trim().toLowerCase();
  return rows.filter((row) => {
    if (params.owner && row.ownerLogin !== params.owner) return false;
    if (params.scope && row.scope !== params.scope) return false;
    if (params.platform && row.platform !== params.platform) return false;
    if (params.kind && row.kind !== params.kind) return false;
    if (params.repo && row.repoFullName !== params.repo) return false;
    if (params.environment && row.environmentName !== params.environment) return false;
    if (q) {
      const hay = [row.name, row.repoFullName, row.environmentName, row.ownerLogin]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function filterIndex(
  doc: GHSecretsIndexDocument,
  params: GHSecretsSearchParams,
): GHSecretInventoryRow[] {
  return filterIndexRows(doc.rows, params);
}

export function searchParamsFromRecord(
  params: Record<string, string | undefined>,
): GHSecretsSearchParams {
  return {
    q: params.q,
    owner: params.owner,
    scope: params.scope as GHSecretsSearchParams["scope"],
    platform: params.platform as GHSecretsSearchParams["platform"],
    kind: params.kind as GHSecretsSearchParams["kind"],
    repo: params.repo,
    environment: params.environment,
  };
}
