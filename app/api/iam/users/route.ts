import type { NextRequest } from 'next/server';
import { getRegion, parseProfileParam } from '@/lib/aws/client';
import { listIamUserNames, type ListIamUsersResult } from '@/lib/aws/iam';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const region = getRegion(
      request.nextUrl.searchParams.get('region') ?? undefined,
    );
    const profile = parseProfileParam(
      request.nextUrl.searchParams.get('profile'),
    );
    const result: ListIamUsersResult = await listIamUserNames(region, profile);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
