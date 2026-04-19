import { searchAmplifyEnvironmentVariables } from '@/lib/aws/amplify';
import { getRegion, parseProfileParam } from '@/lib/aws/client';

export const dynamic = 'force-dynamic';

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
    const { hits, appsScanned, branchRowsScanned, keyMatches } =
      await searchAmplifyEnvironmentVariables(region, profile, query.trim());
    const elapsed = (Date.now() - startTime) / 1000;

    return Response.json({
      results: hits,
      appsScanned,
      branchRowsScanned,
      keyMatches,
      totalHits: hits.length,
      elapsed: Math.round(elapsed * 10) / 10,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
