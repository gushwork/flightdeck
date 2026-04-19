import type { NextRequest } from 'next/server';
import { getRegion, parseProfileParam } from '@/lib/aws/client';
import {
  provisionIamUserWithConsoleAndKey,
  type ProvisionedIamUser,
} from '@/lib/aws/iam';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const region = getRegion(body.region);
    const profile = parseProfileParam(
      body.profile as string | undefined,
    );
    const newUserName = typeof body.newUserName === 'string'
      ? body.newUserName.trim()
      : '';
    const templateUserName = typeof body.templateUserName === 'string'
      ? body.templateUserName.trim()
      : '';
    const includeGroups = Boolean(body.includeGroups);

    if (!newUserName || !templateUserName) {
      return Response.json(
        { error: 'newUserName and templateUserName are required' },
        { status: 400 },
      );
    }

    if (newUserName === templateUserName) {
      return Response.json(
        { error: 'newUserName cannot be the same as templateUserName' },
        { status: 400 },
      );
    }

    const result: ProvisionedIamUser = await provisionIamUserWithConsoleAndKey(
      region,
      profile,
      newUserName,
      templateUserName,
      { includeGroups },
    );

    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
