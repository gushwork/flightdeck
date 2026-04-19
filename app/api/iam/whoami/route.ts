import type { NextRequest } from 'next/server';
import { getRegion, parseProfileParam } from '@/lib/aws/client';
import { getAccountId } from '@/lib/aws/sts';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const region = getRegion(
      request.nextUrl.searchParams.get('region') ?? undefined,
    );
    const profile = parseProfileParam(
      request.nextUrl.searchParams.get('profile'),
    );
    const accountId = await getAccountId(region, profile);
    return Response.json({ accountId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
