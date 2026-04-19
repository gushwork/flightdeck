import { fromIni } from '@aws-sdk/credential-providers';

export function getRegion(overrideRegion?: string): string {
  return overrideRegion || process.env.AWS_REGION || 'us-east-1';
}

/** Stable segment for cache keys; empty profile → default chain. */
export function profileCacheSegment(profile?: string | null): string {
  const p = profile?.trim();
  if (!p) return 'default';
  return encodeURIComponent(p);
}

/** Query/body profile → undefined when empty (default credential chain). */
export function parseProfileParam(
  param: string | null | undefined,
): string | undefined {
  const p = param?.trim();
  return p || undefined;
}

export function awsClientOptions(region: string, profile?: string | null) {
  const r = getRegion(region);
  const p = profile?.trim();
  if (!p) {
    return { region: r };
  }
  return { region: r, credentials: fromIni({ profile: p }) };
}
