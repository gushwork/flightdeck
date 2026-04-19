import type { NextRequest } from 'next/server';
import {
  listAnalyzers,
  listFindings,
  getFinding,
  generateRecommendation,
  getRecommendation,
} from '@/lib/aws/analyzer';
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
    const analyzers = await listAnalyzers(region, profile);
    return Response.json({ analyzers }, {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const region = getRegion(body.region);
    const profile = parseProfileParam(body.profile as string | undefined);

    if (body.action === 'findings') {
      const { analyzerArn, filters } = body;
      if (!analyzerArn) {
        return Response.json(
          { error: 'analyzerArn is required' },
          { status: 400 },
        );
      }
      const findings = await listFindings(
        region,
        analyzerArn,
        filters,
        profile,
      );
      return Response.json({ findings });
    }

    if (body.action === 'findingDetails') {
      const { analyzerArn, findingIds } = body;
      if (!analyzerArn || !Array.isArray(findingIds)) {
        return Response.json(
          { error: 'analyzerArn and findingIds array are required' },
          { status: 400 },
        );
      }
      const details = await Promise.all(
        findingIds.map((id: string) =>
          getFinding(region, analyzerArn, id, profile),
        ),
      );
      return Response.json({ details });
    }

    if (body.action === 'recommendation') {
      const { analyzerArn, findingId } = body;
      if (!analyzerArn || !findingId) {
        return Response.json(
          { error: 'analyzerArn and findingId are required' },
          { status: 400 },
        );
      }
      await generateRecommendation(region, analyzerArn, findingId, profile);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const recommendation = await getRecommendation(
        region,
        analyzerArn,
        findingId,
        profile,
      );
      return Response.json({ recommendation });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
