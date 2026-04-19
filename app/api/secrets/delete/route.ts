import type { NextRequest } from 'next/server';
import {
  SecretsManagerClient,
  DeleteSecretCommand,
} from '@aws-sdk/client-secrets-manager';
import { awsClientOptions, getRegion, parseProfileParam } from '@/lib/aws/client';
import { invalidateCache } from '@/lib/cache';

interface DeleteResult {
  name: string;
  status: 'success' | 'failed';
  error?: string;
  deletionDate?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      secretNames,
      recoveryWindowInDays = 30,
      region: regionOverride,
      profile: profileBody,
    } = body as {
      secretNames: string[];
      recoveryWindowInDays?: number;
      region?: string;
      profile?: string;
    };

    if (!Array.isArray(secretNames) || secretNames.length === 0) {
      return Response.json(
        { error: 'secretNames array is required' },
        { status: 400 },
      );
    }

    const region = getRegion(regionOverride);
    const profile = parseProfileParam(profileBody);
    const client = new SecretsManagerClient(awsClientOptions(region, profile));

    const results: DeleteResult[] = [];
    for (const name of secretNames) {
      try {
        const response = await client.send(
          new DeleteSecretCommand({
            SecretId: name,
            RecoveryWindowInDays: recoveryWindowInDays,
          }),
        );
        results.push({
          name,
          status: 'success',
          deletionDate: response.DeletionDate?.toISOString(),
        });
      } catch (err) {
        results.push({
          name,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
        break;
      }
    }

    await invalidateCache('secrets');

    return Response.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
