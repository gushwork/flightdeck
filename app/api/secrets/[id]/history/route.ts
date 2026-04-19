import type { NextRequest } from 'next/server';
import { lookupSecretEvents } from '@/lib/aws/cloudtrail';
import { getRegion, parseProfileParam } from '@/lib/aws/client';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const secretName = decodeURIComponent(id);
    const region = getRegion(
      request.nextUrl.searchParams.get('region') ?? undefined,
    );
    const profile = parseProfileParam(
      request.nextUrl.searchParams.get('profile'),
    );
    const nextToken =
      request.nextUrl.searchParams.get('nextToken') ?? undefined;

    const result = await lookupSecretEvents(
      region,
      secretName,
      nextToken,
      profile,
    );
    return Response.json(result, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=120' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
