import {
  AccessAnalyzerClient,
  ListAnalyzersCommand,
  ListFindingsV2Command,
  GetFindingV2Command,
  GenerateFindingRecommendationCommand,
  GetFindingRecommendationCommand,
  type AnalyzerSummary,
  type FindingSummaryV2,
} from '@aws-sdk/client-accessanalyzer';
import { awsClientOptions } from './client';

export interface AnalyzerInfo {
  name: string;
  arn: string;
  type: string;
  status: string;
  createdAt: string;
}

export interface AnalyzerFinding {
  id: string;
  resource: string;
  resourceType: string;
  findingType: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

function getClient(region: string, profile?: string) {
  return new AccessAnalyzerClient(awsClientOptions(region, profile));
}

function mapAnalyzer(a: AnalyzerSummary): AnalyzerInfo {
  return {
    name: a.name ?? '',
    arn: a.arn ?? '',
    type: a.type ?? '',
    status: a.status ?? '',
    createdAt: a.createdAt?.toISOString() ?? '',
  };
}

function mapFinding(f: FindingSummaryV2): AnalyzerFinding {
  return {
    id: f.id ?? '',
    resource: f.resource ?? '',
    resourceType: f.resourceType ?? '',
    findingType: f.findingType ?? '',
    status: f.status ?? '',
    createdAt: f.createdAt?.toISOString() ?? '',
    updatedAt: f.updatedAt?.toISOString() ?? '',
  };
}

export async function listAnalyzers(
  region: string,
  profile?: string,
): Promise<AnalyzerInfo[]> {
  const client = getClient(region, profile);
  const analyzers: AnalyzerInfo[] = [];
  let nextToken: string | undefined;

  do {
    const res = await client.send(
      new ListAnalyzersCommand({ nextToken, type: 'ACCOUNT' }),
    );
    for (const a of res.analyzers ?? []) {
      analyzers.push(mapAnalyzer(a));
    }
    nextToken = res.nextToken;
  } while (nextToken);

  let unusedToken: string | undefined;
  do {
    const res = await client.send(
      new ListAnalyzersCommand({ nextToken: unusedToken, type: 'ACCOUNT_UNUSED_ACCESS' }),
    );
    for (const a of res.analyzers ?? []) {
      if (!analyzers.some((existing) => existing.arn === a.arn)) {
        analyzers.push(mapAnalyzer(a));
      }
    }
    unusedToken = res.nextToken;
  } while (unusedToken);

  return analyzers;
}

export async function listFindings(
  region: string,
  analyzerArn: string,
  filters?: Record<string, { eq?: string[] }>,
  profile?: string,
): Promise<AnalyzerFinding[]> {
  const client = getClient(region, profile);
  const findings: AnalyzerFinding[] = [];
  let nextToken: string | undefined;

  const criterion: Record<string, { eq?: string[] }> = filters ?? {};

  do {
    const res = await client.send(
      new ListFindingsV2Command({
        analyzerArn,
        nextToken,
        filter: Object.keys(criterion).length > 0
          ? { criterion }
          : undefined,
      }),
    );
    for (const f of res.findings ?? []) {
      findings.push(mapFinding(f));
    }
    nextToken = res.nextToken;
  } while (nextToken);

  return findings;
}

export async function getFinding(
  region: string,
  analyzerArn: string,
  findingId: string,
  profile?: string,
) {
  const client = getClient(region, profile);
  const res = await client.send(
    new GetFindingV2Command({ analyzerArn, id: findingId }),
  );
  return {
    id: res.id ?? findingId,
    resource: res.resource ?? '',
    resourceType: res.resourceType ?? '',
    findingType: res.findingType ?? '',
    status: res.status ?? '',
    createdAt: res.createdAt?.toISOString() ?? '',
    updatedAt: res.updatedAt?.toISOString() ?? '',
    findingDetails: res.findingDetails,
  };
}

export async function generateRecommendation(
  region: string,
  analyzerArn: string,
  findingId: string,
  profile?: string,
): Promise<void> {
  const client = getClient(region, profile);
  await client.send(
    new GenerateFindingRecommendationCommand({ analyzerArn, id: findingId }),
  );
}

export async function getRecommendation(
  region: string,
  analyzerArn: string,
  findingId: string,
  profile?: string,
) {
  const client = getClient(region, profile);
  const res = await client.send(
    new GetFindingRecommendationCommand({ analyzerArn, id: findingId }),
  );
  return {
    completedAt: res.completedAt?.toISOString(),
    startedAt: res.startedAt?.toISOString(),
    status: res.status,
    recommendedSteps: res.recommendedSteps,
    error: res.error,
  };
}
