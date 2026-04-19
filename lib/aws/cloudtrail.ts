import {
  CloudTrailClient,
  LookupEventsCommand,
} from '@aws-sdk/client-cloudtrail';
import { awsClientOptions } from './client';

export interface AccessEvent {
  eventTime: string;
  eventName: string;
  userName: string;
  userArn: string;
  userType: string;
  sourceIp: string;
  userAgent: string;
  resourceName: string;
}

function getClient(region: string, profile?: string) {
  return new CloudTrailClient(awsClientOptions(region, profile));
}

export async function lookupSecretEvents(
  region: string,
  secretName: string,
  nextToken?: string,
  profile?: string,
): Promise<{ events: AccessEvent[]; nextToken?: string }> {
  const client = getClient(region, profile);

  const res = await client.send(
    new LookupEventsCommand({
      LookupAttributes: [
        { AttributeKey: 'ResourceName', AttributeValue: secretName },
      ],
      MaxResults: 50,
      NextToken: nextToken,
    }),
  );

  const events: AccessEvent[] = [];

  for (const event of res.Events ?? []) {
    if (!event.CloudTrailEvent) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(event.CloudTrailEvent);
    } catch {
      continue;
    }

    if (parsed.eventName !== 'GetSecretValue') continue;

    const userIdentity = parsed.userIdentity as
      | { arn?: string; type?: string; userName?: string }
      | undefined;
    const requestParams = parsed.requestParameters as
      | { secretId?: string }
      | undefined;

    events.push({
      eventTime: event.EventTime?.toISOString() ?? '',
      eventName: String(parsed.eventName ?? ''),
      userName: event.Username ?? userIdentity?.userName ?? '',
      userArn: userIdentity?.arn ?? '',
      userType: userIdentity?.type ?? '',
      sourceIp: String(parsed.sourceIPAddress ?? ''),
      userAgent: String(parsed.userAgent ?? ''),
      resourceName: requestParams?.secretId ?? secretName,
    });
  }

  return {
    events,
    nextToken: res.NextToken,
  };
}
