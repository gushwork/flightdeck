import { getSecretValue, putSecretValue } from '@/lib/aws/secrets';
import { getRegion, parseProfileParam } from '@/lib/aws/client';
import { invalidateCache } from '@/lib/cache';
import { parallelPool } from '@/lib/github/parallel-pool';
import { replaceInSecretString } from '@/lib/secret-replace';
import type { SecretReplaceResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function replaceOne(
  region: string,
  profile: string | undefined,
  name: string,
  find: string,
  replace: string,
  dryRun: boolean,
): Promise<SecretReplaceResult> {
  try {
    // Read AWSCURRENT straight from Secrets Manager right before writing — never a cached or
    // preview-time copy — so a stale value can't overwrite a newer one.
    const latest = await getSecretValue(region, name, profile);
    if (latest.secretString === undefined) {
      return { name, status: 'failed', changes: [], error: 'Binary secret — find and replace not supported' };
    }

    const { next, changes } = replaceInSecretString(latest.secretString, find, replace);
    if (changes.length === 0) return { name, status: 'no-match', changes };
    if (dryRun) return { name, status: 'will-change', changes };
    if (!next.trim()) {
      return { name, status: 'failed', changes, error: 'Result would be an empty secret — not written' };
    }

    const { versionId } = await putSecretValue(region, name, next, profile);

    // Confirm AWS now serves the new version as AWSCURRENT (rotation or a concurrent write could win).
    let currentVersion: string | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      currentVersion = (await getSecretValue(region, name, profile)).versionId;
      if (currentVersion === versionId) return { name, status: 'updated', changes, versionId };
      await sleep(500);
    }
    return {
      name,
      status: 'failed',
      changes,
      versionId,
      error: `Wrote version ${versionId}, but AWSCURRENT is ${currentVersion ?? 'unknown'} — rotation or another write may have replaced it`,
    };
  } catch (err) {
    return { name, status: 'failed', changes: [], error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Case-sensitive find/replace across secrets. Body: `names`, `find`, `replace`, `region`,
 * optional `profile`, `dryRun` (default true). Each secret is re-read from AWS at call time.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const names = Array.isArray(body.names)
      ? [...new Set((body.names as unknown[]).filter((n): n is string => typeof n === 'string' && n.length > 0))]
      : [];
    const find = typeof body.find === 'string' ? body.find : '';
    const replace = typeof body.replace === 'string' ? body.replace : '';
    const dryRun = body.dryRun !== false;
    const region = getRegion(body.region);
    const profile = parseProfileParam(body.profile as string | undefined);

    if (names.length === 0) return Response.json({ error: 'names is required' }, { status: 400 });
    if (!find) return Response.json({ error: 'find is required' }, { status: 400 });
    if (find === replace) return Response.json({ error: 'find and replace are identical' }, { status: 400 });

    const results = await parallelPool(names, 4, (name) =>
      replaceOne(region, profile, name, find, replace, dryRun),
    );
    if (results.some((r) => r.status === 'updated')) await invalidateCache('secrets');

    return Response.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
