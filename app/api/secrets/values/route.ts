import { listSecrets, batchGetValues } from '@/lib/aws/secrets';
import { getRegion, parseProfileParam } from '@/lib/aws/client';
import { findSecretValueMatches } from '@/lib/secret-value-search';
import type { SecretSearchResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

function deriveEnvironment(name: string, tags: Record<string, string>): string {
  if (tags.Environment) return tags.Environment.toLowerCase();
  const first = name.split('/')[0]?.toLowerCase();
  if (['dev', 'staging', 'stg', 'prod', 'production', 'shared'].includes(first)) {
    if (first === 'production') return 'prod';
    if (first === 'stg') return 'staging';
    return first;
  }
  return 'unknown';
}

function deriveType(name: string, tags: Record<string, string>): string {
  if (tags.SecretType) return tags.SecretType;
  const parts = name.split('/');
  return parts[2] ?? parts[1] ?? 'general';
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const query = body.query as string;
    const region = getRegion(body.region);
    const profile = parseProfileParam(body.profile as string | undefined);

    if (!query || query.trim().length === 0) {
      return Response.json({ error: 'Query is required' }, { status: 400 });
    }

    const startTime = Date.now();
    const allSecrets = await listSecrets(region, undefined, profile);
    const arns = allSecrets.map((s) => s.arn);
    const values = await batchGetValues(region, arns, profile);
    const elapsed = (Date.now() - startTime) / 1000;

    const secretMeta = new Map(allSecrets.map((s) => [s.arn, s]));
    const fetchedArns = new Set(values.map((v) => v.arn));
    const unreadable = allSecrets.filter((s) => !fetchedArns.has(s.arn)).map((s) => s.name);
    const results: SecretSearchResult[] = [];

    for (const val of values) {
      if (!val.secretString) continue;
      const matches = findSecretValueMatches(val.secretString, query);
      if (matches.length === 0) continue;

      const tags = secretMeta.get(val.arn)?.tags ?? {};
      results.push({
        name: val.name,
        arn: val.arn,
        environment: deriveEnvironment(val.name, tags),
        type: deriveType(val.name, tags),
        matches,
      });
    }

    return Response.json({
      results,
      totalSecrets: allSecrets.length,
      totalFetched: values.length,
      unreadable,
      elapsed: Math.round(elapsed * 10) / 10,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
