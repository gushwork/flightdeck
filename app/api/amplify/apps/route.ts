import type { NextRequest } from 'next/server';
import { listAppsPage } from '@/lib/aws/amplify';
import { getRegion, parseProfileParam } from '@/lib/aws/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const region = getRegion(
      request.nextUrl.searchParams.get('region') ?? undefined,
    );
    const profile = parseProfileParam(
      request.nextUrl.searchParams.get('profile'),
    );
    const nextToken =
      request.nextUrl.searchParams.get('nextToken') ?? undefined;
    const { apps, nextToken: outToken } = await listAppsPage(
      region,
      profile,
      nextToken,
    );
    return Response.json({ apps, nextToken: outToken });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
