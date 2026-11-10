import type { NextRequest } from 'next/server';
import { getSecretValue, putSecretValue } from '@/lib/aws/secrets';
import { getRegion, parseProfileParam } from '@/lib/aws/client';
import { invalidateCache } from '@/lib/cache';
import { coerceSecretStringForStorage } from '@/lib/secret-string';
import { staleWriteError } from '@/lib/secrets/stale-write';

export const dynamic = 'force-dynamic';

function profileFromRequest(request: NextRequest) {
  return parseProfileParam(request.nextUrl.searchParams.get('profile'));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const secretId = decodeURIComponent(id);
    const region = getRegion(
      request.nextUrl.searchParams.get('region') ?? undefined,
    );
    const profile = profileFromRequest(request);
    const value = await getSecretValue(region, secretId, profile);
    // no-store: a browser-cached copy made edits read stale values (and wrote them back),
    // and secret plaintext should not sit in the HTTP cache.
    return Response.json({ value }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const secretId = decodeURIComponent(id);
    const region = getRegion(
      request.nextUrl.searchParams.get('region') ?? undefined,
    );
    const profile = profileFromRequest(request);
    const body = await request.json() as { secretString?: unknown; expectedVersionId?: unknown };
    const normalizedSecret = coerceSecretStringForStorage(body.secretString);
    if (normalizedSecret === '') {
      return Response.json({ error: 'secretString is required' }, { status: 400 });
    }

    if (body.expectedVersionId !== undefined) {
      const current = await getSecretValue(region, secretId, profile);
      const conflict = staleWriteError(body.expectedVersionId, current.versionId);
      if (conflict) {
        return Response.json({ error: conflict, currentVersionId: current.versionId }, { status: 409 });
      }
    }

    const result = await putSecretValue(region, secretId, normalizedSecret, profile);
    await invalidateCache('secrets');
    return Response.json({ versionId: result.versionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
