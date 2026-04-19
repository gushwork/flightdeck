import type { NextRequest } from 'next/server';
import { listSecrets } from '@/lib/aws/secrets';
import { getRegion, parseProfileParam, profileCacheSegment } from '@/lib/aws/client';
import { getCached, setCache } from '@/lib/cache';
import type { SecretEntry } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const region = getRegion(
      request.nextUrl.searchParams.get('region') ?? undefined,
    );
    const profile = parseProfileParam(
      request.nextUrl.searchParams.get('profile'),
    );
    const force = request.nextUrl.searchParams.get('force') === '1';
    const profSeg = profileCacheSegment(profile);
    const cacheKey = `secrets:${region}:${profSeg}`;

    if (!force) {
      const cached = await getCached<SecretEntry[]>(cacheKey);
      if (cached) {
        return Response.json({ secrets: cached }, {
          headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
        });
      }
    }

    const secrets = await listSecrets(region, undefined, profile);
    await setCache(cacheKey, secrets, 60_000);

    return Response.json({ secrets }, {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
