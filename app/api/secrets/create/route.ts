import type { NextRequest } from 'next/server';
import { createSecret } from '@/lib/aws/secrets';
import { getRegion, parseProfileParam } from '@/lib/aws/client';
import { invalidateCache } from '@/lib/cache';
import { coerceSecretStringForStorage } from '@/lib/secret-string';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      secretString,
      description,
      tags,
      region: regionOverride,
      profile: profileBody,
    } = body as {
      name: string;
      secretString?: unknown;
      description?: string;
      tags?: Record<string, string>;
      region?: string;
      profile?: string;
    };

    const region = getRegion(regionOverride);
    const profile = parseProfileParam(profileBody);

    if (!name?.trim()) {
      return Response.json({ error: 'name is required' }, { status: 400 });
    }
    const normalizedSecret = coerceSecretStringForStorage(secretString);
    if (normalizedSecret === '') {
      return Response.json({ error: 'secretString is required' }, { status: 400 });
    }

    const result = await createSecret(
      region,
      {
        name: name.trim(),
        secretString: normalizedSecret,
        description,
        tags,
      },
      profile,
    );

    await invalidateCache('secrets');

    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
