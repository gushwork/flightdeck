import { filterIndex, getSecretsIndexResponse } from "./secrets-indexer";
import type {
  GHSecretKind,
  GHSecretMutationTarget,
  GHSecretsDriftResponse,
  GHSecretsDriftRow,
  GHSecretsSearchParams,
} from "./secrets-types";

function targetKey(t: GHSecretMutationTarget): string {
  return `${t.platform}:${t.scope}:${t.ownerLogin}:${t.repoFullName ?? ""}:${t.environmentName ?? ""}:${t.name}`;
}

export async function computeDrift(
  filters?: GHSecretsSearchParams & { name?: string; kind?: GHSecretKind },
): Promise<GHSecretsDriftResponse> {
  const { index } = await getSecretsIndexResponse(false);
  const rows = filterIndex(index, filters ?? {});

  const byName = new Map<string, GHSecretMutationTarget[]>();

  for (const row of rows) {
    if (filters?.name && row.name !== filters.name) continue;
    if (filters?.kind && row.kind !== filters.kind) continue;
    if (row.accessError) continue;

    const target: GHSecretMutationTarget = {
      platform: row.platform,
      scope: row.scope,
      ownerLogin: row.ownerLogin,
      repoFullName: row.repoFullName,
      environmentName: row.environmentName,
      name: row.name,
    };

    const groupKey = `${row.kind}:${row.name}:${row.platform}`;
    const list = byName.get(groupKey) ?? [];
    if (!list.some((t) => targetKey(t) === targetKey(target))) {
      list.push(target);
    }
    byName.set(groupKey, list);
  }

  const driftRows: GHSecretsDriftRow[] = [];

  const repoTargets = new Map<string, GHSecretMutationTarget>();
  for (const row of index.rows) {
    if (!row.repoFullName || row.accessError) continue;
    const key = `${row.repoFullName}:${row.environmentName ?? ""}`;
    if (!repoTargets.has(key)) {
      repoTargets.set(key, {
        platform: "actions",
        scope: row.environmentName ? "environment" : "repository",
        ownerLogin: row.ownerLogin,
        repoFullName: row.repoFullName,
        environmentName: row.environmentName,
        name: "",
      });
    }
  }

  for (const [groupKey, presentTargets] of byName) {
    if (presentTargets.length < 2) continue;

    const [kind, name] = groupKey.split(":") as [GHSecretKind, string];
    const presentRepos = new Set(
      presentTargets.map((t) => `${t.repoFullName}:${t.environmentName ?? ""}`),
    );

    const allRepoKeys = [...repoTargets.keys()];
    const missingTargets: GHSecretMutationTarget[] = [];

    for (const repoKey of allRepoKeys) {
      if (presentRepos.has(repoKey)) continue;
      const base = repoTargets.get(repoKey)!;
      missingTargets.push({
        ...base,
        platform: presentTargets[0]!.platform,
        name,
      });
    }

    if (missingTargets.length === 0) continue;

    driftRows.push({
      name,
      kind,
      presentIn: presentTargets.length,
      missingIn: missingTargets.length,
      missingTargets,
    });
  }

  driftRows.sort((a, b) => b.missingIn - a.missingIn);

  return { rows: driftRows };
}
