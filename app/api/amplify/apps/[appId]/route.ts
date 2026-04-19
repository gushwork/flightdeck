import type { NextRequest } from 'next/server';
import {
  getAppSnapshot,
  updateAppEnvironmentVariables,
} from '@/lib/aws/amplify';
import { getRegion, parseProfileParam } from '@/lib/aws/client';

export const dynamic = 'force-dynamic';

function profileFromRequest(request: NextRequest) {
  return parseProfileParam(request.nextUrl.searchParams.get('profile'));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) {
  try {
    const { appId } = await params;
    const id = decodeURIComponent(appId);
    const region = getRegion(
      request.nextUrl.searchParams.get('region') ?? undefined,
    );
    const profile = profileFromRequest(request);
    const snapshot = await getAppSnapshot(region, id, profile);
    return Response.json({ snapshot });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) {
  try {
    const { appId } = await params;
    const id = decodeURIComponent(appId);
    const region = getRegion(
      request.nextUrl.searchParams.get('region') ?? undefined,
    );
    const profile = profileFromRequest(request);
    const body = (await request.json()) as {
      environmentVariables?: Record<string, string>;
    };
    if (
      !body.environmentVariables ||
      typeof body.environmentVariables !== 'object'
    ) {
      return Response.json(
        { error: 'environmentVariables object is required' },
        { status: 400 },
      );
    }
    await updateAppEnvironmentVariables(
      region,
      id,
      body.environmentVariables,
      profile,
    );
    const snapshot = await getAppSnapshot(region, id, profile);
    return Response.json({ snapshot });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
