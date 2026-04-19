import {
  SecretsManagerClient,
  ListSecretsCommand,
  BatchGetSecretValueCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  ListSecretVersionIdsCommand,
  DescribeSecretCommand,
  GetResourcePolicyCommand,
  CreateSecretCommand,
  type FilterNameStringType,
} from '@aws-sdk/client-secrets-manager';
import { awsClientOptions } from '@/lib/aws/client';
import { coerceSecretStringForStorage } from '@/lib/secret-string';
import type { SecretEntry, SecretValue } from '@/lib/types';

function getClient(region: string, profile?: string) {
  return new SecretsManagerClient(awsClientOptions(region, profile));
}

export async function listSecrets(
  region: string,
  filters?: { key: string; values: string[] }[],
  profile?: string,
): Promise<SecretEntry[]> {
  const client = getClient(region, profile);
  const entries: SecretEntry[] = [];
  let nextToken: string | undefined;

  do {
    const cmd = new ListSecretsCommand({
      MaxResults: 100,
      NextToken: nextToken,
      Filters: filters?.map((f) => ({ Key: f.key as FilterNameStringType, Values: f.values })),
    });
    const res = await client.send(cmd);

    for (const s of res.SecretList ?? []) {
      const tags: Record<string, string> = {};
      for (const t of s.Tags ?? []) {
        if (t.Key && t.Value) tags[t.Key] = t.Value;
      }

      entries.push({
        name: s.Name ?? '',
        arn: s.ARN ?? '',
        description: s.Description,
        createdDate: s.CreatedDate?.toISOString() ?? '',
        lastChangedDate: s.LastChangedDate?.toISOString(),
        lastAccessedDate: s.LastAccessedDate?.toISOString(),
        tags,
        rotationEnabled: s.RotationEnabled ?? false,
        rotationLambdaArn: s.RotationLambdaARN,
        rotationRules: s.RotationRules
          ? {
              automaticallyAfterDays: s.RotationRules.AutomaticallyAfterDays,
              scheduleExpression: s.RotationRules.ScheduleExpression,
            }
          : undefined,
        lastRotatedDate: s.LastRotatedDate?.toISOString(),
        primaryRegion: s.PrimaryRegion,
        owningService: s.OwningService,
      });
    }

    nextToken = res.NextToken;
  } while (nextToken);

  return entries;
}

export async function createSecret(
  region: string,
  opts: {
    name: string;
    secretString: unknown;
    description?: string;
    tags?: Record<string, string>;
  },
  profile?: string,
): Promise<{ arn: string; name: string }> {
  const client = getClient(region, profile);
  const secretString = coerceSecretStringForStorage(opts.secretString);
  const tagList =
    opts.tags && Object.keys(opts.tags).length > 0
      ? Object.entries(opts.tags).map(([Key, Value]) => ({ Key, Value }))
      : undefined;
  const cmd = new CreateSecretCommand({
    Name: opts.name,
    SecretString: secretString,
    Description: opts.description?.trim() || undefined,
    Tags: tagList,
  });
  const res = await client.send(cmd);
  return { arn: res.ARN ?? '', name: res.Name ?? opts.name };
}

export async function batchGetValues(
  region: string,
  secretIds: string[],
  profile?: string,
): Promise<SecretValue[]> {
  const client = getClient(region, profile);
  const batchSize = 20;
  const batches: string[][] = [];

  for (let i = 0; i < secretIds.length; i += batchSize) {
    batches.push(secretIds.slice(i, i + batchSize));
  }

  const results = await Promise.all(
    batches.map(async (batch) => {
      try {
        const cmd = new BatchGetSecretValueCommand({
          SecretIdList: batch,
        });
        const res = await client.send(cmd);
        const values: SecretValue[] = [];

        for (const sv of res.SecretValues ?? []) {
          if (sv.SecretBinary) {
            values.push({
              name: sv.Name ?? '',
              arn: sv.ARN ?? '',
              secretBinary: true,
              versionId: sv.VersionId,
              versionStages: sv.VersionStages,
            });
            continue;
          }
          values.push({
            name: sv.Name ?? '',
            arn: sv.ARN ?? '',
            secretString: sv.SecretString,
            versionId: sv.VersionId,
            versionStages: sv.VersionStages,
          });
        }

        return values;
      } catch {
        return [] as SecretValue[];
      }
    }),
  );

  return results.flat();
}

export async function getSecretValue(
  region: string,
  secretId: string,
  profile?: string,
): Promise<SecretValue> {
  const client = getClient(region, profile);
  const cmd = new GetSecretValueCommand({ SecretId: secretId });
  const res = await client.send(cmd);

  return {
    name: res.Name ?? '',
    arn: res.ARN ?? '',
    secretString: res.SecretString,
    secretBinary: !!res.SecretBinary,
    versionId: res.VersionId,
    versionStages: res.VersionStages,
  };
}

export async function putSecretValue(
  region: string,
  secretId: string,
  secretString: unknown,
  profile?: string,
): Promise<{ versionId: string }> {
  const client = getClient(region, profile);
  const cmd = new PutSecretValueCommand({
    SecretId: secretId,
    SecretString: coerceSecretStringForStorage(secretString),
  });
  const res = await client.send(cmd);
  return { versionId: res.VersionId ?? '' };
}

export async function listVersions(
  region: string,
  secretId: string,
  profile?: string,
): Promise<{ versionId: string; versionStages: string[]; createdDate: string }[]> {
  const client = getClient(region, profile);
  const cmd = new ListSecretVersionIdsCommand({ SecretId: secretId });
  const res = await client.send(cmd);

  return (res.Versions ?? []).map((v) => ({
    versionId: v.VersionId ?? '',
    versionStages: v.VersionStages ?? [],
    createdDate: v.CreatedDate?.toISOString() ?? '',
  }));
}

export async function describeSecret(
  region: string,
  secretId: string,
  profile?: string,
) {
  const client = getClient(region, profile);
  const cmd = new DescribeSecretCommand({ SecretId: secretId });
  return client.send(cmd);
}

export async function getResourcePolicy(
  region: string,
  secretId: string,
  profile?: string,
): Promise<string | null> {
  const client = getClient(region, profile);
  const cmd = new GetResourcePolicyCommand({ SecretId: secretId });
  const res = await client.send(cmd);
  return res.ResourcePolicy ?? null;
}
