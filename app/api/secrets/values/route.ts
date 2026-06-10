import { listSecrets, batchGetValues } from '@/lib/aws/secrets';
import { getRegion, parseProfileParam } from '@/lib/aws/client';
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

function extractSnippet(raw: string, query: string, matchedKey?: string): string {
  if (matchedKey) {
    try {
      const parsed = JSON.parse(raw);
      return `${matchedKey}: ${JSON.stringify(parsed[matchedKey])}`;
    } catch { /* fall through */ }
  }
  const idx = raw.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return raw.slice(0, 100);
  const start = Math.max(0, idx - 50);
  const end = Math.min(raw.length, idx + query.length + 50);
  return (start > 0 ? '...' : '') + raw.slice(start, end) + (end < raw.length ? '...' : '');
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
    const q = query.toLowerCase();
    const results: SecretSearchResult[] = [];

    for (const val of values) {
      if (!val.secretString) continue;

      const meta = secretMeta.get(val.arn);
      const tags = meta?.tags ?? {};

      // Shallow key/value pass for JSON objects and arrays (fast path, optional matchedKey).
      // If nothing matches at top level, we must still search the full string — nested
      // values stringify to "[object Object]", so a bare `continue` would drop those hits.
      let addedFromShallowJson = false;
      try {
        const parsed = JSON.parse(val.secretString);
        if (typeof parsed === 'object' && parsed !== null) {
          for (const [key, value] of Object.entries(parsed)) {
            const strVal = String(value);
            if (key.toLowerCase().includes(q) || strVal.toLowerCase().includes(q)) {
              results.push({
                name: val.name,
                arn: val.arn,
                environment: deriveEnvironment(val.name, tags),
                type: deriveType(val.name, tags),
                matchedContext: extractSnippet(val.secretString, query, key),
                matchedKey: key,
              });
              addedFromShallowJson = true;
              break;
            }
          }
        }
      } catch { /* not JSON, search raw string */ }

      if (addedFromShallowJson) continue;

      if (val.secretString.toLowerCase().includes(q)) {
        results.push({
          name: val.name,
          arn: val.arn,
          environment: deriveEnvironment(val.name, tags),
          type: deriveType(val.name, tags),
          matchedContext: extractSnippet(val.secretString, query),
        });
      }
    }

    return Response.json({
      results,
      totalFetched: values.length,
      elapsed: Math.round(elapsed * 10) / 10,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
