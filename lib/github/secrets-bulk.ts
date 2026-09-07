import { executeMutations } from "./secrets";
import { invalidateSecretsIndexCache } from "./secrets-indexer";
import { parallelPool } from "./parallel-pool";
import type { GHSecretsMutationRequest, GHSecretsMutationResponse } from "./secrets-types";
import { SECRETS_REPO_CONCURRENCY } from "./secrets-constants";

export async function executeBulkMutations(
  req: GHSecretsMutationRequest,
): Promise<GHSecretsMutationResponse> {
  if (req.targets.length === 0) {
    return { preview: req.preview, results: [] };
  }

  if (req.preview) {
    return executeMutations(req);
  }

  const batchResults = await parallelPool(
    req.targets,
    SECRETS_REPO_CONCURRENCY,
    async (target) => {
      const single = await executeMutations({
        ...req,
        targets: [target],
        preview: false,
      });
      return single.results[0]!;
    },
  );

  const results = batchResults;

  if (results.some((r) => r.ok)) {
    await invalidateSecretsIndexCache();
  }

  return { preview: false, results };
}
