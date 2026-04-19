import type { NextRequest } from 'next/server';
import { getRegion, parseProfileParam } from '@/lib/aws/client';
import { searchIamEntities, type IamEntityType } from '@/lib/aws/iam';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const region = getRegion(body.region);
    const profile = parseProfileParam(body.profile as string | undefined);
    const query = typeof body.query === 'string' ? body.query : '';
    const types = Array.isArray(body.types)
      ? (body.types.filter((t: unknown) =>
          t === 'role' || t === 'user' || t === 'policy',
        ) as IamEntityType[])
      : undefined;

    if (!query.trim()) {
      return Response.json({ results: [], truncated: false });
    }

    const { results, truncated } = await searchIamEntities(
      region,
      profile,
      query,
      types,
    );
    return Response.json({ results, truncated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
