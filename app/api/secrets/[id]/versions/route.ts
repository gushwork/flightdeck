import type { NextRequest } from 'next/server';
import { listVersions } from '@/lib/aws/secrets';
import { getRegion, parseProfileParam } from '@/lib/aws/client';

export const dynamic = 'force-dynamic';

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
    const profile = parseProfileParam(
      request.nextUrl.searchParams.get('profile'),
    );
    const versions = await listVersions(region, secretId, profile);
    return Response.json({ versions }, {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
