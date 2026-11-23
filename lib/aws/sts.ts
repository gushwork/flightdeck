import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { awsClientOptions } from './client';

export async function getAccountId(
  region: string,
  profile?: string,
): Promise<string> {
  const client = new STSClient(awsClientOptions(region, profile));
  const out = await client.send(new GetCallerIdentityCommand({}));
  if (!out.Account) {
    throw new Error('STS did not return an account ID');
  }
  return out.Account;
}

export async function getCallerIdentity(
  region: string,
  profile?: string,
): Promise<{ accountId: string; arn: string }> {
  const client = new STSClient(awsClientOptions(region, profile));
  const out = await client.send(new GetCallerIdentityCommand({}));
  if (!out.Account || !out.Arn) {
    throw new Error('STS did not return the caller identity');
  }
  return { accountId: out.Account, arn: out.Arn };
}
